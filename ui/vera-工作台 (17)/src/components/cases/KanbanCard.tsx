import { motion } from 'motion/react';
import { Landmark, Flame } from 'lucide-react';
import { CaseInfo } from '../../stores/caseStore';
import { stageCategoryFromStage } from '../../services/caseMapper';

interface KanbanCardProps {
  caseData: CaseInfo;
  onClick: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  isDragging?: boolean;
}

export function KanbanCard({ caseData, onClick, onPointerDown, isDragging }: KanbanCardProps) {
  const stageCat = stageCategoryFromStage(caseData.stage);
  const isOsCategory = stageCat === 'os_condition';

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      onPointerDown={onPointerDown}
      onClick={onClick}
      className={`relative p-3.5 rounded-2xl border flex flex-col justify-between cursor-grab active:cursor-grabbing select-none space-y-2.5 transition-all shadow-2xs hover:shadow-md ${
        isDragging ? 'opacity-50 scale-95 border-[var(--accent)] ring-2 ring-[var(--accent)]/30' : ''
      } ${isOsCategory ? 'border-l-4 border-l-rose-500' : ''}`}
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: isDragging ? undefined : 'var(--border)',
      }}
      id={`kanban-card-${caseData.caseId}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center space-x-1.5">
            <h4 className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>
              {caseData.clientName}
            </h4>
            {isOsCategory && (
              <span className="flex items-center text-[10px] font-bold text-rose-500 bg-rose-500/10 px-1.5 py-0.2 rounded-md flex-shrink-0">
                <Flame className="w-3 h-3 mr-0.5 fill-rose-500" />
                OS
              </span>
            )}
          </div>
          <div className="flex items-center space-x-1.5 text-[11px] font-mono text-muted mt-0.5">
            <span className="flex items-center space-x-1">
              <Landmark className="w-3 h-3" />
              <span>{caseData.lender}</span>
            </span>
            <span>•</span>
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              ${caseData.loanAmount ? (caseData.loanAmount >= 10000 ? `${(caseData.loanAmount / 10000).toFixed(0)}万` : caseData.loanAmount.toLocaleString()) : '0'}
            </span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] font-mono text-muted">
          <span>清单 {caseData.checklistDone}/{caseData.checklistTotal}</span>
          <span>{caseData.checklistProgress}%</span>
        </div>
        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-app)' }}>
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{
              width: `${caseData.checklistProgress}%`,
              backgroundColor: isOsCategory ? 'var(--amber, #f59e0b)' : 'var(--accent)',
            }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] font-mono text-muted pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
        <span className="truncate">{caseData.stage}</span>
        <span className="font-bold text-amber-500 flex-shrink-0">{caseData.deadline || '跟进中'}</span>
      </div>
    </motion.div>
  );
}
