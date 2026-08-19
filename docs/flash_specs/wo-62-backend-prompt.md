# 后端开发任务提示词：WO-62 存量拓扑导入全链路修复

请作为后端资深开发工程师，严格按照 `docs/flash_specs/wo-62-legacy-topology-import-repair.md` 施工单执行代码编写。

## 核心任务

1. **修改 `config/checklist_master.yaml`**：
   - 将该文件重新保存为标准 UTF-8 编码，消除破损乱码字符。
2. **修改 `server/api/schemas.py`**：
   - 扩充 `BatchTopologyImportItem` 字段（`client_phone`, `client_email`, `employment_type`, `residency`, `property_value`, `interest_rate`, `doc_type`, `loan_type`, `onhold_reason`）。
3. **修改 `server/api/cases.py`**：
   - 在 `batch_topology_import` 端点中将上述新增字段传递给 `create_case_from_source`；
   - 赋值 `case.folder_path` 后，**立即调用 `match_checklist_files_for_case(case.id, db)` 自动扫描关联文件夹并给清单勾选已有文件**；
   - 补充 `_seed_initial_brain_facts_for_import` 将基础交易、身份、物业事实沉淀到 `brain_facts` 表。
4. **新建测试 `tests/test_api/test_topology_import_repair.py`**：
   - 构造临时文件夹（包含测试 PDF 文件与预填数据），验证导入建案后：
     - 案件全字段（电话、邮箱、自雇类型等）正确入库；
     - 清单文件即刻自动关联并打勾（`gathering_progress > 0`）；
     - 初始事实已正确写入 `brain_facts`。

## 验收命令
```powershell
$env:PYTHONPATH="D:\vera-workbench\.venv\Lib\site-packages"
$env:TESSDATA_PREFIX="C:\Users\Yaruo\AppData\Local\Temp\py311embed\tessdata"
python -m pytest tests/test_api/test_topology_import_repair.py -v
python -m ruff check server/api/schemas.py server/api/cases.py tests/test_api/test_topology_import_repair.py
```
