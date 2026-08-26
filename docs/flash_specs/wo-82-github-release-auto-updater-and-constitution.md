# WO-82 GitHub Release 自动更新通道打通 + 偏好设置检查入口 + 宪法发布标准 — 施工单

> **状态**：待执行
> **关联**：`electron/preload.cjs`、`electron/main.js`、`frontend/src/pages/Settings.tsx`、`AGENTS.md`
> **目标**：① 在 `preload.cjs` 暴露更新检查与安装 IPC 接口；② 在前端「设置」页面增加原生「软件版本与自动更新」卡片（支持手动检查、静默下载与重启安装）；③ 将全自动更新与 GitHub Release 发布标准写入《项目宪法》（`AGENTS.md` 第十一章）。

---

## 一、技术约束与边界 (Tech Stack & Boundary)

- **前端**：React 18 / TypeScript / Tailwind CSS 语义化变量（`var(--bg-*)`、`var(--green)`、`var(--purple)`）；
- **Electron 桥接**：`window.veraElectron.checkForUpdates()`, `downloadUpdate()`, `installUpdate()`；
- **环境自适应**：在 Web 浏览器模式下展示版本号并提示“当前为 Web 开发端，桌面版支持一键静默热更新”；在打包 Electron 客户端中全功能运作；
- **宪法更新**：遵循单一真源，清晰规范版本号四处同步、Release 上传三件套（`Setup.exe`、`.blockmap`、`latest.yml`）与发布命令。

---

## 二、改动范围

| 序号 | 文件路径 | 操作 | 说明 |
|---|---|---|---|
| 1 | `electron/preload.cjs` | 修改 | 暴露 `checkForUpdates`, `downloadUpdate`, `installUpdate`, `onUpdateAvailable`, `onUpdateDownloaded` |
| 2 | `frontend/src/components/settings/AppUpdateCard.tsx` | 新建 | 软件版本与自动更新卡片（版本展示、检查更新、下载进度、重启生效） |
| 3 | `frontend/src/pages/Settings.tsx` | 修改 | 引入并挂载 `AppUpdateCard` |
| 4 | `AGENTS.md` | 修改 | 在第十一章「版本发布与升级规范」中补全 GitHub Release 自动更新发版规范与操作手册 |

---

## 三、原子化实施步骤 (Atomic Task Checklist)

- [ ] **Step 1**：更新 `electron/preload.cjs`，补充自动更新 IPC 桥接；
- [ ] **Step 2**：新建 `frontend/src/components/settings/AppUpdateCard.tsx` 并在 `Settings.tsx` 中呈现；
- [ ] **Step 3**：更新项目最高宪法 `AGENTS.md` 第十一章；
- [ ] **Step 4**：前端构建验证（`npx tsc --noEmit` + `npm run build`）；
- [ ] **Step 5**：Git 提交与收工汇报。
