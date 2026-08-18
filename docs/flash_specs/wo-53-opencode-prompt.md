# OpenCode 任务提示词：WO-53 目录拓扑与多案卷智能识别

请作为后端资深开发工程师，严格按照 `docs/flash_specs/wo-53-folder-topology-scanner.md` 施工单执行代码编写。

## 核心任务
1. **新建 `core/case_folder/topology.py`**：
   - 实现 `parse_case_folder_name(dir_name: str) -> dict[str, Any]`
   - 实现 `scan_customer_topology(folder_path: str, db: Session | None = None) -> dict[str, Any]`
   - 提取客户名、多案卷子目录、房产地址、Lender、方案类型、withdrawn/onhold 状态及 onhold 原因，标记 `is_recommended_active`。
2. **修改 `server/api/schemas.py`**：
   - 在文件末尾追加：`FolderTopologyScanRequest`、`CaseSubfolderMeta`、`FolderTopologyScanResponse`、`BatchTopologyImportItem`、`BatchTopologyImportRequest`、`BatchTopologyImportResponse`。
3. **修改 `server/api/cases.py`**：
   - 在文件末尾追加 2 个端点：
     - `POST /api/cases/folder-topology/scan`
     - `POST /api/cases/topology-import/batch`
4. **新建全量测试 `tests/test_api/test_folder_topology.py`**：
   - 严禁访问真实客户目录，统一使用 `tmp_path` 构造虚拟测试目录树；
   - 覆盖所有真实目录名格式、单案卷回退、批量导入及平台事件测试。

## 纪律红线
- 严格遵循 `wo-53-folder-topology-scanner.md` 契约，函数名、字段名一字不改；
- 所有路径操作必须使用 `pathlib.Path`；
- 禁止修改改动范围之外的任何文件。

## 验收命令
```powershell
$env:PYTHONPATH="D:\vera-workbench\.venv\Lib\site-packages"
$env:TESSDATA_PREFIX="C:\Users\Yaruo\AppData\Local\Temp\py311embed\tessdata"
python -m pytest tests/test_api/test_folder_topology.py -v
python -m ruff check core/case_folder/topology.py server/api/cases.py server/api/schemas.py tests/test_api/test_folder_topology.py
```
全部测试 pass 且 ruff 零报错后汇报。
