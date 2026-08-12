"""邮件草稿测试 — 钉住 generate_from_advisor / _clean_json / 双语拼装。"""

import json

import pytest

from core.drafts.bilingual import build_bilingual_body, split_bilingual_body
from core.drafts.generator import _clean_json, generate_from_advisor
from core.models.orm import Action, EmailDraft


def _make_action(db, *, type_: str = "advisor_reply", suggestion: dict | str, case_id: str = "CASE-EML-001", title: str = "回复") -> Action:
    action = Action(
        case_id=case_id,
        type=type_,
        title=title,
        status="pending",
        ai_suggestion=(
            json.dumps(suggestion, ensure_ascii=False)
            if isinstance(suggestion, dict)
            else suggestion
        ),
    )
    db.add(action)
    db.commit()
    return action


class TestCleanJson:
    """_clean_json 剥掉 Markdown 围栏。"""

    def test_plain_json_unchanged(self):
        assert _clean_json('{"a": 1}') == '{"a": 1}'

    def test_json_fence_stripped(self):
        assert _clean_json('```json\n{"a": 1}\n```') == '{"a": 1}'

    def test_backtick_only_fence_stripped(self):
        assert _clean_json("```\n{\"a\": 1}\n```") == '{"a": 1}'

    def test_none_safe(self):
        assert _clean_json(None) == ""


class TestGenerateFromAdvisor:
    """从 Advisor Action 提取草稿，不调 LLM。"""

    def test_followup_draft_direct(self, test_db):
        """followup_draft 的 ai_suggestion 直接作为正文。"""
        action = _make_action(
            test_db,
            type_="followup_draft",
            suggestion="请协助提供最近3个月银行流水。",
            title="催件：银行流水",
        )
        draft = generate_from_advisor(action.id, test_db)
        assert draft is not None
        assert draft.draft_type == "follow_up"
        assert "银行流水" in draft.body
        assert draft.status == "draft"  # 绝不自动发送

    def test_reply_extracts_email_reply_draft(self, test_db):
        """advisor_reply 提取 ai_suggestion.email_reply_draft。"""
        action = _make_action(
            test_db,
            type_="advisor_reply",
            suggestion={"email_reply_draft": "Dear Bank, please see attached.", "source_msg_id": "INBOX-9"},
        )
        draft = generate_from_advisor(action.id, test_db)
        assert draft is not None
        assert draft.draft_type == "reply"
        assert "Dear Bank" in draft.body
        assert draft.source_msg_id == "INBOX-9"
        assert draft.status == "draft"

    def test_broker_notes_extracts_draft(self, test_db):
        """advisor_notes 提取 broker_notes_draft 且强制英文。"""
        action = _make_action(
            test_db,
            type_="advisor_notes",
            suggestion={"broker_notes_draft": "Client is PAYG with stable income."},
        )
        draft = generate_from_advisor(action.id, test_db)
        assert draft is not None
        assert draft.draft_type == "broker_notes"
        assert draft.language == "en"

    def test_idempotent_same_action(self, test_db):
        """同一 Action 不重复生成草稿。"""
        action = _make_action(
            test_db,
            type_="advisor_reply",
            suggestion={"email_reply_draft": "hello"},
        )
        first = generate_from_advisor(action.id, test_db)
        second = generate_from_advisor(action.id, test_db)
        assert first.id == second.id
        count = test_db.query(EmailDraft).filter(EmailDraft.source_action_id == action.id).count()
        assert count == 1

    def test_unsupported_type_returns_none(self, test_db):
        """不支持的 Action type 返回 None 且不落库。"""
        action = _make_action(test_db, type_="classify", suggestion="{}")
        assert generate_from_advisor(action.id, test_db) is None
        assert test_db.query(EmailDraft).count() == 0

    def test_missing_action_returns_none(self, test_db):
        assert generate_from_advisor(99999, test_db) is None


class TestBilingualBody:
    """双语正文拼装/拆分往返。"""

    def test_build_then_split_roundtrip(self):
        zh, en = "请补充流水", "Please provide statements."
        body = build_bilingual_body(zh, en)
        zh2, en2 = split_bilingual_body(body)
        assert zh2 == zh
        assert en2 == en

    def test_split_without_marker(self):
        zh, en = split_bilingual_body("plain text")
        assert zh == "plain text"
        assert en == ""

    def test_empty_body(self):
        assert split_bilingual_body("") == ("", "")
