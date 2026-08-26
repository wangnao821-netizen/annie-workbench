import { motion, useReducedMotion } from 'motion/react';
import { UserCheck, FileText, ListChecks, FolderOpen, CheckSquare } from 'lucide-react';
import { useUiStore, RightDeckView } from '../../stores/uiStore';
import { useCaseStore } from '../../stores/caseStore';
import { useRightDeckCounts } from '../../hooks/useRightDeckCounts';

export function RightDeckTabs() {
  const reduced = useReducedMotion();
  const currentCase = useCaseStore((s) => s.currentCase);
  const rightDeckTab = useUiStore((s) => s.rightDeckTab);
  const setRightDeckTab = useUiStore((s) => s.setRightDeckTab);
  const highlightedTab = useUiStore((s) => s.highlightedTab);

  const { checklistPendingCount, notesCount, fileCount, taskCount, overdueCount } = useRightDeckCounts(
    currentCase?.caseId ?? null
  );

  if (!currentCase) return null;

  const tabs: {
    key: RightDeckView;
    label: string;
    icon: typeof UserCheck;
    count?: number;
    hasOverdue?: boolean;
    id: string;
  }[] = [
    {
      key: 'panorama',
      label: '全景',
      icon: UserCheck,
      id: 'right-deck-tab-panorama',
    },
    {
      key: 'notes',
      label: '备忘',
      icon: FileText,
      count: notesCount,
      id: 'right-deck-tab-notes',
    },
    {
      key: 'checklist',
      label: '清单',
      icon: ListChecks,
      count: checklistPendingCount,
      id: 'right-deck-tab-checklist',
    },
    {
      key: 'files',
      label: '文件',
      icon: FolderOpen,
      count: fileCount,
      id: 'right-deck-tab-files',
    },
    {
      key: 'tasks',
      label: '任务',
      icon: CheckSquare,
      count: taskCount,
      hasOverdue: overdueCount > 0,
      id: 'right-deck-tab-tasks',
    },
  ];

  return (
    <div
      className="px-2.5 py-2 border-b flex items-center space-x-2 flex-shrink-0 select-none"
      style={{
        backgroundColor: 'var(--bg-panel)',
        borderColor: 'var(--border)',
      }}
      id="right-deck-tabs-bar"
    >
      <div
        className="grid grid-cols-5 p-0.5 rounded-xl border bg-[var(--bg-subtle)] flex-1 min-w-0 gap-0.5"
        style={{ borderColor: 'var(--border)' }}
      >
        {tabs.map((tab) => {
          const isActive = rightDeckTab === tab.key;
          const isHighlighted = highlightedTab === tab.key;
          const Icon = tab.icon;

          return (
            <motion.button
              key={tab.key}
              type="button"
              id={tab.id}
              whileTap={reduced ? undefined : { scale: 0.96 }}
              animate={
                isHighlighted && !reduced
                  ? { scale: [1, 1.06, 1], transition: { duration: 0.6, repeat: 2 } }
                  : { scale: 1 }
              }
              onClick={() => setRightDeckTab(tab.key)}
              className={`relative flex items-center justify-center space-x-1 py-1.5 px-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                isActive
                  ? 'bg-[var(--accent)] text-white shadow-xs'
                  : isHighlighted
                  ? 'bg-[var(--purple-soft)] text-[var(--purple)] ring-2 ring-[var(--purple)] animate-pulse'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-white' : isHighlighted ? 'text-[var(--purple)]' : 'text-[var(--text-secondary)]'}`} />
              <span className="truncate tracking-tight">{tab.label}</span>

              {/* Count Badge */}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={`ml-0.5 px-1 min-w-[14px] h-3.5 rounded-full text-[10px] font-mono font-extrabold flex items-center justify-center transition-colors ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : tab.hasOverdue
                      ? 'bg-[var(--red)] text-white'
                      : isHighlighted
                      ? 'bg-[var(--purple)] text-white'
                      : 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  }`}
                >
                  {tab.count > 99 ? '99+' : tab.count}
                </span>
              )}

              {/* Overdue indicator dot if tab has no count shown or count is 0 */}
              {tab.hasOverdue && (tab.count === undefined || tab.count === 0) && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--red)]" />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
