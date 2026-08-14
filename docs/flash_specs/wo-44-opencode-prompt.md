# 任务：执行 WO-44 文件 Agent 施工单（opencode 实施）

你是 Vera Workbench 的实施工程师。严格按施工单执行，**禁止超范围改动**，遇到歧义停下报告。

## 前置信息

- 仓库：D:\vera-workbench（Windows）
- Python：D:\vera-workbench\.venv\Scripts\python.exe（测试/ruff 都用它）
- 施工单：docs\flash_specs\wo-44-file-agent.md（**唯一契约**，接口签名/字段名一字不改）
- 背景：文件操作 V2 定稿落地——案件文件夹浏览/预览/改名/移动/放入 + 规范命名建议；
  Vera 拍板：中栏"文件"入口（F-34 前端）、放入=复制保留原文件、V1 不做删除、改名弹窗带命名建议
- 当前基线：`pytest tests/ -q` = **1047 passed**，0 failed / 0 skipped
- 前置能力已就绪：PathGuard（core/security/path_guard.py，含 assert_user_action_allowed）、
  案件文件夹三档渐进（core/case_folder/lookup.py 的 parse_one / lookup_files）、
  classify_file（core/case_folder/discovery.py）、naming_rules.yaml（config/，只读真源）

## 硬性纪律（违反即返工）

1. 只改施工单「改动范围」表内文件：
   `core/file_ops/service.py`（新建 ≤200 行）、`server/api/file_ops.py`（新建 ≤200 行）、
   `server/api/schemas.py`（末尾追加）、`server/main.py`（注册路由）、
   `config/agents.yaml`（追加 agent-file，第 14 项）、`config/agent_flows/file_ops.yaml`（新建）、
   `core/agents/flows.py`、`core/agents/runner.py`、`core/agents/pai.py`、
   `tests/test_api/test_file_ops.py`（新建）、
   **2 个既有测试计数断言收尾**：`tests/test_api/test_agents.py` L36 与
   `tests/test_core/test_agents_registry.py` 4 处（L33/L49/L53/L60），13→14，仅数字与注释（WO-43 同款惯例）
2. **严禁修改** `config/naming_rules.yaml`、`config/document_types.yaml`（只读真源）；
   严禁修改前端 `ui/`；严禁新增任何 pip 依赖
3. **红线**：文件操作只执行 Vera 明确请求（API 层 `user_confirmed=True` 是前端确认弹窗语义的载体）；
   绝不自主移动/删除/改名；目标已存在禁止覆盖（409）；跨案件禁止；路径穿越拒绝（422）
4. `file_ops_open` 工具只返回 `{"ok": True, "case_id": ...}`，不做任何物理操作（物理操作走独立端点）
5. 命名建议是**纯确定性规则**，禁止调 LLM；未识别类型 → matched=false、suggested=原文件名

## 接口契约速览（完整见施工单，一字不改）

```python
# server/api/schemas.py 末尾追加
class FileOpsItem(BaseModel):     # name / rel_path / is_dir / size / mtime / doc_type
class FileOpsListResponse(BaseModel):   # current_path + items: list[FileOpsItem]
class FilePreviewResponse(BaseModel):   # rel_path / size / mtime / doc_type / text_preview / parse_error
class FileOpsResult(BaseModel):         # ok / source / target / event_id
class RenameRequest(BaseModel):         # source: str / new_name: str
class MoveRequest(BaseModel):           # source: str / target_dir: str
class NamingSuggestResponse(BaseModel): # doc_type / suggested / template_key / matched / reasons: list[str]

# 6 个端点（server/api/file_ops.py，prefix=/api/cases）
GET    /{case_id}/folder/files?path=          # 一层列表，子目录在前；未关联案件 404
GET    /{case_id}/folder/files/preview?path=  # 复用 lookup.parse_one，text_preview ≤2000 字符
POST   /{case_id}/folder/files/rename         # {source, new_name} → PathGuard → os.rename → FileEvent
POST   /{case_id}/folder/files/move           # {source, target_dir} → PathGuard → os.rename → FileEvent
POST   /{case_id}/folder/files/import         # multipart(file+target_dir) → shutil.copy2 复制保留原文件 → FileEvent
GET    /{case_id}/folder/naming-suggest?filename=  # classify_file → naming_rules 模板填充
```

`config/agents.yaml` 追加 `agent-file`（key/name/description/category=agent/status=available/
triggers=["打开文件","文件","预览文件","改文件名","把文件放进","移动文件","归档文件"]/
flow_key=file_ops/permission="仅当前案件文件夹；Vera 确认后执行；绝不自主操作"/enabled_default=true）。

`config/agent_flows/file_ops.yaml`：key=file_ops、presentation=dialog、steps 单步 `file_ops_open`、confirm_required=true。

`core/agents/flows.py` 白名单加 `"file_ops_open"`；`runner.py` + `pai.py` 各加 `file_ops_open` 分发。

## 参考代码（先读再写）

- `core/security/path_guard.py`：`assert_user_action_allowed(source, target, user_confirmed, client_files_root)`
  —— rename/move 必须走它（同案件/禁穿越/目标存在拒绝）
- `core/case_folder/lookup.py`：`parse_one(case, rel_path, db)`（preview 直接复用）；
  `_IGNORED_NAMES` 过滤规则、`validate_path_safety` 用法
- `core/case_folder/discovery.py`：`classify_file(name) -> (doc_type, confidence)`（列表 doc_type + 命名建议匹配）
- `core/case_engine/folder.py`：`validate_path_safety(rel, root)`、`_get_default_client_root()`
- `core/models/orm.py`：`FileEvent`（event_id 为 String PK，建议 `fe_{uuid8}`；case_id/source_path/
  target_path/original_name/operator/timestamp；timestamp 用 ISO-8601 字符串）
- `core/agents/runner.py` L171 附近 `elif tool_name == "gap_analysis"` 分发写法；
  `core/agents/pai.py` `_gap_analysis(ctx)` + `_tools()` 注册写法
- `config/agent_flows/calculator.yaml`（dialog 流程包模板）；`server/api/folders.py`（browse/parse 端点写法）
- 测试参考：`tests/test_api/test_case_folder.py`（TestClient + tmp 文件夹 + CLIENT_FILES_ROOT 环境变量）、
  `tests/test_api/test_bank_endpoints.py`（client fixture）

## 实施步骤（每步跑验证命令）

1. 读施工单全文 + 上述参考代码
2. `core/file_ops/service.py` → `python -c "import core.file_ops.service"` 无报错
3. `server/api/file_ops.py` + schemas + `server/main.py` 注册 →
   `python -c "import server.api.file_ops, server.main"` 无报错
4. `config/agents.yaml` + `config/agent_flows/file_ops.yaml` + flows/runner/pai →
   `python -c "from core.agents.flows import load_flows; assert 'file_ops' in load_flows()"`
5. `tests/test_api/test_file_ops.py` → `pytest tests/test_api/test_file_ops.py -v` 全绿（13 用例）
6. 计数断言收尾（13→14）→ `pytest tests/test_api/test_agents.py tests/test_core/test_agents_registry.py -q` 全绿
7. 全量 `pytest tests/ -q` ≥ 1047 passed，0 failed / 0 skipped
8. `ruff check`（本单所有 py 文件）→ All checks passed

## 测试要点（tests/test_api/test_file_ops.py）

- fixture：`monkeypatch.setenv("CLIENT_FILES_ROOT", str(tmp_path/"clients"))`；case 用
  `Case(id=..., client_name=..., folder_path="张三_CBA_001")`（相对案件目录）；在 tmp 下建
  `clients/张三_CBA_001/{_Inbox/, Income Payslip June 2025 CBA.pdf, ID Passport.pdf}`
- 环境变量：`ENV=development`、`DEEPSEEK_API_KEY=test-fake-key`、`GEMINI_API_KEY=test-fake-key`
- import 端点用 `client.post(..., files={"file": ("payslip.pdf", b"x", "application/pdf")}, data={"target_dir": "_Inbox"})`
- FileEvent 断言：`event_type in {"folder_rename","folder_move","folder_import"}`、
  `operator == "vera"`、source_path/target_path 非空
- 红线用例必测：重名 409、`..` 穿越 422、跨案件 422/403、未关联案件 404、未知类型命名建议 matched=false

## 完成标准

- 专项 13/13 全绿；全量 ≥1047；ruff 干净；计数断言已收尾
- git stage 范围表内文件，提交信息：
  `feat: WO-44 文件 Agent — 案件文件夹浏览/预览/改名/移动/放入 + 规范命名建议`
- 交付报告列出：改动文件清单、测试结果、门禁结果、偏离说明（如有）

遇到契约歧义、环境异常或计划外失败 → 停下报告，不自作主张修计划外代码。
