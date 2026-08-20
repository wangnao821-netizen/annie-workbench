"""口语槽位提取 (WO-65)：规则快路径 -> LLM 兜底 -> 槽位落库。"""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from core.ai.gateway import ApiGateway
from core.chat.time_parser import resolve_relative_time
from core.config import get_config
from core.logger import get_logger
from core.models.types import DesensitizedText
from core.pii.gateway import desensitize, rehydrate

logger = get_logger(__name__)

_TIME_KEYWORDS_PATTERN = r"(?:下周[一二三四五六日天]|本周[一二三四五六日天]|周[一二三四五六日天](?:前|之前)?|今天下午|今天晚上|明天上午|明天下午|明天早?上?|明早|后天下午|后天晚上|后天|下个?月\s*\d+\s*号|今天|今日|明天|明日|今晚|明晚|月底|\d+\s*天后|\d+\s*小时后)"
_ACTION_VERBS_PATTERN = r"(?:帮我|请)?(?:记一下|记一笔|帮我记|建(?:一个|个)?(?:加急|紧急)?(?:任务|待办|提醒)|创建任务|安排一下|提醒我|设(?:一个|个)?提醒|设个待办|做个备忘)[:：,，\s]*"
_PRIORITY_HIGH_PATTERN = r"(?:加急|马上|今天内|尽快|立刻|紧急|urgent)"


def extract_task_slots(message: str, ref_time: datetime | None = None) -> dict[str, Any]:
    """规则层任务槽位提取（快路径）。"""
    raw = (message or "").strip()
    if not raw:
        return {"title": "", "deadline": None, "priority": "normal", "raw_time": None, "confidence": "low"}

    priority = "high" if re.search(_PRIORITY_HIGH_PATTERN, raw, re.IGNORECASE) else "normal"

    # 1. 提取相对时间
    raw_time: str | None = None
    deadline: str | None = None
    if tm := re.search(_TIME_KEYWORDS_PATTERN, raw):
        raw_time = tm.group(0).strip()
        deadline = resolve_relative_time(raw_time, ref_time=ref_time)

    # 2. 标题清洗：剥离动词/加急词/时间词/残留连接词/代词废话/首尾标点
    cleaned = re.sub(_ACTION_VERBS_PATTERN, "", raw, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"^(?:加急|紧急)[:：,，\s]*", "", cleaned).strip()
    if raw_time and raw_time in cleaned:
        cleaned = cleaned.replace(raw_time, "").strip()
    cleaned = re.sub(r"^(?:前|之前|内|当天|到时候|上午|下午|中午|晚上)[:：,，\s]*", "", cleaned).strip()
    cleaned = re.sub(r"^(?:我(?:要)?(?:去)?|我们(?:需要)?|去)[:：,，\s]*", "", cleaned).strip()
    cleaned = re.sub(r"^[:：,，\s\-]+", "", cleaned)
    cleaned = re.sub(r"[:：,，!！。.\s]+$", "", cleaned).strip()

    title = cleaned[:40] if cleaned else raw[:40]
    confidence = "high" if len(title) >= 2 and ("记一下" not in title and "建任务" not in title) else "low"

    return {
        "title": title,
        "deadline": deadline,
        "priority": priority,
        "raw_time": raw_time,
        "confidence": confidence,
    }


def llm_extract_slots(message: str, intent: str, case_id: str | None, db: Session) -> dict[str, Any]:
    """LLM 兜底：一次轻量调用输出 JSON，失败静默返回 {}。"""
    raw = (message or "").strip()
    if not raw:
        return {}

    scope = case_id or "global"
    safe_msg = desensitize(raw, scope, db)

    if intent == "task_create":
        prompt = f"""请从用户的中文输入中提取任务信息，直接返回 JSON（无任何额外标记）：
- "title": 清洗后的任务事项简述（去除'记一下'等废话，<=30字）
- "deadline": 识别到的明确或相对截止时间（如无法确定填 null）
- "priority": 优先级 ("high" 或 "normal")

用户输入: {safe_msg}
返回格式: {{"title": "...", "deadline": null, "priority": "normal"}}"""
    else:
        prompt = f"""请从用户的信贷测算输入中提取财务数字，直接返回 JSON（无任何额外标记）：
- "target_loan": 目标贷款额度数字（若无填 null）
- "spouse_income": 配偶年收入数字（若无填 null）
- "interest_rate": 假设利率百分比数字（如 6.2，若无填 null）
- "employment_income": 主借款人年收入数字（若无填 null）

用户输入: {safe_msg}
返回格式: {{"target_loan": null, "spouse_income": null, "interest_rate": null, "employment_income": null}}"""

    try:
        gw = ApiGateway(get_config())
        result = gw.call_llm(
            text=DesensitizedText(prompt),
            prompt_template="",
            max_tokens=120,
        )
        resp_str = result.response_text.strip()
        if "{" in resp_str and "}" in resp_str:
            json_str = resp_str[resp_str.index("{"):resp_str.rindex("}") + 1]
            data = json.loads(json_str)
            # Rehydrate 字符串值
            for k, v in list(data.items()):
                if isinstance(v, str):
                    data[k] = rehydrate(v, scope, db)
            return data
    except Exception as e:  # noqa: BLE001
        logger.warning("llm_extract_slots fallback failed (non-fatal): %s", e)

    return {}


def _cn_amount(num: float, unit: str, bare_min: int) -> float:
    """中文金额单位折算：万/w -> x10000；m/百万 -> x1e6；k -> x1000；裸数按阈值。"""
    if unit in ("万", "w"):
        return num * 10000
    if unit in ("m", "百万"):
        return num * 1000000
    if unit == "k":
        return num * 1000
    return num if num > bare_min else num * 10000


def extract_financial_slots(message: str, db: Session, case_id: str | None = None) -> dict[str, Any]:
    """计算器槽位：规则提取 target_loan / spouse_income / interest_rate / employment_income。"""
    raw = (message or "").strip()
    slots: dict[str, Any] = {
        "target_loan": None,
        "spouse_income": None,
        "interest_rate": None,
        "employment_income": None,
        "confidence": "low",
    }

    # 1. 目标贷款额度 (例: 能不能借180万 / 贷180w / 借款1.8M)
    if m := re.search(r"(?:借|贷|借款|能不能借|能贷|额度|买房借)[:：\s]*(\d+(?:\.\d+)?)\s*(万|w|m|k|百万)?", raw, re.IGNORECASE):
        slots["target_loan"] = _cn_amount(float(m.group(1)), m.group(2) or "", 10000)

    # 2. 配偶收入 (例: 加配偶收入8万 / 加配偶8w / 配偶年薪10万)
    if m := re.search(r"(?:加)?配偶(?:收入|年薪|底薪|薪资)?[:：\s]*(\d+(?:\.\d+)?)\s*(万|w|k|m)?", raw, re.IGNORECASE):
        slots["spouse_income"] = _cn_amount(float(m.group(1)), m.group(2) or "", 1000)

    # 3. 假设利率 (例: 利率降到6.2% / 利率6.2 / 6.2%利率)
    if m := re.search(r"(?:利率(?:降到|为)?[:：\s]*(\d+(?:\.\d+)?)\s*%?|(\d+(?:\.\d+)?)\s*%\s*利率)", raw):
        val_str = m.group(1) or m.group(2)
        if val_str:
            slots["interest_rate"] = float(val_str)

    # 4. 主借款人收入 (例: 自雇年薪12万 / 营业额80万 / 年薪10万)
    if m := re.search(r"(?:自雇(?:收入|年薪|营业额)?|年薪|税前收入|底薪)[:：\s]*(\d+(?:\.\d+)?)\s*(万|w|k|m)?", raw, re.IGNORECASE):
        slots["employment_income"] = _cn_amount(float(m.group(1)), m.group(2) or "", 1000)

    if slots["target_loan"] or slots["spouse_income"] or slots["interest_rate"] or slots["employment_income"]:
        slots["confidence"] = "high"

    return slots
