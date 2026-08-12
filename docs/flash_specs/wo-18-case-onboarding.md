# WO-18：统一建案后端 — 建档完善 + 识别预填 + 文件提取（#13/#15/#16 定稿落地）

> 来源：CASE 大脑 V1 收口 #13（必填 7 项 + LVR 自动算 + 建档即预选清单）、#15（存量三级壳：极简/标准/完整，is_imported 标记）、#16（按需文件提取：扔文件 → 本地解析 → 脱敏 → 提取 → 预填，不主动扫、不留全量文件）。执行方：opencode。检查方：Codex。
> 前置：WO-15（fact_schema 42 key + 提取）、WO-09（pick_checklist / save_confirmed_checklist 可复用）。前端配套 F-7（建案表单 sheet）。

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / liteparse（已装）
- 禁止：引入任何新的 pip 依赖；禁止创建本表以外的文件；禁止修改本表以外的文件
- 禁止：改数据库迁移（本单无表结构变更）
- 脱敏红线：识别/提取出站必须 desensitize；parse-file 的临时文件处理完必须删除；PII 不出网
- 只按需：parse-file 是 Vera 主动上传的文件，不扫描文件夹

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `core/case_creation.py` | 修改 | `create_case_from_source`（L151 起）加参数 + LVR/清单/is_imported 逻辑 |
| `core/facts/prefill.py` | **新建** | 识别/文件预填提取（≤200 行） |
| `server/api/schemas.py` | 修改 | `CaseCreateRequest` 加字段；新增 ParseTextRequest/ParseFileResponse/PreFillResponse |
| `server/api/cases.py` | 修改 | `create_case` 透传新字段；新增 parse-text / parse-file 端点 |
| `tests/test_api/test_case_prefill.py` | **新建** | 预填/文件提取/LVR/清单测试（≤200 行） |

⚠️ 严禁修改上表以外的文件（含 core/pipeline/parser.py、core/checklist/、前端）。严禁改动迁移。

---

## 一、建档完善（`core/case_creation.py`）

### `create_case_from_source` 签名追加（在 special_circumstances 之后）

```python
    property_value: float | None = None,
    employment_type: str | None = None,
    residency: str | None = None,
    interest_rate: float | None = None,
    is_imported: bool = False,
```

### 改动点

1. Case 构造（现 L230 附近 `property_value=0, lvr=0, employment_type=None, residency=None`）改为：
   ```python
   property_value=property_value or 0,
   lvr=round(loan_amount / property_value * 100, 1)
       if (loan_amount and property_value) else 0,
   employment_type=employment_type,
   residency=residency,
   interest_rate=str(interest_rate) if interest_rate is not None else None,
   is_imported=is_imported,
   ```
   > 注意：interest_rate 列是 String（见 ORM），数值需转 str。
2. `db.commit()` 之后（`db.refresh(case)` 前）加**建档即预选清单**：
   ```python
   # 建档即预选清单（#13 配套②）：银行+收入类型 → pick_checklist（规则预选，不调 LLM）
   try:
       from core.checklist.generator import save_confirmed_checklist
       from core.checklist.master_picker import pick_checklist
       picked = pick_checklist(
           {"lender": lender or "CBA", "employment_type": employment_type or "PAYG",
            "residency": residency or "PR", "purpose": purpose or "Purchase"},
           db,
           use_ai=False,
       )
       if picked:
           mapped = [_map_picked_to_checklist(it) for it in picked]
           save_confirmed_checklist(case_id, mapped, db)
   except Exception as exc:  # noqa: BLE001 — 清单预选失败不阻断建档
       logger.warning("Checklist pre-selection failed for %s: %s (non-fatal)", case_id, exc)
   ```
3. 新增私有映射函数（模块内）：
   ```python
   def _map_picked_to_checklist(item: dict) -> dict:
       """pick_checklist 输出 → save_confirmed_checklist 输入。

       pick: {"id","name_zh","required","reason"}；save: {"item_name","category","is_required","ai_suggestion"}。
       category 从 config/checklist_master.yaml 按 id 查（item.get("category") 兜底，缺省 "general"）。
       """
       return {
           "item_name": item.get("name_zh") or item.get("item_name"),
           "category": item.get("category") or "general",
           "is_required": bool(item.get("required", True)),
           "ai_suggestion": item.get("reason"),
       }
   ```
   > 若 pick_checklist 返回项本身含 category 则直接用；否则从 checklist_master 按 id 查 category（只读 yaml，不做复杂解析）。

### `server/api/cases.py` create_case 透传（req → create_case_from_source 追加）

```python
        property_value=req.property_value,
        employment_type=req.employment_type,
        residency=req.residency,
        interest_rate=req.interest_rate,
        is_imported=req.is_imported,
```

### `CaseCreateRequest` 追加字段（schemas.py）

```python
    property_value: float | None = None      # 已有（V5），确认保留
    employment_type: str | None = None       # 新增：PAYG | 自雇 | 公司 | 董事
    residency: str | None = None             # 新增：citizen | PR | temp_visa | other
    interest_rate: float | None = None       # 已有，确认透传
    is_imported: bool = False                # 新增：存量壳标记（#15）
```

---

## 二、识别/文件预填（`core/facts/prefill.py` 新建，≤200 行）

```python
"""建档预填提取 — 一段话/文件 → 字段预填 + 事实（#13/#16）。"""

from __future__ import annotations

from core.ai.gateway import ApiGateway
from core.config import get_config
from core.facts.anchors import extract_rule_facts
from core.logger import get_logger
from core.models.types import DesensitizedText
from core.pii.gateway import desensitize, rehydrate
from sqlalchemy.orm import Session

logger = get_logger(__name__)

# 建档字段映射：fact_schema key → CaseCreateRequest 字段名（返回给前端预填）
_PREFILL_KEYS = {
    "identity.full_name": "client_name",
    "bank.lender": "lender",
    "loan.amount": "loan_amount",
    "property.value": "property_value",
    "property.purpose": "purpose",
    "employment.type": "employment_type",
    "identity.residency": "residency",
    "loan.rate": "interest_rate",
    "loan.goal": "client_goal",
    "special.circumstances": "special_circumstances",
}

_PREFILL_PROMPT = (
    "从客户描述中提取贷款建档字段，只输出 JSON 对象。"
    "字段只允许：client_name/lender/loan_amount/property_value/purpose/employment_type/"
    "residency/interest_rate/client_goal/special_circumstances；无法确定的字段不输出。"
    "金额为数字（去货币符号与逗号）；居住取 citizen/PR/temp_visa/other；用途取 自住/投资/转贷/建房。"
)


def build_prefill_from_text(text: str, db: Session) -> dict:
    """一段话/文件文本 → 建档预填字段 + 规则事实。

    链路：desensitize → LLM 提取（_PREFILL_KEYS 白名单）→ rehydrate → 结构化返回。
    LLM 失败 → 返回空 prefilled（不阻断）；规则锚定（bank.lender/stage.current）照常返回。

    Returns:
        {"prefilled": dict, "facts": list[dict]}
    """
    prefilled: dict = {}
    facts = extract_rule_facts(text)
    try:
        safe = desensitize(text, "prefill", db)
        result = ApiGateway(get_config()).call_llm(
            text=DesensitizedText(safe),
            prompt_template=_PREFILL_PROMPT + "\n\n客户描述：\n" + str(safe),
            system_prompt="你是贷款建档字段提取器，只输出 JSON。",
        )
        raw = rehydrate(result.response_text.strip(), "prefill", db)
        data = _parse_prefill_json(raw)
        prefilled = {k: v for k, v in data.items() if k in _PREFILL_KEYS.values() and v not in (None, "")}
    except Exception as exc:  # noqa: BLE001 — 提取失败降级，不阻断
        logger.warning("Prefill extraction failed, fallback: %s", exc)
    return {"prefilled": prefilled, "facts": facts}


def _parse_prefill_json(raw: str) -> dict:
    """解析 LLM 返回的 JSON 对象（容错：取首个 {…} 块）；失败返回 {}。"""
    ...
```

---

## 三、端点（`server/api/schemas.py` + `server/api/cases.py`）

### Schemas

```python
class ParseTextRequest(BaseModel):
    raw_text: str = Field(..., min_length=1)


class PreFillResponse(BaseModel):
    prefilled: dict = {}   # CaseCreateRequest 字段名 → 值（前端预填表单）
    facts: list[dict] = [] # 规则锚定事实（bank.lender / stage.current）


class ParseFileResponse(BaseModel):
    filename: str
    text_preview: str      # 解析文本前 200 字（仅预览，含脱敏后内容）
    prefilled: dict = {}
    facts: list[dict] = []
```

### 端点（`server/api/cases.py`，`create_case` 之后新增）

```python
@router.post("/parse-text", response_model=PreFillResponse)
def parse_case_text(req: ParseTextRequest, db: Session = Depends(get_db)) -> PreFillResponse:  # noqa: B008
    """一段话识别预填：返回建档字段 + 规则事实（不建案）。"""
    data = build_prefill_from_text(req.raw_text, db)
    return PreFillResponse(**data)


@router.post("/parse-file", response_model=ParseFileResponse)
async def parse_case_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),  # noqa: B008
) -> ParseFileResponse:
    """按需文件提取：Vera 上传单个文件 → 本地解析 → 脱敏提取 → 预填字段。

    红线：文件临时保存到系统临时目录，处理后立即删除；不建索引、不留全量文件数据（#16）。
    """
    tmp_path = None
    try:
        import tempfile
        from pathlib import Path
        from core.pipeline.parser import parse_file
        suffix = Path(file.filename or "upload").suffix or ".pdf"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await file.read())
            tmp_path = Path(tmp.name)
        result = parse_file(tmp_path)
        text = result.text or ""
        data = build_prefill_from_text(text[:8000], db)
        return ParseFileResponse(
            filename=file.filename or "upload",
            text_preview=text[:200],
            prefilled=data["prefilled"],
            facts=data["facts"],
        )
    except Exception as exc:  # noqa: BLE001 — 解析失败返回 422 与原因
        raise HTTPException(status_code=422, detail=f"文件解析失败：{exc}") from exc
    finally:
        if tmp_path and tmp_path.exists():
            tmp_path.unlink(missing_ok=True)
```

> import 补充：`from fastapi import UploadFile, File`。

---

## 四、测试（`tests/test_api/test_case_prefill.py` 新建，≤200 行）

```python
"""统一建案后端测试 — LVR/清单/存量壳/识别预填/文件提取。"""

class TestCaseCreationEnhance:
    def test_lvr_auto_computed(self, client, test_db):
        # create_case(loan_amount=850000, property_value=1000000) → case.lvr == 85.0
    def test_checklist_preselected_on_create(self, client, test_db):
        # create_case(lender=CBA, employment_type=PAYG) → CaseChecklist 15-25 条（pending）
    def test_legacy_shell_marked_imported(self, client, test_db):
        # create_case(client_name=…, is_imported=True, 少字段) → case.is_imported True、其他字段空
    def test_employment_residency_interest_saved(self, client, test_db):
        # employment_type/residency/interest_rate 落库正确（interest_rate 为字符串）

class TestPrefill:
    def test_parse_text_prefills_fields(self, client, test_db, monkeypatch):
        # mock ApiGateway.call_llm 返回含 client_name/lender/loan_amount 的 JSON
        # → /api/cases/parse-text → prefilled 含对应字段；facts 含 bank.lender（若文本含 CBA）
    def test_parse_text_llm_failure_empty(self, client, test_db, monkeypatch):
        # call_llm 抛异常 → 200，prefilled={}，facts 仍返回规则锚定
    def test_parse_file_returns_and_cleans(self, client, test_db, monkeypatch):
        # 上传临时 PDF/文本 → 200 含 filename/text_preview；处理后临时文件不存在
        # （monkeypatch parse_file 返回固定 ParseResult，避免真依赖 liteparse）
    def test_prefill_desensitized(self, client, test_db, monkeypatch):
        # 断言 call_llm 收到的 text 不含原始 PII（desensitize 已生效）
```

> mock 方式：`monkeypatch.setattr("core.facts.prefill.ApiGateway", FakeGateway)`（或 monkeypatch call_llm）；断言语料用脱敏样本（PERSON_1 / $850,000）。parse-file 用 monkeypatch `core.pipeline.parser.parse_file` 返回构造的 ParseResult，避免真实 liteparse 依赖。

---

## 验收标准（全量门禁）

```bash
python -m pytest tests/test_api/test_case_prefill.py -v
python -m pytest tests/ -q                          # 全量（基线 497，不得回归）
ruff check core/case_creation.py core/facts/prefill.py server/api/cases.py server/api/schemas.py tests/test_api/test_case_prefill.py
```

手动验证：
1. `POST /api/cases`（含 loan_amount=850000、property_value=1000000、lender=CBA、employment_type=PAYG）→ 返回 case 的 lvr=85.0；查 CaseChecklist 有 15-25 条 pending。
2. `POST /api/cases`（is_imported=True，仅 client_name + lender）→ 存量壳，is_imported=True。
3. `POST /api/cases/parse-text`（"张三在 CBA 贷 85 万买房，PAYG 月入 1 万"）→ prefilled 含 client_name/lender/loan_amount/purpose/employment_type。
4. `POST /api/cases/parse-file`（上传 payslip PDF）→ 200 含 text_preview/prefilled；临时文件被清理。

---

⚠️ 执行纪律（每一条都必须遵守）：
1. 只修改"改动范围"表中列出的 5 个文件，绝不碰其他文件
2. 所有函数名/变量名/字段名/断言严格按"接口契约"定义，一个字符都不能改
3. 每完成一节立即运行该节验证命令；失败先报告，不自作主张修计划外代码
4. 不引入新依赖；新文件全部 ≤200 行；不改迁移
5. parse-file 临时文件必须 finally 删除（红线）；识别/提取出站必须走 desensitize（PII 不出网）
6. 清单预选失败只 warning 不阻断建档；LLM 提取失败降级空 prefilled
