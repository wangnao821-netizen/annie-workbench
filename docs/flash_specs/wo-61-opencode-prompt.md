# OpenCode 任务提示词：WO-61 知识中心与档案库全景双向打通与工作台先例联动

请作为后端资深开发工程师，严格按照 `docs/flash_specs/wo-61-knowledge-archive-bridge.md` 施工单执行代码编写。

## 核心任务
1. **新建 `core/archive/knowledge_bridge.py`**：
   - 实现 `sync_archive_to_knowledge_base(db)`：
     - 扫描已结档案件，调用 `generate_case_knowledge_card` 生成复盘卡并落库为 `KnowledgeEntry`（`layer="global_experience"`, `source="archive_precedent"`, `case_id=case.id`），实现幂等；
   - 实现 `get_recommended_precedents_for_case(case_id, db, limit=3)`：
     - 根据当前案件机构、方案类型与卡点（`blocker`），从 `KnowledgeEntry` 库中多维评分匹配最相关的历史先例与破局启示。
2. **修改 `server/api/schemas.py`**：
   - 在文件末尾追加：`KnowledgeSyncResponse`、`RecommendedPrecedentItem`、`CaseRecommendedPrecedentsResponse`。
3. **修改 `server/api/archive.py`**：
   - 追加端点：`POST /api/archive/sync-knowledge`。
4. **修改 `server/api/cases.py`**：
   - 顶部引入 `get_recommended_precedents_for_case` 与 `CaseRecommendedPrecedentsResponse`；
   - 追加端点：`GET /api/cases/{case_id}/recommended-precedents`。
5. **新建全量测试 `tests/test_api/test_knowledge_bridge.py`**：
   - 覆盖知识同步落库、反向关联、工作台先例打分匹配与 2 个 API 端点。

## 纪律红线
- 严格遵循 `wo-61-knowledge-archive-bridge.md` 契约，字段和函数名一字不改；
- 禁止修改改动范围之外的任何文件。

## 验收命令
```powershell
$env:PYTHONPATH="D:\vera-workbench\.venv\Lib\site-packages"
$env:TESSDATA_PREFIX="C:\Users\Yaruo\AppData\Local\Temp\py311embed\tessdata"
python -m pytest tests/test_api/test_knowledge_bridge.py -v
python -m ruff check core/archive/knowledge_bridge.py server/api/archive.py server/api/cases.py server/api/schemas.py tests/test_api/test_knowledge_bridge.py
```
全部测试 pass 且 ruff 零报错后汇报。
