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

interface FilterBarProps {
  activeFilter: FilterId;
  onFilterChange: (id: FilterId) => void;
}

const FILTERS = [
  { id: "all" as FilterId, label: "全部", icon: Layers, count: 8 },
  { id: "email" as FilterId, label: "邮件", icon: Mail, count: 3 },
  { id: "file" as FilterId, label: "文件", icon: FileText, count: 2 },
  { id: "os" as FilterId, label: "银行 OS", icon: Landmark, count: 1 },
  { id: "brandon" as FilterId, label: "待老板", icon: UserCheck, count: 1 },
  { id: "overdue" as FilterId, label: "超期任务", icon: Clock, count: 1 },
];

export function FilterBar({ activeFilter, onFilterChange }: FilterBarProps) {
  const reduced = useReducedMotion();

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
      {FILTERS.map((filter) => {
        const Icon = filter.icon;
        const isActive = activeFilter === filter.id;

        return (
          <motion.button
            key={filter.id}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
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
              className="text-[10px] font-mono px-1 rounded transition-colors"
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
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
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
