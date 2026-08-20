import { motion, useReducedMotion } from 'motion/react';
import { Landmark, Flame, Clock, CheckCircle2 } from 'lucide-react';
import { CaseInfo, useCaseStore } from '../../stores/caseStore';
import { stageCategoryFromStage, getFinanceDeadlineDays } from '../../services/caseMapper';

interface KanbanCardProps {
  caseData: CaseInfo;
  onClick: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  isDragging?: boolean;
}

export function KanbanCard({ caseData, onClick, onPointerDown, isDragging }: KanbanCardProps) {
  const reduced = useReducedMotion();
  const cases = useCaseStore((s) => s.cases);
  const stageCat = stageCategoryFromStage(caseData.stage);
  const isOsCategory = stageCat === 'os_condition';

  const {
    clientName,
    lender,
    loanAmount,
    stage,
    checklistDone,
    checklistTotal,
    checklistProgress,
    deadline,
    summary,
    financeDeadline,
    osPendingCount = 0,
  } = caseData;

  const deadlineDays = getFinanceDeadlineDays(financeDeadline);
  const linkedCount = cases.filter((c) => c.clientName === clientName).length;

  return (
    <motion.div
      whileTap={reduced ? undefined : { scale: 0.97 }}
      onPointerDown={onPointerDown}
      onClick={onClick}
      className={`relative p-3.5 rounded-2xl border flex flex-col justify-between cursor-grab active:cursor-grabbing select-none space-y-2.5 transition-all shadow-2xs hover:shadow-md ${
        isDragging ? 'opacity-50 scale-95 border-[var(--accent)] ring-2 ring-[var(--accent)]/30' : ''
      } ${isOsCategory || osPendingCount > 0 ? 'border-l-4 border-l-[var(--red)]' : ''}`}
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: isDragging ? undefined : 'var(--border)',
      }}
      id={`kanban-card-${caseData.caseId}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between min-w-0">
        <div className="min-w-0 flex-1 pr-1">
          <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
            <h4 className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>
              {clientName}
            </h4>

            {/* OS 角标 */}
            {osPendingCount > 0 && (
              <span id="case-os-badge" className="flex items-center text-xs font-bold text-white bg-[var(--red)] px-1.5 py-0.2 rounded flex-shrink-0">
                <Flame className="w-2.5 h-2.5 mr-0.5 fill-white" />
                OS {osPendingCount}
              </span>
            )}

            {/* 关联案件 */}
            {linkedCount > 1 && (
              <span id="case-linked-badge" className="px-1.5 py-0.2 rounded text-xs font-semibold bg-[var(--accent-soft)] text-[var(--accent)] flex-shrink-0">
                ×{linkedCount} 关联
              </span>
            )}
          </div>

          <div className="flex items-center space-x-1.5 text-[11px] font-mono text-muted mt-0.5">
            <span className="flex items-center space-x-1">
              <Landmark className="w-3 h-3" />
              <span>{lender}</span>
            </span>
            <span>•</span>
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              ${loanAmount ? (loanAmount >= 10000 ? `${(loanAmount / 10000).toFixed(0)}万` : loanAmount.toLocaleString()) : '0'}
            </span>
          </div>
        </div>
      </div>

      {/* 一句话摘要 */}
      {summary && (
        <p className="text-[11px] text-muted truncate leading-tight" style={{ color: 'var(--text-secondary)' }}>
          {summary}
        </p>
      )}

      {/* Progress Bar */}
      <div className="space-y-1 w-full">
        <div className="flex items-center justify-between text-[11px] font-mono text-muted">
          <span>清单 {checklistDone}/{checklistTotal}</span>
          <span>{checklistProgress}%</span>
        </div>
        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-app)' }}>
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{
              width: `${checklistProgress}%`,
              backgroundColor: isOsCategory || osPendingCount > 0 ? 'var(--yellow)' : 'var(--accent)',
            }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-[11px] font-mono text-muted pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
        <span className="truncate max-w-[120px]">{stage}</span>

        {/* Finance Due 倒计时 */}
        {deadlineDays !== null ? (
          <span
            id="case-due-badge"
            className={`px-1.5 py-0.2 rounded text-xs font-bold flex items-center space-x-0.5 ${
              deadlineDays < 3
                ? 'bg-[var(--red-soft)] text-[var(--red)]'
                : deadlineDays < 7
                ? 'bg-[var(--yellow-soft)] text-[var(--yellow)]'
                : 'bg-[var(--green-soft)] text-[var(--green)]'
            }`}
          >
            {deadlineDays < 3 ? (
              <Flame className="w-2.5 h-2.5" />
            ) : deadlineDays < 7 ? (
              <Clock className="w-2.5 h-2.5" />
            ) : (
              <CheckCircle2 className="w-2.5 h-2.5" />
            )}
            <span>
              {deadlineDays < 3
                ? `🔥 ${deadlineDays <= 0 ? '今天' : `${deadlineDays}天`}`
                : deadlineDays < 7
                ? `⏰ ${deadlineDays}天`
                : `✓ 充裕`}
            </span>
          </span>
        ) : (
          <span className="font-bold text-[var(--yellow)] flex-shrink-0">{deadline || '跟进中'}</span>
        )}

        {/* TODO(WO-09): 委派状态接入 */}
      </div>
    </motion.div>
  );
}
