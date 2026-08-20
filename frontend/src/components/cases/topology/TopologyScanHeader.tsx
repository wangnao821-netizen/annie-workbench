import { motion, useReducedMotion } from 'motion/react';
import {
  FolderSearch,
  HardDrive,
  Sparkles,
  RefreshCw,
  FolderTree,
} from 'lucide-react';

interface TopologyScanHeaderProps {
  folderPath: string;
  setFolderPath: (path: string) => void;
  scanning: boolean;
  onScan: (path: string) => void;
  hasScanResult: boolean;
}

export function TopologyScanHeader({
  folderPath,
  setFolderPath,
  scanning,
  onScan,
  hasScanResult,
}: TopologyScanHeaderProps) {
  const reduced = useReducedMotion();

  const handleBrowseFolder = async () => {
    if (typeof window !== 'undefined' && window.veraElectron?.chooseDirectory) {
      // Electron 桌面端直通原生文件选择器
      try {
        const selected = await window.veraElectron.chooseDirectory();
        if (selected) {
          setFolderPath(selected);
          onScan(selected);
        }
      } catch (err) {
        console.error('Electron chooseDirectory error:', err);
      }
    } else {
      // Web 浏览器下直接高亮并聚焦到路径输入框
      const inputEl = document.getElementById('topology-scan-path-input') as HTMLInputElement;
      if (inputEl) {
        inputEl.focus();
        inputEl.select();
      }
    }
  };

  return (
    <div className="space-y-3">
      {/* 路径输入与控制条 */}
      <div
        className="p-3.5 rounded-2xl border space-y-2.5 transition-all"
        style={{
          backgroundColor: 'var(--bg-panel)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold flex items-center space-x-1.5" style={{ color: 'var(--text-primary)' }}>
            <FolderSearch className="w-4 h-4" style={{ color: 'var(--purple)' }} />
            <span>客户案卷大根目录 (Clients Multi-Root Directory)</span>
          </label>
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-bold"
            style={{
              backgroundColor: 'var(--purple-soft)',
              color: 'var(--purple)',
            }}
          >
            ★ 支持 600+ 客户大根目录与多案卷分流
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onScan(folderPath);
                }
              }}
              placeholder="例如: D:\rblenginghard\Brandon He\SynologyDrive\Boning He (Brandon) Client 或 D:\...\Yingkun CHEN"
              className="w-full pl-8 pr-3 py-2 rounded-xl border font-mono text-xs outline-none transition-colors"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
              id="topology-scan-path-input"
            />
            <HardDrive className="w-3.5 h-3.5 absolute left-2.5 top-2.5" style={{ color: 'var(--text-muted)' }} />
          </div>

          <motion.button
            whileTap={reduced ? undefined : { scale: 0.97 }}
            type="button"
            onClick={handleBrowseFolder}
            className="px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center space-x-1.5 cursor-pointer shrink-0 transition-colors"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
            id="topology-browse-btn"
          >
            <FolderSearch className="w-3.5 h-3.5" style={{ color: 'var(--purple)' }} />
            <span>浏览目录</span>
          </motion.button>

          <motion.button
            whileTap={reduced ? undefined : { scale: 0.97 }}
            type="button"
            disabled={scanning || !folderPath.trim()}
            onClick={() => onScan(folderPath)}
            className="px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 transition-all shrink-0 shadow-xs"
            style={{
              backgroundColor: 'var(--purple)',
              color: 'var(--on-purple)',
            }}
            id="topology-scan-trigger-btn"
          >
            {scanning ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>扫描中...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>开始扫描</span>
              </>
            )}
          </motion.button>
        </div>
      </div>

      {/* 未扫描时的引导区 */}
      {!scanning && !hasScanResult && (
        <div
          className="p-5 rounded-2xl border space-y-4"
          style={{
            backgroundColor: 'var(--bg-panel)',
            borderColor: 'var(--border)',
          }}
        >
          {/* 大卡片点击区 */}
          <div
            onClick={handleBrowseFolder}
            className="p-5 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center space-y-2.5 cursor-pointer transition-all text-center hover:opacity-95"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--purple)',
            }}
          >
            <div
              className="p-3 rounded-2xl flex items-center justify-center shadow-xs"
              style={{
                backgroundColor: 'var(--purple-soft)',
                color: 'var(--purple)',
              }}
            >
              <FolderTree className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-xs font-extrabold" style={{ color: 'var(--text-primary)' }}>
                点击选择客户大根目录 (如 D:\rblenginghard\...\Boning He Client)
              </h4>
              <p className="text-[11px] pt-0.5" style={{ color: 'var(--text-secondary)' }}>
                支持 600+ 客户两层树状拓扑扫描，自动识别多案卷客户、单案卷客户与潜客并推荐在途主案
              </p>
            </div>
          </div>

          {/* 4 项全自动化能力清单 */}
          <div className="space-y-1.5">
            <h5 className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              ✦ 扫描后系统将自动完成两层智能识别：
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="p-2.5 rounded-xl border space-y-0.5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <div className="font-bold text-[11px] flex items-center space-x-1" style={{ color: 'var(--text-primary)' }}>
                  <span>🏛️</span>
                  <span>两层客户 ➔ 案卷树状分流</span>
                </div>
                <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  精准区分多案卷客户、标准单案卷及潜客，提取渠道推荐人与联名借款人。
                </p>
              </div>

              <div className="p-2.5 rounded-xl border space-y-0.5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <div className="font-bold text-[11px] flex items-center space-x-1" style={{ color: 'var(--text-primary)' }}>
                  <span>🌟</span>
                  <span>推荐主力在途案卷打标</span>
                </div>
                <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  智能甄别最新活跃在途案卷与历史已结案/撤回案卷，提供一键默认勾选策略。
                </p>
              </div>

              <div className="p-2.5 rounded-xl border space-y-0.5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <div className="font-bold text-[11px] flex items-center space-x-1" style={{ color: 'var(--text-primary)' }}>
                  <span>📋</span>
                  <span>Broker Notes 事实画像提取</span>
                </div>
                <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  自动解析 Notes，提取拟贷金额、估值、工作性质与财务目标。
                </p>
              </div>

              <div className="p-2.5 rounded-xl border space-y-0.5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <div className="font-bold text-[11px] flex items-center space-x-1" style={{ color: 'var(--text-primary)' }}>
                  <span>📁</span>
                  <span>11 级材料秒级自动匹配</span>
                </div>
                <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  将目录现有材料秒级对齐澳洲主流银行标准清单并打勾确认。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
