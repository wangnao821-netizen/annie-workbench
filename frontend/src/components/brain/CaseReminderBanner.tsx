import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AlertTriangle, Clock, X, ChevronRight } from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';

interface CaseReminderBannerProps {
  caseId: string;
  overdue: number;
  dueToday: number;
  onDismiss?: () => void;
  onViewTodos?: () => void;
}

export function CaseReminderBanner({ caseId: _caseId, overdue, dueToday, onDismiss, onViewTodos }: CaseReminderBannerProps) {
  const reduced = useReducedMotion();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || (overdue === 0 && dueToday === 0)) {
    return null;
  }

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed(true);
    if (onDismiss) onDismiss();
  };

  const handleClickBanner = () => {
    if (onViewTodos) {
      onViewTodos();
    } else {
      useToastStore.getState().showToast('info', overdue > 0 ? `已筛选显示 ${overdue} 项逾期待办事项` : `已筛选显示 ${dueToday} 项今日到期待办`);
    }
  };

  const isOverdue = overdue > 0;

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0  }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      onClick={handleClickBanner}
      className={`px-3.5 py-2 rounded-xl border text-xs flex items-center justify-between cursor-pointer transition-all shadow-2xs ${
        isOverdue
          ? 'bg-[var(--red-soft)] dark:bg-[var(--red-soft)] border-[var(--red-soft)] text-[var(--red)] hover:bg-[var(--red-soft)]'
          : 'bg-[var(--yellow-soft)] dark:bg-[var(--yellow-soft)] border-[var(--yellow-soft)] text-[var(--yellow)] dark:text-[var(--yellow)] hover:bg-[var(--yellow-soft)]'
      }`}
      id="case-reminder-banner"
    >
      <div className="flex items-center space-x-2 truncate">
        {isOverdue ? (
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-[var(--red)] animate-pulse" />
        ) : (
          <Clock className="w-4 h-4 flex-shrink-0 text-[var(--yellow)]" />
        )}
        <span className="font-bold truncate">
          {isOverdue
            ? `该案件有 ${overdue} 个待办已逾期，建议优先处理`
            : `该案件有 ${dueToday} 个待办今日到期`}
        </span>
      </div>

      <div className="flex items-center space-x-1.5 flex-shrink-0 pl-2">
        <span className="text-[11px] font-mono font-bold underline flex items-center">
          查看待办 <ChevronRight className="w-3 h-3 ml-0.5" />
        </span>
        <button
          type="button"
          onClick={handleClose}
          className="p-1 rounded-md hover:bg-[var(--bg-subtle-strong)] text-muted transition-colors"
          title="关闭提醒"
          id="case-reminder-close-btn"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}
