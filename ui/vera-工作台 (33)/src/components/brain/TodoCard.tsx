import { motion, useReducedMotion } from 'motion/react';
import { Calendar, AlertCircle } from 'lucide-react';
import { TaskResponse } from '../../types/api';

interface TodoCardProps {
  task: TaskResponse;
  onOpen: (taskId: number) => void;
}

const PRIORITY_MAP: Record<string, { label: string; className: string }> = {
  urgent: {
    label: '紧急',
    className: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  },
  high: {
    label: '高优',
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
  normal: {
    label: '普通',
    className: 'bg-black/5 dark:bg-white/10 text-muted border-transparent',
  },
  low: {
    label: '低优',
    className: 'bg-black/5 dark:bg-white/10 text-muted border-transparent',
  },
};

function parseDeadlineInfo(deadline: string | null) {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (isNaN(d.getTime())) {
    return { text: deadline, isOverdue: false };
  }
  const now = new Date();
  // Set both to midnight for day comparison
  const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((dDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: `已逾期 ${Math.abs(diffDays)} 天`, isOverdue: true };
  } else if (diffDays === 0) {
    return { text: '今天到期', isOverdue: false };
  } else {
    return { text: `${d.getMonth() + 1}/${d.getDate()} 到期`, isOverdue: false };
  }
}

export function TodoCard({ task, onOpen }: TodoCardProps) {
  const reduced = useReducedMotion();
  const priorityInfo = PRIORITY_MAP[task.priority] || PRIORITY_MAP.normal;
  const deadlineInfo = parseDeadlineInfo(task.deadline);

  return (
    <motion.div
      whileHover={reduced ? undefined : { y: -1 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onOpen(task.id)}
      id={`todo-card-${task.id}`}
      className="p-2.5 rounded-xl border transition-all cursor-pointer space-y-1.5 shadow-xs hover:shadow-sm"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      {/* Top Header: Title & Priority Badge & Deadline */}
      <div className="flex items-start justify-between space-x-2">
        <span className="font-bold text-xs truncate flex-1" style={{ color: 'var(--text-primary)' }}>
          {task.title}
        </span>
        <div className="flex items-center space-x-1.5 flex-shrink-0">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${priorityInfo.className}`}>
            {priorityInfo.label}
          </span>
        </div>
      </div>

      {/* Suggested Action & Deadline */}
      <div className="flex items-center justify-between space-x-2 text-[11px]">
        <p className="text-muted truncate flex-1">
          {task.suggested_action ? `💡 ${task.suggested_action}` : task.type}
        </p>

        {deadlineInfo && (
          <div
            className={`flex items-center space-x-1 text-[10px] font-medium flex-shrink-0 ${
              deadlineInfo.isOverdue
                ? 'text-rose-600 dark:text-rose-400 font-bold'
                : 'text-muted'
            }`}
          >
            {deadlineInfo.isOverdue ? (
              <AlertCircle className="w-3 h-3 text-rose-500 flex-shrink-0" />
            ) : (
              <Calendar className="w-3 h-3 text-muted flex-shrink-0" />
            )}
            <span>{deadlineInfo.text}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
