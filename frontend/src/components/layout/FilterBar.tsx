import { motion, useReducedMotion } from 'motion/react';
import { 
  Layers, 
  Mail, 
  FileText, 
  Landmark, 
  UserCheck, 
  Clock 
} from 'lucide-react';
import { FilterId } from '../../types/navigation';
import { useTaskStore } from '../../stores/taskStore';

interface FilterBarProps {
  activeFilter: FilterId;
  onFilterChange: (id: FilterId) => void;
}

export function FilterBar({ activeFilter, onFilterChange }: FilterBarProps) {
  const reduced = useReducedMotion();
  const tasks = useTaskStore((s) => s.tasks);
  const pending = tasks.filter((t) => !t.completed);

  const filters: { id: FilterId; label: string; icon: typeof Layers; count: number }[] = [
    { id: 'all', label: '全部', icon: Layers, count: pending.length },
    { id: 'email', label: '邮件', icon: Mail, count: pending.filter((t) => ['EMAIL_DISPATCH', 'GENERAL_EMAIL', 'NEW_CLIENT'].includes(t.type)).length },
    { id: 'file', label: '文件', icon: FileText, count: pending.filter((t) => ['FILE_MATCH', 'SETTLEMENT'].includes(t.type)).length },
    { id: 'os', label: '银行 OS', icon: Landmark, count: pending.filter((t) => t.type === 'OS_ATTACK').length },
    { id: 'brandon', label: '待老板', icon: UserCheck, count: pending.filter((t) => t.type === 'BOSS_DECISION').length },
    { id: 'overdue', label: '超期任务', icon: Clock, count: pending.filter((t) => t.type === 'OVERDUE_REMINDER').length },
  ];

  return (
    <div
      className="px-6 py-2 border-b flex items-center space-x-2 flex-shrink-0 transition-colors duration-200 select-none overflow-x-auto no-scrollbar"
      style={{
        backgroundColor: 'var(--surface-translucent)',
        borderColor: 'var(--border)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)'
      }}
      id="filter-category-bar"
    >
      {filters.map((filter) => {
        const Icon = filter.icon;
        const isActive = activeFilter === filter.id;

        return (
          <motion.button
            key={filter.id}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            onClick={() => onFilterChange(filter.id)}
            className="relative px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 cursor-pointer transition-colors duration-150 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            style={{
              color: isActive ? 'var(--accent)' : undefined,
            }}
            id={`filter-tab-${filter.id}`}
          >
            <Icon className="w-3.5 h-3.5 stroke-[2]" />
            <span>{filter.label}</span>
            <span
              className="text-[11px] font-mono px-1 rounded transition-colors"
              style={{
                backgroundColor: isActive ? 'var(--accent-soft)' : 'transparent',
                color: 'var(--text-muted)',
              }}
            >
              {filter.count}
            </span>

            {isActive && reduced && (
              <span
                className="absolute -bottom-2 left-1.5 right-1.5 h-[2px] rounded-full"
                style={{ backgroundColor: 'var(--accent)' }}
              />
            )}
            {isActive && !reduced && (
              <motion.span
                layoutId="filter-tab-underline"
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="absolute -bottom-2 left-1.5 right-1.5 h-[2px] rounded-full"
                style={{ backgroundColor: 'var(--accent)' }}
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
