# OpenCode 任务提示词：WO-55 邮件时序提取与审批官/案号/卡点落库

请作为后端资深开发工程师，严格按照 `docs/flash_specs/wo-55-msg-timeline-extractor.md` 施工单执行代码编写。

## 核心任务
1. **新建 `core/pipeline/msg_timeline.py`**：
   - 遍历案件关联目录下的 `.msg` 邮件；
   - 提取日期、发件人、收件人、主题、正文摘要；
   - 正则提取审批官（Assessor）、银行系统案号（Lender Ref）；
   - 正则定性事件类型（`submission_lodged` / `assessor_assigned` / `mir_requested` / `valuation_shortfall` / `reassessment_submitted` / `approval_issued`）及阻断卡点原因（`is_blocker` / `blocker_reason`）；
   - 将重要邮件事件写入 `CaseContextEvent`（`source_type="email_timeline"`）；
   - 实现 `get_timeline_for_case` 与 `sync_timeline_for_case`。
2. **修改 `server/api/schemas.py`**：
   - 在文件末尾追加：`TimelineEventItem`、`CaseTimelineResponse`、`TimelineExtractResponse`。
3. **修改 `server/api/cases.py`**：
   - 在文件顶部统一引入 `from core.pipeline.msg_timeline import get_timeline_for_case, sync_timeline_for_case`；
   - 在文件末尾追加端点：
     - `GET /api/cases/{case_id}/timeline`
     - `POST /api/cases/{case_id}/timeline/extract-emails`
4. **新建全量测试 `tests/test_api/test_msg_timeline.py`**：
   - 使用 `tmp_path` 构造模拟文件或结构化 Mock，严禁访问真实客户目录；
   - 覆盖正则提取（审批官/案号）、事件分类定性、卡点标记、落库及两个 API 端点。

## 纪律红线
- 严格遵循 `wo-55-msg-timeline-extractor.md` 契约，字段和函数名一字不改；
- 所有路径操作必须使用 `pathlib.Path`；
- 禁止修改改动范围之外的任何文件。

## 验收命令
```powershell
$env:PYTHONPATH="D:\vera-workbench\.venv\Lib\site-packages"
$env:TESSDATA_PREFIX="C:\Users\Yaruo\AppData\Local\Temp\py311embed\tessdata"
python -m pytest tests/test_api/test_msg_timeline.py -v
python -m ruff check core/pipeline/msg_timeline.py server/api/cases.py server/api/schemas.py tests/test_api/test_msg_timeline.py
```
全部测试 pass 且 ruff 零报错后汇报。
