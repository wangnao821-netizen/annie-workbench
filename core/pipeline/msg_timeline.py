"""WO-55 邮件时序提取与智能定性引擎：.msg 邮件 → 审批官/案号/事件/卡点 → CaseContextEvent。"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import Case, CaseContextEvent

logger = get_logger(__name__)

_ASSESSOR_PATTERNS = (
    re.compile(r"assigned to\s+([A-Za-z\s]+?)\s+for assessment", re.IGNORECASE),
    re.compile(r"assessor\s*[:：]\s*([A-Za-z\s]+?)(?=\r|\n|$)", re.IGNORECASE),
    re.compile(r"credit analyst\s*[:：]\s*([A-Za-z\s]+?)(?=\r|\n|$)", re.IGNORECASE),
)

# 注：相对施工单契约，仅对 _REF_PATTERNS 第 1/2 条做最小修正（修复尾部 \b 永不匹配、
# 以及 app 前缀吞入 "lication" 的问题），否则契约自带验收测试无法通过。
_REF_PATTERNS = (
    re.compile(r"\b(\d{5,8}\s*\([A-Za-z0-9\s]+\))(?![A-Za-z0-9])"),
    re.compile(r"(?:app(?:lication)?\b\s*(?:id|ref|no|#)?\s*[:：#]?\s*)([A-Za-z0-9\-_]{5,20})", re.IGNORECASE),
    re.compile(r"(?:orde|cba|anz|nab|westpac|zank|brighten)\s*(?:ref|id)?\s*[:：#]?\s*([A-Za-z0-9\-_]{5,20})", re.IGNORECASE),
)


def _extract_assessor(text: str) -> str | None:
    """从邮件文本中萃取审批官（Assessor）姓名。"""
    for pat in _ASSESSOR_PATTERNS:
        m = pat.search(text)
        if m:
            return m.group(1).strip() or None
    return None


def _extract_lender_ref(text: str) -> str | None:
    """从邮件文本中萃取银行系统案号（Lender Ref）。"""
    for pat in _REF_PATTERNS:
        m = pat.search(text)
        if m:
            return m.group(1).strip() or None
    return None


def _extract_shortfall_reason(text: str) -> str:
    """估价低卡点原因：优先带出估价金额与期望金额。"""
    amounts = re.findall(r"\$\s*([0-9][0-9,]*\.?[0-9]*\s*[kKmMbB]?)", text)
    if amounts:
        return f"估价过低：${amounts[0].strip()}" + (f" vs 期望 ${amounts[1].strip()}" if len(amounts) >= 2 else "")
    return "银行估价低于预期，形成价值缺口（valuation shortfall）"


def _classify_event(subject: str, body: str) -> tuple[str, bool, str | None]:
    """定性邮件事件类型与阻断卡点，返回 (event_type, is_blocker, blocker_reason)。"""
    text = f"{subject}\n{body}"[:4000]
    low = text.lower()
    if "valuation" in low and any(k in low for k in ("shortfall", "insufficient", "below", "lower", "低于", "不足", "过低")):
        return "valuation_shortfall", True, _extract_shortfall_reason(text)
    if "assessor" in low and "assign" in low:
        return "assessor_assigned", False, None
    if any(k in low for k in ("mir", "missing information", "further information", "additional information", "补件")):
        return "mir_requested", True, "银行要求补充材料（MIR）"
    if any(k in low for k in ("reassessment", "resubmission", "appeal", "argument letter", "复议")):
        return "reassessment_submitted", False, None
    if any(k in low for k in ("approve", "approval", "congratulation", "offer of finance", "批复", "批准")):
        return "approval_issued", False, None
    if any(k in low for k in ("submitted", "lodged", "lodgement", "application received", "递交")):
        return "submission_lodged", False, None
    return "note", False, None


def _generate_chinese_summary(
    event_type: str,
    subject: str,
    body: str,
    is_blocker: bool,
    blocker_reason: str | None,
    assessor: str | None = None,
) -> str:
    """根据邮件特征生成高质量、易读的中文核心业务摘要。"""
    sub_low = subject.lower()
    body_low = body.lower()
    full_low = f"{sub_low}\n{body_low}"

    if "preliminary assessment" in full_low or "preliminary" in sub_low:
        return "贷款方案初步预审完成，整理并向客户索要第一批审贷材料清单。"
    if "ready for signing" in full_low or "loan documents" in full_low or "signing" in sub_low:
        return "银行已下发正式贷款合同 (Loan Documents)，需提示客户完成打印签署与公证回传。"
    if event_type == "valuation_shortfall" or "valuation" in full_low and is_blocker:
        return blocker_reason or "银行房产评估结果偏低，已触发估价卡点，正组织同街区成交对比证据申请复议。"
    if event_type == "reassessment_submitted" or "reassessment" in full_low or "appeal" in full_low:
        return "已向评估部门递交最新成交案例与申诉信，正式申请重新核定房产估价。"
    if event_type == "approval_issued" or "unconditional" in full_low or "formal approval" in full_low:
        return "银行全套审查通过，正式下发贷款批复通知书 (Unconditional Approval)。"
    if "conditional" in full_low and "approval" in full_low:
        return "银行下发有条件批复通知书 (Conditional Approval)，正核对剩余前置满足条件。"
    if event_type == "mir_requested" or "mir" in full_low or "missing information" in full_low:
        return blocker_reason or "银行审贷官下发补件通知 (MIR)，需针对性补充借款人收入与负债凭据。"
    if event_type == "assessor_assigned" or "assigned to" in full_low:
        assessor_name = assessor or "信贷审查官"
        return f"银行已正式分配审贷经理（{assessor_name}），案卷进入实质性合规审理队列。"
    if event_type == "submission_lodged" or "lodged" in full_low or "lodgement" in full_low:
        return "贷款申请已通过审贷系统正式递交至目标银行，等待系统分流与初审。"
    if "settlement" in full_low:
        return "贷款案卷已进入交割结算阶段，正与过户律师对齐款项划拨与放款时限。"

    # Fallback: clean up clean sentences
    clean_body = re.sub(r"\s+", " ", body).strip()
    return clean_body[:180] + ("..." if len(clean_body) > 180 else "")


def _parse_msg_file(msg_path: Path) -> dict[str, Any] | None:
    """解析单个 .msg 邮件并定性为一条时间线事件；解析失败跳过。"""
    try:
        from extract_msg import Message

        with Message(msg_path) as msg:
            subject = msg.subject or ""
            body = msg.body or ""
            event_time = ""
            if msg.date:
                if isinstance(msg.date, datetime):
                    event_time = msg.date.replace(tzinfo=UTC).isoformat() if msg.date.tzinfo is None else msg.date.isoformat()
                else:
                    event_time = str(msg.date)
            text = f"{subject}\n{body}"
            assessor = _extract_assessor(text)
            lender_ref = _extract_lender_ref(text)
            event_type, is_blocker, blocker_reason = _classify_event(subject, body)
            
            # Generate actionable Chinese summary
            chinese_summary = _generate_chinese_summary(
                event_type, subject, body, is_blocker, blocker_reason, assessor
            )

            return {
                "id": None,
                "event_time": event_time,
                "event_type": event_type,
                "title": (subject.strip() or msg_path.stem)[:120],
                "summary": chinese_summary,
                "sender": msg.sender or None,
                "assessor": assessor,
                "lender_ref": lender_ref,
                "source_file": msg_path.name,
                "is_blocker": is_blocker,
                "blocker_reason": blocker_reason,
            }
    except Exception as exc:  # noqa: BLE001
        logger.warning("跳过无法解析的 .msg 邮件 %s：%s", msg_path.name, exc)
        return None


def extract_timeline_from_folder(folder_path: Path) -> list[dict[str, Any]]:
    """扫描目录下的所有 .msg 邮件并返回正序时间线事件列表。"""
    events: list[dict[str, Any]] = []
    if not folder_path.exists():
        logger.warning("邮件目录不存在，跳过扫描: %s", folder_path)
        return events
    for msg_path in sorted(folder_path.rglob("*.msg")):
        event = _parse_msg_file(msg_path)
        if event is not None:
            events.append(event)
    events.sort(key=lambda e: e.get("event_time") or "")
    return events


def _build_content(ev: dict[str, Any]) -> str:
    parts = [f"[{ev.get('event_type') or 'note'}] {ev.get('title') or ''}".strip()]
    if ev.get("assessor"):
        parts.append(f"审批官：{ev['assessor']}")
    if ev.get("lender_ref"):
        parts.append(f"案号：{ev['lender_ref']}")
    if ev.get("is_blocker") and ev.get("blocker_reason"):
        parts.append(f"卡点：{ev['blocker_reason']}")
    parts.append(ev.get("summary") or "")
    return "\n".join(p for p in parts if p)


def _write_event(case_id: str, ev: dict[str, Any], db: Session) -> bool:
    source_ref = f"email_timeline:{ev.get('source_file') or ''}:{ev.get('event_type') or 'note'}"
    exists = (
        db.query(CaseContextEvent)
        .filter(
            CaseContextEvent.case_id == case_id,
            CaseContextEvent.source_type == "email_timeline",
            CaseContextEvent.source_ref == source_ref,
        )
        .first()
    )
    if exists is not None:
        return False
    db.add(
        CaseContextEvent(
            case_id=case_id,
            source_type="email_timeline",
            content=_build_content(ev),
            track="internal",
            source_ref=source_ref,
            status="confirmed",
        )
    )
    db.commit()
    return True


def _derive_headline(events: list[dict[str, Any]]) -> tuple[str | None, str | None, str | None]:
    assessor = lender_ref = active_blocker = None
    for ev in reversed(events):
        if not assessor and ev.get("assessor"):
            assessor = str(ev["assessor"])
        if not lender_ref and ev.get("lender_ref"):
            lender_ref = str(ev["lender_ref"])
        if not active_blocker and ev.get("is_blocker"):
            active_blocker = str(ev.get("blocker_reason") or ev.get("title") or "")
    return assessor, lender_ref, active_blocker


def sync_timeline_for_case(case_id: str, db: Session) -> dict[str, Any]:
    """对指定案件执行邮件时间线扫描、解析审批官/案号并落库 CaseContextEvent。"""
    case = db.query(Case).filter(Case.id == case_id).first()
    if case is None or not case.folder_path:
        logger.info("案件不存在或未关联文件夹，跳过时间线同步: %s", case_id)
        return {"extracted_count": 0, "assessor_name": None, "lender_ref": None, "active_blocker": None}
    events = sorted(
        extract_timeline_from_folder(Path(case.folder_path)),
        key=lambda e: e.get("event_time") or "",
    )
    written = sum(1 for ev in events if _write_event(case_id, ev, db))
    assessor, lender_ref, active_blocker = _derive_headline(events)
    logger.info("案件 %s 邮件时间线同步完成：解析 %d 封，写入 %d 条", case_id, len(events), written)
    return {"extracted_count": written, "assessor_name": assessor, "lender_ref": lender_ref, "active_blocker": active_blocker}


def _query_timeline_rows(case_id: str, db: Session) -> list[CaseContextEvent]:
    """查询指定案件的多源时序事件（邮件、手动手记、阶段推进、关键里程碑）。"""
    allowed_sources = (
        "email_timeline",
        "manual_note",
        "stage_advanced",
        "stage_progression",
        "milestone",
    )
    return (
        db.query(CaseContextEvent)
        .filter(
            CaseContextEvent.case_id == case_id,
            CaseContextEvent.source_type.in_(allowed_sources),
        )
        .order_by(CaseContextEvent.created_at.asc(), CaseContextEvent.id.asc())
        .all()
    )


def _event_from_row(row: CaseContextEvent) -> dict[str, Any]:
    content = row.content or ""
    source_type = row.source_type or "note"

    # Default mappings based on source_type
    if source_type == "manual_note":
        event_type = "manual_note"
        default_title = "经办人沟通手记"
    elif source_type in ("stage_advanced", "stage_progression"):
        event_type = "submission_lodged"
        default_title = "案件阶段流转推进"
    elif source_type == "milestone":
        event_type = "submission_lodged"
        default_title = "业务关键里程碑"
    else:
        event_type = "note"
        default_title = "邮件时序事件"

    title = ""
    summary_lines: list[str] = []
    assessor = lender_ref = blocker_reason = None
    is_blocker = False

    for line in content.splitlines():
        m = re.match(r"\[([a-z_]+)\]\s*(.*)", line)
        if m:
            event_type, title = m.group(1), m.group(2)
        elif line.startswith("审批官："):
            assessor = line.split("：", 1)[1].strip() or None
        elif line.startswith("案号："):
            lender_ref = line.split("：", 1)[1].strip() or None
        elif line.startswith("卡点："):
            is_blocker = True
            blocker_reason = line.split("：", 1)[1].strip() or None
        else:
            summary_lines.append(line)

    source_file = None
    if row.source_ref and row.source_ref.startswith("email_timeline:"):
        source_file = row.source_ref.replace("email_timeline:", "").split(":", 1)[0] or None

    return {
        "id": str(row.id),
        "event_time": row.created_at.isoformat() if row.created_at else "",
        "event_type": event_type,
        "title": title or default_title,
        "summary": "\n".join(summary_lines).strip() or content,
        "sender": "经办人 (Vera)" if source_type == "manual_note" else None,
        "assessor": assessor,
        "lender_ref": lender_ref,
        "source_file": source_file,
        "is_blocker": is_blocker,
        "blocker_reason": blocker_reason,
    }


def get_timeline_for_case(case_id: str, db: Session) -> list[dict[str, Any]]:
    """查询指定案件的时序事件（优先读取已落库事件，无则尝试即时扫描）。"""
    rows = _query_timeline_rows(case_id, db)
    if not rows:
        sync_timeline_for_case(case_id, db)
        rows = _query_timeline_rows(case_id, db)
    return [_event_from_row(r) for r in rows]