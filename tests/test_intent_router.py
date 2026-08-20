import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from core.chat.intent_router import ChatIntent, classify_chat_intent
from core.models.db import get_sa_session

db = next(get_sa_session())

test_cases = [
    ("你能帮我做什么", ChatIntent.META_HELP),
    ("你有什么功能", ChatIntent.META_HELP),
    ("不需要了", ChatIntent.STATUS_ACK),
    ("好的，收到", ChatIntent.STATUS_ACK),
    ("暂停", ChatIntent.STATUS_ACK),
    ("查下她的供楼单", ChatIntent.FOLDER_LOOKUP),
    ("文件夹里找下地税单", ChatIntent.FOLDER_LOOKUP),
    ("看下出粮单", ChatIntent.FOLDER_LOOKUP),
    ("算一下能不能借184万", ChatIntent.CALCULATOR_ASSESS),
    ("自雇营业额80万能借多少", ChatIntent.CALCULATOR_ASSESS),
    ("当前案件卡点和下一步计划是什么", ChatIntent.CASE_STRATEGY),
]

print("=== P2 意图前置分流器测试 ===")
all_pass = True
for msg, expected in test_cases:
    intent, meta = classify_chat_intent(msg, "CASE-7D6B154B", db)
    ok = (intent == expected)
    if not ok:
        all_pass = False
    mark = "✅ PASS" if ok else "❌ FAIL"
    print(f"[{mark}] 输入: \"{msg}\"")
    print(f"       -> 预测意图: {intent.value} (期望: {expected.value}) | 原因: {meta.get('reason')}")

print("-" * 60)
print(f"测试结果: {'ALL PASSED!' if all_pass else 'SOME FAILED!'}")
db.close()
