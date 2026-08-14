# WO-46 文件原文预览 + 手动建草稿（raw 文件流 + POST /api/drafts）

> 依据：Vera 2026-08-16 拍板（(57) 三问题）——文件预览要出**原文**（当前只有解析文本）；
> 邮件草稿需**手动创建**（当前草稿只能 AI 生成挂 Action）。F-40 前端依赖本单两个端点。
> 执行者：opencode / Gemini，按 Step 执行，每步跑验证命令。

## 技术约束

- 项目根：`D:\vera-workbench`；venv：`.venv\Scripts\python.exe`；
  基线：`pytest tests/ -q` = **1060 passed**（WO-44 后；若 WO-45 先行合入则按其新基线）；
- 禁止：修改前端 `ui/`；修改 `config/document_types.yaml` / `config/naming_rules.yaml`（只读真源）；
  新增任何 pip 依赖。

## 改动范围（严禁超出）

| 文件 | 操作 | 说明 |
|---|---|---|
| `core/file_ops/service.py` | 修改 | 新增 `raw_file` 只读读取（validate_path_safety + 大小上限 + 白名单扩展名 + 返回 (bytes, media_type, filename)） |
| `server/api/file_ops.py` | 修改 | 新增 `GET /{case_id}/folder/files/raw?path=` 端点 |
| `server/api/schemas.py` | 修改 | 新增 `DraftCreateRequest`（case_id/subject/body/track?） |
| `server/api/drafts.py` | 修改 | 新增 `POST /api/drafts` 手动建草稿（EmailDraft status=draft，复用 `_to_draft_item`） |
| `tests/test_api/test_file_ops.py` | 修改 | 追加 raw 端点用例 |
| `tests/test_api/test_drafts_manual.py` | 新建 | 手动建草稿用例 |

## 接口契约（一字不改）

### 1. `GET /api/cases/{case_id}/folder/files/raw?path=<rel>`

- 复用 `core.file_ops.service.list_files` 同款 `validate_path_safety`（同案件目录、禁穿越、越界 422）；
- 案件未关联文件夹 404；文件不存在 404；**大小 > 20MB → 413**「文件过大，请直接打开本地文件夹」；
- 扩展名白名单：`pdf / jpg / jpeg / png / txt / md / csv`（其余 422「该格式不支持在线原文预览」）；
- 返回 `FileResponse(content, media_type=按扩展名, headers={"Content-Disposition": 'inline; filename="<原名>"'})`；
- **只读**：不写盘、不落库（不产生 FileEvent）；PII 本地渲染不出网。

### 2. `POST /api/drafts`

body：`DraftCreateRequest {case_id: str, subject: str, body: str, track: str | None = None}`

- case 不存在 → 404；subject/body 空白 → 422；
- 创建 `EmailDraft(case_id, subject, body, status="draft", source="manual")`，返回 DraftListItem（复用既有 `_to_draft_item`）；
- 幂等不做要求（手动草稿每次新建）；不触发任何发送行为（红线：只出草稿）。

## 参考代码

- `core/file_ops/service.py`：`validate_path_safety` / `list_files` 的路径解析写法；
- `server/api/file_ops.py`：`preview_case_file` 端点风格（依赖注入 + PathGuard + 404/422 映射）；
- `server/api/drafts.py`：`_to_draft_item` / `list_drafts` 复用；EmailDraft 模型字段见 `core/models/orm.py`。

## 实施步骤（每步跑验证命令）

1. 读施工单全文 + 上述参考代码；
2. `core/file_ops/service.py` 新增 `raw_file` → `python -c "import core.file_ops.service"` 无报错；
3. `server/api/file_ops.py` 加 raw 端点 + `server/api/drafts.py` 加 POST + `schemas.py` 模型 →
   `python -c "import server.main"` 无报错；
4. `tests/test_api/test_file_ops.py` 追加 raw 用例、新建 `tests/test_api/test_drafts_manual.py` →
   两文件 `pytest -v` 全绿；
5. 全量 `pytest tests/ -q` ≥ 1060 passed（或 WO-45 后新基线），0 failed / 0 skipped；
6. `ruff check`（本单所有 py）→ All checks passed；
7. `git commit`：`feat: WO-46 文件原文预览 + 手动建草稿 — raw 只读流 + POST /api/drafts（N 文件）`。

## 测试要点

`tests/test_api/test_file_ops.py` 追加（TestClient + tmp_path + CLIENT_FILES_ROOT）：
- 正常 PDF/PNG → 200，media_type 正确（application/pdf / image/png），Content-Disposition 含 inline + 原名；
- txt 原文内容一致；越界/穿越 → 422；文件不存在 → 404；未关联文件夹 → 404；
- 超大文件 mock（monkeypatch 大小上限为 1B）→ 413；不支持扩展名（.exe/.docx）→ 422；跨案件 → 404。

`tests/test_api/test_drafts_manual.py`：
- POST 成功 → 落库，`GET /api/drafts` 可见且 status=draft、source=manual；
- subject/body 空白 → 422；case 不存在 → 404；track 缺省 → 默认 internal（或按既有枚举默认）。

## 红线

- raw 只读不落盘、不产生 FileEvent、不写客户文件夹；PathGuard 同案件校验必须走；
- 草稿只有 status=draft，绝不自动发送；PII 本地渲染不出网。
