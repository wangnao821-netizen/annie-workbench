# WO-75c master_picker 容量策略正式化 — 施工单

> **状态**：待执行（WO-75 验收遗留；代码已在工作树，本单做契约固化 + 专项测试）
> **关联**：`core/checklist/master_picker.py`；WO-75 偏离 #3

---

## 一、背景

WO-75 向 `checklist_master.yaml` 追加 12 个"总是命中"项后，PAYG/PR/Purchase 案件的规则预选池由 24 → 36，超出 `_SIZE_MAX`（25）上限，既有 `test_pick_includes_custom` 回归：**用户自定义总项库项被静默截断**。WO-75 实施时做了最小修复（`is_custom` 标记 + 截断后补回），本单将其正式化为容量策略契约并补专项测试。

---

## 二、改动范围（严禁超出）

| 序号 | 文件 | 操作 | 说明 |
|---|---|---|---|
| 1 | `core/checklist/master_picker.py` | 修改 | 容量策略契约化：`_SIZE_MAX` 语义、`is_custom` 透传、截断补回逻辑（如与工作树实现一致则仅补注释/文档串） |
| 2 | `tests/test_core/test_master_picker_capacity.py` | **新建** | 专项测试（见 §三） |

---

## 三、容量策略契约与测试

### 策略（写入模块 docstring）
1. 规则预选按优先级排序后取前 `_SIZE_MAX` 项；
2. **用户自定义总项库项（`is_custom=True`）永不被主库扩容截断**——超出上限的部分按序补回；
3. AI 排序路径（`use_ai=True`）不受影响（AI 自行排序，不截断）。

### 专项测试用例
- `test_custom_preserved_over_cap`：构造 25+ 主库命中项 + N 个自定义项 → 返回含全部自定义项且总数 ≥ `_SIZE_MAX`；
- `test_custom_not_duplicated`：自定义项只出现一次；
- `test_no_custom_truncation_normal`：无自定义项时行为与旧版一致（严格前 25）；
- `test_ai_path_unchanged`：`use_ai=True` 时不下发截断逻辑。

---

## 四、验收门禁

1. `python -m pytest tests/test_core/test_master_picker_capacity.py -v` 全绿；
2. 全量 `pytest tests/ -q` 0 failed；`ruff check` 0 errors / 0 warnings；
3. 失败标准：`_SIZE_MAX` 内存在自定义项被截断 → 测试失败。

---

*v1.0 · 2026-08-25 · WO-75c master_picker 容量策略正式化（WO-75 偏离 #3 收口）*
