# WO-22：银行主数据注册表 + 聚合平台字段绑定（bank_registry + 消费点切 key）

> 来源（Vera 定稿 2026-08-13）：银行 20 家全收但分层 —— A 层「常用精档」（6 家计算器银行 + 4 大，置顶） / B 层「基础档」（其余，按需补档）。平台维度独立，不把 Infynity 写死（Finsure 已公布 2026 起以新 CRM Metanoia 替换 Infynity，落地时间未定）。Infynity 3 条规则已补入 industry_seed.yaml（WO-22 前置完成）。本单把银行/平台字段同步到所有消费点：建档下拉、清单预选、政策引擎、佣金、统计、PII 白名单。
> 执行方：opencode。检查方：Codex。
> 前置：WO-19（配置加载模式）、WO-21（计算器档案 key：boc/cba/macquarie/ma_money/latrobe/resimac）、industry_seed.yaml 已含 MQG×4 + Infynity×3 平台条目。当前 alembic head = **6f9c2d4a8e1b**。

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / PyYAML（venv 已有）
- 禁止：引入任何新的 pip 依赖；禁止修改本表以外的文件；禁止改动 lender_policies.yaml 的既有键名与结构；**禁止改前端**；禁止改动迁移链中既有 revision
- 红线：bank_registry.yaml 为本地配置（不含 PII，样例值禁止出现客户姓名/电话）；解析只做字符串规范化，不调 LLM、不访问网络；回填工具只写 `cases.lender_ref` / `cases.submission_platform_ref` 两列，不碰其他字段
- 命名契约：规范 key 一律小写下划线 slug（`st_george` / `me_bank` / `ma_money` / `boc`）；`display_name` 与 lender_policies.yaml 顶层键**逐字一致**（20 家），保证政策引擎/佣金按 display_name 查找零改动
- 新代码文件全部 ≤200 行；`config/bank_registry.yaml` 为数据文件不受 200 行限制（参照 checklist_master.yaml 先例）

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `config/bank_registry.yaml` | **新建** | 数据文件（22 家 + 5 平台，见 §一/§二） |
| `core/bank_registry.py` | **新建** | 加载/校验/别名解析（≤200 行，见 §三） |
| `core/migrations/versions/<gen>_add_submission_platform_ref.py` | **新建** | down_revision=`6f9c2d4a8e1b`，仅加 1 列（见 §五） |
| `tools/migrate_lender_keys.py` | **新建** | 幂等回填（≤200 行，见 §五） |
| `server/api/banks.py` | **新建** | GET /api/banks/ + GET /api/platforms/（≤200 行） |
| `server/main.py` | 修改 | 注册 banks router |
| `server/api/schemas.py` | 修改 | +BankItem/PlatformItem；CaseDetailResponse +lender_ref/submission_platform_ref；AnalyticsLenderStats +lender_key |
| `server/api/cases.py` | 修改 | `create_case`（约 L310）建案规范化（见 §四） |
| `core/commission/calculator.py` | 修改 | `resolve_lender_key`（L64）委托 registry（见 §六） |
| `core/checklist/master_picker.py` | 修改 | `_matches_bank_specific`（L56）走规范 key（见 §六） |
| `core/analytics/service.py` | 修改 | `get_lenders`（L96）按 key 分组（见 §六） |
| `core/pii/gateway.py` | 修改 | `_LENDER_NAMES`（L31）由 registry 生成（见 §六） |
| `config/industry_seed.yaml` | 修改 | platform 段 7 条 + `platform_key` 字段（仅数据，见 §二.3） |
| `tests/test_core/test_bank_registry.py` | **新建** | ≥14 用例 |
| `tests/test_core/test_lender_key_backfill.py` | **新建** | ≥6 用例 |
| `tests/test_api/test_bank_endpoints.py` | **新建** | ≥6 用例 |

⚠️ 严禁修改上表以外的文件。严禁重命名、移动、删除任何现有文件。
⚠️ 尤其不得改动：`core/knowledge/service.py`、`core/policy/engine.py`、`core/case_creation.py`、`core/checklist/generator.py`、`config/lender_policies.yaml` 结构、`core/models/orm.py`（新增列走 Alembic，ORM 只加 1 个 Column 属性，见 §五）。

---

## 一、银行主数据注册表（`config/bank_registry.yaml`）

统一 schema（字段名契约，实施时一字不改）：

```yaml
version: 1
lenders:
  - key: cba
    display_name: "CBA"                       # 必须与 lender_policies.yaml 顶层键逐字一致（20 家）
    name_en: "Commonwealth Bank of Australia"
    name_zh: "澳洲联邦银行"
    aliases: ["Commonwealth Bank", "Commonwealth"]
    type: major                               # major | bank | non_bank
    adi: true
    tier: full                                # full（置顶） | basic
    sort_order: 1                             # 前端排序：full 在前、basic 在后，同层按此递增
    calculator_profile: cba                   # 仅 6 家非 null；对应 config/calculator/<key>.yaml
    policy_key: "CBA"                         # lender_policies.yaml 顶层键；boc/ma_money 为 null
    platforms: ["mqg", "infynity"]            # 递交平台可用性（vera_confirmed=false，待 Vera 确认）
    vera_confirmed: false

platforms:
  - key: mqg
    display_name: "MoneyQuest"
    name_zh: "MoneyQuest（聚合平台）"
    aliases: ["MQG", "mqga", "money quest"]
    type: aggregator                          # aggregator | lodgement | manual
    vera_confirmed: true
```

**22 家完整数据（直接抄入 YAML，不得增删改名；aliases 一个字符不能改）**

| key | display_name | name_zh | type | adi | tier | sort | calculator | policy_key | platforms |
|---|---|---|---|---|---|---|---|---|---|
| cba | CBA | 澳洲联邦银行 | major | true | full | 1 | cba | CBA | [mqg, infynity] |
| anz | ANZ | 澳新银行 | major | true | full | 2 | null | ANZ | [mqg, infynity] |
| westpac | Westpac | 西太平洋银行 | major | true | full | 3 | null | Westpac | [mqg, infynity] |
| nab | NAB | 澳洲国民银行 | major | true | full | 4 | null | NAB | [mqg, infynity] |
| macquarie | Macquarie | 麦格理银行 | major | true | full | 5 | macquarie | Macquarie | [mqg, infynity] |
| boc | Bank of China | 中国银行（澳洲） | bank | true | full | 6 | boc | null | [mqg, infynity] |
| ma_money | MA Money | MA Money（非银行） | non_bank | false | full | 7 | ma_money | null | [mqg, infynity] |
| latrobe | La Trobe | La Trobe 金融 | non_bank | false | full | 8 | latrobe | Latrobe | [mqg, infynity] |
| resimac | Resimac | Resimac 贷款 | non_bank | false | full | 9 | resimac | Resimac | [mqg, infynity] |
| bankwest | Bankwest | 西澳银行 | bank | true | basic | 10 | null | Bankwest | [mqg] |
| ing | ING | ING 银行 | bank | true | basic | 11 | null | ING | [mqg] |
| pepper | Pepper | Pepper 金融 | non_bank | false | basic | 12 | null | Pepper | [mqg] |
| st_george | St George | 圣乔治银行 | bank | true | basic | 13 | null | St George | [mqg] |
| bank_of_melbourne | Bank of Melbourne | 墨尔本银行 | bank | true | basic | 14 | null | Bank of Melbourne | [mqg] |
| adelaide_bank | Adelaide Bank | 阿德莱德银行 | bank | true | basic | 15 | null | Adelaide Bank | [mqg] |
| boq | BOQ | 昆士兰银行 | bank | true | basic | 16 | null | BOQ | [mqg] |
| me_bank | ME Bank | ME 银行 | bank | true | basic | 17 | null | ME Bank | [mqg] |
| suncorp | Suncorp | 桑科普银行 | bank | true | basic | 18 | null | Suncorp | [mqg] |
| hsbc | HSBC | 汇丰银行 | bank | true | basic | 19 | null | HSBC | [mqg] |
| amp | AMP | AMP 银行 | bank | true | basic | 20 | null | AMP | [mqg] |
| bendigo | Bendigo | 本迪戈银行 | bank | true | basic | 21 | null | Bendigo | [mqg] |
| liberty | Liberty | Liberty 金融 | non_bank | false | basic | 22 | null | Liberty | [mqg] |

每家的 `aliases`（除下表外默认 `[]`）：

| key | aliases |
|---|---|
| cba | ["Commonwealth Bank", "Commonwealth", "Commonwealth Bank of Australia"] |
| anz | ["ANZ Bank", "Australia and New Zealand Banking Group"] |
| westpac | ["Westpac Banking Corporation"] |
| nab | ["National Australia Bank"] |
| macquarie | ["Macquarie Bank"] |
| boc | ["BOC", "Bank of China (Australia)", "中国银行"] |
| ma_money | ["MA Money Home Loans"] |
| latrobe | ["La Trobe Financial", "Latrobe Financial"] |
| resimac | ["Resimac Home Loans"] |
| ing | ["ING Direct"] |
| pepper | ["Pepper Money"] |
| st_george | ["St.George", "St. George", "St George Bank"] |
| bank_of_melbourne | ["BOM"] |
| boq | ["Bank of Queensland"] |
| me_bank | ["ME"] |
| suncorp | ["Suncorp Bank"] |
| amp | ["AMP Bank"] |
| bendigo | ["Bendigo Bank"] |
| liberty | ["Liberty Financial"] |

**校验规则（load_registry 内强制，失败抛 ValueError）**：key 唯一；display_name 唯一；boc/ma_money 的 policy_key 必须为 null；calculator_profile 非 null 的恰为 6 家；每家 platforms 的 key 必须存在于 platforms 段；platforms 段必须有 mqg/infynity/manual。

## 二、平台维度

### 2.1 platforms 契约（5 条，直接抄入）

| key | display_name | name_zh | type | aliases | vera_confirmed |
|---|---|---|---|---|---|
| mqg | MoneyQuest | MoneyQuest（聚合平台） | aggregator | ["MQG", "mqga", "money quest"] | true |
| infynity | Infynity | Infynity（Finsure 聚合平台） | aggregator | ["Finsure"] | true |
| aol | ApplyOnline | ApplyOnline（递交工具） | lodgement | ["AOL"] | true |
| loanapp | Loanapp | Loanapp（递交工具） | lodgement | [] | true |
| manual | 手动递交 | 手动递交 | manual | [] | true |

说明：aol/loanapp 保留用于兼容存量 `submission_platform` 旧值（"ApplyOnline"/"Loanapp"）可解析回填；前端下拉只展示 type ∈ {aggregator, manual}。

### 2.2 银行×平台默认映射

- tier=full 的 9 家：`platforms: [mqg, infynity]`
- tier=basic 的 13 家：`platforms: [mqg]`
- 全部 lender 条目 `vera_confirmed: false`（Vera 在设置页确认前仅作 UI 过滤建议，不算合规结论）

### 2.3 industry_seed.yaml 加 platform_key（数据联动，仅此一处）

- 文件：`config/industry_seed.yaml`
- 在 platform 段 7 条的 `lender:` 字段后新增一行 `platform_key:`：
  - 4 条 MQG（lender: MQG）→ `platform_key: mqg`
  - 3 条 Infynity（lender: INFYNITY）→ `platform_key: infynity`
- 不改任何 content 文本；不改 policy 段。

## 三、解析模块（`core/bank_registry.py`，≤200 行）

只允许 import：`pathlib`、`yaml`、`functools`（如需缓存）。函数签名契约（实施时一字不改）：

```python
_REGISTRY_PATH: Path  # 项目根 / config/bank_registry.yaml（按 __file__ 上溯两级定位）
_REGISTRY: dict | None = None

def load_registry() -> dict:
    """读取并缓存 bank_registry.yaml，执行 §一 校验规则；失败抛 ValueError。"""

def resolve_lender_key(name: str | None) -> str | None:
    """任意写法 → 规范 key（小写下划线 slug）。匹配顺序（全部大小写不敏感、首尾去空白）：
    1) 等于某 key；2) 等于某 display_name；3) 等于某 alias（alias 匹配前把内部连续空白折叠为单空格再小写）；
    4) name_en 包含关系。无法匹配返回 None。"""

def resolve_policy_key(name: str | None) -> str | None:
    """→ lender_policies.yaml 顶层键（display_name）。先 resolve_lender_key 再取 policy_key。"""

def display_name(key: str | None) -> str | None:
    """规范 key → display_name；未知返回 None。"""

def resolve_platform_key(name: str | None) -> str | None:
    """任意写法 → 平台 key（匹配规则同 resolve_lender_key：key/display_name/alias）。"""

def display_platform(key: str | None) -> str | None:
    """平台 key → display_name；未知返回 None。"""

def all_lenders() -> list[dict]:
    """lenders 列表（按 sort_order 升序）。"""

def all_platforms() -> list[dict]:
    """platforms 列表（按 yaml 顺序）。"""

def platforms_for_bank(key: str) -> list[str]:
    """银行 key → platforms 列表；未知返回 []。"""

def has_calculator(key: str) -> bool:
    """bank 的 calculator_profile 非 null。"""

def bank_names_for_pii() -> frozenset[str]:
    """所有 display_name + name_en + aliases 的并集（供 PII 白名单生成）。"""
```

## 四、API 端点 + 建案规范化

### 4.1 server/api/schemas.py

```python
class BankItem(BaseModel):
    key: str
    display_name: str
    name_zh: str
    type: str            # major | bank | non_bank
    adi: bool
    tier: str            # full | basic
    has_calculator: bool
    platforms: list[str]
    vera_confirmed: bool

class PlatformItem(BaseModel):
    key: str
    display_name: str
    name_zh: str
    type: str            # aggregator | lodgement | manual
    vera_confirmed: bool

class BanksResponse(BaseModel):
    banks: list[BankItem] = Field(default_factory=list)

class PlatformsResponse(BaseModel):
    platforms: list[PlatformItem] = Field(default_factory=list)
```

- `CaseDetailResponse`（L44）：新增 `lender_ref: str | None = None`、`submission_platform_ref: str | None = None`（若已存在则跳过）
- `AnalyticsLenderStats`（约 L408）：新增 `lender_key: str`

### 4.2 server/api/banks.py（新建，router prefix=`/api`，≤200 行）

```python
router = APIRouter(prefix="/api", tags=["banks"])

@router.get("/banks/", response_model=BanksResponse)
def list_banks(): ...   # 直接读 registry，返回全部 22 家（已按 sort_order 排序）

@router.get("/platforms/", response_model=PlatformsResponse)
def list_platforms(): ...   # 返回全部 5 家
```

只读端点，不查库。注册进 `server/main.py`（照抄现有 router include 模式）。

### 4.3 server/api/cases.py 建案规范化（`create_case`，约 L310）

在调用 `create_case_from_source` 前计算并传入：

```python
from core.bank_registry import display_name, display_platform, resolve_lender_key, resolve_platform_key
...
lender_key = resolve_lender_key(req.lender)
platform_key = resolve_platform_key(req.submission_platform)
case = create_case_from_source(
    ...
    lender=display_name(lender_key) or req.lender,          # 原 lender=req.lender 替换
    lender_ref=lender_key,                                   # 原未传，新增
    submission_platform=display_platform(platform_key) or req.submission_platform,
    ...
)
```

在「── 其余字段落 Case 表对应列（core 只读不改）──」块内追加：

```python
if platform_key:
    case.submission_platform_ref = platform_key
```

未知银行/平台：`lender_key`/`platform_key` 为 None → 原样透传、ref 为 None。不改 core/case_creation.py。

## 五、数据迁移

### 5.1 Alembic revision（新建，仅 1 列）

- 文件名：`core/migrations/versions/<生成 id>_add_submission_platform_ref.py`
- `down_revision = "6f9c2d4a8e1b"`
- 参照 `b4e1c9d2f7a3_add_event_status.py` 的 batch 写法，只加：

```python
batch_op.add_column(sa.Column("submission_platform_ref", sa.String(), nullable=True))
```

- upgrade/downgrade 对称；不动其他列；不设 server_default（nullable，回填走工具）

### 5.2 tools/migrate_lender_keys.py（新建，≤200 行）

```python
def backfill(db_path: Path, dry_run: bool = False) -> dict:
    """逐行扫描 cases：
    - lender → resolve_lender_key → 更新 lender_ref（仅当解析成功且现值不同）
    - submission_platform → resolve_platform_key → 更新 submission_platform_ref
    - 解析失败保持原值（不置空）
    返回 {"cases": n, "lender_updated": n, "platform_updated": n, "unresolved": n}"""

def main() -> None:
    """argparse：--dry-run、--db <path>（可重复）。
    默认同时处理 data/assistant.db 与 core/data/assistant.db（都存在才跑，缺失跳过）。"""
```

幂等：同库跑两次，第二次 `lender_updated=0`、`platform_updated=0`。

## 六、消费点切换（4 个文件，只改函数体，不改签名）

### 6.1 core/commission/calculator.py（L64 `resolve_lender_key`）

函数体整体替换为委托（保留原 docstring 与返回值语义——返回 lender_policies 顶层键）：

```python
def resolve_lender_key(lender: str | None) -> str | None:
    """...（原 docstring 保留）"""
    from core.bank_registry import resolve_policy_key
    return resolve_policy_key(lender)
```

删除函数内原 `rates = get_commission_rates()` 等旧逻辑；`get_commission_rates` 及其余代码不动。

### 6.2 core/checklist/master_picker.py（L56 `_matches_bank_specific`）

```python
def _matches_bank_specific(item: dict, lender: str) -> bool:
    bs = item.get("bank_specific")
    if not bs:
        return True
    from core.bank_registry import resolve_lender_key
    k_bs = resolve_lender_key(bs)
    k_lender = resolve_lender_key(lender)
    return k_bs is not None and k_bs == k_lender
```

效果：`bank_specific: CBA` 与案件 "Commonwealth Bank" 匹配；"St.George" 与 "St George" 互相匹配。

### 6.3 core/analytics/service.py（L96 `get_lenders`）

分组键从原始文本改为规范 key：

```python
from core.bank_registry import display_name, resolve_lender_key
...
key = case.lender_ref or resolve_lender_key(case.lender) or (case.lender or "").strip() or "未指定银行"
name = display_name(key) or key
group = groups.setdefault(key, {...})
...
rows.append({"lender": name, "lender_key": key, "cases": n, ...})
```

`AnalyticsLenderStats` 已加 `lender_key` 字段（§四）；其余字段不变。

### 6.4 core/pii/gateway.py（L31 `_LENDER_NAMES`）

```python
from core.bank_registry import bank_names_for_pii

# 非银行机构/聚合商/监管机构（保持原样，registry 不收录）
_EXTRA_NAMES: frozenset[str] = frozenset({
    "Citibank", "Citi", "UBank", "Virgin Money",
    "Firstmac", "Athena", "Nano", "loans.com.au",
    "AFG", "Connective", "Aggregator",
    "ATO", "ASIC", "APRA", "Centrelink",
})

_LENDER_NAMES: frozenset[str] = frozenset(bank_names_for_pii()) | _EXTRA_NAMES
```

`_LENDER_PATTERN` 及其余逻辑不动；PII 脱敏行为只增不减（registry 名称全部进入白名单）。

## 七、测试

### 7.1 tests/test_core/test_bank_registry.py（新建，≥14 用例）

1. load_registry 成功，lenders=22、platforms=5、version=1
2. 每条 lender 必含 key/display_name/name_zh/type/adi/tier/sort_order/policy_key/platforms；key 唯一
3. display_name 唯一；boc/ma_money 的 policy_key 为 null
4. resolve_lender_key("CBA")=="cba"；("Commonwealth Bank")=="cba"
5. ("St George")=="st_george"；("St.George")=="st_george"；("ST GEORGE")=="st_george"
6. ("ME Bank")=="me_bank"；("Bank of Melbourne")=="bank_of_melbourne"；("Bank of Queensland")=="boq"
7. ("Bank of China")=="boc"；("中国银行")=="boc"；("MA Money")=="ma_money"
8. resolve_lender_key(None)==""未知银行""→None
9. resolve_policy_key("CBA")=="CBA"；("st_george")=="St George"；("Commonwealth Bank")=="CBA"；（"Bank of China"）is None
10. display_name("st_george")=="St George"；display_name(None) is None
11. has_calculator 恰为 6 家：{cba, macquarie, boc, ma_money, latrobe, resimac}
12. resolve_platform_key("MoneyQuest")=="mqg"；("MQG")=="mqg"；("ApplyOnline")=="aol"；("Finsure")=="infynity"；("手动递交")=="manual"
13. bank_names_for_pii 非空，且包含 "CBA"/"Commonwealth Bank"/"St George"/"St.George"/"中国银行"
14. 全部 lender.platforms 中的 key 均存在于 platforms（一致性）；tier=full 的 9 家都含 infynity
15. 样例数据无 PII：全文件不含手机号/邮箱/TFN 模式

### 7.2 tests/test_api/test_bank_endpoints.py（新建，≥6 用例）

1. GET /api/banks/ → 200，22 家，前 9 家 tier=="full"
2. GET /api/banks/ → has_calculator=true 恰 6 家
3. GET /api/platforms/ → 200，5 家，含 mqg/infynity/manual
4. POST /api/cases（lender="Commonwealth Bank"）→ Case.lender_ref=="cba" 且 lender=="CBA"
5. POST /api/cases（lender="野鸡银行"）→ lender_ref is None、lender 原样
6. POST /api/cases（submission_platform="MoneyQuest"）→ submission_platform_ref=="mqg"
7. CaseDetailResponse 含 lender_ref / submission_platform_ref 字段

### 7.3 tests/test_core/test_lender_key_backfill.py（新建，≥6 用例）

1. 造 3 案（alias / 未知 / 空 lender）→ backfill 后 lender_ref 正确、未知保持 None
2. submission_platform_ref 回填：ApplyOnline→aol、MoneyQuest→mqg
3. 幂等：跑两次，第二次 lender_updated==0 且 platform_updated==0
4. dry_run=True 不写库（内容不变）
5. 空库跑 backfill 不报错、返回全 0
6. 指定不存在 db 路径 → 报错信息清晰（FileNotFoundError 或自定义异常）

### 7.4 存量回归（必须全绿，不改断言）

`test_commission.py`（resolve_lender_key 兼容）、`test_pii_gateway.py`（白名单只增不减）、`test_checklist_master.py`、`test_analytics.py`、`test_policy_engine.py`、`test_case_creation.py`、`test_alembic.py`。

## 八、验收标准（全量门禁）

### 自动验证（全部通过才交付）

- `python -m pytest tests/ -q` → 0 failed / 0 skipped
- `ruff check`（本单新增/修改文件）→ All checks passed
- 临时 SQLite 库 `alembic upgrade head` 成功；`alembic current` == 新 revision id
- `python tools/migrate_lender_keys.py --dry-run` 与实跑各一次；实跑两次第二次 0 变更
- `import core.bank_registry` 无循环导入；`server.main` 可导入、路由含 `/api/banks/`、`/api/platforms/`

### 手动验证（TestClient 实测）

1. `GET /api/banks/` → 22 家，顺序 full(9) → basic(13)
2. `POST /api/cases` body 含 `"lender": "Commonwealth Bank"` → 响应 lender="CBA"、lender_ref="cba"
3. `POST /api/cases` body 含 `"submission_platform": "MoneyQuest"` → submission_platform_ref="mqg"
4. `GET /api/platforms/` → 5 家；前端下拉将只取 aggregator+manual

### 输入输出示例

- `resolve_lender_key("St.George")` → `"st_george"`；`resolve_policy_key("st_george")` → `"St George"`
- `GET /api/banks/` 首条 `{"key":"cba","display_name":"CBA","tier":"full","has_calculator":true,...}`
- 迁移前 `cases.lender="Commonwealth Bank"` → 迁移后 `lender_ref="cba"`，第二次运行 `lender_updated=0`

## 附录：前端 F 批次（另行给 AI Studio 的提示词素材，本单禁止改前端）

1. `NewCaseFields.tsx`：银行下拉改为 `GET /api/banks/`（选项=display_name，服务端已按 sort_order 排序）；递交平台下拉改为 `GET /api/platforms/` 且仅 type ∈ {aggregator, manual}
2. 删除硬编码 `['ANZ','CBA','NAB','Westpac','Macquarie','Bankwest','Suncorp','St.George','其他']` 与 `['ApplyOnline','Loanapp','手动递交']`
3. 案件列表银行筛选 / Analytics 银行维度：直接用后端返回的 `lender_key` / `display_name`
4. 设置页「银行×平台可用性确认」（vera_confirmed 闭环）→ 本期不做，留后续设置页批次

---
⚠️ 执行纪律（每一条都必须遵守）：
1. 只修改「改动范围」表中列出的文件，绝不碰其他文件
2. 所有变量名/函数名/字段名/YAML key 严格按照「接口契约」章节定义，一个字符都不能改
3. 每完成一个 Step 立即运行该 Step 的验证命令
4. 如果验证失败，停下来报告错误内容，不要自己尝试修复计划外的代码
5. 不要引入任何「技术约束」章节中未列出的依赖库
6. 不要创建任何「改动范围」表中未列出的新文件
7. 不要重构、优化、美化任何计划外的代码
