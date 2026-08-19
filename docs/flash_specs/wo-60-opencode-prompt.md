# OpenCode 任务提示词：WO-60 档案中心全景重构与最终交付

请作为后端资深开发工程师，严格按照 `docs/flash_specs/wo-60-archive-hub-redesign.md` 施工单执行代码编写。

## 核心任务
1. **新建 `core/archive/portfolio.py`**：
   - 实现 `get_archive_hub_stats(db)`：
     - 计算：`total_archived_clients`、`total_cases_count`、`total_loan_volume`、`total_opportunities_count`、`total_precedents_count`；
   - 实现 `get_client_portfolios(db, query=None, limit=50)`：
     - 按客户姓名（`client_name`）聚合名下所有房产与案卷，汇总房产套数、贷款总额、主力银行与最新二次经营商机。
2. **修改 `server/api/schemas.py`**：
   - 在文件末尾追加：`ArchiveHubStats`、`ClientPortfolioItem`、`ArchivePortfolioResponse`。
3. **修改 `server/api/archive.py`**：
   - 引入 `get_archive_hub_stats` 与 `get_client_portfolios`；
   - 追加 2 个端点：
     - `GET /api/archive/stats`
     - `GET /api/archive/portfolio`
4. **新建全量测试 `tests/test_api/test_archive_portfolio.py`**：
   - 覆盖客户多房产资产聚合、大盘总额指标计算与 2 个 API 端点。

## 纪律红线
- 严格遵循 `wo-60-archive-hub-redesign.md` 契约，字段和函数名一字不改；
- 禁止修改改动范围之外的任何文件。

## 验收命令
```powershell
$env:PYTHONPATH="D:\vera-workbench\.venv\Lib\site-packages"
$env:TESSDATA_PREFIX="C:\Users\Yaruo\AppData\Local\Temp\py311embed\tessdata"
python -m pytest tests/test_api/test_archive_portfolio.py -v
python -m ruff check core/archive/portfolio.py server/api/archive.py server/api/schemas.py tests/test_api/test_archive_portfolio.py
```
全部测试 pass 且 ruff 零报错后汇报。
