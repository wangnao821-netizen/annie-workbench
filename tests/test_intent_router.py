import pytest

from core.chat.intent_router import ChatIntent, classify_chat_intent
from core.models.db import get_sa_session

test_cases = [
    ("你能帮我做什么", ChatIntent.META_HELP),
    ("你有什么功能", ChatIntent.META_HELP),
    ("不需要了", ChatIntent.STATUS_ACK),
    ("好的，收到", ChatIntent.STATUS_ACK),
    ("暂停", ChatIntent.STATUS_ACK),
    ("查下她的供楼单", ChatIntent.FOLDER_LOOKUP),
    ("文件夹里找下地税单", ChatIntent.FOLDER_LOOKUP),
    ("看下出粮单", ChatIntent.FOLDER_LOOKUP),
    ("把银行流水找出来", ChatIntent.FOLDER_LOOKUP),
    ("算一下能不能借184万", ChatIntent.CALCULATOR_ASSESS),
    ("能贷多少？", ChatIntent.CALCULATOR_ASSESS),
    ("评估一下还款能力", ChatIntent.CALCULATOR_ASSESS),
    ("自雇营业额80万能借多少", ChatIntent.CALCULATOR_ASSESS),
    ("帮我记一下明天上午催客户要材料", ChatIntent.TASK_CREATE),
    ("建一个任务：周五前完成审核", ChatIntent.TASK_CREATE),
    ("检查一下申报材料一致性", ChatIntent.DECLARATION_CHECK),
    ("帮我写一封催件邮件", ChatIntent.DRAFT_EMAIL),
    ("查一下ORDE的LVR政策要求", ChatIntent.POLICY_QUERY),
    ("当前案件卡点和下一步计划是什么", ChatIntent.CASE_STRATEGY),
]


@pytest.mark.parametrize("msg,expected", test_cases)
def test_classify_intent(msg, expected):
    db = next(get_sa_session())
    try:
        intent, _ = classify_chat_intent(msg, "CASE-TEST", db)
        assert intent == expected, f"Failed for '{msg}': got {intent}, expected {expected}"
    finally:
        db.close()


if __name__ == "__main__":
    db = next(get_sa_session())
    print("=== WO-64 意图分类器全量测试 ===")
    all_pass = True
    for msg, expected in test_cases:
        intent, meta = classify_chat_intent(msg, "CASE-TEST", db)
        ok = (intent == expected)
        if not ok:
            all_pass = False
        mark = "✅ PASS" if ok else "❌ FAIL"
        print(f"[{mark}] '{msg}' -> {intent.value} ({expected.value})")
    print(f"Result: {'ALL PASSED!' if all_pass else 'SOME FAILED!'}")
    db.close()
