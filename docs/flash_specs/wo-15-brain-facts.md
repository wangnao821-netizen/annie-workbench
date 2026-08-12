# WO-15：BrainFact + fact_schema 词表 + 提取（#5 定稿落地）

> 来源：CASE 大脑 V1 收口 #5（受控词表：config/fact_schema.yaml 配置驱动；AI 只映射词表内 key，词表外 → unclassified；金额/日期/银行/阶段规则锚定）+ #7（派生层只重建、矛盾 → supersede + conflict）。词表 43 key 已获 Vera 确认（2026-08-12 按草案走）。执行方：opencode。检查方：Codex。
> 前置依赖：WO-14 已交付（case_context_events.status 状态机，蒸馏只吃 confirmed）。本单只从 **confirmed** 事件提取。

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / Alembic（唯一建表路径）
- 禁止：引入任何新的 pip 依赖；禁止创建本表以外的文件；禁止修改本表以外的文件
- 禁止：改动既有迁移 revision（只允许**新建**一个，down_revision = `b4e1c9d2f7a3`）
- 禁止：把 BrainFact 表/字段塞进 WO-14 的 revision——新建独立 revision
- 词表来源唯一：`docs/CASE大脑_V1缺口与待讨论清单.md` 附录 A（43 key 全量转译，**不得增删 key**）

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `config/fact_schema.yaml` | **新建** | 43 key 全量转译自附录 A（结构见一） |
| `core/migrations/versions/xxxx_add_brain_facts.py` | **新建** | down_revision=`b4e1c9d2f7a3`，建 `brain_facts` 表 |
| `core/models/orm.py` | 修改 | `class CaseContextEvent` 之后新增 `class BrainFact` |
| `core/facts/__init__.py` | **新建** | 空文件（或一行 docstring） |
| `core/facts/anchors.py` | **新建** | 规则锚定（≤200 行） |
| `core/facts/extract.py` | **新建** | LLM 词表提取 + sync_brain_facts（≤200 行） |
| `server/api/schemas.py` | 修改 | 新增 `BrainFactResponse` |
| `server/api/cases.py` | 修改 | 新增 GET facts + POST facts/sync 两个端点 |
| `tests/test_core/test_brain_facts.py` | **新建** | 规则/提取/同步/冲突用例（≤200 行） |
| `tests/test_safety/test_config_consistency.py` | 修改 | 追加 fact_schema.yaml 一致性断言 |

⚠️ 严禁修改上表以外的文件（含 core/context/、core/ai/、前端）。严禁改动既有 revision。

---

## 一、config/fact_schema.yaml（43 key 全量转译）

### 结构契约

```yaml
# BrainFact 受控词表 v1（CASE 大脑 #5，2026-08-12 Vera 确认"按草案走"）
# 结构：category → key → { label, type, anchor }
# anchor: rule = 规则锚定（金额/日期/银行/阶段） | llm = LLM 提取 | llm+rule = 两者
# 新 key 必须走施工单，AI 禁止自造；词表外概念存 unclassified
version: 1
categories:
  identity:
    full_name: { label: "客户姓名", type: "string", anchor: "llm+rule" }
    # ... 其余按附录 A 逐行转译
```

### 转译要求
1. 打开 `docs/CASE大脑_V1缺口与待讨论清单.md` 文末附录 A，**逐行**转译全部 11 个 category（identity/income/employment/property/loan/liability/bank/stage/commitment/disclosure/special）共 43 个 key；
2. `type` 映射：string / enum / int / amount / percent / date / text 照抄附录 A"类型"列（amount→amount，enum→enum，其余 string/int/date/text）；
3. `anchor` 映射：附录 A"锚定"列 `rule`→`rule`、`llm`→`llm`、`llm+rule`→`llm+rule`；
4. `label` 用附录 A"标签"列原文；
5. 严禁增删 key、严禁改 key 名（如 `income.monthly_payg` 必须一字不差）；
6. 文件末尾追加使用规则注释（unclassified 说明 + 新 key 走施工单）。

### 验证
`python -c "import yaml; d=yaml.safe_load(open(r'config/fact_schema.yaml',encoding='utf-8')); ks=[f'{c}.{k}' for c,v in d['categories'].items() for k in v]; print(len(ks), len(set(ks)))"` → `43 43`；锚定值只含 rule/llm/llm+rule。

---

## 二、BrainFact ORM + 迁移

### ORM（`core/models/orm.py`，`class CaseContextEvent` 之后新增）

```python
class BrainFact(Base):  # type: ignore[misc]
    """结构化事实（从 confirmed 事件派生，可查询 KV；#5/#7）。

    派生规则：
    - 只从 status='confirmed' 的 CaseContextEvent 提取；
    - 同 (case_id, key, track, event_id) 幂等不重复写；
    - 同 (case_id, key, track) 新值替换旧值 → 旧行 superseded_by=新 id + conflict=True；
    - 来源事件被撤销（superseded）→ 其派生事实 valid_to=now（不再参与全景，不物理删除）。
    """

    __tablename__ = "brain_facts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String, nullable=False, index=True)
    key = Column(String, nullable=False)        # category.key，词表内
    value = Column(Text, nullable=False)
    category = Column(String, nullable=False)
    track = Column(String, nullable=False, default="internal")  # internal | external
    event_id = Column(Integer, nullable=False)  # 来源事件 id（confirmed）
    superseded_by = Column(Integer, nullable=True)
    conflict = Column(Boolean, default=False)
    valid_from = Column(DateTime, default=datetime.utcnow)
    valid_to = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
```

### 迁移（新建 revision）

```python
def upgrade() -> None:
    op.create_table(
        "brain_facts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("case_id", sa.String(), nullable=False),
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("track", sa.String(), nullable=False, server_default="internal"),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("superseded_by", sa.Integer(), nullable=True),
        sa.Column("conflict", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("valid_from", sa.DateTime(), nullable=True),
        sa.Column("valid_to", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_brain_facts_case_id", "brain_facts", ["case_id"])


def downgrade() -> None:
    op.drop_index("ix_brain_facts_case_id", table_name="brain_facts")
    op.drop_table("brain_facts")
```

---

## 三、core/facts/anchors.py（规则锚定，≤200 行）

```python
"""规则锚定 — 金额/日期/银行/阶段不依赖 LLM（#5）。"""

from __future__ import annotations
import re

# 银行枚举（与 fact_schema bank.lender 对齐；名称大小写归一）
BANK_ALIASES = {
    "cba": "CBA", "commonwealth": "CBA", "commonwealth bank": "CBA",
    "anz": "ANZ", "nab": "NAB", "westpac": "Westpac", "st george": "St George",
}

# 阶段词 → fact_schema stage.current 枚举（与 core/constants 阶段语义一致）
STAGE_TERMS = {
    "建档": "gathering", "收集资料": "gathering", "收集": "gathering",
    "递交": "submitted", "递交中": "submitted",
    "补件": "awaiting_docs", "补材料": "awaiting_docs",
    "批准": "approved", "已批准": "approved",
    "结算": "settling", "结算中": "settling", "已结算": "settled",
}

_AMOUNT_RE = re.compile(r"(?:\$|AUD\s*)?([\d,]+(?:\.\d{1,2})?)\s*(万|w|k|千)?", re.I)
_DATE_RE = re.compile(r"(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})")


def extract_rule_facts(content: str) -> list[dict]:
    """从文本提取可确定 key 的规则事实（bank.lender / stage.current）。

    Returns:
        列表：[{"key": "bank.lender", "value": "CBA", "category": "bank", "anchor": "rule"}]。
        金额/日期仅返回 token 证据（key 由 LLM 归属），不在此处硬猜归属。
    """
    facts: list[dict] = []
    lowered = content.lower()
    for alias, canonical in BANK_ALIASES.items():
        if alias in lowered:
            facts.append({"key": "bank.lender", "value": canonical, "category": "bank", "anchor": "rule"})
            break
    for term, canonical in STAGE_TERMS.items():
        if term in content:
            facts.append({"key": "stage.current", "value": canonical, "category": "stage", "anchor": "rule"})
            break
    return facts


def amount_tokens(content: str) -> list[str]:
    """返回金额证据 token（供 LLM 归属 key；不做金额→收入/负债判断）。"""
    return [m.group(0) for m in _AMOUNT_RE.finditer(content)]
```

---

## 四、core/facts/extract.py（LLM 提取 + 同步，≤200 行）

```python
"""BrainFact 提取与同步 — 只处理 confirmed 事件（#5/#7）。"""

from __future__ import annotations

from core.ai.gateway import ApiGateway
from core.config import get_config
from core.facts.anchors import extract_rule_facts
from core.logger import get_logger
from core.models.orm import BrainFact, CaseContextEvent
from core.models.types import DesensitizedText
from core.pii.gateway import desensitize, rehydrate
from sqlalchemy.orm import Session

logger = get_logger(__name__)

_EXTRACT_SYSTEM_PROMPT = (
    "你是贷款案件事实提取器。只输出 JSON，不要解释。"
    "从事件文本提取事实，key 只能来自给定的词表；词表外的概念统一输出 "
    '{"key": "unclassified", "value": "原文摘要"}。金额/日期/银行/阶段已由规则锚定，不要重复提取。'
)


def extract_facts_from_text(text: str, case_id: str, db: Session, schema_keys: set[str]) -> list[dict]:
    """LLM 词表映射提取（脱敏 → LLM → 还原）；失败降级为空列表（不阻断）。

    Args:
        text: 已确认事件原文。
        case_id: 案件 ID。
        db: SQLAlchemy session。
        schema_keys: fact_schema.yaml 内全部 "category.key" 集合（白名单）。

    Returns:
        [{key, value, category, anchor: 'llm'}]；key 只可能来自 schema_keys 或 'unclassified'。
    """
    try:
        safe = desensitize(text, case_id, db)
        result = ApiGateway(get_config()).call_llm(
            text=DesensitizedText(safe),
            prompt_template=_build_prompt(text, schema_keys),
            system_prompt=_EXTRACT_SYSTEM_PROMPT,
        )
        raw = rehydrate(result.response_text.strip(), case_id, db)
        return _parse_json_facts(raw, schema_keys)
    except Exception as exc:  # noqa: BLE001 — 提取失败必须降级，不阻断业务
        logger.warning("BrainFact LLM 提取失败，降级: %s", exc)
        return []


def sync_brain_facts(case_id: str, db: Session, event: CaseContextEvent | None = None) -> int:
    """重建/增量更新该案件 BrainFact（幂等）。

    - event 为空：全量扫描该案件所有 confirmed 事件重建；
    - event 非空：只处理该事件（confirm 后调用）；
    - pending/superseded 事件不参与；
    - 同 (case_id, key, track, event_id) 已存在 → 跳过；
    - 同 (case_id, key, track) 不同 value 且新事件更新 → 旧行 superseded_by=新 id + conflict=True；
    - 来源事件 superseded → 其派生事实 valid_to=now。

    Returns:
        本次写入/更新的 BrainFact 行数。
    """
    ...
```

> `_build_prompt` / `_parse_json_facts` 为模块内私有助手：`_build_prompt(text, schema_keys)` 把词表全量 key 拼进 prompt（脱敏后文本 + 白名单）；`_parse_json_facts` 解析 JSON 数组，逐条校验 key ∈ schema_keys ∪ {'unclassified'}，非法 key 丢弃并 logger.warning。所有新文件 ≤200 行，超出则拆私有函数。

---

## 五、API（`server/api/schemas.py` + `server/api/cases.py`）

### Schemas

```python
class BrainFactResponse(BaseModel):
    id: int
    case_id: str
    key: str
    value: str
    category: str
    track: str
    event_id: int
    superseded_by: int | None = None
    conflict: bool = False
    valid_to: datetime | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
```

### 端点（`server/api/cases.py`，`supersede_context_event` 之后）

```python
@router.get("/{case_id}/facts", response_model=list[BrainFactResponse])
def list_brain_facts(
    case_id: str,
    db: Session = Depends(get_db),  # noqa: B008
    track: str | None = Query(default=None, pattern="^(internal|external)$"),
) -> list[BrainFactResponse]:
    """当前有效 BrainFact 列表（valid_to IS NULL；含 conflict 标记），供全景事实卡。"""
    _get_case_or_404(case_id, db)
    query = db.query(BrainFact).filter(
        BrainFact.case_id == case_id, BrainFact.valid_to.is_(None)
    )
    if track is not None:
        query = query.filter(BrainFact.track == track)
    return [BrainFactResponse.model_validate(f) for f in query.order_by(BrainFact.category, BrainFact.key).all()]


@router.post("/{case_id}/facts/sync", response_model=dict)
def sync_case_brain_facts(case_id: str, db: Session = Depends(get_db)) -> dict:  # noqa: B008
    """全量重建该案件 BrainFact（幂等；pending 不参与；返回写入行数）。"""
    _get_case_or_404(case_id, db)
    written = sync_brain_facts(case_id, db)
    return {"case_id": case_id, "written": written}
```

---

## 六、测试

### `tests/test_core/test_brain_facts.py`（新建，≤200 行）

```python
class TestRuleAnchors:
    def test_bank_and_stage_detected(self): ...
    def test_non_bank_text_no_false_positive(self): ...
    def test_amount_tokens_returned(self): ...

class TestFactSchema:
    def test_schema_has_43_unique_keys(self):
        # yaml 读取：总 key 数 == 43，且无重复
    def test_anchor_values_valid(self):
        # 全部 anchor ∈ {rule, llm, llm+rule}

class TestExtract:
    def test_llm_failure_falls_back_empty(self, monkeypatch):
        # ApiGateway.call_llm 抛异常 → extract_facts_from_text 返回 []
    def test_out_of_schema_key_becomes_unclassified(self, monkeypatch):
        # mock call_llm 返回词表外 key → 结果为 unclassified
    def test_schema_keys_whitelist_enforced(self, monkeypatch):
        # mock 返回非法 key → 丢弃

class TestSync:
    def test_sync_from_confirmed_event_creates_fact(self, test_db): ...
    def test_sync_idempotent(self, test_db):
        # 跑两次 sync → 行数不变（同 event_id+key 不重复）
    def test_pending_event_not_included(self, test_db): ...
    def test_conflict_supersedes_old_fact(self, test_db):
        # 同 key 新值 → 旧行 superseded_by=新 id + conflict=True，新行有效
    def test_superseded_event_invalidates_facts(self, test_db):
        # 来源事件 superseded 后 sync → 派生事实 valid_to 非空
    def test_sync_endpoint_and_list(self, client, test_db):
        # POST sync → {written}; GET facts → 有效列表含 conflict 标记；track 过滤；404
```

### `tests/test_safety/test_config_consistency.py` 追加

```python
def test_fact_schema_matches_appendix_a_count():
    # fact_schema.yaml 总 key 数 == 43；且含 identity.full_name / income.monthly_payg /
    # liability.debt / bank.lender / stage.current 等关键 key（防止转译遗漏）
```

---

## 验收标准（全量门禁）

```bash
python -m pytest tests/test_core/test_brain_facts.py tests/test_safety/test_config_consistency.py -v   # 专项
python -m pytest tests/ -q                                                                            # 全量（基线 464，不得回归）
ruff check core/facts/ core/models/orm.py server/api/schemas.py server/api/cases.py tests/test_core/test_brain_facts.py tests/test_safety/test_config_consistency.py
```

手动验证：
1. `cd D:\vera-workbench && .venv\Scripts\python.exe -m alembic current` → 新 revision（head）。
2. 记一笔（confirmed）→ `POST /api/cases/{id}/facts/sync` → `{"written": ≥1}`；`GET /api/cases/{id}/facts` 返回 bank.lender/stage.current 等规则事实；`?track=external` 过滤生效。
3. 造一条 pending 事件 → sync 后该事件内容不出现在 facts。

---

⚠️ 执行纪律（每一条都必须遵守）：
1. 只修改"改动范围"表中列出的 10 个文件，绝不碰其他文件
2. 词表 43 key 从附录 A **逐行转译**，key 名一字不差；严禁增删
3. 所有函数名/变量名/字段名/断言严格按"接口契约"定义，一个字符都不能改
4. 每完成一节立即运行该节验证命令；失败先报告，不自作主张修计划外代码
5. 不引入新依赖；不创建改动范围表以外的新文件（迁移 revision 除外）
6. 不改动既有迁移 revision；只新建一个
7. 新文件全部 ≤200 行；不要重构、优化、美化任何计划外的代码
