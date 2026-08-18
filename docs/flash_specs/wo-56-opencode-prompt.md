# OpenCode 任务提示词：WO-56 新建案件全景重构与目录脚手架

请作为后端资深开发工程师，严格按照 `docs/flash_specs/wo-56-new-case-flow-refactor.md` 施工单执行代码编写。

## 核心任务
1. **修改 `core/case_engine/folder.py`**：
   - 定义 `STANDARD_CASE_SUBDIRS`（澳洲信贷标准 11 个子目录）；
   - 实现 `scaffold_case_directories(parent_path, client_name, case_name, create_subdirs=True)`：在父目录下生成规范命名的客户根目录、案卷子目录并自动物理创建 11 个子文件夹。
2. **修改 `server/api/schemas.py`**：
   - 在文件末尾追加：`CaseScaffoldRequest` 与 `CaseScaffoldResponse`。
3. **修改 `server/api/cases.py`**：
   - 在文件顶部统一引入 `from core.case_engine.folder import scaffold_case_directories`；
   - 在文件末尾追加端点：`POST /api/cases/scaffold`。
4. **新建全量测试 `tests/test_api/test_case_scaffold.py`**：
   - 使用 `tmp_path` 作为父目录，验证 11 个子文件夹物理创建与 API 接口连通性。

## 纪律红线
- 严格遵循 `wo-56-new-case-flow-refactor.md` 契约，字段和函数名一字不改；
- 所有路径操作必须使用 `pathlib.Path`；
- 禁止修改改动范围之外的任何文件。

## 验收命令
```powershell
$env:PYTHONPATH="D:\vera-workbench\.venv\Lib\site-packages"
$env:TESSDATA_PREFIX="C:\Users\Yaruo\AppData\Local\Temp\py311embed\tessdata"
python -m pytest tests/test_api/test_case_scaffold.py -v
python -m ruff check core/case_engine/folder.py server/api/cases.py server/api/schemas.py tests/test_api/test_case_scaffold.py
```
全部测试 pass 且 ruff 零报错后汇报。
