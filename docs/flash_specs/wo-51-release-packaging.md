# WO-51 正式发布收尾 — 执行规范

## 技术约束

- 后端：Python 3.11+ / FastAPI；打包：electron-builder 24.x（electron/ 目录）
- 禁止：引入任何新的 pip/npm 依赖
- 禁止：创建"改动范围"表以外的文件；禁止修改表以外文件
- 打包命令必须在 Windows 本机（D:\vera-workbench）执行，需要提权（写 release/、读 AppData）
- Node/npm 用 `C:\Users\Yaruo\AppData\Roaming\uv\python\cpython-3.11-windows-x86_64-none\python.exe`
  与临时 node 运行时（`$env:TEMP\codex-node-80\bin\npm.cmd`）；若临时目录不存在，
  从 `C:\Program Files\WindowsApps\OpenAI.Codex_26.810.7004.0_x64__2p2nqsd0c76g0\app\resources\cua_node`
  复制一份到 `$env:TEMP\codex-node-80`

## 背景

前端 (85) 已验收、后端最新（WO-50 存量导入/闭环/master_id/V4/热重载/OCR 全内置）。
本单：正式发布前的版本同步、图标、安装包产物与门禁固化。

## 改动范围（严禁超出）

| 文件 | 操作 | 锚点 |
|------|------|------|
| `electron/package.json` | 修改 | version 字段（当前 2.0.0） |
| `server/api/admin.py` | 修改 | `VersionInfo(version="2.1.0")`（约 L13） |
| `ui/vera-工作台 (85)/package.json` | 修改 | version 字段（当前 2.0.0） |
| `CHANGELOG.md` | 修改 | 文件头部新增发布条目 |
| `electron/build/app.ico` | 新增 | 待 Vera 提供；缺失时跳过并标注 |
| `electron/release/`（产物） | 生成 | NSIS 安装版 + zip 便携版 |
| `docs/release_workflow.md` | 修改 | 补充本机打包步骤（如已覆盖则跳过） |

⚠️ 版本号由 Vera 拍板：本单用 `{VERSION}` 占位，Vera 确认后统一替换
（建议 2.1.0 或 2.2.0；三处必须一致）。
⚠️ 严禁修改上表以外文件；严禁改动业务代码逻辑。

## 接口契约

无新 API。版本号三处必须逐字一致：`electron/package.json.version` =
`server/api/admin.py VersionInfo.version` = `ui/vera-工作台 (85)/package.json.version` =
`CHANGELOG.md` 顶部条目号。

## 实施步骤

### Step 1：版本号三处同步 + CHANGELOG

- [ ] 文件：`electron/package.json`、`server/api/admin.py`、`ui/vera-工作台 (85)/package.json`、`CHANGELOG.md`
- [ ] 把三处 version 统一改为 `{VERSION}`（Vera 确认）
- [ ] `CHANGELOG.md` 顶部新增：
  ```
  ## {VERSION}（2026-08-18）
  ### 新增
  - 存量导入（WO-50）：Broker Notes 画像识别 + Send to * 平台递交状态 + 清单别名匹配
  - 案件闭环管理：撤回/终止/暂停/换行重递 + 恢复/解封/删除
  - 材料清单 AI 推荐 + master_id 关联（文件自动匹配）
  ### 修复
  - 设置页 Key 保存真正热重载；统计活跃案件数含当日新案
  - DeepSeek 模型名跟进 V4（deepseek-v4-flash）
  - 自包含便携打包：内置 Python 运行时 + OCR 语言包 + 空数据交付
  ```
- [ ] 验证：`rg -n "2\.[0-9]+\.[0-9]+" electron/package.json server/api/admin.py "ui/vera-工作台 (85)/package.json" | Select-Object -First 6` 三处一致

### Step 2：应用图标（阻塞项，待 Vera 提供）

- [ ] 文件：`electron/build/app.ico`（新增，Vera 提供 256×256 ico）
- [ ] 若 Vera 尚未提供：在报告中标注"图标缺失，使用默认 Electron 图标"，跳过构建图标步骤，不阻塞其他 Step
- [ ] 验证：`Get-Item electron/build/app.ico` 存在（提供后）

### Step 3：构建安装包产物

- [ ] 前置：Electron 路径已指向 `ui/vera-工作台 (85)`（main.js DIST_DIR + package.json
  build-web + extraResources.from 三处）；未指向则先同步（这属于本单允许的"打包路径同步"，仅改路径字符串）
- [ ] 构建前端：`$env:VITE_USE_MOCK="false"; npm run build -- --base=./ --mode production`（在
  `D:\vera-workbench\ui\vera-工作台 (85)`，用临时 node 运行时）
- [ ] 组装 staging：`powershell -NoProfile -ExecutionPolicy Bypass -File
  D:\vera-workbench\electron\prepare-package.ps1 -SkipBuild`
- [ ] 打包 win-unpacked：`npx electron-builder --dir --config.win.signAndEditExecutable=false`
  （`$env:CSC_IDENTITY_AUTO_DISCOVERY="false"`）
- [ ] 打包 NSIS 安装版：`npx electron-builder --win nsis --config.win.signAndEditExecutable=false`
  → 产物 `release/{ProductName} Setup {VERSION}.exe`
- [ ] 打包便携 zip：把 `release/win-unpacked/` 压缩为
  `release/VeraWorkbench-{VERSION}-portable.zip`（保留目录结构，zip 根为 win-unpacked 内容）
- [ ] **若 NSIS/portable 报 "The batch file cannot be found"**：先报告错误，
  不自行更换工具链；排查方向：electron-builder 缓存目录
  `C:\Users\Yaruo\AppData\Local\electron-builder\Cache\nsis` 是否完整、makensis 路径是否含中文
- [ ] 验证：`Get-ChildItem electron\release -Filter "*.exe"` 与 `*.zip` 存在且体积 > 100MB

### Step 4：发布前门禁

- [ ] `pytest tests/ -q --basetemp="$env:TEMP\pytest-release"`（PYTHONPATH=
  `D:\vera-workbench\.venv\Lib\site-packages`，TESSDATA_PREFIX=
  `C:\Users\Yaruo\AppData\Local\Temp\py311embed\tessdata`）→ 全绿（基线 1128+）
- [ ] `ruff check`（本次改动文件 + 关键模块）→ All checks passed
- [ ] `npx tsc --noEmit`（ui/vera-工作台 (85)）→ 零错误

## 验收标准

### 自动验证
- 版本号三处一致 + CHANGELOG 有 `{VERSION}` 条目
- `release/` 下存在 NSIS 安装包（.exe）与便携 zip，均 > 100MB
- 全量 pytest 全绿、ruff 全绿、tsc 零错误

### 手动验证
1. 双击 NSIS 安装包 → 安装到默认目录 → 启动应用 → 健康页正常、案件列表显示既有数据
2. 解压便携 zip → 运行 `Vera 工作台.exe` → 首次启动自动建库迁移（空数据）→ 界面正常
3. 安装版/便携版设置页可配置 DeepSeek Key 并保存生效（热重载）

---
⚠️ 执行纪律：
1. 只修改"改动范围"表文件；业务代码逻辑零改动
2. 版本号三处必须与 Vera 确认的 `{VERSION}` 完全一致
3. 每 Step 完成立即验证；失败停下报告，不自作主张换方案
4. 打包命令需要本机提权；网络不可用时不下载任何工具
5. 产物不 commit（release/ 在 .gitignore 内）；代码改动（版本号/CHANGELOG）才 commit
