# OpenCode 任务提示词：WO-57 历史案卷批量归档入库与放款事实解析

请作为后端资深开发工程师，严格按照 `docs/flash_specs/wo-57-archive-batch-ingestion.md` 施工单执行代码编写。

## 核心任务
1. **新建 `core/archive/ingestion.py`**：
   - 实现 `scan_archive_folder(folder_path, db=None)`：
     - 扫描历史客户/总目录，识别案卷子目录；
     - **严格准入审查（Anti-Pollution Gate）**：比对 DB，若该路径正在工作台推进（`stage != "closed"`），标记 `in_workbench = True, eligible = False`（防跨区冲突）；若已归档标记 `already_archived = True`；
     - 识别放款终态关键词（`settled`、`completed`、`approval` 等）；
     - 提取放款事实：`settlement_date`、`interest_rate`、金额、机构、物业地址。
   - 实现 `batch_import_archive_cases(items, db)`：
     - 批量写入 `Case` 表，标记 `stage="closed"`, `close_reason="settled"`, `is_imported=True`, `closed_at=settlement_date`，并记录 `ImportRecord(source="archive_batch", ...)`。
2. **修改 `server/api/schemas.py`**：
   - 在文件末尾追加：`ArchiveCaseItem`、`ArchiveScanResponse`、`ArchiveBatchImportItem`、`ArchiveBatchImportRequest`、`ArchiveBatchImportResponse`。
3. **新建 `server/api/archive.py`**：
   - 挂载路由 `prefix="/api/archive"`，实现 `POST /api/archive/scan` 与 `POST /api/archive/batch-import`。
4. **修改 `server/main.py`**：
   - 注册 `archive_router`。
5. **新建全量测试 `tests/test_api/test_archive_ingestion.py`**：
   - 使用 `tmp_path` 构造虚拟测试数据，覆盖已放款识别、在途冲突拦截、已归档拦截与 2 个 API 端点。

## 纪律红线
- 严格遵循 `wo-57-archive-batch-ingestion.md` 契约，字段和函数名一字不改；
- 所有路径操作必须使用 `pathlib.Path`；
- 禁止修改改动范围之外的任何文件。

## 验收命令
```powershell
$env:PYTHONPATH="D:\vera-workbench\.venv\Lib\site-packages"
$env:TESSDATA_PREFIX="C:\Users\Yaruo\AppData\Local\Temp\py311embed\tessdata"
python -m pytest tests/test_api/test_archive_ingestion.py -v
python -m ruff check core/archive/ingestion.py server/api/archive.py server/main.py server/api/schemas.py tests/test_api/test_archive_ingestion.py
```
全部测试 pass 且 ruff 零报错后汇报。
