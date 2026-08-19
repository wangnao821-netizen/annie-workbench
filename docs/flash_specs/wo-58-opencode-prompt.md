# OpenCode 任务提示词：WO-58 二次经营时钟引擎与主动商机雷达

请作为后端资深开发工程师，严格按照 `docs/flash_specs/wo-58-retention-scheduler.md` 施工单执行代码编写。

## 核心任务
1. **新建 `core/archive/retention.py`**：
   - 实现 `compute_case_retention_opportunities(case, now=None)`：
     - 严格隔离：仅处理已归结案（`stage == 'closed'` 或 `close_reason == 'settled'`）；
     - 四大时钟判定：
       - 🔴 `fixed_rate_expiry` (Red)：到期前 ≤90 天；
       - 🟡 `annual_repricing` (Yellow)：满 1 周年/2 周年降息体检；
       - 🟢 `equity_cashout` (Green)：满 2 年增值套现/再置业意向；
       - 🔵 `settlement_care` (Blue)：放款 30 天 / 180 天关怀；
   - 实现 `get_all_retention_radar(db, now=None)`：
     - 汇总统计 `red_count`, `yellow_count`, `green_count`, `blue_count` 及商机列表。
2. **修改 `server/api/schemas.py`**：
   - 在文件末尾追加：`RetentionOpportunityItem`、`RetentionRadarSummary`、`RetentionRadarResponse`。
3. **修改 `server/api/archive.py`**：
   - 引入 `from core.archive.retention import get_all_retention_radar`；
   - 追加端点：`GET /api/archive/retention-radar`。
4. **新建全量测试 `tests/test_api/test_retention_radar.py`**：
   - 覆盖 4 种时钟触发逻辑、在办案件隔离性与 API 端点测试。

## 纪律红线
- 严格遵循 `wo-58-retention-scheduler.md` 契约，字段和函数名一字不改；
- 所有时间计算基于 UTC；
- 禁止修改改动范围之外的任何文件。

## 验收命令
```powershell
$env:PYTHONPATH="D:\vera-workbench\.venv\Lib\site-packages"
$env:TESSDATA_PREFIX="C:\Users\Yaruo\AppData\Local\Temp\py311embed\tessdata"
python -m pytest tests/test_api/test_retention_radar.py -v
python -m ruff check core/archive/retention.py server/api/archive.py server/api/schemas.py tests/test_api/test_retention_radar.py
```
全部测试 pass 且 ruff 零报错后汇报。
