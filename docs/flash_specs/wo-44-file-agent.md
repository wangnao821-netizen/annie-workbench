# WO-44 文件 Agent（File Ops）— 案件文件夹浏览/预览/改名/移动/放入 + 规范命名建议

> 依据：主文档 §十三 V2 定稿（文件操作 Vera 主动、绝不自主）+ Vera 2026-08-14 拍板
> （中栏"文件"入口；放入=复制保留原文件；V1 不做物理删除；改名弹窗带规范命名建议）。
> 执行者：Codex / opencode / Gemini，逐 Step 执行，每步跑验证命令。

## 技术约束

- 项目根：`D:\vera-workbench`；venv：`.venv\Scripts\python.exe`；基线：`pytest tests/ -q` = **1047 passed**
- 禁止：新增任何 pip 依赖；修改前端 `ui/`；修改 `config/naming_rules.yaml`、`config/document_types.yaml`（只读真源）
- 红线：只执行 Vera 明确请求（前端确认弹窗后才调端点，API 层 `user_confirmed=True` 为该语义的载体）；
  **绝不自主移动/删除/改名**；目标已存在禁止覆盖；跨案件禁止；路径穿越拒绝

## 改动范围（严禁超出）

| 文件 | 操作 | 说明 |
|---|---|---|
| `core/file_ops/service.py` | 新建（≤200 行） | list / preview / rename / move / import / suggest_naming |
| `server/api/file_ops.py` | 新建（≤200 行） | 6 个端点 |
| `server/api/schemas.py` | 修改 | 末尾追加请求/响应模型 |
| `server/main.py` | 修改 | 注册 file_ops 路由 |
| `config/agents.yaml` | 修改 | 追加 `agent-file`（第 14 项） |
| `config/agent_flows/file_ops.yaml` | 新建 | 流程包 |
| `core/agents/flows.py` | 修改 | 白名单 + 加载校验 |
| `core/agents/runner.py`、`core/agents/pai.py` | 修改 | `file_ops_open` 工具分发 |
| `tests/test_api/test_file_ops.py` | 新建 | 验收测试 |
| `tests/test_api/test_agents.py`、`tests/test_core/test_agents_registry.py` | 修改 | 计数 13→14（WO-43 同款惯例，仅数字与注释） |

## 接口契约（一个字符都不能改）

### 1. `GET /api/cases/{case_id}/folder/files?path=<rel_subdir>`

→ `FileOpsListResponse {current_path: str, items: [FileOpsItem]}`

`FileOpsItem {name, rel_path, is_dir, size: int|None, mtime: str|None, doc_type: str|None}`

- `path` 为空 = 案件根；`path` 相对**案件目录**（`validate_path_safety` 在 case_dir 内校验，越界/穿越 → 422）；
- 只列一层（子目录在前，文件在后，均按名排序）；前端逐层进入；
- 案件未关联文件夹 → 404 `detail="案件未关联文件夹"`；过滤 `_IGNORED_NAMES` 与隐藏文件；
- `doc_type` 用 `core.case_folder.discovery.classify_file(name)` 返回。

### 2. `GET /api/cases/{case_id}/folder/files/preview?path=<rel>`

→ `FilePreviewResponse {rel_path, size, mtime, doc_type, text_preview: str, parse_error: str|None}`

- 复用 `core.case_folder.lookup.parse_one(case, rel_path, db)`；`text_preview` 截断 ≤2000 字符；
- 解析失败不 500，返回 `parse_error` 文案；文件不存在/越界 → 404/422。

### 3. `POST /api/cases/{case_id}/folder/files/rename`

body `{source: str, new_name: str}` → `FileOpsResult {ok: true, source, target, event_id}`

- `new_name` 校验：非空、不含 `/ \ ..`、不以 `.` 开头 → 否则 422；
- `PathGuard.assert_user_action_allowed(source, target, user_confirmed=True, client_files_root)`：
  同案件目录、禁穿越、目标已存在 → 409（不覆盖）；
- `os.rename` 执行；`FileEvent(case_id, event_type="folder_rename", source_path, target_path,
  original_name=旧名, operator="vera", timestamp=ISO)` 落库。

### 4. `POST /api/cases/{case_id}/folder/files/move`

body `{source: str, target_dir: str}` → `FileOpsResult`

- `target_dir` 相对案件目录；目标 = `target_dir/原名`；PathGuard 同规则；`os.rename`；
- `FileEvent(event_type="folder_move", ...)` 落库。

### 5. `POST /api/cases/{case_id}/folder/files/import`（multipart：`file` + `target_dir`）

→ `FileOpsResult`

- **复制**（`shutil.copy2`）进案件目录 `target_dir`，**保留原文件**（Vera 拍板：放入=复制）；
- 目标重名 → 409（不覆盖）；`FileEvent(event_type="folder_import", target_path, operator="vera")` 落库；
- 文件类型白名单：扩展名 ∈ pdf/doc/docx/xlsx/xls/msg/txt/jpg/jpeg/png/csv（其余 422）。

### 6. `GET /api/cases/{case_id}/folder/naming-suggest?filename=<name>`

→ `NamingSuggestResponse {doc_type: str|None, suggested: str, template_key: str|None, matched: bool, reasons: [str]}`

- `classify_file(filename)` → doc_type；若 `naming_rules.yaml` 有该 key → 填模板：
  `{client_name}`←case.client_name；`{date}`/`{year}`/`{quarter}`←文件名日期正则或今天；
  `{employer}`/`{bank}`/`{property_short}`←文件名关键词或留空；`{original_filename}`←原名去扩展名；
- 无匹配 → `matched=false, suggested=原文件名, reasons=["未识别文档类型，保持原名"]`；
- 纯确定性规则，不调 LLM。

### 7. `config/agents.yaml` 追加（第 14 项）

```yaml
- key: agent-file
  name: "文件 Agent (File Ops)"
  description: "打开案件文件夹/预览文件/按规范改名/移动归档/放入文件"
  category: agent
  status: available
  triggers: ["打开文件", "文件", "预览文件", "改文件名", "把文件放进", "移动文件", "归档文件"]
  flow_key: file_ops
  capability: "案件文件夹浏览/预览/改名/移动/放入（Vera 确认后执行）"
  permission: "仅当前案件文件夹；Vera 确认后执行；绝不自主操作"
  enabled_default: true
```

### 8. `config/agent_flows/file_ops.yaml`

```yaml
key: file_ops
name: "文件操作"
description: "打开案件文件夹抽屉，Vera 预览/改名/移动/放入文件"
triggers: ["打开文件", "文件", "预览文件", "改文件名", "移动文件", "归档文件"]
presentation: dialog
steps:
  - tool: file_ops_open
    params: {}
    output: result
confirm_required: true
acceptance: []
```

### 9. 工具分发

- `core/agents/flows.py` 白名单加 `"file_ops_open"`；`runner.py` + `pai.py` 各加 `file_ops_open` 分发
  （返回 `{"ok": True, "case_id": ...}`，参照 `gap_analysis` / `checklist_query` 写法）；
- dialog 卡由前端消费 → 打开文件抽屉（参数 V1 由抽屉补全，同 calculator 模式）。

## 实施步骤（每步验证）

1. `core/file_ops/service.py` → `python -c "import core.file_ops.service"`
2. `server/api/file_ops.py` + schemas + main 注册 → `python -c "import server.api.file_ops, server.main"`
3. agents.yaml + file_ops.yaml + flows/runner/pai → `python -c "from core.agents.flows import load_flows; assert 'file_ops' in load_flows()"`
4. `pytest tests/test_api/test_file_ops.py -v` 全绿
5. 计数断言收尾：`test_agents.py` L36 13→14；`test_agents_registry.py` 4 处 13→14（仅数字与注释）
6. 全量 `pytest tests/ -q` ≥1047，0 failed；`ruff check`（改动文件）All checks passed

## 验收测试（tests/test_api/test_file_ops.py）

1. `test_list_case_files`：案件关联临时文件夹（2 文件 + 1 子目录）→ GET files → 3 项、doc_type 有值、子目录在前
2. `test_list_unlinked_case_404`：未关联文件夹 → 404
3. `test_preview_file`：txt → text_preview 非空；`test_preview_missing_404`
4. `test_rename_success`：改名后列表含新名；FileEvent `event_type=folder_rename` 落库
5. `test_rename_overwrite_409`：目标已存在 → 409
6. `test_rename_traversal_422`：new_name 含 `..` → 422
7. `test_move_success`：移到子目录 → 列表反映；FileEvent `folder_move` 落库
8. `test_move_cross_case_rejected`：source 属其他案件目录 → 422/403
9. `test_import_copies_keeps_original`：上传 → 案件目录出现文件、原临时文件仍存在；FileEvent `folder_import` 落库
10. `test_import_duplicate_409`：重名 → 409
11. `test_naming_suggest_payslip`：`Income Payslip June 2025 CBA.pdf` → matched=true、suggested 含模板样式
12. `test_naming_suggest_unknown`：未知类型 → matched=false、suggested=原名
13. `test_traversal_422`：path/source/target_dir 含 `..` 或越出案件目录 → 422

---

⚠️ 执行纪律：只改改动范围表内文件；契约命名一字不改；每完成一个 Step 立即验证；失败停下报告；
完成后 git stage 范围表内文件，提交信息：`feat: WO-44 文件 Agent — 案件文件夹浏览/预览/改名/移动/放入 + 规范命名建议`
