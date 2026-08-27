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
    """估价低卡点原因：精确提取估价与门槛金额，过滤房贷余额等无关干扰。"""
    m_threshold = re.search(
        r"(?:lower than|below|less than|under)\s*\$\s*([0-9][0-9,]*\.?[0-9]*\s*(?:mil|m|k|b)?)",
        text,
        re.IGNORECASE,
    )
    m_est = re.search(
        r"(?:estimated value|expected value|expected|est\.? value|期望(?:估值)?)\s*(?:is|at|for|:|the)?\s*\$\s*([0-9][0-9,]*\.?[0-9]*\s*(?:mil|m|k|b)?)",
        text,
        re.IGNORECASE,
    )
    m_val = re.search(
        r"(?:valuation|val|mv|market value|估价|评估)\s*(?:is|at|of|came in at|came back at|was|:)?\s*\$\s*([0-9][0-9,]*\.?[0-9]*\s*(?:mil|m|k|b)?)",
        text,
        re.IGNORECASE,
    )

    if m_val and m_est:
        return f"估价过低：实际 ${m_val.group(1)} vs 期望 ${m_est.group(1)}"
    if m_threshold and m_est:
        return f"估价门槛预期：门槛 ${m_threshold.group(1)} vs 期望 ${m_est.group(1)}"
    if m_threshold:
        return f"估价低于门槛：低于 ${m_threshold.group(1)} 触发转贷方案"
    if m_val:
        return f"估价过低：${m_val.group(1)}"
    if m_est:
        return f"估价期望值：${m_est.group(1)}"

    # 智能兜底：若包含 valuation 与 shortfall/below 且有金额
    amounts = re.findall(r"\$\s*([0-9][0-9,]*\.?[0-9]*\s*(?:mil|m|k|b)?)", text, re.IGNORECASE)
    if amounts and not any(k in text.lower() for k in ("remaining balance", "loan balance")):
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
            else:
                # 针对从未发送过的草稿/模板文件（msg.date is None），回退使用物理文件最后修改时间
                try:
                    mtime_dt = datetime.fromtimestamp(msg_path.stat().st_mtime, tz=UTC)
                    event_time = mtime_dt.isoformat()
                except Exception:  # noqa: BLE001
                    event_time = ""
            text = f"{subject}\n{body}"
            assessor = _extract_assessor(text)
            lender_ref = _extract_lender_ref(text)
            event_type, is_blocker, blocker_reason = _classify_event(subject, body)
            
            # Generate actionable Chinese summary
            chinese_summary = _generate_chinese_summary(
                event_type, subject, body, is_blocker, blocker_reason, assessor
            )

            title_str = (
                (f"[草稿/模板] {subject.strip()}" if (
                    any(k in str(msg_path).replace("\\", "/").lower() for k in ("/val template/", "/template")) or
                    any(k in subject for k in ("[Client Name]", "First Name FAMILY NAME", "[Lender]"))
                ) else subject.strip()) or msg_path.stem
            )[:120]

            return {
                "id": None,
                "event_time": event_time,
                "event_type": event_type,
                "title": title_str,
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
    # 解析邮件原始发送时间
    occurred = None
    raw_time = ev.get("event_time")
    if raw_time:
        try:
            from datetime import datetime as _dt
            if isinstance(raw_time, str):
                # 兼容 ISO 格式（含/不含时区）
                cleaned = raw_time.replace("Z", "+00:00")
                occurred = _dt.fromisoformat(cleaned)
            elif isinstance(raw_time, _dt):
                occurred = raw_time
        except (ValueError, TypeError):
            pass
    db.add(
        CaseContextEvent(
            case_id=case_id,
            source_type="email_timeline",
            content=_build_content(ev),
            track="internal",
            source_ref=source_ref,
            status="confirmed",
            occurred_at=occurred,
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


STAGE_PRIORITY: dict[str, int] = {
    "settled": 90,
    "已结算": 90,
    "已放款": 90,
    "settling": 80,
    "结算中": 80,
    "approved": 70,
    "已批准": 70,
    "valuing": 60,
    "估值中": 60,
    "os_requested": 50,
    "银行补件": 50,
    "submitted": 45,
    "已递交(等银行)": 45,
    "已递交": 45,
    "to_submit": 30,
    "待递交": 30,
    "reviewing": 20,
    "审核中": 20,
    "gathering": 10,
    "收集资料": 10,
}


def _infer_stage_from_timeline(events: list[dict[str, Any]]) -> str | None:
    """根据邮件时序事件推断案件当前应当处于的阶段 (WO-91)。"""
    inferred = None
    max_priority = 0

    for ev in events:
        ev_type = ev.get("event_type") or ""
        subj = (ev.get("subject") or "").lower()
        body = (ev.get("body") or "").lower()
        text = f"{subj} {body}"

        cand_stage = None
        if "settlement" in text and any(k in text for k in ("confirmed", "completed", "done", "已放款", "已结算")):
            cand_stage = "已结算"
        elif "ready for signing" in text or "loan documents" in text or "signing" in subj:
            cand_stage = "结算中"
        elif ev_type == "approval_issued" or "unconditional" in text or "formal approval" in text or "offer of finance" in text or "批复" in text:
            cand_stage = "已批准"
        elif "conditional approval" in text or "pre-approval" in text:
            cand_stage = "已批准"
        elif ev_type == "mir_requested" or "mir" in text or "missing information" in text or "补件" in text:
            cand_stage = "银行补件"
        elif ev_type == "valuation_shortfall" or "valuation" in text:
            cand_stage = "估值中"
        elif ev_type == "submission_lodged" or "lodged" in text or "application received" in text or "递交" in text:
            cand_stage = "已递交(等银行)"

        if cand_stage:
            prio = STAGE_PRIORITY.get(cand_stage, 0)
            if prio > max_priority:
                max_priority = prio
                inferred = cand_stage

    return inferred


def sync_timeline_for_case(case_id: str, db: Session) -> dict[str, Any]:
    """对指定案件执行邮件时间线扫描、解析审批官/案号并落库 CaseContextEvent，同时联动推进阶段 (WO-91)。"""
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

    # 联动推进阶段 (WO-91)
    inferred_stage = _infer_stage_from_timeline(events)
    if inferred_stage:
        curr_prio = STAGE_PRIORITY.get(case.stage or "", 0)
        new_prio = STAGE_PRIORITY.get(inferred_stage, 0)
        if new_prio > curr_prio or case.stage in ("收集资料", "初步咨询", "待递交", None):
            case.stage = inferred_stage
            db.flush()
            logger.info("案件 %s 阶段根据邮件时序自动推进为: %s", case_id, inferred_stage)

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

    # 优先使用事件真实发生时间（occurred_at），若无则回退到入库时间（created_at）
    real_time = getattr(row, "occurred_at", None) or row.created_at
    return {
        "id": str(row.id),
        "event_time": real_time.isoformat() if real_time else "",
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
    """查询指定案件的时序事件（优先读取已落库事件，无邮件事件则自动触发扫描）。"""
    rows = _query_timeline_rows(case_id, db)
    # 修复短路判断：检查是否存在 email_timeline 类型事件，
    # 若不存在则触发邮件扫描（避免被 manual_note 等事件阻断）
    has_email_events = any(r.source_type == "email_timeline" for r in rows)
    if not has_email_events:
        sync_timeline_for_case(case_id, db)
        rows = _query_timeline_rows(case_id, db)
    return [_event_from_row(r) for r in rows]