import { motion, useReducedMotion } from 'motion/react';
import {
  Check,
  Sparkles,
  RefreshCw,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface TopologyImportActionBarProps {
  totalCasesCount: number;
  selectedCount: number;
  selectedClientsCount: number;
  onSelectRecommendedOnly: () => void;
  onSelectAllFiltered: () => void;
  onClearSelection: () => void;
  isImporting: boolean;
  importProgress: number;
  importProgressText: string;
  onImport: () => void;
  onClose?: () => void;
}

export function TopologyImportActionBar({
  totalCasesCount,
  selectedCount,
  selectedClientsCount,
  onSelectRecommendedOnly,
  onSelectAllFiltered,
  onClearSelection,
  isImporting,
  importProgress,
  importProgressText,
  onImport,
  onClose,
}: TopologyImportActionBarProps) {
  const reduced = useReducedMotion();

  return (
    <div
      className="p-4 rounded-2xl border shadow-lg sticky bottom-0 z-20 space-y-3"
      style={{
        backgroundColor: 'var(--surface-translucent)',
        borderColor: 'var(--border)',
        backdropFilter: 'blur(20px) saturate(180%)',
      }}
      id="topology-import-action-bar"
    >
      {/* 导入进度条 (在导入中展示) */}
      {isImporting && (
        <div className="space-y-1.5 pb-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold flex items-center space-x-1.5" style={{ color: 'var(--purple)' }}>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>{importProgressText || '正在批量建档中...'}</span>
            </span>
            <span className="font-mono font-extrabold" style={{ color: 'var(--text-primary)' }}>
              {Math.round(importProgress)}%
            </span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden bg-[var(--bg-input)]">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: 'var(--purple)' }}
              initial={{ width: 0 }}
              animate={{ width: `${importProgress}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>
        </div>
      )}

      {/* 控制与提交操作条 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* 左侧：快捷勾选工具 + 统计 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 实时选择统计 */}
          <div className="flex items-center space-x-2 text-xs">
            <span className="font-bold flex items-center space-x-1" style={{ color: 'var(--text-primary)' }}>
              <Check className="w-4 h-4" style={{ color: 'var(--purple)' }} />
              <span>已选中：</span>
            </span>
            <span
              className="px-2.5 py-0.5 rounded-lg font-mono font-bold"
              style={{
                backgroundColor: 'var(--purple-soft)',
                color: 'var(--purple)',
              }}
            >
              {selectedCount} / {totalCasesCount} 个案卷
            </span>
            {selectedClientsCount > 0 && (
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                (覆盖 {selectedClientsCount} 位客户)
              </span>
            )}
          </div>

          {/* 快捷按钮 */}
          <div className="flex items-center space-x-1.5 text-xs">
            <button
              type="button"
              disabled={isImporting}
              onClick={onSelectRecommendedOnly}
              className="px-2.5 py-1 rounded-lg border font-bold flex items-center space-x-1 transition-colors cursor-pointer disabled:opacity-50"
              style={{
                backgroundColor: 'var(--green-soft)',
                borderColor: 'rgba(5, 150, 105, 0.3)',
                color: 'var(--green)',
              }}
              title="仅勾选所有推荐主力在途案卷"
            >
              <Sparkles className="w-3 h-3" />
              <span>仅选推荐活跃主案</span>
            </button>

            <button
              type="button"
              disabled={isImporting}
              onClick={onSelectAllFiltered}
              className="px-2.5 py-1 rounded-lg border font-medium transition-colors cursor-pointer disabled:opacity-50"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              全选当前
            </button>

            <button
              type="button"
              disabled={isImporting || selectedCount === 0}
              onClick={onClearSelection}
              className="px-2.5 py-1 rounded-lg border transition-colors cursor-pointer disabled:opacity-50"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
                color: 'var(--text-muted)',
              }}
            >
              清空
            </button>
          </div>
        </div>

        {/* 右侧：取消与提交按钮 */}
        <div className="flex items-center space-x-2.5">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="px-3.5 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              取消
            </button>
          )}

          <motion.button
            whileTap={reduced ? undefined : { scale: 0.96 }}
            type="button"
            disabled={isImporting || selectedCount === 0}
            onClick={onImport}
            className="px-5 py-2 rounded-xl text-xs font-extrabold flex items-center space-x-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all"
            style={{
              backgroundColor: 'var(--purple)',
              color: 'var(--on-purple)',
            }}
            id="topology-batch-import-submit-btn"
          >
            {isImporting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>正在批量建档导入...</span>
              </>
            ) : (
              <>
                <Layers className="w-3.5 h-3.5" />
                <span>一键批量建档并进入 ({selectedCount})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
