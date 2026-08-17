# 发布流程（release_workflow）

> 适用于 vera-workbench 本地单机发布。前端由 Google AI Studio 线交付（ui/vera-工作台 (N)），后端由 opencode/Codex 施工。

## 发布前检查（门禁）

1. **全量测试**：`python -m pytest tests/ -q` → 0 failed / 0 skipped
2. **ruff**：`python -m ruff check core/ server/ tools/`（本单文件）→ All checks passed
3. **迁移**：`python -m alembic upgrade head` → current = head；`python -m tools.migrate_lender_keys --dry-run` → 全 0
4. **启动自检**：`python run_backend.py` 能起，`/api/health` config_ok=true
5. **端到端联调**：按 docs/e2e_checklist.md 走一遍（建案/任务/SSE/草稿/通知/计算器/申报检查/能力中心）
6. **OCR 运行依赖（WO-45 起）**：`.env` 必须配 `TESSDATA_PREFIX`（指向含 eng.traineddata 的目录）或已安装 Tesseract；
   联调加一步"扔一张图片/扫描 PDF → 识别出文字"（不配置则静默走占位兜底，界面看不出但识别为空）

## 版本号三处同步

- `pyproject.toml` → `version`
- `server/main.py` → `APP_VERSION`（启动/健康使用）
- `server/api/admin.py` → `/api/version` 返回的硬编码版本（必须与 APP_VERSION 一致）
- `ui/vera-工作台 (N)/package.json` → `version`（前端线，随 AI Studio 交付同步）

## 发布步骤

1. 版本号三处同步 + CHANGELOG 追加条目
2. 跑全部门禁（见上）
3. 提交：`git commit -m "release: vX.Y.Z — 描述"`
4. 打标签：`git tag vX.Y.Z`
5. 前端：AI Studio 交付最新文件夹后，把 `ui/vera-工作台 (N)` 作为当前前端版本基线（不入 git；由用户侧管理）

## Electron 封装（2026-08-17 起，方案见 docs/Electron封装方案_2026-08-17.md）

### 启动方式

- **生产模式**（加载前端 dist + 自动拉起后端）：`cd electron && npm run start`
  - 自动探测 `.venv` python → spawn `run_backend.py` → 轮询 `/api/health` 就绪后显示窗口；
  - 端口 8000 被占用自动换 8000-8010；关闭按钮默认最小化到托盘，托盘"退出"完全退出并清理后端进程；
  - 首次启动若 `.env` 缺失 → 引导选择 CLIENT_FILES_ROOT 并生成 `.env`。
- **开发模式**（前端 vite dev 3000 + 后端）：先 `ui/vera-工作台 (N)` 里 `npm run dev`，
  再 `cd electron && npm run dev`。

### 打包

- 前置：`ui/vera-工作台 (N)/npm run build` 生成 dist（electron-builder 会打进 `resources/web`）；
- `cd electron && npm run dist`（生成 NSIS 安装包 + portable 便携版到 `electron/release/`）；
- 快速验证：`npm run dist:dir`（只出 `release/win-unpacked` 免安装目录）。
- **`npm run build-web`**：打包前自动用 `vite build --base=./` 构建前端 dist（相对路径，
  修复 Electron file:// 白屏）。**不要依赖前端 vite.config.ts 的 base 字段**——AI Studio
  交付新前端时可能不带 base，构建用 CLI 参数强制覆盖即可。
- **已知限制（2026-08-17）**：Windows 上 winCodeSign 解压需创建符号链接，普通权限会失败；
  可设 `CSC_IDENTITY_AUTO_DISCOVERY=false` + `--config.win.signAndEditExecutable=false`
  跳过签名打包（产物未签名，正式分发时需补代码签名证书）。
- Python 后端随应用：V1 为外部 Python（spawn 已装 venv），PyInstaller 内嵌列为 V2 优化。

### 前端配合

- 窗口按钮（最小化/最大化/关闭）由 TopNavBar 条件渲染（F-44，检测 `window.veraElectron`）；
- 前端 API 地址：http.ts 优先读 `window.veraElectron.apiBase`（Electron 注入），否则默认
  `http://localhost:8000`。

## 红线提醒

- `data/`、`.env` 绝不提交 git
- 客户文件/ PII 不进入任何外部 API（脱敏闸门）
- AI 只出草稿，发送/递交必须 Vera 确认
