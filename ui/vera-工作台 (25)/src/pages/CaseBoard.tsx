import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Plus, Briefcase, AlertCircle, RefreshCw, LayoutGrid, Kanban, BarChart2 } from 'lucide-react';
import { CaseInfo, useCaseStore } from '../stores/caseStore';
import { StageFilter, CaseStageFilter } from '../components/cases/StageFilter';
import { CaseCard } from '../components/cases/CaseCard';
import { KanbanBoard } from '../components/cases/KanbanBoard';
import { CommissionCard } from '../components/cases/CommissionCard';
import { stageCategoryFromStage, isUrgentCase, getFinanceDeadlineDays } from '../services/caseMapper';
import { useUiStore } from '../stores/uiStore';

interface CaseBoardProps {
  onOpenCase: (caseId: string) => void;
  onViewAnalytics?: () => void;
}

type ViewMode = 'grid' | 'kanban';

export function CaseBoard({ onOpenCase, onViewAnalytics }: CaseBoardProps) {
  const [activeStage, setActiveStage] = useState<CaseStageFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const reduced = useReducedMotion();

  const { cases, casesLoading, casesError, fetchCases, setCurrentCase } = useCaseStore();

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  const filteredCases = cases.filter((c) => {
    if (activeStage === 'all') return true;
    const category = stageCategoryFromStage(c.stage);
    return category === activeStage;
  });

  // 紧急置顶排序：osPendingCount > 0 或 financeDeadline < 7 天 排最前，其次按 deadline 升序
  const sortedCases = [...filteredCases].sort((a, b) => {
    const urgentA = isUrgentCase(a);
    const urgentB = isUrgentCase(b);
    if (urgentA && !urgentB) return -1;
    if (!urgentA && urgentB) return 1;

    const daysA = getFinanceDeadlineDays(a.financeDeadline) ?? 9999;
    const daysB = getFinanceDeadlineDays(b.financeDeadline) ?? 9999;
    return daysA - daysB;
  });

  const handleSelectCase = (c: CaseInfo) => {
    setCurrentCase(c);
    onOpenCase(c.caseId);
  };

  const handleCreateCase = () => {
    useUiStore.getState().setNewCaseOpen(true);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden p-6 space-y-5" id="case-board-page">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Briefcase className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <div>
            <h2 className="text-base font-extrabold" style={{ color: 'var(--text-primary)' }}>
              案件看板 (Case Board)
            </h2>
            <p className="text-xs text-muted">管理与跟进当前所有 28 个贷款全生命周期案件</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Segmented Control: Grid / Kanban */}
          <div
            className="p-1 rounded-xl border flex items-center space-x-1"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setViewMode('grid')}
              className={`relative px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1 cursor-pointer transition-colors ${
                viewMode === 'grid' ? 'text-[var(--accent)]' : 'text-secondary hover:text-primary'
              }`}
              id="case-view-grid"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>网格</span>
              {viewMode === 'grid' && !reduced && (
                <motion.span
                  layoutId="case-view-indicator"
                  className="absolute inset-0 rounded-lg -z-10"
                  style={{ backgroundColor: 'var(--accent-soft)' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              {viewMode === 'grid' && reduced && (
                <span className="absolute inset-0 rounded-lg -z-10" style={{ backgroundColor: 'var(--accent-soft)' }} />
              )}
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setViewMode('kanban')}
              className={`relative px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1 cursor-pointer transition-colors ${
                viewMode === 'kanban' ? 'text-[var(--accent)]' : 'text-secondary hover:text-primary'
              }`}
              id="case-view-kanban"
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>看板</span>
              {viewMode === 'kanban' && !reduced && (
                <motion.span
                  layoutId="case-view-indicator"
                  className="absolute inset-0 rounded-lg -z-10"
                  style={{ backgroundColor: 'var(--accent-soft)' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              {viewMode === 'kanban' && reduced && (
                <span className="absolute inset-0 rounded-lg -z-10" style={{ backgroundColor: 'var(--accent-soft)' }} />
              )}
            </motion.button>
          </div>

          {onViewAnalytics && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={onViewAnalytics}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 border cursor-pointer hover:opacity-80 transition-opacity"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              id="case-board-analytics-btn"
            >
              <BarChart2 className="w-4 h-4 text-purple-500" />
              <span>📊 统计</span>
            </motion.button>
          )}

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleCreateCase}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer text-white shadow-xs"
            style={{ backgroundColor: 'var(--accent)' }}
            id="create-new-case-btn"
          >
            <Plus className="w-4 h-4" />
            <span>➕ 新建案件</span>
          </motion.button>
        </div>
      </div>

      {/* Error Bar if fetch failed */}
      {casesError && (
        <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-500 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{casesError}</span>
          </div>
          <button
            onClick={() => fetchCases()}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 font-medium transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>重试</span>
          </button>
        </div>
      )}

      {/* Commission Overview Card */}
      <CommissionCard />

      {/* Stage Filters Bar */}
      <StageFilter activeStage={activeStage} onStageChange={setActiveStage} />

      {/* Main Content: Grid View or Kanban View */}
      <div className="flex-1 overflow-y-auto no-scrollbar pt-1">
        {casesLoading && cases.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-40 rounded-2xl border animate-pulse p-4 space-y-3"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
              >
                <div className="h-4 rounded w-1/2" style={{ backgroundColor: 'var(--bg-input)' }} />
                <div className="h-3 rounded w-3/4" style={{ backgroundColor: 'var(--border)' }} />
                <div className="h-2 rounded w-full mt-4" style={{ backgroundColor: 'var(--bg-input)' }} />
              </div>
            ))}
          </div>
        ) : viewMode === 'kanban' ? (
          <KanbanBoard cases={sortedCases} onCardClick={handleSelectCase} />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedCases.map((caseItem) => (
                <div key={caseItem.caseId}>
                  <CaseCard caseData={caseItem} onClick={() => handleSelectCase(caseItem)} />
                </div>
              ))}
            </div>

            {sortedCases.length === 0 && (
              <div className="text-center py-12 text-xs text-muted">该阶段暂无匹配的案件</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
