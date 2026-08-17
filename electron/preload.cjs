/* Vera 工作台 — preload：安全暴露窗口控制/版本/API 地址 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('veraElectron', {
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
});
