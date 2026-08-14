# 任务：执行 WO-46 文件原文预览 + 手动建草稿施工单（opencode 实施）

你是 Vera Workbench 的实施工程师。严格按施工单执行，**禁止超范围改动**，遇到歧义停下报告。

## 前置信息

- 仓库：`D:\vera-workbench`（Windows）；
- Python：`D:\vera-workbench\.venv\Scripts\python.exe`（测试 / ruff 都用它）；
- 施工单：`docs\flash_specs\wo-46-file-raw-preview-draft.md`，**唯一契约**（接口签名、字段名一字不改）；
- 背景：Vera 对 (57) 提出——文件预览要出原文（当前 preview 只有解析文本）；邮件草稿需手动创建
  （当前草稿只能 AI 生成挂 Action）。F-40 前端依赖本单两个端点；
- 当前基线：`pytest tests/ -q` = **1060 passed**，0 failed / 0 skipped（若 WO-45 已合入则用其新基线）；
- 注意：工作区可能有 WO-45 实施者未提交的 `pyproject.toml` / `uv.lock` 改动——**不要碰、不要纳入本单提交**。

## 硬性纪律（违反即返工）

1. 只改施工单「改动范围」表内文件：
   `core/file_ops/service.py`、`server/api/file_ops.py`、`server/api/schemas.py`、`server/api/drafts.py`、
   `tests/test_api/test_file_ops.py`（追加）、`tests/test_api/test_drafts_manual.py`（新建）；
2. **严禁修改** 前端 `ui/`、`config/document_types.yaml`、`config/naming_rules.yaml`（只读真源）；
   **严禁新增任何 pip 依赖**；**严禁把 WO-45 的 pyproject/uv.lock 改动带入本单提交**；
3. **红线**：raw 端点只读不落盘、不写客户文件夹、必须 PathGuard 同案件校验；
   草稿只有 status=draft，绝不自动发送；PII 本地渲染不出网。

## 接口契约速览（完整见施工单，一字不改）

```text
GET /api/cases/{case_id}/folder/files/raw?path=<rel>
  200 FileResponse(media_type 按扩展名, Content-Disposition: inline; filename="原名")
  404 文件不存在 / 案件未关联文件夹；422 越界/穿越；413 超 20MB；422 不支持扩展名

POST /api/drafts
  body {case_id, subject, body, track?} → DraftListItem（status=draft, source=manual）
  404 case 不存在；422 subject/body 空白
```

扩展名白名单：`pdf / jpg / jpeg / png / txt / md / csv`（其余 422）。

## 参考代码

- `core/file_ops/service.py`：`validate_path_safety` / `list_files` 路径解析写法；
- `server/api/file_ops.py`：`preview_case_file` 端点风格（依赖注入 + 404/422 映射）；
- `server/api/drafts.py`：`_to_draft_item` / `list_drafts`；EmailDraft 模型字段见 `core/models/orm.py`。

## 实施步骤（每步跑验证命令）

1. 读施工单全文 + 参考代码；
2. `core/file_ops/service.py` 新增 `raw_file` → `python -c "import core.file_ops.service"` 无报错；
3. `server/api/file_ops.py` 加 raw 端点 + `server/api/drafts.py` 加 POST + `schemas.py` 模型 →
   `python -c "import server.main"` 无报错；
4. 测试：`pytest tests/test_api/test_file_ops.py tests/test_api/test_drafts_manual.py -v` 全绿；
5. 全量 `pytest tests/ -q` ≥ 1060 passed（或 WO-45 新基线），0 failed / 0 skipped；
6. `ruff check`（本单所有 py 文件）→ All checks passed；
7. `git add` **仅本单 6 文件** → `git commit`：
   `feat: WO-46 文件原文预览 + 手动建草稿 — raw 只读流 + POST /api/drafts（6 文件）`。

## 测试要点

- raw：PDF/PNG 200 + media_type + inline 头；txt 原文一致；越界 422；404；413（monkeypatch 上限）；
  不支持扩展名 422；跨案件 404；
- drafts：POST 落库 → GET /api/drafts 可见 status=draft/source=manual；空白 422；case 404。

## 交付报告要求

- 改动文件清单 + 行数；两个端点的 TestClient 实测结果（状态码/头/落库）；
- 全量 pytest / ruff 结果；确认未触碰 WO-45 的 pyproject/uv.lock 与前端。
