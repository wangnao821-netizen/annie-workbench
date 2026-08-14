# WO-39 澳洲时区 / 公共假期 / 银行工作日 — 执行规范

> 状态：待执行（2026-08-14 起草）
> 背景：Vera 团队总部堪培拉（ACT）、客户集中在悉尼（NSW）与布里斯班（QLD），中国与澳洲协同。顶栏需澳洲实时时间，面板需三州日历/假期/工作日状态；案件 finance_deadline 落在银行休息日时要预警。数据源 = 本地 YAML 配置（离线可用、Vera 校对，V2 可接 Nager.Date 自动更新）。

## 一、技术约束

- 后端：Python 3.11+ / FastAPI / Pydantic v2；时区用标准库 `zoneinfo`（**零新依赖**）
- 禁止：引入任何新的 pip 依赖（不用 `holidays` 库）
- 禁止：新增数据库迁移（**不动 `core/models/orm.py`**；案件州字段留 V2）
- 禁止：修改 `core/agents/*`、`config/agent_flows/*.yaml`、前端 `ui/`
- 只允许修改/新建：
  - `config/holidays_au.yaml`（新建：2026/2027 三州 ACT/NSW/QLD 公共假期 + default_state）
  - `core/holidays.py`（新建，≤200 行：加载/校验/工作日判定/假期查询/夏令时）
  - `server/api/holidays.py`（新建：`GET /api/holidays`）
  - `server/main.py`（修改：注册 holidays 路由）
  - `core/ai/case_context.py`（修改：`_build_risk` 增加"finance_due 为银行休息日"风险，最小改动）
  - `tests/test_core/test_au_holidays.py`（新建）
- PII 红线：本单不接触客户 PII；holidays 数据纯公开日历

## 二、接口契约（变量名/函数名/字段名写死，一字不改）

### 配置（config/holidays_au.yaml，新建）

```yaml
version: 1
default_state: nsw        # 案件联动默认州（Case 无州字段，V2 再加）
states:                   # 三州（ACT 总部 / NSW、QLD 客户集中）
  act:
    display: "堪培拉 ACT"
    holidays:
      "2026-01-01": "New Year's Day"
      "2026-01-26": "Australia Day"
      "2026-03-09": "Canberra Day"
      "2026-04-03": "Good Friday"
      "2026-04-06": "Easter Monday"
      "2026-04-27": "ANZAC Day (observed)"
      "2026-06-01": "Reconciliation Day"
      "2026-06-08": "King's Birthday"
      "2026-10-05": "Labour Day"
      "2026-12-25": "Christmas Day"
      "2026-12-28": "Boxing Day (observed)"
      "2027-01-01": "New Year's Day"
      "2027-01-26": "Australia Day"
      "2027-03-08": "Canberra Day"
      "2027-03-26": "Good Friday"
      "2027-03-29": "Easter Monday"
      "2027-04-26": "ANZAC Day (observed)"
      "2027-06-07": "Reconciliation Day"
      "2027-06-14": "King's Birthday"
      "2027-10-04": "Labour Day"
      "2027-12-27": "Christmas Day (observed)"
      "2027-12-28": "Boxing Day (observed)"
  nsw:
    display: "悉尼 NSW"
    holidays:
      "2026-01-01": "New Year's Day"
      "2026-01-26": "Australia Day"
      "2026-04-03": "Good Friday"
      "2026-04-04": "Easter Saturday"
      "2026-04-05": "Easter Sunday"
      "2026-04-06": "Easter Monday"
      "2026-04-27": "ANZAC Day (observed)"
      "2026-06-08": "King's Birthday"
      "2026-08-03": "Bank Holiday"
      "2026-10-05": "Labour Day"
      "2026-12-25": "Christmas Day"
      "2026-12-28": "Boxing Day (observed)"
      "2027-01-01": "New Year's Day"
      "2027-01-26": "Australia Day"
      "2027-03-26": "Good Friday"
      "2027-03-27": "Easter Saturday"
      "2027-03-28": "Easter Sunday"
      "2027-03-29": "Easter Monday"
      "2027-04-26": "ANZAC Day (observed)"
      "2027-06-14": "King's Birthday"
      "2027-08-02": "Bank Holiday"
      "2027-10-04": "Labour Day"
      "2027-12-27": "Christmas Day (observed)"
      "2027-12-28": "Boxing Day (observed)"
  qld:
    display: "布里斯班 QLD"
    holidays:
      "2026-01-01": "New Year's Day"
      "2026-01-26": "Australia Day"
      "2026-04-03": "Good Friday"
      "2026-04-06": "Easter Monday"
      "2026-04-25": "ANZAC Day"
      "2026-05-04": "Labour Day"
      "2026-10-05": "King's Birthday"
      "2026-12-25": "Christmas Day"
      "2026-12-28": "Boxing Day (observed)"
      "2027-01-01": "New Year's Day"
      "2027-01-26": "Australia Day"
      "2027-03-26": "Good Friday"
      "2027-03-28": "Easter Sunday"
      "2027-03-29": "Easter Monday"
      "2027-04-26": "ANZAC Day (observed)"
      "2027-05-03": "Labour Day"
      "2027-10-04": "King's Birthday"
      "2027-12-27": "Christmas Day (observed)"
      "2027-12-28": "Boxing Day (observed)"
```

⚠️ 实施者按官方源核对（fairwork.gov.au / act.gov.au / qld.gov.au）；发现差异以官方为准并修正后报告。

### 核心模块（core/holidays.py，新建）

```python
"""澳洲时区 / 公共假期 / 银行工作日（WO-39）。"""

from __future__ import annotations

import datetime as dt

from core.logger import get_logger

logger = get_logger(__name__)

STATES = ("act", "nsw", "qld")
_SYDNEY_TZ = "Australia/Sydney"   # zoneinfo 标准库，自动处理夏令时
_BRISBANE_TZ = "Australia/Brisbane"  # QLD 无夏令时


def load_holidays() -> dict:
    """读取并校验 config/holidays_au.yaml（version==1、state 合法、日期唯一）。
    失败抛 ValueError；返回 {"default_state": str, "states": {state: {"display": str,
    "holidays": {"YYYY-MM-DD": name}}}}。"""


def is_working_day(date: dt.date, state: str = "nsw") -> tuple[bool, str | None]:
    """银行工作日判定：周一至周五且非公共假期。
    Returns: (is_working_day, holiday_name_or_None)。"""


def state_today_status(state: str) -> dict:
    """今日状态：{"date": "YYYY-MM-DD", "state": state, "is_working_day": bool,
    "holiday_name": str | None, "weekday": 0-6}。"""


def upcoming_holidays(state: str | None = None, limit: int = 10) -> list[dict]:
    """未来假期（含今天之后），按日期升序；state=None 返回三州合并（带 state 字段）。
    [{"date": "YYYY-MM-DD", "name": str, "state": str, "display": str}]"""


def next_holiday(state: str = "nsw", from_date: dt.date | None = None) -> dict | None:
    """下一个假期（从 from_date 起，默认今天），None 表示配置内无未来假期。"""


def dls_status() -> dict:
    """夏令时/时差信息：{"sydney": {"utc_offset_hours": 10|11, "dls_active": bool},
    "brisbane": {"utc_offset_hours": 10, "dls_active": False},
    "beijing": {"utc_offset_hours": 8, "dls_active": False}}（基于 Sydney zoneinfo now）"""
```

### 端点（server/api/holidays.py，新建）

```python
@router.get("/api/holidays", response_model=HolidaysResponse)
def get_holidays(
    state: str | None = Query(None),
    limit: int = Query(10, ge=1, le=60),
) -> HolidaysResponse:
    """today：三州各自今日状态；upcoming：未来假期；next：默认州下一个假期；dls：夏令时。"""
```

### 响应模型（server/api/schemas.py 末尾追加，勿动既有模型）

```python
class HolidayStateToday(BaseModel):
    date: str
    state: str
    is_working_day: bool
    holiday_name: str | None = None
    weekday: int

class HolidayItem(BaseModel):
    date: str
    name: str
    state: str
    display: str

class DlsStatus(BaseModel):
    utc_offset_hours: int
    dls_active: bool

class HolidaysResponse(BaseModel):
    today: dict[str, HolidayStateToday]   # key = act/nsw/qld
    upcoming: list[HolidayItem]
    next: HolidayItem | None
    dls: dict[str, DlsStatus]             # key = sydney/brisbane/beijing
```

### 案件联动（core/ai/case_context.py，最小改动）

- `_build_risk`（约 L78）追加一条：`finance_due` 存在且 `is_working_day(finance_date, default_state)[0] == False` → `risk.append(f"Finance Clause 截止日（{date}）是银行休息日（{holiday or '周末'}），建议提前")`
- 实现：`build_case_context` 调用处（约 L191-206）把 finance_due 解析为 date 后传给 `_build_risk`（新增可选参数 `finance_workday: tuple[bool, str | None] | None = None`，默认 None 不注入——零影响既有调用）
- 默认州 = `load_holidays()["default_state"]`

## 三、实施步骤（每步完成即运行验证命令）

### Step 1：配置
- [ ] 新建 `config/holidays_au.yaml`（按上文契约；按官方源核对三州日期）
- [ ] 验证：`.venv\Scripts\python.exe -c "from core.holidays import load_holidays; print(sorted(load_holidays()['states']))"` → `['act', 'nsw', 'qld']`

### Step 2：核心模块
- [ ] 新建 `core/holidays.py`，按契约实现全部函数（zoneinfo 标准库；`load_holidays` 失败抛 ValueError 由端点转 500）
- [ ] 验证：`ruff check core/holidays.py` → All checks passed

### Step 3：端点 + schema + 路由
- [ ] `server/api/schemas.py` 末尾追加 4 个响应模型（全部 `ConfigDict(from_attributes=True)`）
- [ ] 新建 `server/api/holidays.py`；`server/main.py` 注册路由（仿现有 router 注册）
- [ ] 验证：`pytest tests/test_core/test_au_holidays.py -q` → 全绿

### Step 4：案件联动
- [ ] `core/ai/case_context.py`：`_build_risk` 加可选参数 `finance_workday`；`build_case_context` 内计算并传入
- [ ] 不改变既有 risk 输出顺序与内容（新风险仅追加在 LVR 之后）
- [ ] 验证：`pytest tests/test_core/test_case_context.py -q`（如存在）或相关 cases API 测试零回归

### Step 5：测试
- [ ] 新建 `tests/test_core/test_au_holidays.py`，用例：
  1. `test_load_holidays_valid` — 三州加载、默认州 nsw
  2. `test_is_working_day_weekday` — 2026-03-10（周二）NSW → (True, None)
  3. `test_is_working_day_weekend` — 2026-03-14（周六）→ (False, None)
  4. `test_is_working_day_holiday` — 2026-04-03 Good Friday NSW → (False, "Good Friday")
  5. `test_state_holiday_difference` — 2026-03-09 Canberra Day ACT 休息、NSW 工作日
  6. `test_qld_no_dls_brisbane` — dls_status 中 brisbane.dls_active == False
  7. `test_upcoming_holidays_sorted` — 返回升序、含 state 字段
  8. `test_next_holiday` — from_date=2026-03-01 NSW → 2026-03-09?（NSW 无 Canberra Day → 下一个是 Good Friday 4/3）
  9. `test_api_holidays_200` — TestClient GET /api/holidays → 200，today 含三州
  10. `test_api_holidays_bad_state` — state="vic" → 422
  11. `test_case_risk_finance_on_holiday` — finance_deadline=2026-04-03（Good Friday）→ build_case_context risk 含"银行休息日"
  12. `test_case_risk_finance_workday_no_extra` — finance_deadline=2026-04-06（周一 Easter Monday 也是假期）→ 用 2026-04-07 验证无新增风险
- [ ] 验证：`pytest tests/test_core/test_au_holidays.py -q` → 全绿

### Step 6：全量门禁
- [ ] `pytest tests/ -q` → ≥930 全绿，0 failed / 0 skipped
- [ ] `ruff check core/holidays.py server/api/holidays.py server/api/schemas.py server/main.py core/ai/case_context.py tests/test_core/test_au_holidays.py` → All checks passed
- [ ] `python -c "import core.holidays, server.main"` → 无循环导入

## 四、本次改动范围（严禁超出）

| 文件 | 操作 |
|------|------|
| `config/holidays_au.yaml` | 新建 |
| `core/holidays.py` | 新建 |
| `server/api/holidays.py` | 新建 |
| `server/api/schemas.py` | 修改（末尾追加 4 模型） |
| `server/main.py` | 修改（注册路由） |
| `core/ai/case_context.py` | 修改（_build_risk 可选参数 + 调用处） |
| `tests/test_core/test_au_holidays.py` | 新建 |

⚠️ 严禁修改上表以外的任何文件；严禁新增依赖；严禁数据库迁移。

## 五、验收标准

### 自动验证（必须全部通过）
- `pytest tests/test_core/test_au_holidays.py -q` → 12 项全绿
- `pytest tests/ -q` → ≥930 全绿，0 failed / 0 skipped
- `ruff check`（上表 py 文件）→ All checks passed

### 手动验证
1. TestClient：`GET /api/holidays` → 200，today 含 act/nsw/qld 三州状态；`?state=vic` → 422
2. 案件 finance_deadline 设为已知假期（如 2026-04-03）→ `GET /api/cases/{id}/context` 的 risk 含"银行休息日"
3. 假期表已按 fairwork.gov.au / act.gov.au / qld.gov.au 核对（Vera 最终校对）

---
⚠️ 执行纪律（每一条都必须遵守）：
1. 只修改"改动范围"表中列出的文件，绝不碰其他文件
2. 所有变量名/函数名/字段名严格按照"接口契约"章节的定义，一个字符都不能改
3. 每完成一个 Step 立即运行该 Step 的验证命令
4. 如果验证失败，停下来报告错误内容，不要自己尝试修复计划外的代码
5. 不要引入任何"技术约束"章节中未列出的依赖库
6. 不要创建任何"改动范围"表中未列出的新文件
7. 不要重构、优化、美化任何计划外的代码
