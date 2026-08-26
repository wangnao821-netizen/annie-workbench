import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Sparkles,
  RefreshCw,
  DownloadCloud,
  CheckCircle2,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';

interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
}

export function AppUpdateCard() {
  const reduced = useReducedMotion();
  const showToast = useToastStore((s) => s.showToast);

  const [currentVersion, setCurrentVersion] = useState<string>('2.2.0');
  const [checking, setChecking] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [updateDownloaded, setUpdateDownloaded] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const electron = (window as any).veraElectron;
    if (electron) {
      electron.getVersion?.().then((v: string) => {
        if (v) setCurrentVersion(v);
      }).catch(() => {});

      // 监听桌面端更新事件
      const unsubs = [
        electron.onUpdateAvailable?.((info: any) => {
          setUpdateAvailable(info);
          setStatusMessage(`发现新版本 v${info.version}`);
        }),
        electron.onUpdateDownloaded?.((info: any) => {
          setUpdateDownloaded(true);
          setDownloading(false);
          setStatusMessage(`新版本 v${info.version} 已下载完成`);
          showToast('success', `🎉 Annie v${info.version} 更新包已就绪，重启软件即可生效！`);
        }),
      ];

      return () => {
        unsubs.forEach((unsub) => unsub && typeof unsub === 'function' && unsub());
      };
    }
  }, []);

  const handleCheckUpdate = async () => {
    const electron = (window as any).veraElectron;
    if (!electron || !electron.checkForUpdates) {
      setStatusMessage('当前运行在 Web 开发端模式（打包桌面版支持一键全自动静默热更新）');
      showToast('info', '当前为 Web 浏览器端，桌面客户端已开启自动更新通道');
      return;
    }

    setChecking(true);
    setStatusMessage(null);
    try {
      const res = await electron.checkForUpdates();
      if (res.status === 'dev_mode') {
        setStatusMessage('开发模式下已跳过自动更新');
      } else if (res.status === 'ok' && res.updateInfo) {
        setUpdateAvailable(res.updateInfo);
        showToast('info', `发现新版本 v${res.updateInfo.version}`);
      } else if (res.status === 'error') {
        setStatusMessage(`检查更新失败: ${res.message || '网络无法连接到 GitHub Release'}`);
      } else {
        setStatusMessage(`已经是最新版本 (v${currentVersion})，无需更新`);
        showToast('success', `已是最新版本 v${currentVersion}`);
      }
    } catch (err: any) {
      setStatusMessage(`检查更新失败: ${err?.message || '未知错误'}`);
    } finally {
      setChecking(false);
    }
  };

  const handleDownloadUpdate = async () => {
    const electron = (window as any).veraElectron;
    if (!electron || !electron.downloadUpdate) return;
    setDownloading(true);
    try {
      await electron.downloadUpdate();
      showToast('info', '正在后台静默下载新版本安装包...');
    } catch (err: any) {
      setDownloading(false);
      showToast('error', `下载失败: ${err?.message}`);
    }
  };

  const handleInstallNow = () => {
    const electron = (window as any).veraElectron;
    if (!electron || !electron.installUpdate) return;
    electron.installUpdate();
  };

  return (
    <div
      className="rounded-2xl p-6 border space-y-4 shadow-2xs"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      id="app-update-settings-card"
    >
      <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shadow-xs"
            style={{ backgroundColor: 'var(--green-soft)', color: 'var(--green)' }}
          >
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
              🚀 软件版本与自动更新 (Software Version & Auto Update)
            </h3>
            <p className="text-[11px] text-muted">
              基于 GitHub Release 全自动差分增量升级，保留全部历史案件数据
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-[var(--green-soft)] text-[var(--green)]">
            v{currentVersion} Stable
          </span>
        </div>
      </div>

      <div className="space-y-3 text-xs">
        <div className="p-4 rounded-xl border bg-[var(--bg-app)] space-y-3" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center space-x-2 font-bold" style={{ color: 'var(--text-primary)' }}>
                <ShieldCheck className="w-4 h-4 text-[var(--green)]" />
                <span>当前安装版本：v{currentVersion}</span>
              </div>
              <p className="text-[11px] text-muted">
                托管渠道：GitHub Releases（everstones/annie-workbench · 全球加速 CDN）
              </p>
            </div>

            <div className="flex items-center space-x-2">
              {!updateDownloaded && (
                <motion.button
                  whileTap={reduced ? undefined : { scale: 0.95 }}
                  onClick={handleCheckUpdate}
                  disabled={checking || downloading}
                  className="px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center space-x-1.5 cursor-pointer bg-[var(--bg-card)] hover:border-[var(--green)] text-[var(--text-primary)] transition-all disabled:opacity-50"
                  style={{ borderColor: 'var(--border)' }}
                  id="check-update-btn"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin text-[var(--green)]' : 'text-muted'}`} />
                  <span>{checking ? '正在检查...' : '🔍 检查新版本'}</span>
                </motion.button>
              )}

              {updateAvailable && !updateDownloaded && (
                <motion.button
                  whileTap={reduced ? undefined : { scale: 0.95 }}
                  onClick={handleDownloadUpdate}
                  disabled={downloading}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-[var(--green)] hover:opacity-90 flex items-center space-x-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                  id="download-update-btn"
                >
                  <DownloadCloud className="w-3.5 h-3.5" />
                  <span>{downloading ? '正在下载更新包...' : `⬇️ 下载 v${updateAvailable.version}`}</span>
                </motion.button>
              )}

              {updateDownloaded && (
                <motion.button
                  whileTap={reduced ? undefined : { scale: 0.95 }}
                  onClick={handleInstallNow}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-[var(--green)] hover:opacity-90 flex items-center space-x-1.5 cursor-pointer shadow-md animate-pulse"
                  id="install-update-btn"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>🔄 立即重启并应用更新</span>
                </motion.button>
              )}
            </div>
          </div>

          {statusMessage && (
            <div className="pt-2 border-t text-[11px] flex items-center space-x-1.5 text-muted" style={{ borderColor: 'var(--border)' }}>
              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--green)] flex-shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] text-muted">
          <div className="p-3 rounded-xl border bg-[var(--bg-app)] space-y-1" style={{ borderColor: 'var(--border)' }}>
            <span className="font-bold text-[var(--text-primary)] block">⚡ 静默差分升级</span>
            <p>每次启动时自动检查最新版本，采用 blockmap 差分算法只下载更新文件，几秒内即可在后台静默下载完毕。</p>
          </div>
          <div className="p-3 rounded-xl border bg-[var(--bg-app)] space-y-1" style={{ borderColor: 'var(--border)' }}>
            <span className="font-bold text-[var(--text-primary)] block">🛡️ 数据绝对隔离</span>
            <p>升级过程只覆盖程序核心代码，数据库文件（`assistant.db`）与客户资料目录永久隔离，100% 保证数据安全。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
