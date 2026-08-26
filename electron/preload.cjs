/* Annie 工作台 — preload：安全暴露窗口控制/版本/API 地址/自动更新 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('veraElectron', {
  // 静态默认 API 地址（http.ts 同步读取；后端优先 8000，被占用时主进程会动态改端口）
  apiBase: 'http://127.0.0.1:8000',
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  getVersion: () => ipcRenderer.invoke('app:version'),
  getApiBase: () => ipcRenderer.invoke('app:api-base'),
  isMaximized: () => ipcRenderer.invoke('app:is-maximized'),
  chooseDirectory: () => ipcRenderer.invoke('dialog:choose-directory'),
  notify: (title, body) => ipcRenderer.invoke('notify:show', { title, body }),
  onMaximizedChange: (cb) => {
    const listener = (_e, maximized) => cb(maximized);
    ipcRenderer.on('window-maximized-changed', listener);
    return () => ipcRenderer.removeListener('window-maximized-changed', listener);
  },

  // 自动更新通道
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdateAvailable: (cb) => {
    const listener = (_e, info) => cb(info);
    ipcRenderer.on('updater:available', listener);
    return () => ipcRenderer.removeListener('updater:available', listener);
  },
  onUpdateDownloaded: (cb) => {
    const listener = (_e, info) => cb(info);
    ipcRenderer.on('updater:downloaded', listener);
    return () => ipcRenderer.removeListener('updater:downloaded', listener);
  },
});
