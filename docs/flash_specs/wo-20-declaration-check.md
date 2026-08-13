# WO-20：申报一致性检查 Agent（主文档"披露检查覆盖两层"② + #16 定稿落地）

> 来源：主文档"申报一致性检查功能卡"（阶段感知主动推卡；Vera 指定文件/贴路径才检查；结论分层 ✅/⚠️/🔴；预警可生成解释信草稿；结果写上下文事件不留存全量材料）+ 收口 #16（按需文件分析：只扫指定文件，不主动扫文件夹）。执行方：opencode。检查方：Codex。
> 前置：WO-15（external BrainFact）、WO-19（policy 引擎模式）、liteparse parse_file、脱敏链路。

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / liteparse（已装）
- 禁止：引入任何新的 pip 依赖；禁止创建本表以外的文件；禁止修改本表以外的文件
- 禁止：改数据库迁移（本单无表结构变更）
- 红线：**只检查 Vera 指定的文件/路径**（body 传入，不主动扫文件夹、不扫描案件目录）；文件文本脱敏后出站；结果不留存全量材料（只写结论事件）
- 比对规则先行（可测试），LLM 语义补强（失败降级规则结果）

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `core/agents/__init__.py` | **新建** | 空文件（或一行 docstring） |
| `core/agents/declaration_check.py` | **新建** | 申报一致性检查 Agent（≤200 行） |
| `core/agents/evidence.py` | **新建** | 文件信号提取（规则关键词，≤200 行，可并入 declaration_check） |
| `server/api/schemas.py` | 修改 | 新增 `DeclarationCheckRequest/Response` |
| `server/api/cases.py` | 修改 | 新增 `POST /api/cases/{id}/declaration-check` |
| `tests/test_core/test_declaration_check.py` | **新建** | Agent 测试（≤200 行） |

⚠️ 严禁修改上表以外的文件（含 core/pipeline/parser.py、core/facts/、前端）。严禁改动迁移。

---

## 一、文件信号提取（`core/agents/evidence.py`，≤200 行）

```python
"""文件信号提取 — 从指定文件文本中抽取申报相关信号（规则先行，不依赖 LLM）。"""

from __future__ import annotations

import re

# 申报关键维度 → 文件中的触发词（中文+英文）
SIGNAL_KEYWORDS = {
    "dependents": ["孩子", "子女", "depend", "child", "baby", "抚养"],
    "income": ["salary", "工资", "收入", "pay", "payslip", "年薪"],
    "living_expense": ["living", "生活", "expense", "支出", "rent", "租金", "还款"],
    "liability": ["loan", "贷款", "信用卡", "credit", "debt", "负债", "offset"],
    "occupation": ["engineer", "工程师", "自雇", "self-employed", "ABN", "director", "董事"],
    "visa": ["visa", "签证", "PR", "citizen", "公民", "临时"],
}


def extract_signals(text: str) -> dict[str, list[str]]:
    """从文本提取各维度的信号（命中关键词的原文片段，截断 40 字）。

    Returns:
        {"dependents": ["...原文片段..."], "income": [...], ...}（未命中维度为空列表）
    """
    ...


def evidence_lines(text: str, keyword: str, window: int = 40) -> list[str]:
    """返回 keyword 命中处的上下文片段（去重，最多 3 条）。"""
    ...
```

---

## 二、申报一致性检查 Agent（`core/agents/declaration_check.py`，≤200 行）

```python
"""申报一致性检查 — 外线申报画像 vs 指定材料，结论分层（主文档②）。"""

from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from core.agents.evidence import extract_signals
from core.ai.gateway import ApiGateway
from core.config import get_config
from core.logger import get_logger
from core.models.orm import BrainFact
from core.models.types import DesensitizedText
from core.pii.gateway import desensitize, rehydrate

logger = get_logger(__name__)

STATUS_PASS = "pass"
STATUS_WARNING = "warning"
STATUS_FAIL = "fail"
STATUS_UNPARSEABLE = "unparseable"


def run_declaration_check(
    case_id: str,
    files: list[str],
    folder: str | None,
    db: Session,
) -> dict:
    """执行申报一致性检查。

    Args:
        case_id: 案件 ID。
        files: Vera 指定的文件路径列表（绝对路径或相对 CLIENT_FILES_ROOT）。
        folder: Vera 指定的文件夹路径（可选，与 files 二选一；仅检查该文件夹内文件，不递归）。
        db: SQLAlchemy session。

    Returns:
        {"status": str, "findings": [{item, evidence, level, suggestion}], "summary": str,
         "draft_explanation": str | None}

    流程：
    1. 组装"申报画像"：external BrainFact（track="external", valid_to IS NULL）key/value 列表 + Case.submission_summary（无 → status=fail，summary="暂无外线申报画像，请先在递交模式建立"）；
    2. 解析指定文件：逐个 parse_file → 文本（每文件 ≤ 8000 字符截断）；解析全部失败 → status=unparseable；
    3. 信号提取：extract_signals（规则）→ 与申报画像比对（规则比对函数 _rule_compare，见下）；
    4. 规则结果非空 → 作为 findings 基线；再调 LLM 语义补强（desensitize → LLM → rehydrate，失败忽略）；
    5. status = 任一 fail → fail；否则任一 warning → warning；否则 pass；
    6. warning/fail 时生成解释信草稿（LLM，失败回退模板句子）；写一条 internal 上下文事件（结论摘要）。
    """
    ...


def _rule_compare(declaration: dict[str, str], signals: dict[str, list[str]]) -> list[dict]:
    """规则比对：申报值 vs 文件信号，返回 findings。

    例：申报 dependents=0 而文件命中 "孩子/child" → {item:"dependents", evidence:"...", level:"warning", suggestion:"请确认是否申报子女"}；
    申报 income 与文件金额差异 > 20%（规则近似）→ warning；文件含未申报负债关键词 → warning。
    """
    ...


def _parse_files(files: list[str], folder: str | None) -> list[tuple[str, str]]:
    """解析指定文件/文件夹（文件夹仅一层，不递归）；返回 [(文件名, 文本)]。"""
    ...
```

> 解析失败单文件跳过（记录 warning finding：item=文件名, level="unparseable"）；全部失败 → status=unparseable。**不扫描案件目录、不递归文件夹**（红线）。

---

## 三、端点 + Schemas（`server/api/schemas.py` + `server/api/cases.py`）

### Schemas

```python
class DeclarationFinding(BaseModel):
    item: str                       # 申报维度（dependents/income/living_expense/liability/occupation/visa/文件）
    evidence: str                   # 证据片段（本地展示真实值；仅 LLM 出站时脱敏）
    level: str                      # warning | fail | unparseable
    suggestion: str                 # 建议


class DeclarationCheckRequest(BaseModel):
    files: list[str] = []           # Vera 指定文件路径（至少一个，或 folder）
    folder: str | None = None       # Vera 指定文件夹（可选；仅一层，不递归）


class DeclarationCheckResponse(BaseModel):
    status: str                     # pass | warning | fail | unparseable
    findings: list[DeclarationFinding] = []
    summary: str
    draft_explanation: str | None = None
```

### 端点（cases.py，`policy-check` 之后新增）

```python
@router.post("/{case_id}/declaration-check", response_model=DeclarationCheckResponse)
def declaration_check(
    case_id: str,
    req: DeclarationCheckRequest,
    db: Session = Depends(get_db),  # noqa: B008
) -> DeclarationCheckResponse:
    """申报一致性检查（#16 按需：只检查 Vera 指定的文件/路径）。"""
    _get_case_or_404(case_id, db)
    if not req.files and not req.folder:
        raise HTTPException(status_code=422, detail="请指定至少一个文件或文件夹路径")
    data = run_declaration_check(case_id, req.files, req.folder, db)
    return DeclarationCheckResponse(**data)
```

---

## 四、测试（`tests/test_core/test_declaration_check.py` 新建，≤200 行）

```python
"""申报一致性检查 Agent 测试 — 规则比对/文件解析/结论分层/红线。"""

class TestEvidence:
    def test_dependents_keyword(self):
        # 文本含"孩子/child" → signals["dependents"] 非空
    def test_no_keyword_empty(self):
        # 无关文本 → 各维度空

class TestRuleCompare:
    def test_undeclared_dependents_warning(self):
        # 申报 dependents=0 + 文件信号 dependents → warning finding
    def test_undeclared_liability_warning(self):
        # 文件含负债关键词而申报无 → warning

class TestRunDeclaration:
    def test_no_external_profile_fail(self, test_db):
        # 案件无 external BrainFact/submission_summary → status=fail "暂无外线申报画像"
    def test_pass_when_consistent(self, test_db, monkeypatch):
        # 申报+文件无冲突 → status=pass；写 internal 事件
    def test_warning_with_conflict(self, test_db, monkeypatch):
        # 冲突 → warning + findings；生成解释信草稿（mock LLM 失败回退模板）
    def test_all_files_unparseable(self, test_db, monkeypatch):
        # parse_file 全失败 → status=unparseable
    def test_endpoint_requires_input(self, client, test_db):
        # files=[] 且 folder=None → 422
    def test_endpoint_404(self, client, test_db):
        # 案件不存在 → 404
    def test_no_auto_scan(self, test_db, monkeypatch):
        # 断言只解析传入的 files/folder 内文件（不递归、不扫案件目录）
```

> mock：`monkeypatch` `core.pipeline.parser.parse_file` 返回构造 ParseResult；`ApiGateway.call_llm` 抛异常验证降级。断言语料脱敏样本。

---

## 验收标准（全量门禁）

```bash
python -m pytest tests/test_core/test_declaration_check.py -v
python -m pytest tests/ -q                      # 全量（基线 514，不得回归）
ruff check core/agents/ server/api/cases.py server/api/schemas.py tests/test_core/test_declaration_check.py
```

手动验证：
1. 先建档（含 external 事实或递交摘要）→ `POST /api/cases/{id}/declaration-check`（files=[payslip.pdf]）→ 200，status 与 findings 合理；
2. 无外线画像 → status=fail + "暂无外线申报画像"；
3. 指定不存在文件 → 该文件 unparseable finding，不阻断其他；
4. 检查结果写 internal 事件；前端（F-9 DeclarationCheckCard）可消费同一契约。

---

⚠️ 执行纪律（每一条都必须遵守）：
1. 只修改"改动范围"表中列出的 6 个文件，绝不碰其他文件
2. **只检查 Vera 指定的 files/folder**（不递归、不扫案件目录）——红线
3. 规则比对先行（可测试）；LLM 只做语义补强与解释信，失败降级
4. 所有函数名/变量名/字段名/断言严格按"接口契约"定义，一个字符都不能改
5. 不引入新依赖；新文件全部 ≤200 行；不改迁移；结果不留存全量材料
