# WO-75 清单主库补齐 + 首次材料模板 + Preliminary Assessment 邮件草稿引擎 — 施工单

> **状态**：待执行
> **关联**：[新建客户AI协同体验规划.md](../新建客户AI协同体验规划.md) §五b 两段式清单工作台；`config/checklist_master.yaml`；`config/checklist_templates/preliminary_assessment.yaml`（新建）；`core/checklist/email_draft.py`（新建）
> **依赖**：本单为纯后端基础，不依赖 `CaseChecklist.phase` 字段；首次清单种子（phase=initial 落库）由 WO-74 Step 5 负责。

---

## 一、技术约束与安全红线

1. **后端技术栈**：Python 3.11+ / FastAPI / Pydantic v2 / SQLAlchemy 2.x / `pathlib.Path`。
2. **禁止破坏**：禁止引入任何外部非标 pip 依赖；禁止在代码中硬编码任何真实客户 PII。
3. **测试隔离（红线）**：严禁任何测试写入 `data/assistant.db`；测试必须使用内存/隔离数据库。
4. **单一真源**：清单全集以 `config/checklist_master.yaml` 为唯一真源；首次模板以 `config/checklist_templates/preliminary_assessment.yaml` 为唯一真源，模板只引用 master 的 `id`，不重复定义业务规则。
5. **只出草稿（红线）**：邮件引擎只生成草稿并落草稿箱，绝不自动发送。

---

## 二、改动范围（严禁超出）

| 序号 | 文件路径 | 操作 | 说明 |
|---|---|---|---|
| 1 | `config/checklist_master.yaml` | 修改 | 追加 9 个文档项 + 3 个信息项（`kind: info`） |
| 2 | `config/checklist_templates/preliminary_assessment.yaml` | **新建** | 首次材料模板：8 大板块、引用 master id、裁剪规则、信息项 |
| 3 | `core/checklist/email_draft.py` | **新建** | `generate_preliminary_assessment_email()`：模板驱动、固定措辞（Q2=方案A，不做 AI 润色） |
| 4 | `server/api/schemas.py` | 修改 | 追加 `EmailDraftRequest` / `EmailDraftResponse` |
| 5 | `server/api/cases.py` | 修改 | 新增 `POST /api/cases/{case_id}/email-draft/preliminary` |
| 6 | `tests/test_core/test_checklist_email_draft.py` | **新建** | 主库加载 / 模板解析 / 三种客群裁剪 / 端点测试 |

---

## 三、接口契约与核心实现规范

### 1. `config/checklist_master.yaml` 追加内容

**文档项（9 个）**：

```yaml
  # ── income_payg 收入-PAYG 补充 ──
  - id: ato_income_statement
    name_zh: ATO 收入声明
    name_en: ATO Income Statement
    category: income_payg
    aliases: [ato_income, ato_statement, income_statement]
    applicable_when: { all: true }

  - id: salary_credit_statement
    name_zh: 6 个月工资入账流水
    name_en: Bank Statement (Salary Credits, 6 months)
    category: income_payg
    aliases: [salary_statement, salary_credits, wage_credits]
    applicable_when: { employment_type: [PAYG, Casual] }
    max_age_days: 60

  # ── special / liability 负债与资产补充 ──
  - id: living_expense_statement
    name_zh: 6 个月生活开支流水
    name_en: Bank Statement (Living Expenses, 6 months)
    category: special
    aliases: [living_expense, expense_statement, transaction_statement]
    applicable_when: { all: true }
    max_age_days: 60

  - id: car_loan_statement
    name_zh: 车贷/个人贷款对账单
    name_en: Car Loan / Personal Loan Statement
    category: special
    aliases: [car_loan, personal_loan, auto_loan, carloan]
    applicable_when: { all: true }

  - id: credit_card_statement
    name_zh: 信用卡账单 (60天内, 含6月历史)
    name_en: Credit Card Statement (within 60 days, 6 months history)
    category: special
    aliases: [creditcardstatement, credit_card, cc_statement]
    applicable_when: { all: true }
    max_age_days: 60

  - id: deposit_receipt
    name_zh: 首付定金收据
    name_en: Deposit Receipt
    category: property
    aliases: [deposit_receipt, deposit_proof]
    applicable_when: { purpose: [Purchase] }

  - id: savings_proof
    name_zh: 存款余额证明
    name_en: Savings Proof of Balance
    category: special
    aliases: [savings_proof, genuine_savings, savings_balance]
    applicable_when: { all: true }

  - id: super_statement
    name_zh: 养老金余额证明
    name_en: Superannuation Statement
    category: special
    aliases: [super, superannuation, super_statement, super_balance]
    applicable_when: { all: true }

  - id: vehicle_asset_info
    name_zh: 车辆资产信息
    name_en: Vehicle Asset (Make/Model/Value)
    category: special
    aliases: [vehicle_asset, car_asset]
    applicable_when: { all: true }
```

**信息项（3 个，`kind: info`，非文档，走 Fact Find 采集）**：

```yaml
  - id: employment_history
    name_zh: 最近 3 年雇主历史
    name_en: Employment History (3 years)
    kind: info
    category: special
    aliases: [employment_history, emp_history, work_history]
    applicable_when: { all: true }

  - id: living_history
    name_zh: 最近 3 年居住历史
    name_en: Living History (3 years)
    kind: info
    category: special
    aliases: [living_history, residence_history, address_history]
    applicable_when: { all: true }

  - id: solicitor_info
    name_zh: 律师/过户师信息
    name_en: Solicitor / Conveyancer Information
    kind: info
    category: special
    aliases: [solicitor_info, conveyancer, solicitor]
    applicable_when: { all: true }
```

> `kind` 字段为新增可选字段，缺省 `document`；master 加载器（`master_picker._load_master`）需透传，不得破坏既有解析。

### 2. `config/checklist_templates/preliminary_assessment.yaml` 模板格式

```yaml
template_id: preliminary_assessment
version: 1.0.0
sections:
  - id: id
    title_en: ID
    title_zh: 身份证明
    items:
      - ref: driver_license          # 引用 checklist_master.yaml 的 id
      - ref: passport
      - ref: visa_grant              # 非澳公民才要求（applicable_when / trim_rules 裁剪）
  - id: income
    title_en: Income
    title_zh: 收入
    items: [ payslip_2, salary_credit_statement, accounting_financial_report, tax_return_2yr, tax_return_1yr, bas_statements, ato_income_statement, rental_statement ]
  - id: employment_history
    title_en: Employment History
    title_zh: 雇主历史（3 年）
    items: [ { ref: employment_history, kind: info } ]
  - id: living_expense
    title_en: Living Expense
    title_zh: 生活开支
    items: [ living_expense_statement ]
  - id: liability
    title_en: Liability
    title_zh: 负债
    items: [ existing_loan_statement, credit_card_statement, car_loan_statement ]
  - id: living_history
    title_en: Living History
    title_zh: 居住历史（3 年）
    items: [ { ref: living_history, kind: info } ]
  - id: asset
    title_en: Asset
    title_zh: 资产
    items: [ trust_deed, council_rates_notice, contract_of_sale, deposit_receipt, savings_proof, vehicle_asset_info, super_statement ]
  - id: solicitor
    title_en: Solicitor Information
    title_zh: 律师/过户师
    items: [ { ref: solicitor_info, kind: info } ]
trim_rules:
  # 与 master 的 applicable_when 协同；PAYG/自雇/PR/Refinance 裁剪见 email_draft.py 契约
  - { when: { employment_type: [PAYG, Casual] }, drop: [accounting_financial_report, tax_return_2yr, tax_return_1yr, bas_statements, accountant_letter] }
  - { when: { employment_type: [SelfEmployed] }, drop: [payslip_2, employment_letter] }
  - { when: { residency: [Citizen, PR] }, drop: [visa_grant] }
  - { when: { purpose: [Refinance] }, drop: [contract_of_sale, deposit_receipt], add: [payout_letter, discharge_authority] }
```

> 模板中 `items` 的 `ref` 必须能在 `checklist_master.yaml` 命中，加载时做一致性校验（缺 id → 生成时报错 422，禁止静默跳过）。

### 3. `core/checklist/email_draft.py` 邮件生成引擎

```python
def generate_preliminary_assessment_email(
    case_id: str,
    db: Session,
) -> dict[str, str]:
    """根据案件画像与首次材料模板，生成裁剪后的标准 Preliminary Assessment 英文邮件草稿。

    固定措辞（Q2=方案A）：不调用 LLM，不做个性化润色，只按客户类型裁剪板块内项目。

    Returns:
        {
            "subject": str,
            "body_text": str,
            "body_html": str,
            "recipient_email": str,
            "cc_email": str,
        }
    """
```

- **Subject**：`EVERSTONES Preliminary Assessment - {client_name} - {purpose} - {property_address}`
- **板块顺序**：严格照模板 8 大板块（ID → Income → Employment History → Living Expense → Liability → Living History → Asset → Solicitor Information）
- **裁剪**：按 `trim_rules` + 案件画像（employment_type / residency / purpose / lender）过滤；PAYG 删公司财报/税表/BAS；自雇删雇佣信/工资单；Citizen/PR 删 VISA；Refinance 删购房合同/首付收据、加 Payout/Discharge
- **信息项**（雇主历史/居住历史/律师）在邮件中以「请提供以下信息」小节列出，不写成文档项
- **落草稿**：调用既有 `POST /api/drafts` 语义写入（`draft_type="preliminary"`、`status=draft`），只存不发

### 4. API 路由与契约

- **端点**：`POST /api/cases/{case_id}/email-draft/preliminary`
- **响应**：

```json
{
  "ok": true,
  "case_id": "CASE-12345678",
  "subject": "EVERSTONES Preliminary Assessment - Alice Johnson - Purchase - 12 Bridge St, Sydney",
  "body_text": "Hi Alice,\n\nHope this email finds you well...",
  "body_html": "<p>Hi Alice,</p>...",
  "recipient_email": "alice@example.com",
  "cc_email": "Brandon.He@everstones.com.au",
  "draft_id": "draft_xxxx"
}
```

- 案件不存在 → 404；模板加载/校验失败 → 422；写入草稿失败 → 500（事务回滚）

---

## 四、自动化测试与验收标准

```powershell
$env:PYTHONPATH="D:\vera-workbench\.venv\Lib\site-packages;D:\vera-workbench"
python -m pytest tests/test_core/test_checklist_email_draft.py -v
python -m ruff check config/checklist_master.yaml core/checklist/email_draft.py server/api/cases.py server/api/schemas.py tests/test_core/test_checklist_email_draft.py
```

### 验收门禁：
1. `tests/test_core/test_checklist_email_draft.py` 全部通过（0 failed）。
2. **PAYG** 客户邮件自动删减公司财报/税表/BAS；**Self-Employed** 保留 2 年财报与税表、删雇佣信；**Citizen/PR** 删 VISA；**Refinance** 删购房合同/首付收据并出现 Payout Letter。
3. 模板 8 大板块顺序与 Vera 截图一致；信息项以"请提供信息"小节呈现。
4. 草稿落库 `status=draft`，无任何发送动作。
5. `ruff` 检查 0 errors / 0 warnings。

---

## 六、执行偏离记录（2026-08-25 验收反哺）

| # | 偏离 | 处理 | 状态 |
|---|---|---|---|
| 1 | 模板原文字面引用的 `company_financials / business_tax_return / personal_tax_return / noa / bas_statement / home_loan_statement / mobile_number` 在 master 中不存在；按"ref 必须命中 master 否则 422"硬规则映射为真实 master id（`accounting_financial_report`、`tax_return_2yr`、`tax_return_1yr`、`bas_statements`、`existing_loan_statement`），并删除无对应 master 的 `mobile_number` | 已反哺本单 §三.2 模板正文（上方即为定稿映射） | ✅ 已修正 |
| 2 | 3 个信息项缺 `aliases`，违反 master 既有契约（`test_required_fields_present`） | 已反哺本单 §三.1（补 aliases） | ✅ 已修正 |
| 3 | 新增 12 个"总是命中"项使 PAYG/PR/Purchase 预选池 24→36 超出 25 上限，既有 `test_pick_includes_custom` 回归（自定义项被静默截断）——需改 `core/checklist/master_picker.py`（超出本单 6 文件范围） | 临时修复已实施（`is_custom` 标记 + 截断补回）；**另立 WO-75c 正式纳入容量策略 + 补专项测试** | 🔶 见 WO-75c |

---

*v1.3 · 2026-08-25 · WO-75 验收反哺：模板 ref 映射定稿 + 信息项 aliases + 偏离记录（#1/#2 修正，#3 转 WO-75c）*
