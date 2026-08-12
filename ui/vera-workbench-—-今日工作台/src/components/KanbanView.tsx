import React from 'react';
import { motion } from 'motion/react';
import { Kanban, Plus, ArrowRight, User, Building2, CheckCircle2 } from 'lucide-react';
import { useWorkbenchStore } from '../store/useStore';
import { CaseStage, MortgageCase } from '../types';

export const KanbanView: React.FC = () => {
  const { cases, setSelectedCaseId, setCurrentView, setNewCaseModalOpen } = useWorkbenchStore((s) => ({
    cases: s.cases,
    setSelectedCaseId: s.setSelectedCaseId,
    setCurrentView: s.setCurrentView,
    setNewCaseModalOpen: s.setNewCaseModalOpen
  }));

  const columns: { stage: CaseStage; title: string; color: string }[] = [
    { stage: 'consultation', title: '1. 咨询评估', color: 'border-slate-300' },
    { stage: 'docs_collect', title: '2. 材料收集', color: 'border-blue-400' },
    { stage: 'submission', title: '3. 银行递交', color: 'border-amber-400' },
    { stage: 'approval', title: '4. 预批/批复', color: 'border-emerald-500' },
    { stage: 'settlement', title: '5. 结算割接', color: 'border-purple-500' }
  ];

  return (
    <div id="kanban-board-page" className="p-6 max-w-7xl mx-auto space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center space-x-2">
          <Kanban className="w-5 h-5 text-[var(--accent)]" />
          <h1 className="text-xl font-extrabold text-[var(--text-primary)]">
            案件推进看板 (Kanban Pipeline)
          </h1>
        </div>

        <button
          onClick={() => setNewCaseModalOpen(true)}
          className="px-3.5 py-1.5 rounded-xl bg-[var(--accent)] text-white text-xs font-bold hover:brightness-110 flex items-center space-x-1 shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>新建案件</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 flex-1 overflow-x-auto pb-4">
        {columns.map((col) => {
          const colCases = cases.filter((c) => c.stage === col.stage);
          return (
            <div
              key={col.stage}
              className={`bg-[var(--bg-card)] border-t-4 ${col.color} border-x border-b border-[var(--border)] rounded-xl p-3 flex flex-col h-full min-w-[200px] shadow-xs`}
            >
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border-subtle)] shrink-0">
                <span className="font-bold text-xs text-[var(--text-primary)]">{col.title}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[var(--bg-app)] font-bold text-[var(--text-secondary)]">
                  {colCases.length}
                </span>
              </div>

              <div className="space-y-2 flex-1 overflow-y-auto pr-1">
                {colCases.map((c) => (
                  <motion.div
                    key={c.id}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setSelectedCaseId(c.id);
                      setCurrentView('case_detail', c.id);
                    }}
                    className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] hover:border-[var(--accent)] transition-all cursor-pointer shadow-2xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs text-[var(--text-primary)]">{c.clientName}</span>
                      <span className="text-[10px] font-bold text-[var(--accent)]">{c.bankName}</span>
                    </div>

                    <p className="text-[11px] font-bold text-[var(--text-secondary)]">
                      ${(c.loanAmount / 1000).toFixed(0)}k · <span className="font-normal text-[var(--text-muted)]">{c.loanType}</span>
                    </p>

                    <p className="text-[10px] text-[var(--text-muted)] truncate">
                      {c.statusText}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
