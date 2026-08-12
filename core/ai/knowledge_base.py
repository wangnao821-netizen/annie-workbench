"""Case Knowledge Base — 每案件自动维护的 AI 记忆文档。

V5 迁移：旧 modules/strategy_engine/knowledge_base.py → core/ai/knowledge_base.py。
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from core.logger import get_logger
from core.models.orm import Case, CaseChecklist, CaseFile

logger = get_logger(__name__)

_SKIP_KEYS = ("文件名", "解析路由", "文本字数", "解析状态", "材料分类")
_INCOME_TYPES = ("Payslip", "TaxReturn", "EmploymentLetter", "BAS", "AccountantLetter")
_LIABILITY_TYPES = ("HomeLoanStatement", "CreditCardStatement")


class CaseKnowledgeBase:
    """构建和更新每个案件的知识库摘要。"""

    def __init__(self, db: Session) -> None:
        self._db = db

    def build_knowledge(self, case_id: str) -> str:
        case_info = self._get_case_info(case_id)
        if not case_info:
            return f"# Case {case_id}\n\nNo case information found."
        knowledge = self._assemble_knowledge(
            case_info,
            self._get_files_info(case_id),
            self._get_checklist_info(case_id),
        )
        self._save_knowledge(case_id, knowledge)
        return knowledge

    def _get_case_info(self, case_id: str) -> dict[str, Any] | None:
        case = self._db.query(Case).filter(Case.id == case_id).first()
        if not case:
            return None
        return {"case_id": case.id, "client_name": case.client_name,
                "case_type": case.case_type, "residency_status": case.residency,
                "preferred_language": case.preferred_language, "lender": case.lender,
                "loan_amount": case.loan_amount or 0, "property_value": case.property_value or 0,
                "lvr": case.lvr or 0, "loan_purpose": case.purpose, "stage": case.stage,
                "is_urgent": case.is_urgent, "urgent_reason": case.urgent_reason}

    def _get_files_info(self, case_id: str) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        for f in self._db.query(CaseFile).filter(CaseFile.case_id == case_id).order_by(CaseFile.created_at).all():
            info: dict[str, Any] = {"file_name": f.original_name,
                                    "document_type": f.assigned_type,
                                    "confidence": f.confidence,
                                    "suggested_name": f.suggested_name,
                                    "status": f.status}
            if f.extracted_data:
                try:
                    info["extracted_fields"] = json.loads(f.extracted_data)
                except (json.JSONDecodeError, TypeError):
                    pass
            result.append(info)
        return result

    def _get_checklist_info(self, case_id: str) -> list[dict[str, Any]]:
        items = self._db.query(CaseChecklist).filter(CaseChecklist.case_id == case_id).all()
        return [{"document_type": i.item_name,
                 "status": i.status.upper() if i.status else "MISSING"} for i in items]

    def _assemble_knowledge(
        self,
        case_info: dict[str, Any],
        files_info: list[dict[str, Any]],
        checklist_info: list[dict[str, Any]],
    ) -> str:
        """组装知识文本（行为与旧版一致）。"""
        sec: list[str] = []
        sec.append("## Client Profile")
        sec += [f"- **{label}**: {case_info.get(key, 'N/A')}" for label, key in (
            ("Client Name", "client_name"), ("Case ID", "case_id"),
            ("Case Type", "case_type"), ("Residency Status", "residency_status"),
            ("Preferred Language", "preferred_language"))]

        sec.append("\n## Loan Details")
        sec += [f"- **{label}**: {val}" for label, val in (
            ("Target Lender", case_info.get('lender', 'N/A')),
            ("Loan Amount", f"${case_info.get('loan_amount', 0):,.0f}"),
            ("Property Value", f"${case_info.get('property_value', 0):,.0f}"),
            ("LVR", f"{case_info.get('lvr', 0):.1f}%"),
            ("Loan Purpose", case_info.get('loan_purpose', 'N/A')),
            ("Stage", case_info.get('stage', 'N/A')))]
        if case_info.get("is_urgent"):
            sec.append(f"\n> ⚠️ **URGENT**: {case_info.get('urgent_reason', 'No reason specified')}")
        sec.append("\n## Documents Received")
        if files_info:
            for f in files_info:
                conf = f"{f['confidence']:.0%}" if f.get("confidence") else "N/A"
                sec.append(
                    f"- **{f['document_type'] or 'Unknown'}** — "
                    f"`{f['file_name']}` (confidence: {conf}, status: {f['status']})"
                )
                fields = {k: v for k, v in (f.get("extracted_fields") or {}).items()
                          if k not in _SKIP_KEYS and v}
                sec += [f"    - {k}: {v}" for k, v in list(fields.items())[:5]]
        else:
            sec.append("- No documents received yet.")

        sec.append("\n## Checklist Status")
        if checklist_info:
            received = [c for c in checklist_info if c["status"] == "RECEIVED"]
            missing = [c for c in checklist_info if c["status"] in ("MISSING", "PENDING")]
            if received:
                sec.append(f"- ✅ Received ({len(received)}): " + ", ".join(c["document_type"] for c in received))
            if missing:
                sec.append(f"- ❌ Missing ({len(missing)}): " + ", ".join(c["document_type"] for c in missing))
        else:
            sec.append("- Checklist not yet evaluated.")
        sec.append("\n## Income Structure (Inferred)")
        income = {f["document_type"] for f in files_info if f.get("document_type") in _INCOME_TYPES}
        if income & {"BAS", "AccountantLetter"}:
            sec.append("- **Employment Type**: Self-Employed (BAS/Accountant Letter found)")
        elif "Payslip" in income:
            sec.append("- **Employment Type**: PAYG (Payslip found)")
        elif "TaxReturn" in income:
            sec.append("- **Employment Type**: Likely PAYG or Self-Employed (Tax Return found)")
        else:
            sec.append("- Income documents not yet received.")

        sec.append("\n## Liabilities (Inferred)")
        liability = [f for f in files_info if f.get("document_type") in _LIABILITY_TYPES]
        if liability:
            sec += [f"- {f['document_type']}: `{f['file_name']}`" for f in liability]
        else:
            sec.append("- No liability documents received yet.")
        return "\n".join(sec)

    def _save_knowledge(self, case_id: str, knowledge: str) -> None:
        """写入 Case.knowledge_summary（不触碰 context_summary，由 accumulator 管理）。"""
        case = self._db.query(Case).filter(Case.id == case_id).first()
        if case:
            case.knowledge_summary = knowledge
            self._db.commit()
            logger.info("Knowledge summary (structured view) updated for case %s", case_id)

    def get_cached_knowledge(self, case_id: str) -> str | None:
        case = self._db.query(Case).filter(Case.id == case_id).first()
        if case and case.knowledge_summary:
            return case.knowledge_summary
        return None
