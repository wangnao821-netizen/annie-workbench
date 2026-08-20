import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ListChecks, Clock, Mail } from 'lucide-react';
import { useChecklistStore } from '../../stores/checklistStore';
import { ChecklistPanel } from '../panel/details/ChecklistPanel';
import { CaseTimelinePanel } from '../panel/details/CaseTimelinePanel';
import { useCaseStore, CaseInfo } from '../../stores/caseStore';

interface CaseWorkspaceRightPanelProps {
  caseId: string;
  caseData?: Partial<CaseInfo> | null;
}

type RightTabKey = 'checklist' | 'timeline';

export function CaseWorkspaceRightPanel({ caseId, caseData }: CaseWorkspaceRightPanelProps) {
  const reduced = useReducedMotion();
  const [activeTab, setActiveTab] = useState<RightTabKey>('checklist');

  const { items, fetchChecklist, toggleItem, revokeFileMatch } = useChecklistStore();
  const currentCase = useCaseStore((s) => s.currentCase);

  useEffect(() => {
    if (caseId) {
      fetchChecklist(caseId);
    }
  }, [caseId, fetchChecklist]);

  const checkedCount = items.filter((i) => i.checked || i.status === 'received' || i.status === 'confirmed').length;
  const totalCount = items.length;
  const progressPct = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  const handleToggleItem = (itemId: string) => {
    const target = items.find((i) => i.id === itemId);
    if (target) {
      toggleItem(itemId, !target.checked);
    }
  };

  const handleRevokeItem = (itemId: string, fileId?: string) => {
    if (fileId && caseId) {
      revokeFileMatch(caseId, fileId, itemId);
    } else {
      toggleItem(itemId, false);
    }
  };

  const handleAddItem = (label: string, category: 'required' | 'ai_suggested' | 'optional') => {
    useChecklistStore.setState((state) => ({
      items: [
        ...state.items,
        {
          id: `chk-custom-${Date.now()}`,
          label,
          category,
          checked: false,
          status: 'missing',
        },
      ],
    }));
  };

  return (
    <div
      className="flex flex-col h-full rounded-2xl border overflow-hidden transition-all shadow-xs"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow-card)',
      }}
      id="case-workspace-right-panel"
    >
      {/* Top Segmented Tabs Header */}
      <div
        className="px-4 py-2.5 border-b flex items-center justify-between gap-2 flex-shrink-0"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--bg-panel)',
        }}
      >
        <div className="flex items-center space-x-1.5 p-1 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)]">
          {/* Tab 1: Checklist */}
          <button
            type="button"
            onClick={() => setActiveTab('checklist')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
              activeTab === 'checklist'
                ? 'bg-[var(--bg-card)] text-primary shadow-xs'
                : 'text-muted hover:text-primary'
            }`}
            style={{
              color: activeTab === 'checklist' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
            id="right-panel-tab-checklist"
          >
            <ListChecks className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>材料清单核对</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                progressPct === 100
                  ? 'bg-[var(--green-soft)] text-[var(--green)]'
                  : 'bg-[var(--accent-soft)] text-[var(--accent)]'
              }`}
            >
              {checkedCount}/{totalCount}
            </span>
          </button>

          {/* Tab 2: Timeline & Evidence */}
          <button
            type="button"
            onClick={() => setActiveTab('timeline')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
              activeTab === 'timeline'
                ? 'bg-[var(--bg-card)] text-primary shadow-xs'
                : 'text-muted hover:text-primary'
            }`}
            style={{
              color: activeTab === 'timeline' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
            id="right-panel-tab-timeline"
          >
            <Clock className="w-3.5 h-3.5 text-[var(--purple)]" />
            <span>沟通与时序脉络</span>
          </button>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center space-x-2 text-[11px] text-muted hidden sm:flex">
          {activeTab === 'checklist' ? (
            <span>齐备进度: <strong className="text-primary font-bold">{progressPct}%</strong></span>
          ) : (
            <span className="flex items-center space-x-1">
              <Mail className="w-3 h-3 text-[var(--purple)]" />
              <span>邮件/事件流</span>
            </span>
          )}
        </div>
      </div>

      {/* Tab Content Body */}
      <div className="flex-1 overflow-y-auto p-4 no-scrollbar min-h-0" style={{ backgroundColor: 'var(--bg-card)' }}>
        <AnimatePresence mode="wait">
          {activeTab === 'checklist' ? (
            <motion.div
              key="checklist"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="space-y-4"
            >
              <ChecklistPanel
                items={items}
                caseId={caseId}
                onToggleItem={handleToggleItem}
                onRevokeItem={handleRevokeItem}
                onAddItem={handleAddItem}
                lender={caseData?.lender || currentCase?.lender}
                productType={(caseData as any)?.productType}
              />
            </motion.div>
          ) : (
            <motion.div
              key="timeline"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <CaseTimelinePanel caseId={caseId} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
