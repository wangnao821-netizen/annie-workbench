# WO-19：政策库规则引擎 + 建档政策提示（#14 定稿落地）

> 来源：CASE 大脑 V1 收口 #14（lender_policies.yaml 配置驱动；规则引擎判断 + LLM 只做解释；CBA/ANZ/NAB 先行；触发时机=建档时立即给 + 关键事实变更时重算；免责"以银行官方为准"）。执行方：opencode。检查方：Codex。
> 前置：WO-18 建档链路（create_case_from_source 已支持 lender/employment_type/residency/lvr）。config/lender_policies.yaml 已有 741 行数据（ANZ/CBA/NAB 等），**本单不改该 yaml 数据**，规则引擎读取它。

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x
- 禁止：引入任何新的 pip 依赖；禁止创建本表以外的文件；禁止修改本表以外的文件
- 禁止：改数据库迁移（本单无表结构变更）
- 禁止：修改 config/lender_policies.yaml 现有数据（741 行手工数据，规则引擎只读）
- 规则判断**不依赖 LLM**（可测试、不编造）；LLM 只用于把结论润色成中文话术（可选，失败回退模板文案）

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `core/policy/__init__.py` | **新建** | 空文件（或一行 docstring） |
| `core/policy/engine.py` | **新建** | 规则引擎（≤200 行） |
| `core/policy/prompts.py` | **新建** | LLM 话术润色（可选，≤80 行，可并入 engine） |
| `server/api/schemas.py` | 修改 | 新增 `PolicyCheckResponse` |
| `server/api/cases.py` | 修改 | 新增 `GET /api/cases/{id}/policy-check` |
| `core/case_creation.py` | 修改 | 建档成功后自动触发政策检查并写 internal 事件（非阻塞） |
| `tests/test_core/test_policy_engine.py` | **新建** | 规则引擎测试（≤200 行） |

⚠️ 严禁修改上表以外的文件（含 config/lender_policies.yaml、core/ai/、前端）。严禁改动迁移。

---

## 一、规则引擎（`core/policy/engine.py`，≤200 行）

```python
"""政策库规则引擎 — 只读 lender_policies.yaml，规则判断不依赖 LLM（#14）。"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from sqlalchemy.orm import Session

from core.logger import get_logger

logger = get_logger(__name__)

# 规则表：employment_type → (min_abn_years 要求, 宽松度)
# 宽松度: strict=自雇<2yr 红 / medium=黄 / lenient=绿
_SELF_EMPLOYED_RULES = {
    "ANZ": {"min_years": 2, "strictness": "strict"},
    "NAB": {"min_years": 2, "strictness": "strict"},
    "CBA": {"min_years": 1, "strictness": "lenient"},
    "Westpac": {"min_years": 2, "strictness": "medium"},
    "Macquarie": {"min_years": 2, "strictness": "medium"},
}

# 临时签证 → 多数主流行收紧（方向性）
_TEMP_VISA_LENDERS = {"CBA", "ANZ", "NAB", "Westpac"}


@dataclass
class PolicyIssue:
    """一条政策风险/提示。"""
    level: str          # green | amber | red
    title: str          # 简短结论（如 "自雇 ABN 不足 2 年"）
    detail: str         # 一句话原因（读 yaml 的 avoid_for/special_requirements）
    suggestion: str     # 建议（如 "建议改投 CBA（接受 1 年税表）"）


@dataclass
class PolicyCheckResult:
    """政策检查结果。"""
    lender: str
    overall: str                 # green | amber | red（取最严重）
    issues: list[PolicyIssue]
    alternative_lenders: list[str]   # 按风险从低到高
    disclaimer: str = "政策会变，以银行官方为准；本提示仅供辅助参考。"


def load_lender_policies(config_dir: Path) -> dict[str, Any]:
    """读取 config/lender_policies.yaml（只读缓存）。"""
    ...


def check_policy(
    lender: str,
    employment_type: str | None,
    residency: str | None,
    lvr: float | None,
    loan_amount: float | None,
    property_value: float | None,
    config_dir: Path,
) -> PolicyCheckResult:
    """规则引擎主入口：按案件画像输出政策风险与替代银行建议。

    规则（V1）：
    - 自雇（employment_type 含 自雇/ABN/self）：对照 _SELF_EMPLOYED_RULES——
      strict 且无 ABN 年限信息 → red "自雇要求严格（需 2 年税表）"；lenient → green/amber；
    - 临时签证（residency == temp_visa 且 lender 在 _TEMP_VISA_LENDERS）→ amber "临时签证需银行逐案审核"；
    - LVR > max_lvr_no_lmi（读 yaml）→ amber/red "LVR 超过 80% 需 LMI"；> max_lvr_with_lmi → red；
    - 无 lender 数据 → 返回空结果（green，无提示）；
    - 结果按最严重 level 汇总；alternative_lenders = 其余 lender 按 strictness 排序（lenient 优先）。
    """
    ...
```

> 实现要求：yaml 读取带简单缓存（模块级 dict，按 path）；**金额/比例字段一律规则判断**；detail 文案尽量取自 yaml（avoid_for/special_requirements 关键词匹配），取不到用内置模板。

---

## 二、LLM 话术润色（`core/policy/prompts.py`，可选，≤80 行）

```python
"""政策提示话术润色 — LLM 把结构化结论改写成中文一段话；失败回退模板文案（#14：LLM 只做解释）。"""

def polish_policy_text(result: PolicyCheckResult, case_id: str, db: Session) -> str:
    """desensitize → LLM → rehydrate；失败回退「{lender}：{overall}」+ 各 issue title 拼接。"""
    ...
```

---

## 三、端点（`server/api/schemas.py` + `server/api/cases.py`）

### Schemas

```python
class PolicyIssueOut(BaseModel):
    level: str      # green | amber | red
    title: str
    detail: str
    suggestion: str


class PolicyCheckResponse(BaseModel):
    lender: str
    overall: str                       # green | amber | red
    issues: list[PolicyIssueOut] = []
    alternative_lenders: list[str] = []
    summary: str = ""                  # LLM 润色或模板文案（中文一段话）
    disclaimer: str = "政策会变，以银行官方为准；本提示仅供辅助参考。"
```

### 端点（cases.py，`parse-file` 之后新增）

```python
@router.get("/{case_id}/policy-check", response_model=PolicyCheckResponse)
def policy_check(
    case_id: str,
    db: Session = Depends(get_db),  # noqa: B008
) -> PolicyCheckResponse:
    """建档/变更后政策检查：读案件画像 → 规则引擎 → 话术润色（失败回退模板）。"""
    case = _get_case_or_404(case_id, db)
    result = check_policy(
        lender=case.lender or "",
        employment_type=case.employment_type,
        residency=case.residency,
        lvr=case.lvr,
        loan_amount=case.loan_amount,
        property_value=case.property_value,
        config_dir=get_config().project_root / "config",
    )
    summary = polish_policy_text(result, case_id, db)  # 失败自动回退模板
    return PolicyCheckResponse(**result.__dict__, summary=summary)
```

> import：`from core.policy.engine import check_policy, PolicyCheckResult`；`from core.policy.prompts import polish_policy_text`；`from core.config import get_config`（cases.py 已可能导入）。

---

## 四、建档自动触发（`core/case_creation.py`）

在 `create_case_from_source` 的"建档即预选清单"之后追加（同样非阻塞）：

```python
    # 建档即政策提示（#14）：非阻塞，写 internal 事件 → 全景/AI 可见
    try:
        from core.policy.engine import check_policy
        from core.context.accumulator import append_context_event
        result = check_policy(
            lender=lender or "",
            employment_type=employment_type,
            residency=residency,
            lvr=case.lvr,
            loan_amount=loan_amount,
            property_value=property_value,
            config_dir=get_config().project_root / "config",
        )
        if result.issues:
            content = "；".join(
                f"[{i.level}] {i.title}：{i.detail}（{i.suggestion}）" for i in result.issues
            )
            append_context_event(
                case_id=case_id,
                source_type="manual_note",
                content=f"政策检查：{content}",
                db=db,
                trigger_distill=True,
                track="internal",
                status="confirmed",
            )
    except Exception as exc:  # noqa: BLE001 — 政策提示失败不阻断建档
        logger.warning("Policy check on create failed for %s: %s (non-fatal)", case_id, exc)
```

> `get_config` 已在 case_creation 可用（或 from core.config import get_config）。事件内容为结构化文案（无 PII 泄露：不写客户名）。

---

## 五、测试（`tests/test_core/test_policy_engine.py` 新建，≤200 行）

```python
"""政策规则引擎测试 — 自雇/签证/LVR/替代银行（#14）。"""

class TestPolicyEngine:
    def test_self_employed_anz_red(self, tmp_path):
        # 自雇 + ANZ（无 ABN 年限）→ overall red；issues 含"自雇要求严格"；alternative 含 CBA
    def test_self_employed_cba_green_or_amber(self, tmp_path):
        # 自雇 + CBA → 非 red（lenient）
    def test_temp_visa_amber(self, tmp_path):
        # residency=temp_visa + NAB → 含 amber 签证提示
    def test_lvr_over_no_lmi(self, tmp_path):
        # lvr=85 + ANZ → 含 "LVR 超过 80 需 LMI"（amber）；lvr=96 → red
    def test_unknown_lender_empty(self, tmp_path):
        # lender="Unknown" → overall green、无 issues、alternative 空
    def test_no_lender_data(self, tmp_path):
        # lender="" → green 空结果

class TestCreatePolicyEvent:
    def test_create_case_writes_policy_event(self, client, test_db):
        # create_case(lender=ANZ, employment_type=自雇) → case_context_events 有 policy 事件（confirmed、含"政策检查"）
    def test_create_case_no_issues_no_event(self, client, test_db):
        # create_case(lender=CBA, employment_type=PAYG, lvr=60) → 无 policy 事件（或 green 事件）
    def test_policy_check_endpoint(self, client, test_db):
        # GET /api/cases/{id}/policy-check → 200 含 overall/issues/summary/disclaimer；404 案件
```

> tmp_path 用法：把 config_dir 指向 tmp_path，写最小 lender_policies.yaml（ANZ/CBA/NAB 各一个条目，含 max_lvr_no_lmi/max_lvr_with_lmi/special_requirements/avoid_for），engine 读它，不依赖真实 741 行文件。

---

## 验收标准（全量门禁）

```bash
python -m pytest tests/test_core/test_policy_engine.py -v
python -m pytest tests/ -q                    # 全量（基线 505，不得回归）
ruff check core/policy/ core/case_creation.py server/api/cases.py server/api/schemas.py tests/test_core/test_policy_engine.py
```

手动验证：
1. `POST /api/cases`（lender=ANZ、employment_type=自雇、loan=85万、property=100万）→ 建档后 `GET /api/cases/{id}/context-events?status=confirmed` 含"政策检查"事件（red/amber 提示）；`GET /api/cases/{id}/policy-check` 返回 overall=red、alternative_lenders 含 CBA。
2. `GET /api/cases/{id}/policy-check`（PAYG + CBA + LVR 60）→ overall green、issues 空、summary 模板文案。
3. 免责声明出现在响应。

---

⚠️ 执行纪律（每一条都必须遵守）：
1. 只修改"改动范围"表中列出的 7 个文件，绝不碰其他文件
2. **严禁修改 config/lender_policies.yaml**（只读）；规则判断不依赖 LLM（可测试）
3. 所有函数名/变量名/字段名/断言严格按"接口契约"定义，一个字符都不能改
4. 每完成一节立即运行该节验证命令；失败先报告，不自作主张修计划外代码
5. 不引入新依赖；新文件全部 ≤200 行；不改迁移；政策提示失败只 warning 不阻断建档
