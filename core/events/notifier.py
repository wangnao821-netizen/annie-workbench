"""Chinese Markdown report generator (Enhanced).

Generates comprehensive file-identification reports in Chinese for Vera,
written to ``data/reports/{case_id}_{timestamp}.md``. All output paths pass
through ``PathGuard`` validation.

Report sections:
    1. Case summary header with progress bar
    2. Identified files table with details
    3. Required missing documents (must-have)
    4. Optional pending items (if applicable)
    5. Files needing manual review (PII blocked / OCR failed)
    6. Action recommendations for Vera
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.orm import Session

from core.checklist.matcher import check_completeness
from core.config import ConfigLoader
from core.logger import get_logger
from core.security.path_guard import PathGuard
from core.models.orm import Case, CaseFile

logger = get_logger(__name__)

# Document type Chinese labels for readability
_TYPE_LABELS: dict[str, str] = {
    "Passport": "护照",
    "DriverLicense": "驾照",
    "Visa": "签证",
    "Payslip": "工资单",
    "EmploymentLetter": "雇佣信",
    "BankStatement": "银行流水",
    "HomeLoanStatement": "房贷账单",
    "CreditCardStatement": "信用卡账单",
    "CouncilRates": "市政费通知",
    "TaxReturn": "税务申报",
    "ContractOfSale": "买卖合同",
    "ValuationReport": "估价报告",
    "ApplicationForm": "申请表",
    "DischargeAuthority": "解押授权书",
    "MedicareCard": "Medicare卡",
    "UtilityBill": "水电账单",
}

# Case type Chinese labels
_CASE_TYPE_LABELS: dict[str, str] = {
    "full_doc": "Full Doc (全文档)",
    "lite_doc": "Lite Doc (简文档)",
    "alt_doc": "Alt Doc (替代文档)",
}


def _label(doc_type: str) -> str:
    """Return Chinese label for a document type, fallback to original."""
    return _TYPE_LABELS.get(doc_type, doc_type)


def _progress_bar(done: int, total: int, width: int = 20) -> str:
    """Generate a text progress bar like [=========>..........] 45%."""
    if total == 0:
        return "[" + "." * width + "] 0%"
    ratio = done / total
    filled = int(width * ratio)
    bar = "=" * filled + (">" if filled < width else "") + "." * (width - filled - (1 if filled < width else 0))
    return f"[{bar}] {int(ratio * 100)}%"


class Notifier:
    """Builds and writes comprehensive Chinese Markdown reports for loan cases."""

    def __init__(
        self,
        config: ConfigLoader,
        session: Session,
        path_guard: PathGuard,
    ) -> None:
        self._config = config
        self._session = session
        self._guard = path_guard
        self._output_dir = config.settings.report.output_dir
        self._expiry_days = config.settings.report.expiry_warning_days

    def generate_report(self, case_id: str) -> Path:
        """Generate and save an enhanced Chinese Markdown report.

        Args:
            case_id: Case identifier.

        Returns:
            Absolute path to the generated ``.md`` file.
        """
        project_root = self._config.project_root
        now = datetime.now(UTC)
        ts = now.strftime("%Y%m%d_%H%M%S")

        # ── Gather data ───────────────────────────────────────────
        case = self._session.get(Case, case_id)
        case_type = case.case_type if case else "unknown"
        case_type_label = _CASE_TYPE_LABELS.get(case_type, case_type)
        processed = self._session.query(CaseFile).filter_by(case_id=case_id).all()

        try:
            checklist_report = check_completeness(
                case_id, self._session, self._config,
            )
        except Exception:
            checklist_report = None

        # Categorize files
        reported = [f for f in processed if f.status in ("REPORTED", "APPROVED")]
        manual_review = [f for f in processed if f.status == "NEEDS_MANUAL_REVIEW"]
        pii_blocked = [f for f in processed if f.status == "PII_BLOCKED"]

        # Checklist stats
        missing_items = []
        pending_items = []
        received_items = []
        if checklist_report and checklist_report.items:
            missing_items = [it for it in checklist_report.items if it.status == "missing"]
            pending_items = [it for it in checklist_report.items if it.status == "pending_confirm"]
            received_items = [it for it in checklist_report.items if it.status == "received"]

        total_required = len(missing_items) + len(received_items)
        total_checklist = total_required + len(pending_items)

        # ── Build markdown ────────────────────────────────────────
        lines: list[str] = []

        # Header
        lines.append("# 文件识别报告\n")

        # Case summary box
        lines.append("## 案件概况\n")
        lines.append("| 项目 | 内容 |")
        lines.append("|------|------|")
        lines.append(f"| 案件编号 | {case_id} |")
        lines.append(f"| 案件类型 | {case_type_label} |")
        lines.append(f"| 本次处理 | {len(processed)} 个文件 |")
        lines.append(f"| 成功识别 | {len(reported)} 个 |")
        if manual_review or pii_blocked:
            lines.append(f"| 需人工处理 | {len(manual_review) + len(pii_blocked)} 个 |")
        lines.append(f"| 报告时间 | {now.strftime('%Y-%m-%d %H:%M')} (UTC) |")

        # Progress section
        if total_required > 0:
            lines.append("\n### 材料收集进度\n")
            bar = _progress_bar(len(received_items), total_required)
            lines.append(f"**必需材料：** {len(received_items)}/{total_required} 已收齐")
            lines.append("```")
            lines.append(f"{bar}")
            lines.append("```")
            if pending_items:
                lines.append(f"另有 {len(pending_items)} 项视情况而定（非必需）")

        # Section 1: Identified files
        lines.append("\n---\n")
        lines.append("## 已识别文件\n")
        if reported:
            lines.append("| # | 文件名 | 识别类型 | 置信度 | 建议命名 |")
            lines.append("|---|--------|----------|--------|----------|")
            for idx, f in enumerate(reported, 1):
                conf = f.confidence
                conf_str = f"{int(conf * 100)}%" if conf is not None else "—"
                doc_type = f.assigned_type or "?"
                type_display = f"{_label(doc_type)}"
                fname = f.original_name or "?"
                suggested = f.suggested_name or "—"
                # Confidence indicator
                if conf and conf >= 0.9:
                    conf_indicator = "HIGH"
                elif conf and conf >= 0.7:
                    conf_indicator = "MED"
                else:
                    conf_indicator = "LOW"
                lines.append(
                    f"| {idx} "
                    f"| {fname} "
                    f"| {type_display} "
                    f"| {conf_str} ({conf_indicator}) "
                    f"| {suggested} |"
                )
        else:
            lines.append("暂无已识别文件。\n")

        # Section 2: Missing documents (MUST HAVE)
        if missing_items:
            lines.append("\n---\n")
            lines.append("## 缺件清单（必需）\n")
            lines.append("> 以下材料为该案件类型的必需文件，请尽快收集。\n")
            lines.append("| # | 文件类型 | 说明 |")
            lines.append("|---|----------|------|")
            for idx, it in enumerate(missing_items, 1):
                lines.append(f"| {idx} | **{_label(it.doc_type)}** | {it.description} |")

        # Section 3: Pending items (OPTIONAL / IF APPLICABLE)
        if pending_items:
            lines.append("\n---\n")
            lines.append("## 待确认项（视情况而定）\n")
            lines.append("> 以下材料不一定适用于所有案件，请根据实际情况判断是否需要。\n")
            for it in pending_items:
                lines.append(f"- **{_label(it.doc_type)}** — {it.description}")

        # Section 4: Manual review / PII blocked
        needs_attention = manual_review + pii_blocked
        if needs_attention:
            lines.append("\n---\n")
            lines.append("## 需要人工处理\n")
            lines.append("> 以下文件无法自动分类，需要人工确认。\n")
            lines.append("| 文件名 | 原因 | 建议操作 |")
            lines.append("|--------|------|----------|")
            for f in needs_attention:
                fname = f.original_name or "?"
                status = f.status or ""
                # Determine reason and suggestion
                if status == "PII_BLOCKED":
                    reason = "含敏感信息（PII），安全拦截"
                    suggestion = "请手动检查并脱敏后重新提交，或直接归档"
                elif "ocr_failed" in (f.parse_route or ""):
                    reason = "图片/扫描件无法识别文字"
                    suggestion = "请确认文件是否清晰，或手动标注类型"
                else:
                    reason = "置信度过低，无法确定类型"
                    suggestion = "请人工确认文件类型"
                lines.append(f"| {fname} | {reason} | {suggestion} |")

        # Section 5: Action recommendations
        lines.append("\n---\n")
        lines.append("## 下一步操作建议\n")

        actions: list[str] = []
        if missing_items:
            missing_names = "、".join(_label(it.doc_type) for it in missing_items[:5])
            actions.append(f"1. **收集缺件** — 请联系客户提供：{missing_names}")
        if needs_attention:
            actions.append(f"2. **人工确认** — {len(needs_attention)} 个文件需要手动检查（见上方表格）")
        if pending_items:
            actions.append(f"3. **确认可选项** — 请判断 {len(pending_items)} 个「视情况而定」项是否适用于本案件")
        if not missing_items and not needs_attention:
            actions.append("1. **材料齐全** — 所有必需文件已收齐，可以提交给 Lender")

        if actions:
            lines.extend(actions)
        else:
            lines.append("暂无特别操作建议。")

        # Footer
        lines.append("\n---\n")
        lines.append(f"*本报告由 Loan-Assistant 自动生成 | {now.strftime('%Y-%m-%d %H:%M:%S')} UTC*")

        content = "\n".join(lines) + "\n"

        # ── Write file ────────────────────────────────────────────
        out_dir = project_root / self._output_dir
        out_file = out_dir / f"{case_id}_{ts}.md"
        self._guard.assert_write_allowed(out_file)
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file.write_text(content, encoding="utf-8")
        logger.info("Report generated: %s", out_file)
        return out_file
