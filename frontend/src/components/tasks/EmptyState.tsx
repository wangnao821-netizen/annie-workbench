import { motion, useReducedMotion } from 'motion/react';
import { Inbox, RefreshCw } from 'lucide-react';
import { FilterId } from '../../types';

interface EmptyStateProps {
  filter: FilterId;
  onResetFilter: () => void;
}

export function EmptyState({ filter: _filter, onResetFilter }: EmptyStateProps) {
  const reduced = useReducedMotion();
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none" id="task-empty-state">
      <div 
        className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3 shadow-xs border"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <Inbox className="w-6 h-6 stroke-[1.5]" style={{ color: 'var(--text-muted)' }} />
      </div>

      <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        暂无符合条件的任务
      </h3>

      <p className="text-xs max-w-[240px] mb-4" style={{ color: 'var(--text-secondary)' }}>
        当前分类中没有待处理事项，您可以点击“重置筛选”查看全部工作流任务。
      </p>

      <motion.button
        whileTap={reduced ? undefined : { scale: 0.95 }}
        onClick={onResetFilter}
        className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer border shadow-2xs"
        style={{ 
          backgroundColor: 'var(--bg-card)', 
          borderColor: 'var(--border)', 
          color: 'var(--accent)' 
        }}
        id="reset-filter-btn"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>重置分类筛选</span>
      </motion.button>
    </div>
  );
}
