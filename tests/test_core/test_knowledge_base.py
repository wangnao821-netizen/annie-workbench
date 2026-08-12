"""core/ai/knowledge_base.py 迁移测试。"""

from core.ai.knowledge_base import CaseKnowledgeBase
from core.models.orm import Case, CaseChecklist, CaseFile


def _make_case(test_db):
    case = Case(
        id="case_kb_1",
        client_name="PERSON_1",
        lender="CBA",
        loan_amount=850000,
        stage="收集资料",
        case_type="FullDoc",
    )
    test_db.add(case)
    test_db.commit()
    return case


def _make_file(test_db, name="payslip.pdf", doc_type="Payslip"):
    f = CaseFile(
        id=f"file_{name}",
        case_id="case_kb_1",
        original_name=name,
        assigned_type=doc_type,
        confidence=0.95,
        nas_path=f"/tmp/{name}",
    )
    test_db.add(f)
    test_db.commit()
    return f


class TestBuildKnowledge:
    def test_builds_knowledge_text(self, test_db):
        _make_case(test_db)
        text = CaseKnowledgeBase(test_db).build_knowledge("case_kb_1")
        assert "Client Profile" in text
        assert "PERSON_1" in text
        assert "CBA" in text

    def test_persists_knowledge_summary(self, test_db):
        case = _make_case(test_db)
        CaseKnowledgeBase(test_db).build_knowledge("case_kb_1")
        test_db.refresh(case)
        assert case.knowledge_summary and "Client Profile" in case.knowledge_summary

    def test_missing_case(self, test_db):
        text = CaseKnowledgeBase(test_db).build_knowledge("case_kb_missing")
        assert "No case information found." in text

    def test_documents_and_checklist(self, test_db):
        _make_case(test_db)
        _make_file(test_db)
        test_db.add(
            CaseChecklist(
                case_id="case_kb_1", item_name="Payslip", category="Income",
                status="received",
            )
        )
        test_db.commit()
        text = CaseKnowledgeBase(test_db).build_knowledge("case_kb_1")
        assert "Payslip" in text
        assert "Income" in text

    def test_get_cached_knowledge(self, test_db):
        _make_case(test_db)
        kb = CaseKnowledgeBase(test_db)
        kb.build_knowledge("case_kb_1")
        assert kb.get_cached_knowledge("case_kb_1") is not None
        assert kb.get_cached_knowledge("case_kb_none") is None
