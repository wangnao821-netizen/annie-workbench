import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from core.facts.slots import set_slot_fact, get_case_slots, build_confirmed_slots_prompt_block
from core.ai.context_builder import assemble_context
from core.models.db import get_sa_session

db = next(get_sa_session())
case_id = "CASE-7D6B154B"

print("=== P3 结构化槽位落库与直读测试 ===")

# 1. 模拟写入已确认槽位
print("1. 写入结构化槽位事实 (BrainFact)...")
f1 = set_slot_fact(case_id, "applicant.spouse_income", "1000000", db, category="applicant")
f2 = set_slot_fact(case_id, "applicant.spouse_income_type", "PAYG", db, category="applicant")
f3 = set_slot_fact(case_id, "applicant.co_borrower_accepted", "客户明确接受加配偶共同借款", db, category="applicant")

# 2. 读取持久化槽位
slots = get_case_slots(case_id, db)
print(f"2. 读取到当前有效槽位数: {len(slots)}")
for k, v in slots.items():
    print(f"   - {k}: {v}")

# 3. 验证生成提示词块
block = build_confirmed_slots_prompt_block(case_id, db)
print("\n3. 生成的防反问 Prompt 块预览:")
print(block)

# 4. 验证完整上下文组装 (assemble_context)
ctx = assemble_context(case_id, "case_chat", db)
assert "配偶年收入" in ctx.live_data
assert "1000000" in ctx.live_data
assert "严禁重复追问/反问" in ctx.live_data
print("\n4. assemble_context 验证通过！成功注入 live_data！")

print("-" * 60)
print("P3 结构化槽位落库测试: ALL PASSED!")
db.close()
