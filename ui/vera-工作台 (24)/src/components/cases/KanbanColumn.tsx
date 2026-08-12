import { CaseInfo } from '../../stores/caseStore';
import { CaseStageCategory } from '../../services/caseMapper';
import { KanbanCard } from './KanbanCard';

interface KanbanColumnProps {
  stage: CaseStageCategory;
  cases: CaseInfo[];
  isDropTarget: boolean;
  onCardClick: (c: CaseInfo) => void;
  onCardDragStart: (c: CaseInfo, e: React.PointerEvent) => void;
  onCardDragEnd: () => void;
  draggingCaseId?: string | null;
}

const STAGE_TITLES: Record<CaseStageCategory, string> = {
  all: '全部案件',
  pre_review: '预审阶段',
  submitted: '递件中',
  os_condition: '补件 / OS条件',
  approval: '审批批复',
  settlement: '结算 (Settlement)',
};

const STAGE_COLORS: Record<CaseStageCategory, string> = {
  all: 'text-muted',
  pre_review: 'text-blue-500 bg-blue-500/10',
  submitted: 'text-purple-500 bg-purple-500/10',
  os_condition: 'text-rose-500 bg-rose-500/10',
  approval: 'text-amber-500 bg-amber-500/10',
  settlement: 'text-emerald-500 bg-emerald-500/10',
};

export function KanbanColumn({
  stage,
  cases,
  isDropTarget,
  onCardClick,
  onCardDragStart,
  draggingCaseId,
}: KanbanColumnProps) {
  const totalAmount = cases.reduce((acc, c) => acc + (c.loanAmount || 0), 0);
  const totalInWan = (totalAmount / 10000).toFixed(0);

  return (
    <div
      data-stage={stage}
      className={`w-72 flex-shrink-0 flex flex-col rounded-2xl border p-3 space-y-3 transition-colors ${
        isDropTarget
          ? 'border-[var(--accent)] bg-[var(--accent-soft)]/20 ring-2 ring-[var(--accent)]/40'
          : ''
      }`}
      style={{
        backgroundColor: 'var(--bg-app)',
        borderColor: isDropTarget ? undefined : 'var(--border)',
      }}
      id={`kanban-column-${stage}`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2">
          <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${STAGE_COLORS[stage] || 'text-muted'}`}>
            {STAGE_TITLES[stage]}
          </span>
          <span className="text-xs font-mono font-bold text-muted">({cases.length})</span>
        </div>
        <span className="text-xs font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
          ${totalInWan}万
        </span>
      </div>

      {/* Cards List */}
      <div className="flex-1 overflow-y-auto space-y-2.5 min-h-[350px] no-scrollbar">
        {cases.map((c) => (
          <KanbanCard
            key={c.caseId}
            caseData={c}
            isDragging={draggingCaseId === c.caseId}
            onClick={() => onCardClick(c)}
            onPointerDown={(e) => onCardDragStart(c, e)}
          />
        ))}

        {cases.length === 0 && (
          <div
            className="h-32 border-2 border-dashed rounded-2xl flex items-center justify-center text-xs text-muted font-mono"
            style={{ borderColor: 'var(--border)' }}
          >
            拖放案件到此
          </div>
        )}
      </div>
    </div>
  );
}
