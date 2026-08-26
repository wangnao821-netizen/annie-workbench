import { create } from 'zustand';
import { useToastStore } from './toastStore';

export interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
}

interface UpdateState {
  currentVersion: string;
  checking: boolean;
  downloading: boolean;
  updateAvailable: UpdateInfo | null;
  updateDownloaded: boolean;
  statusMessage: string | null;

  setCurrentVersion: (v: string) => void;
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => void;
  initListeners: () => () => void;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  currentVersion: '2.3.2',
  checking: false,
  downloading: false,
  updateAvailable: null,
  updateDownloaded: false,
  statusMessage: null,

  setCurrentVersion: (v: string) => set({ currentVersion: v }),

  initListeners: () => {
    const electron = (window as any).veraElectron;
    if (!electron) return () => {};

    // 1. 初始化当前版本
    electron.getVersion?.().then((v: string) => {
      if (v) set({ currentVersion: v });
    }).catch(() => {});

    // 2. 注册全局事件监听
    const unsubs = [
      electron.onUpdateAvailable?.((info: UpdateInfo) => {
        set({
          updateAvailable: info,
          statusMessage: `发现新版本 v${info.version}`,
        });
      }),
      electron.onUpdateDownloaded?.((info: UpdateInfo) => {
        set({
          updateDownloaded: true,
          downloading: false,
          statusMessage: `新版本 v${info.version} 已下载完成`,
        });
        useToastStore.getState().showToast('success', `🎉 Annie v${info.version} 更新包已就绪，重启软件即可生效！`);
      }),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub && typeof unsub === 'function' && unsub());
    };
  },

  checkForUpdates: async () => {
    const electron = (window as any).veraElectron;
    if (!electron || !electron.checkForUpdates) {
      set({ statusMessage: '当前运行在 Web 开发端模式（打包桌面版支持一键全自动静默热更新）' });
      useToastStore.getState().showToast('info', '当前为 Web 浏览器端，桌面客户端已开启自动更新通道');
      return;
    }

    set({ checking: true, statusMessage: null });
    try {
      const res = await electron.checkForUpdates();
      if (res.status === 'dev_mode') {
        set({ statusMessage: '开发模式下已跳过自动更新' });
      } else if (res.status === 'ok' && res.updateInfo) {
        set({
          updateAvailable: res.updateInfo,
          statusMessage: `发现新版本 v${res.updateInfo.version}`,
        });
        useToastStore.getState().showToast('info', `发现新版本 v${res.updateInfo.version}`);
      } else if (res.status === 'error') {
        const cleanMsg = res.message?.includes('404')
          ? '未发现新版本或发布通道同步中 (HTTP 404)'
          : (res.message || '网络无法连接到 GitHub Release');
        set({ statusMessage: `检查更新提示: ${cleanMsg}` });
      } else {
        const cur = get().currentVersion;
        set({ statusMessage: `已经是最新版本 (v${cur})，无需更新` });
        useToastStore.getState().showToast('success', `已是最新版本 v${cur}`);
      }
    } catch (err: any) {
      const cleanMsg = err?.message?.includes('404')
        ? '未发现新版本或发布通道同步中 (HTTP 404)'
        : (err?.message || '未知错误');
      set({ statusMessage: `检查更新提示: ${cleanMsg}` });
    } finally {
      set({ checking: false });
    }
  },

  downloadUpdate: async () => {
    const electron = (window as any).veraElectron;
    if (!electron || !electron.downloadUpdate) return;

    set({ downloading: true });
    try {
      await electron.downloadUpdate();
      useToastStore.getState().showToast('info', '正在后台静默下载新版本安装包...');
    } catch (err: any) {
      set({ downloading: false });
      useToastStore.getState().showToast('error', `下载失败: ${err?.message}`);
    }
  },

  installUpdate: () => {
    const electron = (window as any).veraElectron;
    if (!electron || !electron.installUpdate) return;
    electron.installUpdate();
  },
}));
