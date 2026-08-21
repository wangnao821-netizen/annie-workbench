# OpenCode 任务提示词：WO-72 邮件时间线草稿物理时间回退与估价语义提取重构

请作为资深后端开发工程师，严格按照 `docs/flash_specs/wo-72-timeline-mtime-fallback.md` 施工单执行代码修改。

## 核心任务（2 个文件）

1. **`core/pipeline/msg_timeline.py`**：
   - 重构 `_extract_shortfall_reason` 函数：基于估价上下文（`estimated value`, `lower than`, `valuation`）精准匹配，彻底剔除无关的房贷余额（如 `$640k`）；
   - 在 `_parse_msg_file` 函数中，当 `msg.date` 为 `None` 时，增加 `try-except` 读取 `datetime.fromtimestamp(msg_path.stat().st_mtime, tz=UTC).isoformat()` 作为 `event_time`；
   - 在生成 `title` 字段时，若路径含 `/val template/` 或主题含 `[Client Name]`、`First Name FAMILY NAME` 等占位符，自动加上 `[草稿/模板]` 前缀；
   - 严禁修改其他函数。

2. **`tests/test_timeline_mtime_fallback.py`**（新建）：
   - 贴入施工单中的完整单元测试（覆盖 mtime 物理时间回退、模板标题识别、估价语义精准提取）。

## 纪律红线
- 严禁修改施工单列出的 2 个文件以外的任何文件；
- 严禁更改既有接口契约；
- 严禁删除与本次修改无关的注释和 docstring。

## 验收命令
```powershell
cd D:\vera-workbench
$env:PYTHONPATH="D:\vera-workbench\electron\release\win-unpacked\resources\runtime\site-packages;D:\vera-workbench\electron\release\win-unpacked\resources\backend;D:\vera-workbench"
& "D:\vera-workbench\electron\release\win-unpacked\resources\runtime\python\python.exe" -m pytest tests/test_timeline_mtime_fallback.py -v
& "D:\vera-workbench\electron\release\win-unpacked\resources\runtime\python\python.exe" -m ruff check core/pipeline/msg_timeline.py
```
测试全部通过且 ruff 零报错后汇报。
