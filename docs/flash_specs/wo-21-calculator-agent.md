# WO-21：计算器 Agent —— 6 银行档案 + 确定性引擎（过程可见）+ 上传更新闭环

> 来源（Vera 定稿 2026-08-13）：第一版范围 = 6 个 Brokerpedia 常用计算器（BOC / CBA / Macquarie / MA Money / Latrobe / Resimac）作为数据真源；**数据必须准确**（参数全部机械提取自源文件、带来源与日期）；**计算过程必须可见**（非黑盒，每步公式+输入+输出）；设置页上传最新 xlsm → 系统识别/解析/diff → Vera 确认后替换或新增；OpenClaw `aussie-mortgage-calc` v1.1.0 仅用于补 8 州印花税 + 首购房豁免 + FHOG 与 LMI 兜底表（2024-25，标 indicative）；`@wealthx/borrow-capacity-lib` **不引入**（UNLICENSED 私有包）。
> 执行方：opencode。检查方：Codex。
> 前置：WO-19（配置加载模式）、WO-18（建档）、现有 core/config.py ConfigLoader、oletools/python_multipart（已在 venv）；**openpyxl 缺失需先安装**（见「技术约束-环境自检」，2026-08-13 修订）。

## 技术约束

- 后端：Python 3.11+ / FastAPI / SQLAlchemy 2.x / openpyxl（只读解析，**需先安装**）/ oletools（venv 已有）/ python_multipart 0.0.32（已装）
- 禁止：引入任何新的 pip 依赖；禁止修改本表以外的文件；禁止改数据库迁移（本单无表结构变更）
- 环境自检（开工第一步）：openpyxl 是本单规划内必需的解析库，**安装它不算新增依赖，属前置补齐**。先执行 `python -m pip install "openpyxl>=3.1"`，再验证 `python -c "import openpyxl; print(openpyxl.__version__)"` 输出 ≥3.1（venv 级安装，不改 pyproject，与 oletools/python_multipart 先例一致）；自检不通过不得进入 Step 1
- 红线：**上传的 .xlsm 只读解析（openpyxl keep_vba + read_only），绝不执行宏、绝不开 Excel COM、绝不运行 VBA**；上传文件不写入客户文件夹；参数数据只写入 `data/calculator_profiles/`（运行时数据，不入 git）
- 准确性纪律：所有 6 家档案参数**必须由构建工具从源文件机械提取生成 YAML，禁止手抄/估算**；提取后黄金测试钉住关键值
- 可见性纪律：计算引擎为本地确定性函数，**算术不经过 LLM、不调用外部 API**；每个计算函数返回 `(value, steps)`，响应带完整步骤轨迹
- 新代码文件全部 ≤200 行；`config/calculator/*.yaml` 为数据文件，不受 200 行限制（参照 checklist_master.yaml 先例）

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `config/calculator/boc.yaml` / `cba.yaml` / `macquarie.yaml` / `ma_money.yaml` / `latrobe.yaml` / `resimac.yaml` | **新建（6 个）** | 默认档案（构建工具生成，见 §四） |
| `config/calculator/stamp_duty.yaml` | **新建** | 8 州印花税 + 首购房豁免 + FHOG（OpenClaw v1.1.0，2024-25，indicative） |
| `config/calculator/lmi_fallback.yaml` | **新建** | LMI 兜底阶梯（indicative） |
| `core/calculator/__init__.py` | **新建** | 空/一行 docstring |
| `core/calculator/models.py` | **新建** | 输入/输出 dataclass（≤200 行） |
| `core/calculator/profiles.py` | **新建** | 档案加载/合并/校验（≤200 行） |
| `core/calculator/tax.py` | **新建** | 各银行税率函数（≤200 行） |
| `core/calculator/hem.py` | **新建** | HEM 查表（≤200 行） |
| `core/calculator/commitments.py` | **新建** | 存量负债/新贷月供规则（≤200 行） |
| `core/calculator/assess.py` | **新建** | 主计算链（≤200 行） |
| `core/calculator/result.py` | **新建** | 5 种判定指标（≤200 行） |
| `core/calculator/stamp_duty.py` | **新建** | 印花税/首购/FHOG/LMI 兜底查询（≤200 行） |
| `core/calculator/updates.py` | **新建** | diff/apply/rollback（≤200 行） |
| `core/calculator/parsers/__init__.py` | **新建** | 空/一行 docstring |
| `core/calculator/parsers/base.py` | **新建** | 通用解析助手（≤200 行） |
| `core/calculator/parsers/boc.py` / `cba.py` / `macquarie.py` / `ma_money.py` / `latrobe.py` / `resimac.py` | **新建（6 个）** | 每家版本标记 + 参数提取（各 ≤200 行） |
| `server/api/schemas.py` | 修改 | + 计算器 Schemas（见 §二） |
| `server/api/calculator.py` | **新建** | 5 个端点（≤200 行） |
| `server/main.py` | 修改 | 注册 calculator router |
| `tools/build_calculator_profiles.py` | **新建** | 从源文件机械生成默认 YAML（≤200 行） |
| `tests/test_calculator/test_profiles.py` | **新建** | 档案加载/校验 |
| `tests/test_calculator/test_engine.py` | **新建** | 黄金用例（见 §六） |
| `tests/test_calculator/test_parsers.py` | **新建** | 解析器（合成 fixture + 可选真实文件） |
| `tests/test_calculator/test_updates.py` | **新建** | diff/apply/rollback/安全 |
| `tests/test_calculator/test_api_calculator.py` | **新建** | 端点测试 |

⚠️ 严禁修改上表以外的文件（含前端、core/pipeline/、core/config.py 的既有加载逻辑——计算器档案走独立加载器 `core/calculator/profiles.py`）。严禁改动迁移。

---

## 一、档案配置（`config/calculator/<bank>.yaml`）

统一 schema（字段名契约，实施时一字不改）：

```yaml
bank: cba                                  # boc | cba | macquarie | ma_money | latrobe | resimac
name: CBA Home Lending Servicing Calculator
source_file: cba hl calculator 270626 (Brokerpedia).xlsm
source_version: LV81.3
source_date: "2026-06-27"
effective_from: "2026-08-13"
profile_version: 1
indicative: false                          # true 仅 stamp_duty / lmi_fallback

parameters:
  assessment:
    buffer: 0.03                           # 评估利率缓冲
    floor: 0.054                           # 评估利率下限
    extra: {}                              # 银行专属（如 cba.refinance_exception_buffer=0.01、macquarie.fix_buffer=0.0225、ma_money.dollar_for_dollar_buffer=0.0101、resimac.simple_refinance_buffer=0.01）
  income_rules:                            # 规范收入类别 → 规则（superset，见 models.py）
    overtime: {haircut: 0.8, taxable: true}
    bonus_commission: {haircut: 0.8, taxable: true}
    casual: {haircut: 1.0, taxable: true, annualize_weeks: 48}   # ma_money ×48/52；其余银行 1.0
    investment_income: {haircut: 0.8, taxable: true}
    dividends: {haircut: 0.8, taxable: true}
    foreign: {haircut: 0.8, taxable: true}
    rental: {haircut: 0.9, taxable: true}  # 各银行不同（见下表）
    government_benefits: {haircut: 1.0, taxable: false}
    other_taxable: {haircut: 1.0, taxable: true}
    other_nontaxable: {haircut: 1.0, taxable: false}
  tax:
    brackets: [[18200, 0.0, 0], [45000, 0.15, 0], [135000, 0.3, 4020], [190000, 0.37, 31020], [1e12, 0.45, 51370]]
    medicare: 0.02
    medicare_low: {threshold_a: 28011, rate_a: 0.10, threshold_b: 35013, rate_b: 0.02}  # cba 特有，其余可 null
    lito: null                              # cba/latrobe/ma_money 有；格式 [[37500, 700, 0], ...]
    lmito: null
    company_tax: null                       # latrobe 0.25 / ma_money 0.25 / boc 0.30 / resimac 0.30
    net_income_factor: null                 # resimac 0.985
  living:
    hem_source: hem_table                   # 内嵌本 YAML 的 hem_table（机械提取）
    hem_weekly: true                        # false=boc/cba 月度表；true=周值×52/12
    use_max_declared: true
    non_hem_categories: [private_schooling, health_insurance, child_support, rent_board, investment_property_costs, other]
  commitments:
    credit_card: {rate_monthly: 0.038, minimum: null}      # cba minimum=25；macquarie 用 annual_rate=0.456
    overdraft: {rate_monthly: 0.03}
    mortgage: {method: pmt_buffered, take_max_declared: true}   # latrobe: implied_rate_stress
    personal: {method: pmt_buffered}
    hire_purchase: {method: pmt_buffered}
    lease: {method: pmt_buffered}
    line_of_credit: {method: pmt_buffered}
    other: {method: declared}
    bnpl: {method: declared_or_balance}
  result:
    indicator: surplus_sign                 # nis | surplus_sign | nsr | dscr | ndi
    threshold: null                         # nis→100、ndi→0、其余 null
    min_surplus: null                       # macquarie 500 / resimac 200
    nsr_required: null                      # macquarie 1.0；resimac 见 nsr_by_insurer
    nsr_required_lvr90: null                # macquarie 1.20
    nsr_by_insurer: null                    # resimac {prime: 1.0, quickstart: 1.25, specialist: 1.0}
    dscr_by_lvr: null                       # ma_money [[0.85, 1.0], [1.0, 1.1]]
    refer_without_buffer: false             # cba true
    max_loan: pv_invert                     # pv_invert | nsr_iterate | null（resimac V1 不做 max_loan）
  lmi: null                                 # macquarie/ma_money 内嵌表；其余 null
  options: {}                               # 银行专属选项 schema（见 §二）
  version_stamp:                            # 解析锚点（见 §四）
    sheet: MasterData
    cells: {version: S3, date: T3}
```

**6 家关键参数锚点（实施时以此为准，数值必须与源文件一致；下表为解析抽验值）**

| 银行 | 缓冲/下限 | 信用卡 | 租金 | 其他 haircut | 判定 | 附加 |
|---|---|---|---|---|---|---|
| boc | +3.0% / 5.3% | limit×3.8%/月 | 80%（高密度 70%） | OT/佣金/奖金/股息/利息/信托/基金/海外 20% | NIS ≥ 100 | HEM 缓冲 0、notional rent $150/$180、公司税 30%、MLS 1/1.25/1.5% |
| cba | +3.0% / 5.4%（转贷特例 +1%） | max($25, 3.8%)/月；透支 3.0% | 70% | OT/奖金/投资 80%、养老金 90%、免税 90% | 盈余≥0 PASS / 无缓冲 REFER / FAIL | LITO、Medicare 低收入阶梯、IO 上限 5y、LOC 25y |
| macquarie | +3.0%（固定 2.25%）/ 5.3% | 年 limit×45.6%（=3.8%×12） | 80% | OT/奖金/投资 80% | NSR ≥ 1.0，盈余 ≥ $500，LVR>90% 用 1.20 | DTI>8 出政策、默认评估期 294 个月、最大 LVR 95% |
| ma_money | +2.01% / 5.75%（DDR +1.01%） | limit×3.8%/月 | 90% | casual ×48/52、投资收入 80% | DSCR ≥ 1.0（LVR>85% → 1.10） | 公司税 25%、存量申报×1.25 加压（开关默认关）、OFI 缓冲 0.9 |
| latrobe | +2.0% / 5.3% | limit×3.8%/月 | 80% | — | NDI > 0 | 存量贷款反推隐含利率加压、新贷 +$15/月、公司税 25% |
| resimac | +2.0% / 5.75%（转贷 +1.0%） | limit×3.8%/月 | 90% | OT/casual/奖金 100%、投资收入 80%（Specialist 100%） | NSR ≥ 按保险商（1.0/1.25/1.0），盈余 ≥ $200 | 净收入 ×98.5%、deemed 投资利率 6.0%、LVR>100% → NO RESULT |

---

## 二、数据模型 + API 契约

### models.py（dataclass，字段名契约）

```python
@dataclass
class ApplicantIn:
    name: str = ""
    status: str = "Single"            # Single | Couple
    dependents: int = 0
    spouse_of: str = ""               # Couple 时配偶申请人 name（可选）
    base: float = 0                   # 基础 PAYG/自雇申报年收入
    overtime: float = 0
    bonus_commission: float = 0
    casual: float = 0
    investment_income: float = 0
    dividends: float = 0
    foreign: float = 0
    rental_income: float = 0          # 毛租金（年）
    government_benefits: float = 0
    other_taxable: float = 0
    other_nontaxable: float = 0
    company_npbt: float = 0
    company_addbacks: float = 0
    entity_type: str = "B"            # resimac: B|G|BR|GR；其余忽略

@dataclass
class LoanPortionIn:
    amount: float
    rate: float
    term_years: int
    io_years: int = 0
    purpose: str = "OO"               # OO | INV
    repayment: str = "PI"             # PI | IO

@dataclass
class LoanIn:
    portions: list[LoanPortionIn]
    security_value: float = 0
    postcode: str = ""
    state: str = ""
    mortgage_insurer: str = ""        # resimac: prime|quickstart|specialist
    product: str = ""                 # ma_money/macquarie 产品
    doc_type: str = ""                # ma_money: full_doc|alt_doc
    simple_refinance: bool = False    # resimac
    refinance_exception: bool = False # cba

@dataclass
class CommitmentIn:
    type: str                         # mortgage_oo|mortgage_inv|personal|credit_card|overdraft|line_of_credit|hire_purchase|lease|other|bnpl
    balance: float = 0
    limit: float = 0
    rate: float = 0
    remaining_months: int = 0
    declared_monthly: float = 0

@dataclass
class HouseholdIn:
    status: str = "Single"            # Single | Couple
    dependents: int = 0
    income_for_hem: float = 0         # 0=自动按申请人收入汇总

@dataclass
class LivingExpensesIn:
    declared_basic_monthly: float = 0
    declared_non_hem: dict[str, float] = field(default_factory=dict)

@dataclass
class CalcStep:
    step_id: str
    label: str
    formula: str
    inputs: dict
    output: float | str | None
    source: str                       # 参数来源路径或公式名

@dataclass
class CalcResult:
    bank: str
    result: str                       # PASS|FAIL|REFER|NO RESULT
    indicator: str
    indicator_value: float | None
    threshold: float | None
    min_surplus: float | None
    surplus: float | None
    max_loan: float | None
    dti: float | None
    lvr: float | None
    steps: list[CalcStep]
    profile_version: int
```

### server/api/schemas.py 新增（Pydantic，字段与 models 对齐）

```python
class CalculatorAssessRequest(BaseModel):
    bank: str
    loan: LoanIn
    applicants: list[ApplicantIn] = []
    commitments: list[CommitmentIn] = []
    living_expenses: LivingExpensesIn | None = None
    household: list[HouseholdIn] = []

class CalcStepSchema(BaseModel):
    step_id: str; label: str; formula: str
    inputs: dict = {}; output: Any = None; source: str

class CalculatorAssessResponse(BaseModel):
    bank: str; result: str; indicator: str
    indicator_value: float | None = None
    threshold: float | None = None
    min_surplus: float | None = None
    surplus: float | None = None
    max_loan: float | None = None
    dti: float | None = None
    lvr: float | None = None
    steps: list[CalcStepSchema] = []
    profile_version: int = 0

class ProfileInfo(BaseModel):
    bank: str; name: str; version: str; effective_date: str
    source_file: str; source_hash: str
    status: str                        # default | overridden
    pending: bool = False
    last_checked: str | None = None

class ProfileDiffItem(BaseModel):
    path: str; old: Any = None; new: Any = None

class ProfileUploadResponse(BaseModel):
    bank: str | None = None
    detected_version: str | None = None
    current_version: str | None = None
    is_new_bank: bool = False
    needs_review: bool = False
    review_note: str | None = None
    diff: list[ProfileDiffItem] = []
    changed_count: int = 0
    source_hash: str = ""

class ProfileApplyRequest(BaseModel):
    source_hash: str

class SmokeTestResult(BaseModel):
    name: str; passed: bool; detail: str = ""

class ProfileApplyResponse(BaseModel):
    bank: str; applied_version: str
    smoke_tests: list[SmokeTestResult] = []
    history: list[str] = []

class ProfileRollbackRequest(BaseModel):
    version: str

class ProfileRollbackResponse(BaseModel):
    bank: str; rolled_back_to: str
    smoke_tests: list[SmokeTestResult] = []
```

### 端点（server/api/calculator.py，router prefix `/api/calculator`）

```python
@router.post("/assess", response_model=CalculatorAssessResponse)
def assess(req: CalculatorAssessRequest, db: Session = Depends(get_db)) -> ...:
    """服务能力测算：确定性引擎 + 完整步骤轨迹（过程可见）。bank 未知 → 404；输入校验失败 → 422。"""

@router.get("/profiles", response_model=list[ProfileInfo])
def list_profiles(...): ...

@router.post("/profiles/upload", response_model=ProfileUploadResponse)
def upload_profile(file: UploadFile = File(...)) -> ...:
    """上传 xlsm（.xlsm/.xlsx，≤20MB）：识别 → 解析 → diff → 返回预览，不应用。"""

@router.post("/profiles/{bank}/apply", response_model=ProfileApplyResponse)
def apply_profile(bank: str, req: ProfileApplyRequest, ...) -> ...:
    """应用待更新（source_hash 必须匹配）；smoke 测试失败 → 409 阻断。"""

@router.post("/profiles/{bank}/rollback", response_model=ProfileRollbackResponse)
def rollback_profile(bank: str, req: ProfileRollbackRequest, ...) -> ...:
    """回滚到 history 中指定版本；smoke 测试失败 → 409。"""
```

> 上传安全：校验扩展名 + ZIP 魔数；openpyxl `load_workbook(read_only=True, keep_vba=True, data_only=False)` 只读解析；**禁止**执行宏/打开 Excel/调用 LibreOffice；源文件以 `.bin` 后缀存 `data/calculator_profiles/sources/<bank>_<hash>.bin`（防误双击执行）；参数落 YAML，不产生代码执行面。日志不输出请求体（红线）。

---

## 三、确定性引擎（core/calculator/）

### profiles.py

```python
def load_profile(bank: str) -> BankProfile:
    """加载：data/calculator_profiles/<bank>.yaml（用户覆盖）优先，否则 config/calculator/<bank>.yaml（默认）。"""

def validate_profile(profile: dict) -> list[str]:
    """校验：必需键齐全、HEM 表形状（列=收入档、行=家庭代码）、数值范围（缓冲/税率 0-1）、source 字段非空。返回错误列表。"""
```

### tax.py

```python
def income_tax(income: float, tax_cfg: dict) -> float:
    """递进税率（brackets 逐档累计 carry），支持 cba 的 'ignore cents'（阈值+0.99）。"""

def lito(income: float, tax: float, lito_cfg: list) -> float:
    """LITO：按 [[上限, offset, taper]] 计算，不得大于 tax。"""

def medicare_levy(income: float, cfg: dict) -> float:
    """2% 或低收入阶梯（cba）。"""

def assess_tax(applicant: ApplicantIn, profile: BankProfile, db=None) -> tuple[float, list[CalcStep]]:
    """返回 (年税+Medicare+MLS，steps)。公司收入按 company_tax 单独计税后并入。"""
```

### hem.py

```python
def hem_lookup(household: HouseholdIn, income_for_hem: float, profile: BankProfile) -> float:
    """按 profile.hem_table 查月度 HEM（周值表 ×52/12）；收入档取区间下限（LOOKUP 语义）；子女人数超表 → 按末两档差值外推（latrobe/resimac 语义）。"""
```

### commitments.py

```python
def commitment_monthly(c: CommitmentIn, profile: BankProfile) -> tuple[float, list[CalcStep]]:
    """信用卡/透支按 %limit；其余 PMT(max(floor, rate+buffer)/12, remaining_months, balance) 或取 max(计算, 申报)（profile 决定）；latrobe 反推隐含利率后加压。"""

def new_loan_monthly(portion: LoanPortionIn, profile: BankProfile) -> tuple[float, list[CalcStep]]:
    """评估利率 = MAX(floor, rate+buffer)；IO 期只计息；latrobe 追加 +15/月。"""
```

### result.py

```python
def evaluate(profile: BankProfile, net_monthly: float, living_monthly: float,
             commitments_monthly: float, loan_monthly: float, extra: dict) -> tuple[str, dict]:
    """按 indicator 计算指标值 + 阈值 + 附加条件（min_surplus / nsr_by_insurer / dscr_by_lvr / lvr90），返回 (PASS|FAIL|REFER|NO RESULT, 指标明细)。"""
```

### assess.py（主链，逐步 append CalcStep）

```python
def assess(req: CalculatorAssessRequest, db: Session = None) -> CalcResult:
    """1 收入年化与 haircut → 2 税 → 3 净收入(月) → 4 HEM vs 申报(MAX+非HEM) →
       5 存量负债月供 → 6 新贷月供 → 7 指标与判定 → 8 LVR/DTI → 9 max_loan(PV 反推)。
       每步 append CalcStep(step_id, label, formula, inputs, output, source)。steps 上限 300。"""
```

### stamp_duty.py

```python
def stamp_duty(state: str, price: float, first_home: bool) -> tuple[float, list[CalcStep]]:
    """config/calculator/stamp_duty.yaml（8 州 2024-25 + FHB 豁免/优惠 + FHOG），source 标 OpenClaw v1.1.0，indicative。"""

def lmi_fallback(lvr: float, loan_amount: float) -> tuple[float, list[CalcStep]]:
    """config/calculator/lmi_fallback.yaml（indicative）；银行有官方表时优先官方表。"""
```

---

## 四、解析器 + 版本检测 + 构建工具（core/calculator/parsers/）

### 版本标记位置（契约，parsers 必须能读到）

| 银行 | sheet | 单元格/内容 |
|---|---|---|
| boc | Change Log | C6 含 "Version 7.1.6"（正则 `Version (\d+\.\d+(\.\d+)?)`） |
| cba | MasterData | S3 = "CBA_HL_Simulator"，T3 = "LV81.3"；Data!A25 = 最后修改日期 |
| macquarie | Serviceability Worksheet | I4 = "(17 Jul 2026)"；HEM Table!B5 = 日期 |
| ma_money | Version | 命名单元格 Version.Num / Version.Date；回退：末行 C/E |
| latrobe | Living Allow | E11 = "Version Date: 29 June 2026"；E14 = HEM 数据日期 |
| resimac | Calculator | A5 = "Version 7.03 (01/07/2026)" |

### parsers/base.py

```python
def identify_bank(filename: str, sheetnames: list[str]) -> str | None:
    """文件名关键词 + 表名签名 → bank；无法识别 → None。"""

def extract_version(ws_map: dict[str, object], stamp_cfg: dict) -> str | None:
    """按 version_stamp 契约读版本（正则兜底）。"""

def iter_cells(ws) -> Iterator[tuple[str, object]]:
    """只读遍历非空单元格。"""
```

### 每家 parser 契约

```python
def parse(path: Path) -> dict:
    """返回 profile dict（不含 HEM 大表引用之外的完整参数）：
       {bank, source_file, source_version, source_date, parameters: {...}, version_stamp: {...}}
       参数提取点（示例）：
       - assessment.buffer/floor：boc Parameters!Q2/R2；cba MasterData!R52/R51；macquarie References!H10/H9；
         ma_money Setup!I39/I41；latrobe RepayCalculator!B6/B9；resimac Tables!H50/G50
       - credit_card.rate：boc P2；cba R48；macquarie 45.6% 年率（Serviceability K223 公式）；ma_money I43；latrobe D106 公式；resimac C55
       - hem_table：完整提取（月度值原样 / 周值原样），不换算、不插值修改
       - 其余按 YAML schema 对应路径。
       提取失败的关键字段必须抛 ValueError（禁止静默 0 填充）。"""
```

> 解析器读取真实文件（只读），**不执行宏**；oletools 仅用于读 VBA 源码对照公式（可选，验收时 Codex 抽查）。

### tools/build_calculator_profiles.py

```bash
python -m tools.build_calculator_profiles --source-dir "D:/WhatFile/xwechat_files/wangnao820_8b0f/msg/file/2026-08" --out config/calculator
```

- 对 6 个源文件逐个 `parsers.<bank>.parse()` → 写 `config/calculator/<bank>.yaml`；
- **幂等**：重复运行输出一致（YAML 排序稳定）；生成后打印每家 `bank/version/关键参数摘要`；
- 生成结果作为默认档案提交 git；`data/calculator_profiles/` 由运行时上传产生，不入 git。

---

## 五、上传更新闭环（core/calculator/updates.py）

```python
def prepare_upload(path: Path, filename: str) -> ProfileUploadResponse:
    """identify_bank → 未知银行：通用提取（版本标记 + HEM 形状 + 关键参数正则）→ needs_review=True；
       已知银行：parsers.<bank>.parse() → 与当前生效档案 diff（递归按路径对比）→ 存 pending
       （data/calculator_profiles/pending/<bank>.yaml + sources/<bank>_<hash>.bin）→ 返回预览。"""

def apply_pending(bank: str, source_hash: str) -> ProfileApplyResponse:
    """hash 校验 → validate_profile → smoke 测试（固定向量，见 §六）→ 通过：pending → data/calculator_profiles/<bank>.yaml，
       append history/<bank>/<version>.yaml（含 source_hash/时间/变更摘要）；失败 → 409。"""

def rollback(bank: str, version: str) -> ProfileRollbackResponse:
    """从 history/<bank>/<version>.yaml 恢复 → smoke 测试 → 失败 409。"""
```

> diff 摘要示例：`parameters.assessment.buffer: 0.02 → 0.021`、`parameters.living.hem_table: 23 项变更`、`parameters.result.threshold: 100 → 150`。返回给前端渲染"变更报告"，Vera 确认后才 apply。

---

## 六、测试（tests/test_calculator/）

### test_profiles.py（≥8 用例）

- 6 家档案全部可加载、validate 无错误
- 每家含 source_file/source_version/source_date、parameters 必需键、hem_table 形状正确
- stamp_duty/lmi_fallback 可加载且带 indicative=true
- data/ 覆盖优先于 config/（构造临时 data 覆盖验证）

### test_engine.py（黄金用例，预期值来自公式链手算/对照源文件，容差 1e-2；验收时 Codex 逐一核对）

| 用例 | 输入 | 预期 |
|---|---|---|
| cba 税 | taxable 80,000 | tax 14,520；ML 1,600；net 63,880（LITO=0） |
| cba 信用卡 | limit 10,000 | 月 380 = MAX(25, 10000×0.038) |
| boc 评估利率 | rate 5.99% | MAX(5.99+3, 5.3) = 8.99% |
| boc 信用卡 | limit 5,000 | 月 190 |
| resimac 补充收入 | bonus 20,000 prime / specialist | 16,000 / 20,000 |
| resimac 评估利率 | rate 6.5%，普通 / simple_refi | 8.5% / 7.5%（下限 5.75%） |
| latrobe 新贷月供 | 600,000 @6% 30y P&I | 3,597.30 + 15 = 3,612.30 |
| macquarie 信用卡 | limit 10,000 | 年 4,560（=limit×45.6%） |
| ma_money 租金 | 40,000 | 36,000（×0.9） |
| 过程可见 | assess 任意用例 | steps 非空，每条含 step_id/label/formula/inputs/output/source，可逐条复算 |

> 要求：opencode 按上述公式链再补 6 家各 ≥3 条黄金用例（标注公式来源单元格），Codex 验收时用公式链复算核对。

### test_parsers.py（≥8 用例）

- 每家：合成最小 xlsx fixture（openpyxl 内存构造，含版本单元格 + 2-3 个关键参数单元格）→ parse 返回正确 version + 参数
- identify_bank：6 个真实文件名 → 正确 bank；未知文件名 → None
- 版本正则：`Version 7.1.6` / `LV81.3` / `(17 Jul 2026)` / `Version 7.03 (01/07/2026)` / `29 June 2026`
- 关键字段缺失 → ValueError
- 可选（环境变量 `CALC_SOURCE_DIR` 指向真实文件时）：真实文件 parse 全绿 + 版本与下表一致（boc 7.1.6 / cba LV81.3 / macquarie 17 Jul 2026 / ma_money 5.2 / latrobe 29 June 2026 / resimac 7.03）

### test_updates.py（≥8 用例）

- prepare_upload：已知银行文件 → diff 正确、changed_count 正确、pending 落盘、hash 一致
- prepare_upload：未知文件 → is_new_bank=True、needs_review=True
- apply：hash 不匹配 → 404/422；smoke 失败 → 409；成功 → 生效 + history +1
- rollback：成功回滚 + smoke 通过；不存在版本 → 404
- 安全：非 xlsm/xlsx（伪造扩展名）→ 422；超 20MB → 413；**断言解析全程不执行宏**（monkeypatch openpyxl 确认 read_only=True）

### test_api_calculator.py（≥6 用例）

- assess：boc 简单用例 → 200 + result + steps 非空 + profile_version
- assess：未知 bank → 404；空 applicants → 422
- profiles：GET → 6 家 + status
- upload/apply/rollback 端点链路（用合成 fixture，monkeypatch 落盘路径到 tmp）
- 日志不含请求体（红线抽查）

---

## 七、验收标准（全量门禁）

```bash
python -m pytest tests/test_calculator/ -v
python -m pytest tests/ -q                      # 全量，相对当前 HEAD 不得回归（基线以验收时 HEAD 为准）
ruff check core/calculator/ server/api/calculator.py server/api/schemas.py server/main.py tools/build_calculator_profiles.py tests/test_calculator/
python -m tools.build_calculator_profiles --source-dir "D:/WhatFile/xwechat_files/wangnao820_8b0f/msg/file/2026-08" --out config/calculator   # 幂等，两次输出一致
```

手动验证（Codex 验收）：
1. `POST /api/calculator/assess`（boc 用例）→ 200，steps 逐条与源文件公式链核对；
2. `GET /api/calculator/profiles` → 6 家；
3. 上传 6 个真实文件之一 → 返回 diff 预览；apply 后 profiles 显示新版本；rollback 恢复；
4. 上传一个非计算器 xlsx → 422/needs_review 合理；
5. `data/calculator_profiles/` 生成内容不入 git；`.gitignore` 已有 data/（无需改动，确认即可）。

---

⚠️ 执行纪律（每一条都必须遵守）：
1. 只修改"改动范围"表中列出的文件，绝不碰其他文件
2. **上传文件只读解析，绝不执行宏 / 不开 Excel COM**（红线）
3. 参数必须机械提取（build 工具生成 YAML），禁止手抄/估算；提取失败抛错，禁止静默填 0
4. 计算引擎为本地确定性函数：不调外部 API、不过 LLM；每条输出带 steps（过程可见，非黑盒）
5. 所有函数名/变量名/字段名/断言严格按契约，一个字符都不能改
6. 不引入新依赖；新代码文件 ≤200 行（YAML 数据文件除外）；不改迁移；`@wealthx/borrow-capacity-lib` 不引入
7. 日志不输出请求体（PII 红线）；上传文件只写 `data/calculator_profiles/`
