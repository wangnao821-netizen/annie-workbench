# WO-34：文件夹浏览/解析端点（Electron 兼容）

> 来源（Vera 拍板 2026-08-14）：F-16 v3——目录选择器走 provider 抽象，Electron 打包只换实现不重做。
> **本单执行范围（2026-08-14 拍板后修订）：parse + browse 都做**——AI Studio 前端 (42) 已按 browse 契约实现文件夹树弹窗（folderPicker provider 抽象），后端 browse 必须就位；Electron 落地时经 provider 切原生选择器，browse 保留为 Web 过渡（标注 TODO(WO-05)）。revoke 响应已对齐前端契约 {success, message}。
> 后端要点：`POST /api/cases/{id}/folder` 已兼容绝对/相对路径（WO-29 validate_path_safety）；本单补两个辅助端点。
> 执行方：Codex。检查方：Codex 自检。

## 技术约束
- 安全：browse/parse 均限定 CLIENT_FILES_ROOT 内（复用 validate_path_safety）；拒绝越界/穿越；只读
- `browse` 为 **Web 过渡**（Electron 原生选择器 WO-05 替代），代码标注 `# TODO(WO-05): Electron 原生目录选择器后 browse 可下线`
- `parse` 为**两模式共用**（预填必需）
- 新代码文件 ≤200 行；无新依赖；不碰前端

## 改动范围（严禁超出）
| 文件 | 操作 | 锚点 |
| server/api/folders.py | **新建** | GET /api/folders/browse?path=（列 CLIENT_FILES_ROOT 下子目录，隐藏文件/目录过滤）；GET /api/folders/parse?path=（命名解析） |
| core/case_engine/folder.py | 修改 | +parse_folder_naming(rel_path) -> {client_name?, broker_name?, case_id?}（三段结构 broker/client/case-id；末段清理兜底） |
| server/main.py | 修改 | 注册 folders 路由 |
| server/api/schemas.py | 修改 | FolderBrowseResponse / FolderParseResponse |
| tests/test_api/test_folder_browse_parse.py | **新建** | ≥8 用例 |

⚠️ 严禁修改：core/models/orm.py、config/agent_flows/*.yaml、core/chat/loop.py、前端 ui/。

## 设计
### GET /api/folders/browse?path=<rel>
- 默认列出 CLIENT_FILES_ROOT 根；path 为相对子目录 → 列出其直接子目录（dirs only，排除隐藏/忽略名）
- 越界/穿越/不存在 → 422（可读原因）
- 响应：{ path, entries: [{name, rel_path, has_subdirs}] }（不递归，前端逐级进入）
- `# TODO(WO-05): Electron 原生目录选择器后此端点可下线`

### GET /api/folders/parse?path=<rel|abs>
- 解析命名 → { client_name?, broker_name?, case_id? }
- 规则：按 "/" 分段，≥3 段 → broker/client/case-id；取末段清理（去下划线/连字符/末尾数字）兜底为 client_name
- 不校验路径存在（纯命名解析）；越界/穿越 → 422

## 测试（≥8）
1. browse 根目录列出子目录（tmp CLIENT_FILES_ROOT 造目录）
2. browse 进入子目录（path 相对）→ 列出其子目录
3. browse 越界（../）/不存在 → 422
4. browse 忽略隐藏/文件（只列目录）
5. parse 三段命名 → client_name/broker_name/case_id 全解析
6. parse 两段/单段 → 末段清理兜底 client_name
7. parse 越界 → 422
8. 契约：响应字段形状符合 schemas

## 验收标准
- 专项 8 用例全绿；`pytest tests/ -q` → 901 基线 + 新增，0 failed / 0 skipped
- ruff（本单文件）→ All checks passed
- TestClient：browse 三层路径 + parse 三/两段 + 越界 422 实测
- 前端零改动（git diff 核对）

## 提交建议
git add server/api/folders.py server/main.py server/api/schemas.py core/case_engine/folder.py tests/test_api/test_folder_browse_parse.py docs/flash_specs/wo-34-folder-browse-parse.md
git commit -m "feat: WO-34 文件夹浏览/解析端点 — browse（Web 过渡，TODO WO-05）+ parse 命名预填（Electron 兼容）"