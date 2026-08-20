import { motion, useReducedMotion } from 'motion/react';
import { 
  Mail, FileText, Landmark, UserCheck, UserPlus, AlertTriangle, CheckCircle2, MailCheck, Sparkles, MessageSquare, LucideIcon, Crown
} from 'lucide-react';
import { TaskItem, TaskType, QuickAction, TaskPriority } from '../../types';
import { useTaskStore } from '../../stores/taskStore';
import { useCaseStore } from '../../stores/caseStore';

interface TaskCardProps {
  task: TaskItem;
  isSelected: boolean;
  isMultiSelected?: boolean;
  onSelect: (id: number) => void;
  onToggleSelect?: (id: number) => void;
  onQuickAction?: (task: TaskItem, action: QuickAction) => void;
}

const TYPE_CONFIG: Record<TaskType, { icon: LucideIcon; bgVar: string; colorVar: string }> = {
  EMAIL_DISPATCH:   { icon: Mail, bgVar: 'var(--accent-soft)', colorVar: 'var(--accent)' },
  FILE_MATCH:       { icon: FileText, bgVar: 'var(--green-soft)', colorVar: 'var(--green)' },
  OS_ATTACK:        { icon: Landmark, bgVar: 'var(--orange-soft)', colorVar: 'var(--orange)' },
  BOSS_DECISION:    { icon: UserCheck, bgVar: 'var(--yellow-soft)', colorVar: 'var(--yellow)' },
  NEW_CLIENT:       { icon: UserPlus, bgVar: 'var(--accent-soft)', colorVar: 'var(--accent)' },
  OVERDUE_REMINDER: { icon: AlertTriangle, bgVar: 'var(--red-soft)', colorVar: 'var(--red)' },
  SETTLEMENT:       { icon: CheckCircle2, bgVar: 'var(--green-soft)', colorVar: 'var(--green)' },
  GENERAL_EMAIL:    { icon: MailCheck, bgVar: 'var(--accent-soft)', colorVar: 'var(--accent)' },
};

const getPriorityColor = (prio: TaskPriority, completed?: boolean) => {
  if (completed) return 'var(--border)';
  switch (prio) {
    case 'urgent': return 'var(--red)';
    case 'high': return 'var(--orange)';
    case 'normal': return 'var(--accent)';
    case 'low': return 'var(--text-muted)';
    default: return 'var(--accent)';
  }
};

export function TaskCard({ task, isSelected, isMultiSelected, onSelect, onToggleSelect, onQuickAction }: TaskCardProps) {
  const reduced = useReducedMotion();
  const typeConfig = TYPE_CONFIG[task.type] || TYPE_CONFIG.GENERAL_EMAIL;
  const TypeIcon = typeConfig.icon;
  const bossReplyAction = useTaskStore((s) => s.bossReplyAction);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);

  const getTagStyle = (color: string) => {
    switch (color) {
      case 'red': return { bg: 'var(--red-soft)', color: 'var(--red)', border: 'rgba(248,113,113,0.3)' };
      case 'accent': return { bg: 'var(--accent-soft)', color: 'var(--accent)', border: 'rgba(99,102,241,0.3)' };
      case 'yellow': return { bg: 'var(--yellow-soft)', color: 'var(--yellow)', border: 'rgba(245,158,11,0.3)' };
      case 'green': return { bg: 'var(--green-soft)', color: 'var(--green)', border: 'rgba(16,185,129,0.3)' };
      case 'orange': return { bg: 'var(--orange-soft)', color: 'var(--orange)', border: 'rgba(249,115,22,0.3)' };
      default: return { bg: 'var(--bg-app)', color: 'var(--text-secondary)', border: 'var(--border)' };
    }
  };

  const borderLeftColor = getPriorityColor(task.priority, task.completed);
  const mainBorderColor = isSelected ? 'var(--border-active)' : 'var(--border)';

  return (
    <motion.div
      whileTap={task.completed ? undefined : { scale: 0.98 }}
      whileHover={task.completed ? undefined : { y: -1 }}
      transition={{ type: 'spring', damping: 25, stiffness: 400 }}
      onClick={() => onSelect(task.id)}
      className={`p-3.5 rounded-2xl border cursor-pointer transition-all duration-200 relative group hover:shadow-sm ${
        task.completed ? 'opacity-50 select-none' : ''
      }`}
      style={{
        backgroundColor: isSelected ? 'var(--bg-card-hover)' : 'var(--bg-card)',
        borderTopColor: mainBorderColor,
        borderRightColor: mainBorderColor,
        borderBottomColor: mainBorderColor,
        borderLeftColor: borderLeftColor,
        borderLeftWidth: isSelected ? '5px' : '4px',
        boxShadow: isSelected ? 'var(--shadow-card)' : 'none',
      }}
      id={`task-card-${task.id}`}
    >
      {/* Header: Checkbox (if pending & toggleable) + Icon + Title + Subtitle */}
      <div className="flex items-start space-x-2.5">
        {!task.completed && onToggleSelect && (
          <div className="flex items-center pt-1" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              id={`task-select-${task.id}`}
              checked={!!isMultiSelected}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelect(task.id);
              }}
              className="w-4 h-4 rounded cursor-pointer accent-[var(--accent)] flex-shrink-0"
              aria-label={`选择任务 ${task.title}`}
            />
          </div>
        )}

        <div 
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 shadow-xs"
          style={{ backgroundColor: typeConfig.bgVar, color: typeConfig.colorVar }}
        >
          <TypeIcon className="w-4 h-4 stroke-[2]" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 
              className={`text-xs font-bold leading-snug truncate ${
                task.completed ? 'line-through text-muted' : ''
              }`}
              style={{ color: task.completed ? 'var(--text-muted)' : 'var(--text-primary)' }}
            >
              {task.title}
            </h3>
            <span className="text-[11px] font-mono flex-shrink-0 ml-1" style={{ color: 'var(--text-muted)' }}>
              {task.createdAt}
            </span>
          </div>

          <p className="text-[11px] font-medium leading-tight mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
            {task.subtitle}
          </p>
        </div>
      </div>

      {/* Boss Decision Issue Summary Box */}
      {task.bossDecision && !task.completed && (
        <div className="mt-2.5 p-2 rounded-xl text-[11px] font-medium leading-relaxed border bg-[var(--yellow-soft)] text-[var(--yellow)] dark:text-[var(--yellow)] border-[var(--yellow-soft)] flex items-start space-x-1">
          <Crown className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span><span className="font-bold mr-1">老板议题:</span>{task.bossDecision}</span>
        </div>
      )}

      {/* AI Summary Box */}
      {task.aiSummary && !task.completed && (
        <div 
          className="mt-2.5 p-2 rounded-xl text-[11px] leading-relaxed flex items-start space-x-1.5 border"
          style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <Sparkles className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--purple)' }} />
          <span className="line-clamp-2">{task.aiSummary}</span>
        </div>
      )}

      {/* Tags & Meta Info Row */}
      <div className="mt-2.5 flex items-center justify-between text-[11px]">
        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
          {((task.status === 'in_progress' && (task.assignee === 'vera' || task.delegatedTo === 'vera')) || (task.assignee === 'vera' && !task.completed)) && (
            <span
              id={`task-claimed-status-${task.id}`}
              className="px-1.5 py-0.2 rounded-md text-xs font-bold border bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-soft)] inline-flex items-center space-x-1"
            >
              <span>🙋 Vera 正在跟进</span>
            </span>
          )}
          {task.escalatedToBoss && (
            <span
              id={`task-boss-status-${task.id}`}
              className="px-1.5 py-0.2 rounded-md text-xs font-bold border bg-[var(--yellow-soft)] text-[var(--yellow)] border-[var(--yellow-soft)] inline-flex items-center space-x-1"
            >
              <Crown className="w-3 h-3" />
              <span>待老板拍板</span>
            </span>
          )}
          {task.matchStatus === 'confirmed' && (
            <span
              id={`task-match-status-${task.id}`}
              className="px-1.5 py-0.2 rounded-md text-xs font-semibold border bg-[var(--green-soft)] text-[var(--green)] border-[var(--green-soft)]"
            >
              ✓ 已确证
            </span>
          )}
          {task.tags.map((tag, idx) => {
            const style = getTagStyle(tag.color);
            return (
              <span
                key={idx}
                className="px-1.5 py-0.2 rounded-md text-xs font-semibold border"
                style={{ backgroundColor: style.bg, color: style.color, borderColor: style.border }}
              >
                {tag.label}
              </span>
            );
          })}
        </div>

        {task.meta && (
          <span className="text-[11px] font-medium font-mono truncate ml-2" style={{ color: 'var(--text-muted)' }}>
            {task.meta}
          </span>
        )}
      </div>

      {/* Boss Reply Action Buttons (approve / reject / defer) */}
      {(task.escalatedToBoss || task.type === 'BOSS_DECISION') && !task.completed && (
        <div className="mt-2.5 pt-2 border-t flex items-center space-x-1.5 flex-wrap gap-y-1" style={{ borderColor: 'var(--border)' }}>
          <motion.button
            whileTap={reduced ? undefined : { scale: 0.94 }}
            onClick={async (e) => {
              e.stopPropagation();
              await bossReplyAction(task.id, { decision: 'approve' });
              await fetchTasks();
            }}
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[var(--green)] text-white shadow-2xs hover:bg-[var(--green)] cursor-pointer"
            id={`boss-approve-btn-${task.id}`}
          >
            ✅ 批准
          </motion.button>
          <motion.button
            whileTap={reduced ? undefined : { scale: 0.94 }}
            onClick={async (e) => {
              e.stopPropagation();
              await bossReplyAction(task.id, { decision: 'reject' });
              await fetchTasks();
            }}
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[var(--red)] text-white shadow-2xs hover:bg-[var(--red)] cursor-pointer"
            id={`boss-reject-btn-${task.id}`}
          >
            ❌ 拒绝
          </motion.button>
          <motion.button
            whileTap={reduced ? undefined : { scale: 0.94 }}
            onClick={async (e) => {
              e.stopPropagation();
              await bossReplyAction(task.id, { decision: 'defer' });
              await fetchTasks();
            }}
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-[var(--yellow-soft)] text-[var(--yellow)] hover:bg-[var(--yellow-soft)] cursor-pointer"
            id={`boss-defer-btn-${task.id}`}
          >
            ⏳ 暂缓
          </motion.button>
        </div>
      )}

      {/* Quick Action Buttons & Enter Case Chat Button */}
      {((task.quickActions && task.quickActions.length > 0) || (task.caseId && !task.completed)) && !task.completed && (
        <div className="mt-3 pt-2 border-t flex items-center space-x-2 flex-wrap gap-y-1.5" style={{ borderColor: 'var(--border)' }}>
          {task.caseId && !task.completed && (
            <motion.button
              whileTap={reduced ? undefined : { scale: 0.94 }}
              onClick={(e) => {
                e.stopPropagation();
                const cases = useCaseStore.getState().cases;
                let targetCase = cases.find((c) => c.caseId === task.caseId);
                if (!targetCase) {
                  targetCase = {
                    caseId: task.caseId || '',
                    clientName: task.caseName || '案件客户',
                    lender: task.caseBank || '贷款银行',
                    loanAmount: task.loanAmount || 0,
                    stage: '补件与条件审理',
                    checklistDone: 8,
                    checklistTotal: 12,
                    checklistProgress: 67,
                    summary: task.aiSummary || '跟进中',
                    deadline: '',
                  };
                }
                useCaseStore.getState().setCurrentCase(targetCase || null);
                window.dispatchEvent(new CustomEvent('app-navigate', { detail: 'brain' }));
              }}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center space-x-1 cursor-pointer transition-colors shadow-2xs bg-[var(--purple-soft)] text-[var(--purple)] border border-[var(--purple-soft)] hover:bg-[var(--purple)]/25"
              id={`task-brain-chat-btn-${task.id}`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>进入案件对话</span>
            </motion.button>
          )}

          {task.quickActions && task.quickActions.map((action, idx) => (
            <motion.button
              key={idx}
              whileTap={reduced ? undefined : { scale: 0.94 }}
              onClick={(e) => {
                e.stopPropagation();
                if (onQuickAction) onQuickAction(task, action);
              }}
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center space-x-1 cursor-pointer transition-colors shadow-2xs"
              style={{
                backgroundColor: action.primary ? 'var(--accent)' : 'var(--bg-app)',
                color: action.primary ? '#ffffff' : 'var(--text-primary)',
                border: action.primary ? 'none' : '1px solid var(--border)'
              }}
              id={`quick-action-${task.id}-${action.action}`}
            >
              <span>{action.label}</span>
            </motion.button>
          ))}
        </div>
      )}
    </motion.div>
  );
}
