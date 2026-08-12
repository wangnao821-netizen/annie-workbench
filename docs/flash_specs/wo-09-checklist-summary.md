# 施工单 09：清单驱动 + 一句话摘要

> 执行者：DeepSeek  
> 依赖：WO-08（Action 扩展 + received_file_ids）  
> 预估：1.5 天

---

## 技术约束

- 新增文件放 `core/checklist/`、`core/ai/`、`config/`
- Python 文件行数 ≤ 200
- `checklist_master.yaml` 不超过 500 行
- 不引入新的 pip 依赖
- AI 调用必须经过 `core.pii.gateway.desensitize()` 脱敏

---

## 目标

1. 建立 `checklist_master.yaml` 全量清单主库（50-80 项）
2. AI 预选逻辑（根据案件信息选 15-25 项）
3. 文件 → 清单反向匹配
4. 一句话摘要服务（≤ 50 字中文）
5. 清单闭环（已收→换文件→撤销）

---

## 改动范围

| 文件 | 操作 | 说明 |
|------|------|------|
| `config/checklist_master.yaml` | 新建 | 全量清单主库 |
| `core/checklist/master_picker.py` | 新建 | AI 预选逻辑 |
| `core/checklist/reverse_match.py` | 新建 | 文件→清单反向匹配 |
| `core/ai/case_summary.py` | 新建 | 一句话摘要 |
| `core/checklist/generator.py` | 修改 | 接入 master_picker |
| `tests/test_checklist_master.py` | 新建 | 清单主库测试 |
| `tests/test_case_summary.py` | 新建 | 摘要测试 |

---

## 接口契约

### config/checklist_master.yaml 结构

```yaml
# 按银行/产品/场景分组
groups:
  - name: "通用 - 身份证明"
    items:
      - id: "ID001"
        name_zh: "护照"
        name_en: "Passport"
        aliases: ["passport", "travel_document"]  # 用于反向匹配
        conditions: []  # 无条件，所有案件都需要
      - id: "ID002"
        name_zh: "驾照"
        name_en: "Driver Licence"
        aliases: ["driver_license", "licence"]
        conditions: []

  - name: "收入证明 - PAYG"
    items:
      - id: "INC001"
        name_zh: "工资单（最近 2 期）"
        name_en: "Payslips (latest 2)"
        aliases: ["payslip", "pay_slip", "salary_slip"]
        conditions: ["employment_type == 'payg'"]
      # ...

  - name: "CBA 特殊要求"
    items:
      - id: "CBA001"
        name_zh: "CBA 贷款申请表"
        name_en: "CBA Application Form"
        aliases: ["cba_form", "cba_application"]
        conditions: ["lender == 'CBA'"]
```

### master_picker.py

```python
def pick_checklist(
    case_info: dict,   # {lender, product, employment_type, ...}
    db: Session,
) -> list[dict]:
    """根据案件信息从 master 库中 AI 预选 15-25 项。

    Returns:
        [{"id": "ID001", "name_zh": "护照", "required": True}, ...]
    """
    ...
```

### reverse_match.py

```python
def match_file_to_checklist_items(
    file_name: str,
    file_classification: str,  # classifier 的分类结果
    case_checklist_ids: list[str],
    db: Session,
) -> list[str]:
    """返回该文件可能匹配的清单项 ID 列表。"""
    ...
```

### case_summary.py

```python
def generate_case_summary(
    case_id: str,
    db: Session,
) -> str:
    """生成 ≤ 50 字的中文一句话摘要。

    写入路径（5 条 dirty write）：
    1. Case.brief 字段
    2. CaseKnowledge 最新条目
    3. 返回给调用方
    4. SSE 推送（如果可用）
    5. 微信通知（如果配置了）
    """
    ...
```

---

## 验证步骤

### Step 1：YAML 加载
```python
python -c "
import yaml
from pathlib import Path
data = yaml.safe_load(Path('config/checklist_master.yaml').read_text(encoding='utf-8'))
total = sum(len(g['items']) for g in data['groups'])
assert 50 <= total <= 80, f'Expected 50-80 items, got {total}'
print(f'checklist_master: {total} items in {len(data[\"groups\"])} groups')
"
```

### Step 2：import 验证
```python
python -c "
from core.checklist.master_picker import pick_checklist
from core.checklist.reverse_match import match_file_to_checklist_items
from core.ai.case_summary import generate_case_summary
print('All checklist imports OK')
"
```

### Step 3：测试
```bash
python -m pytest tests/test_checklist_master.py tests/test_case_summary.py -v
```

---

## 失败标准

- `checklist_master.yaml` 总项数 < 50 或 > 80 → **FAIL**
- `pick_checklist({lender: "CBA", product: "home_loan"})` 返回 < 10 项 → **FAIL**
- `match_file_to_checklist_items("payslip.pdf", "payslip", ...)` 未返回含 "INC001" → **FAIL**
- `generate_case_summary()` 返回 > 50 字 → **FAIL**
- 任何文件 > 200 行 → **FAIL**

---

⚠️ 执行纪律：
1. YAML 中的 aliases 必须与 `core/pipeline/classifier.py` 的分类标签对齐
2. 摘要服务的 AI 调用必须经过脱敏
3. 清单项必须支持闭环：已收→换文件→撤销→豁免
4. 不自动标记 "已收"——仅建议匹配，Vera 确认
