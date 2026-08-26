# WO-89: 自动更新全局状态持久化与静默下载体验升级

## 一、背景与问题
- **问题**：目前更新状态保存在 `AppUpdateCard.tsx` 局部 `useState` 中，用户切到其他页面时组件卸载导致状态丢失，切回后误以为下载中断；且手动下载期间无全局感知。

## 二、架构设计与契约
1. **全局 Store (`frontend/src/stores/updateStore.ts`)**：
   - 托管 `checking`、`downloading`、`updateAvailable`、`updateDownloaded`、`statusMessage` 全局状态。
   - `initListeners()` 在应用顶层全局注册，页面切换永不断流。
2. **顶层就绪条 (`frontend/src/components/layout/AppShell.tsx`)**：
   - 挂载更新全局监听。
   - 当 `updateDownloaded === true` 时，在顶栏或浮动状态栏展示微交互提示「🎉 新版本已就绪，点击重启生效」。
3. **设置卡片精简 (`frontend/src/components/settings/AppUpdateCard.tsx`)**：
   - 连接全局 `useUpdateStore`，状态无缝保持。
4. **Electron 主进程 (`electron/main.js`)**：
   - 优化 `autoUpdater.autoDownload = true`，实现启动 8 秒后全自动静默后台差分拉取。
5. **版本升级**:
   - `pyproject.toml` (2.3.2 -> 2.3.3)
   - `frontend/package.json` (2.3.2 -> 2.3.3)
   - `electron/package.json` (2.3.2 -> 2.3.3)
   - `server/main.py` (`APP_VERSION = "2.3.3"`)

## 三、验收标准
- `tsc --noEmit` & `vite build` 0 error。
- 打包并发布 `v2.3.3` 至 GitHub Release。
