import { motion, useReducedMotion } from 'motion/react';
import {
  Sparkles,
  RefreshCw,
  DownloadCloud,
  CheckCircle2,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { useUpdateStore } from '../../stores/updateStore';

export function AppUpdateCard() {
  const reduced = useReducedMotion();
  const {
    currentVersion,
    checking,
    downloading,
    updateAvailable,
    updateDownloaded,
    statusMessage,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  } = useUpdateStore();

  const handleCheckUpdate = () => {
    checkForUpdates();
  };

  const handleDownloadUpdate = () => {
    downloadUpdate();
  };

  const handleInstallNow = () => {
    installUpdate();
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
                托管渠道：GitHub Releases（wangnao821-netizen/annie-workbench · 全球加速 CDN）
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
