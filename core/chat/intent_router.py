"""core/chat/intent_router.py — 意图前置分流器（P2 阶段，WO-26b 顺延）。

两阶段意图路由：
1. Fast-Path (强规则快速判定，<1ms)：拦截高频元指令、闲聊与能力问答；
2. Semantic-Path (轻量 LLM 语义分流，~50ms)：判定复杂/长句信贷意图；
3. Fallback (规则兜底)：任何异常回退到安全默认意图。
"""

from __future__ import annotations

import json
import re
from enum import Enum
from typing import Any

from sqlalchemy.orm import Session

from core.ai.gateway import ApiGateway
from core.config import get_config
from core.logger import get_logger
from core.models.types import DesensitizedText
from core.pii.gateway import desensitize

logger = get_logger(__name__)


class ChatIntent(str, Enum):
    META_HELP = "meta_help"
    STATUS_ACK = "status_ack"
    FOLDER_LOOKUP = "folder_lookup"
    CALCULATOR_ASSESS = "calculator_assess"
    CHECKLIST_GAP = "checklist_gap"
    TASK_CREATE = "task_create"            # 新增：建任务/记待办/提醒
    DECLARATION_CHECK = "declaration_check" # 新增：申报一致性检查
    DRAFT_EMAIL = "draft_email"            # 新增：写邮件/催件/草稿
    POLICY_QUERY = "policy_query"          # 新增：查银行政策
    CASE_STRATEGY = "case_strategy"


# Fast-Path 正则与关键词表（<1ms 极速命中）
_META_HELP_PATTERNS = (
    r"你能(帮我)?做什么",
    r"你有什么功能",
    r"你可以做什么",
    r"你能提供什么(帮助|服务)",
    r"怎么使用你",
    r"^help$",
    r"^帮助$",
)

_STATUS_ACK_PATTERNS = (
    r"^(好的|收到|明白|知道了|行|可以|ok|okay|got it|thanks|谢谢|多谢|好的[，,\s]*收到|收到[，,\s]*好的|明白[，,\s]*收到)[!！。.\s]*$",
    r"^(不需要了|不用了|不用啦|暂停|取消|算了|先不用|先放着|暂时不需要|先等等)[!！。.\s]*$",
)

_TASK_CREATE_PATTERNS = (
    r"(记一下|记一笔|帮我记|建(一个)?任务|创建任务|安排一下|提醒我|设一个提醒)",
)

_FOLDER_LOOKUP_PATTERNS = (
    r"(查|看|找|翻|搜|调).*?(文件|对账单|供楼单|负债单|出粮单|工资单|税表|地税|估价|估值|合同|保单|流水)",
    r"流水",
    r"找.{0,8}?(流水|对账单|账单)",
    r"把.{0,15}?(流水|对账单|账单|工资单|文件).{0,8}?(找|查|翻|搜|调)出来",
    r"文件夹",
    r"本地文件",
)

_DRAFT_EMAIL_PATTERNS = (
    r"(写|起草|拟).{0,8}?(邮件|信|催件|催)",
)

_POLICY_PATTERNS = (
    r"(查|看|了解).{0,15}?(政策|policy|银行.{0,6}要求)",
)

_CHECKLIST_PATTERNS = (
    r"(核对|检查|看|查|核查).{0,8}?(清单|缺件|缺哪些材料|材料清单|缺口)",
)

_DECLARATION_PATTERNS = (
    r"(检查|核对|比对).{0,8}?(申报|材料一致性|一致性)",
)

_CALCULATOR_PATTERNS = (
    r"(算|测|评估|借贷|反解).*?(额度|能不能借|能贷多少|月供|利息|hem|缓冲率)",
    r"(营业额|年薪|税前|底薪|自雇).*?(能借|算算)",
    r"^(能贷多少|贷款额度|还款能力|月供多少)[?？!！]*$",
    r"能贷多少|贷款额度|还款能力|月供多少",
    r"评估.{0,8}?还款",
    r"算.{0,8}?(额度|月供|利息)",
)


def classify_chat_intent(
    message: str,
    case_id: str | None,
    db: Session,
) -> tuple[ChatIntent, dict[str, Any]]:
    """判定当前用户输入的意图分类与附加元数据。

    Fast-Path 命中顺序（按 WO-64 契约）：
    META_HELP → STATUS_ACK → TASK_CREATE → FOLDER_LOOKUP →
    DRAFT_EMAIL → POLICY_QUERY → CHECKLIST_GAP → DECLARATION_CHECK → CALCULATOR_ASSESS → LLM 语义 → fallback。
    """
    raw = (message or "").strip()
    if not raw:
        return ChatIntent.STATUS_ACK, {}

    # =========================================================================
    # Stage 1: Fast-Path 极速规则命中 (<1ms)
    # =========================================================================
    for pat in _META_HELP_PATTERNS:
        if re.search(pat, raw, re.IGNORECASE):
            return ChatIntent.META_HELP, {"reason": "fast_path_meta_help"}

    for pat in _STATUS_ACK_PATTERNS:
        if re.search(pat, raw, re.IGNORECASE):
            return ChatIntent.STATUS_ACK, {"reason": "fast_path_status_ack"}

    for pat in _TASK_CREATE_PATTERNS:
        if re.search(pat, raw, re.IGNORECASE):
            return ChatIntent.TASK_CREATE, {"reason": "fast_path_task_create"}

    for pat in _FOLDER_LOOKUP_PATTERNS:
        if re.search(pat, raw, re.IGNORECASE):
            return ChatIntent.FOLDER_LOOKUP, {"reason": "fast_path_folder_lookup"}

    for pat in _DRAFT_EMAIL_PATTERNS:
        if re.search(pat, raw, re.IGNORECASE):
            return ChatIntent.DRAFT_EMAIL, {"reason": "fast_path_draft_email"}

    for pat in _POLICY_PATTERNS:
        if re.search(pat, raw, re.IGNORECASE):
            return ChatIntent.POLICY_QUERY, {"reason": "fast_path_policy_query"}

    for pat in _CHECKLIST_PATTERNS:
        if re.search(pat, raw, re.IGNORECASE):
            return ChatIntent.CHECKLIST_GAP, {"reason": "fast_path_checklist_gap"}

    for pat in _DECLARATION_PATTERNS:
        if re.search(pat, raw, re.IGNORECASE):
            return ChatIntent.DECLARATION_CHECK, {"reason": "fast_path_declaration_check"}

    for pat in _CALCULATOR_PATTERNS:
        if re.search(pat, raw, re.IGNORECASE):
            return ChatIntent.CALCULATOR_ASSESS, {"reason": "fast_path_calculator"}

    # =========================================================================
    # Stage 2: Semantic-Path (若配置开启则走轻量 LLM 语义路由)
    # =========================================================================
    routing_cfg = getattr(get_config().settings.ai, "routing", None)
    if routing_cfg and getattr(routing_cfg, "intent_routing_enabled", False):
        try:
            scope = case_id or "global"
            safe_msg = desensitize(raw, scope, db)
            prompt = f"""请判定以下用户输入的意图类别，仅从下列候选值中选择一个返回 JSON：
1. "meta_help": 询问 AI 功能/你能帮我做什么
2. "status_ack": 简短礼貌回复/不需要了/暂停/收到
3. "task_create": 创建任务/记代办/设置提醒
4. "folder_lookup": 查阅本地案卷文件夹/具体材料文件（对账单/工资单/估值等）
5. "draft_email": 起草邮件/催件信/邮件回复
6. "policy_query": 查询银行政策/LVR/缓冲率
7. "declaration_check": 申报一致性比对/材料比对
8. "calculator_assess": 测算贷款额度/月供/财务借贷能力
9. "checklist_gap": 材料清单核对/缺件补件
10. "case_strategy": 案卷信贷策略/常规问答诊断

用户输入: {safe_msg}

返回格式: {{"intent": "<候选值之一>"}}"""

            gw = ApiGateway(get_config())
            result = gw.call_llm(
                text=DesensitizedText(prompt),
                prompt_template="意图分类器",
                max_tokens=60,
            )
            resp_str = result.response_text.strip()
            if "{" in resp_str and "}" in resp_str:
                data = json.loads(resp_str[resp_str.index("{"):resp_str.rindex("}") + 1])
                intent_val = data.get("intent")
                for it in ChatIntent:
                    if it.value == intent_val:
                        return it, {"reason": "llm_semantic_route"}
        except Exception as e:  # noqa: BLE001
            logger.warning("LLM semantic intent routing failed, fallback to default: %s", e)

    # =========================================================================
    # Stage 3: Fallback 默认走综合信贷策略
    # =========================================================================
    return ChatIntent.CASE_STRATEGY, {"reason": "fallback_default"}
