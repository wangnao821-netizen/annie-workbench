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
from core.pii.gateway import desensitize, rehydrate

logger = get_logger(__name__)


class ChatIntent(str, Enum):
    META_HELP = "meta_help"                # 能力咨询（如："你能帮我做什么"、"你有什么功能"）
    STATUS_ACK = "status_ack"              # 状态/闲聊/确认（如："不需要了"、"好的"、"暂停"）
    FOLDER_LOOKUP = "folder_lookup"        # 查阅本地案卷文件/对账单/工资单/估值
    CALCULATOR_ASSESS = "calculator_assess"# 借贷额度精算/还款测算/收入分析
    CHECKLIST_GAP = "checklist_gap"        # 材料清单缺口/催件/补件
    CASE_STRATEGY = "case_strategy"        # 案卷综合策略诊断/下一步推进


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

_FOLDER_LOOKUP_PATTERNS = (
    r"(查|看|找|翻|搜|调).*?(文件|对账单|供楼单|负债单|出粮单|工资单|税表|地税|估价|估值|合同|保单|流水)",
    r"文件夹里",
    r"本地文件",
)

_CALCULATOR_PATTERNS = (
    r"(算|测|评估|借贷|反解).*?(额度|能不能借|能贷多少|月供|利息|hem|缓冲率)",
    r"(营业额|年薪|税前|底薪|自雇).*?(能借|算算)",
)


def classify_chat_intent(
    message: str,
    case_id: str | None,
    db: Session,
) -> tuple[ChatIntent, dict[str, Any]]:
    """判定当前用户输入的意图分类与附加元数据。

    Args:
        message: 用户原始输入。
        case_id: 当前关联的案件 ID（可为空）。
        db: 数据库 Session。

    Returns:
        (ChatIntent, meta_dict)
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

    if any(re.search(pat, raw, re.IGNORECASE) for pat in _FOLDER_LOOKUP_PATTERNS):
        return ChatIntent.FOLDER_LOOKUP, {"reason": "fast_path_folder_lookup"}

    if any(re.search(pat, raw, re.IGNORECASE) for pat in _CALCULATOR_PATTERNS):
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
3. "folder_lookup": 查阅本地案卷文件夹/具体材料文件（对账单/工资单/估值等）
4. "calculator_assess": 测算贷款额度/月供/财务借贷能力
5. "checklist_gap": 材料清单核对/缺件补件
6. "case_strategy": 案卷信贷策略/常规问答诊断

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
        except Exception as e:
            logger.warning("LLM semantic intent routing failed, fallback to default: %s", e)

    # =========================================================================
    # Stage 3: Fallback 默认走综合信贷策略
    # =========================================================================
    return ChatIntent.CASE_STRATEGY, {"reason": "fallback_default"}
