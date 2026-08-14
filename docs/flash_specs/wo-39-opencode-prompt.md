# 任务：执行 WO-39 澳洲时区 / 假期 / 银行工作日施工单（opencode 实施）

你是 Vera Workbench 的实施工程师。严格按施工单执行，**禁止超范围改动**，遇到歧义停下报告。

## 前置信息
- 仓库：D:\vera-workbench（Windows）
- Python：D:\vera-workbench\.venv\Scripts\python.exe（测试/ruff 都用它）
- 施工单：docs\flash_specs\wo-39-au-holidays.md（**唯一契约**，接口签名/字段名一字不改；假期表已按官方源核对，你需再对照 fairwork.gov.au / act.gov.au / qld.gov.au 复核一遍，差异以官方为准并修正后报告）
- 背景：Vera 团队总部堪培拉（ACT）、客户集中在悉尼（NSW）与布里斯班（QLD），中国与澳洲协同；顶栏澳洲时间 + 三州日历/假期/工作日状态 + 案件 finance_deadline 休息日预警
- 当前基线：`pytest tests/ -q` = 950 passed（WO-37/38 已合入），0 failed / 0 skipped
- 前置单已完成：WO-35 会话压缩 / WO-36 技能路由 / WO-37 决策先例 / WO-38 时间点回溯

## 硬性纪律（违反即返工）
1. 只改施工单「本次改动范围」表内文件，共 7 个：
   - `config/holidays_au.yaml`（新建：2026/2027 三州 ACT/NSW/QLD 假期 + default_state: nsw）
   - `core/holidays.py`（新建，≤200 行：load_holidays / is_working_day / state_today_status / upcoming_holidays / next_holiday / dls_status）
   - `server/api/holidays.py`（新建：GET /api/holidays）
   - `server/api/schemas.py`（修改：末尾追加 HolidayStateToday / HolidayItem / DlsStatus / HolidaysResponse 4 模型，勿动既有模型）
   - `server/main.py`（修改：注册 holidays 路由）
   - `core/ai/case_context.py`（修改：_build_risk 加可选参数 finance_workday + build_case_context 调用处，最小改动）
   - `tests/test_core/test_au_holidays.py`（新建，12 用例）
2. 严禁修改：`core/models/orm.py`、`core/agents/*`、`config/agent_flows/*.yaml`、前端 `ui/`；严禁新增数据库迁移；严禁引入任何新 pip 依赖（时区用标准库 zoneinfo，**不用 holidays 库**）
3. `_build_risk` 新风险只追加在 LVR 之后，不改变既有 risk 输出顺序；`finance_workday` 参数默认 None（既有调用零影响）
4. 假期表数据准确性是硬要求：实施时对照官方源复核，不确定的日期停下报告
5. schemas.py / main.py / case_context.py 只允许"追加/最小扩展"，不允许改动既有逻辑

## 接口契约速览（完整见施工单「二、接口契约」，一字不改）

```python
# core/holidays.py
STATES = ("act", "nsw", "qld")

def load_holidays() -> dict:                       # {"default_state": str, "states": {...}}
def is_working_day(date: dt.date, state: str = "nsw") -> tuple[bool, str | None]
def state_today_status(state: str) -> dict         # {"date","state","is_working_day","holiday_name","weekday"}
def upcoming_holidays(state: str | None = None, limit: int = 10) -> list[dict]
def next_holiday(state: str = "nsw", from_date: dt.date | None = None) -> dict | None
def dls_status() -> dict                           # sydney/brisbane/beijing 的 utc_offset_hours + dls_active
```

端点：`GET /api/holidays?state=&limit=` → `HolidaysResponse{today: dict[str, HolidayStateToday], upcoming: list[HolidayItem], next: HolidayItem | None, dls: dict[str, DlsStatus]}`；`state` 非 act/nsw/qld → 422。

案件联动：`_build_risk(checklist, os, deadlines, lvr, finance_workday: tuple[bool, str | None] | None = None)`；`build_case_context` 内 `finance_due` 存在时按 `load_holidays()["default_state"]` 调 `is_working_day`，非工作日 → `risk.append(f"Finance Clause 截止日（{date}）是银行休息日（{holiday or '周末'}），建议提前")`。

## 参考代码（先读再写）
- `core/models/orm.py`：Case.finance_deadline（L48）
- `core/ai/case_context.py`：`_build_deadlines`（L67）/ `_build_risk`（L78）/ `build_case_context` 调用处（L191-206）
- `server/api/banks.py`：新端点/路由注册范例；`server/main.py` 现有 router 注册方式
- `server/api/schemas.py`：响应模型风格 + `ConfigDict(from_attributes=True)`
- 测试参考：`tests/test_core/test_au_holidays.py` 风格仿 `tests/test_core/test_bank_registry.py`（配置加载）+ `tests/test_api/test_context_events.py`（TestClient）

## 实施步骤
1. 读施工单全文 + 上述参考代码；对照官方源复核 holidays_au.yaml 三州日期
2. Step 1：config/holidays_au.yaml；验证 `python -c "from core.holidays import load_holidays; print(sorted(load_holidays()['states']))"` → `['act','nsw','qld']`
3. Step 2：core/holidays.py 六函数；验证 `ruff check core/holidays.py`
4. Step 3：schemas 4 模型 + server/api/holidays.py + main.py 注册；验证 `pytest tests/test_core/test_au_holidays.py -q`
5. Step 4：case_context.py 案件联动（_build_risk 可选参数 + 调用处）；验证相关测试零回归
6. Step 5：写 12 个测试用例（施工单列名）；验证 `pytest tests/test_core/test_au_holidays.py -q`
7. Step 6：全量门禁 + 提交

## 门禁（全绿才算完成）
- 专项：`pytest tests/test_core/test_au_holidays.py -q` → 12 项全绿
- 回归：`pytest tests/test_api/test_case_context.py tests/test_api/test_cases.py -q`（如存在）→ 全绿
- 全量：`pytest tests/ -q` → ≥950 全绿，0 failed / 0 skipped
- `ruff check core/holidays.py server/api/holidays.py server/api/schemas.py server/main.py core/ai/case_context.py tests/test_core/test_au_holidays.py` → All checks passed
- `python -c "import core.holidays, server.main"` → 无循环导入
- `git diff` 核对：除「改动范围」表内 7 文件外零改动（前端 ui/ 一律不碰）

## 提交
- 只 stage 本单 7 个文件；提交信息：`feat: WO-39 澳洲时区/假期/银行工作日 — GET /api/holidays + 案件截止日休息日预警`
- 提交后输出交付报告：改动文件清单 + 行数、专项/全量测试数、ruff 结果、假期表核对说明、遗留 TODO（如有）

## 失败标准（对照施工单「验收标准」）
任何一项不满足 → 停下报告，不要自行扩大范围。
