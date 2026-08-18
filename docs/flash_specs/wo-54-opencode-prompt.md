# OpenCode 任务提示词：WO-54 标题快速匹配与清单自动打勾

请作为后端资深开发工程师，严格按照 `docs/flash_specs/wo-54-checklist-title-matcher.md` 施工单执行代码编写。

## 核心任务
1. **新建 `core/checklist/matcher.py`**：
   - 实现 `CHECKLIST_ALIAS_MAP` 别名映射词典；
   - 实现 `match_checklist_files_for_case(case_id: str, db: Session) -> dict[str, Any]`：
     - 扫描案件关联目录（忽略 `.DS_Store` 等杂文件）；
     - 查验/创建 `CaseFile` 记录，根据文件名别名自动与 `CaseChecklist` 的 `master_id` / `item_name` 进行语义匹配；
     - 匹配命中后设置 `status = "received"`，回填 `received_file_id` 和 `received_file_ids`；
     - 计算并回写 `Case.gathering_progress`。
2. **修改 `core/case_creation.py`**：
   - 在 `create_case_from_source` 中，清单生成后若 `folder_path` 存在且有效，自动触发一次 `match_checklist_files_for_case`。
3. **修改 `server/api/schemas.py`**：
   - 在文件末尾追加：`ChecklistMatchedFileDetail` 与 `ChecklistMatchFilesResponse`。
4. **修改 `server/api/cases.py`**：
   - 追加端点：`POST /api/cases/{case_id}/checklist/match-files`。
5. **新建全量测试 `tests/test_api/test_checklist_matcher.py`**：
   - 统一使用 `tmp_path` 构造虚拟测试目录与文件，严禁访问真实客户目录；
   - 覆盖真实文件名匹配、打勾、多文件绑定、进度计算及空目录安全回退。

## 纪律红线
- 严格遵循 `wo-54-checklist-title-matcher.md` 契约，字段和函数名一字不改；
- 所有路径操作必须使用 `pathlib.Path`；
- 禁止修改改动范围之外的任何文件。

## 验收命令
```powershell
$env:PYTHONPATH="D:\vera-workbench\.venv\Lib\site-packages"
$env:TESSDATA_PREFIX="C:\Users\Yaruo\AppData\Local\Temp\py311embed\tessdata"
python -m pytest tests/test_api/test_checklist_matcher.py -v
python -m ruff check core/checklist/matcher.py core/case_creation.py server/api/cases.py server/api/schemas.py tests/test_api/test_checklist_matcher.py
```
全部测试 pass 且 ruff 零报错后汇报。
