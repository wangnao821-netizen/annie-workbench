# OpenCode 任务提示词：WO-59 AI 知识萃取与审批官/先例图谱

请作为后端资深开发工程师，严格按照 `docs/flash_specs/wo-59-knowledge-precedent-mining.md` 施工单执行代码编写。

## 核心任务
1. **新建 `core/archive/knowledge_mining.py`**：
   - 实现 `get_all_assessor_insights(db)`：
     - 从 `CaseContextEvent` 与 `Case` 表聚合审批官姓名（如 `Rachel Fonseka`）、银行、负责案件数、最近案号与卡点类型列表；
   - 实现 `search_case_precedents(db, lender=None, doc_type=None, keyword=None, limit=20)`：
     - 仅在已归档案件（`stage == 'closed'` 或 `close_reason == 'settled'`）中检索，支持按机构、方案类型与关键词多维过滤；
   - 实现 `generate_case_knowledge_card(case_id, db)`：
     - 提取结构化复盘卡（背景与金额、策略摘要、关键挑战点、获批条件与经验结晶）。
2. **修改 `server/api/schemas.py`**：
   - 在文件末尾追加：`AssessorInsightItem`、`AssessorListResponse`、`CasePrecedentItem`、`CasePrecedentSearchResponse`、`KnowledgeCardResponse`。
3. **修改 `server/api/archive.py`**：
   - 追加 3 个端点：
     - `GET /api/archive/assessors`
     - `GET /api/archive/precedents`
     - `GET /api/archive/cases/{case_id}/knowledge-card`
4. **新建全量测试 `tests/test_api/test_knowledge_mining.py`**：
   - 覆盖审批官画像聚合、先例多维检索、复盘卡生成与 3 个 API 端点。

## 纪律红线
- 严格遵循 `wo-59-knowledge-precedent-mining.md` 契约，字段和函数名一字不改；
- 禁止修改改动范围之外的任何文件。

## 验收命令
```powershell
$env:PYTHONPATH="D:\vera-workbench\.venv\Lib\site-packages"
$env:TESSDATA_PREFIX="C:\Users\Yaruo\AppData\Local\Temp\py311embed\tessdata"
python -m pytest tests/test_api/test_knowledge_mining.py -v
python -m ruff check core/archive/knowledge_mining.py server/api/archive.py server/api/schemas.py tests/test_api/test_knowledge_mining.py
```
全部测试 pass 且 ruff 零报错后汇报。
