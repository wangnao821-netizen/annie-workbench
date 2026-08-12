import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ArrowLeft, LayoutGrid, CheckSquare, Clock, Brain, PauseCircle, ArrowLeftRight, RotateCcw, OctagonX } from 'lucide-react';
import { useCaseStore } from '../stores/caseStore';
import { getCase } from '../services/api/cases';
import { mapCaseResponse } from '../services/caseMapper';
import { useToastStore } from '../stores/toastStore';
import { ChecklistDrawerContent } from '../components/panel/ChecklistDrawerContent';
import { TimelinePanel } from '../components/panel/details/TimelinePanel';
import { BrainPanel } from '../components/panel/details/BrainPanel';

interface CaseDetailProps {
  caseId: string;
  onBack: () => void;
}

type TabKey = 'overview' | 'checklist' | 'timeline' | 'brain';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'overview', label: '概览', icon: LayoutGrid },
  { key: 'checklist', label: '清单', icon: CheckSquare },
  { key: 'timeline', label: '时间线', icon: Clock },
  { key: 'brain', label: '大脑', icon: Brain },
];

export function CaseDetail({ caseId, onBack }: CaseDetailProps) {
  const reduced = useReducedMotion();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const { currentCase, setCurrentCase, cases } = useCaseStore();

  useEffect(() => {
    let isMounted = true;
    if (currentCase?.caseId !== caseId) {
      const found = cases.find((c) => c.caseId === caseId);
      if (found) {
        setCurrentCase(found);
      } else {
        getCase(caseId)
          .then((res) => {
            if (isMounted) {
              setCurrentCase(mapCaseResponse(res));
            }
          })
          .catch(() => { /* fallback */ });
      }
    }
    return () => {
      isMounted = false;
    };
  }, [caseId, cases, currentCase?.caseId, setCurrentCase]);

  const caseData = currentCase?.caseId === caseId ? currentCase : cases.find((c) => c.caseId === caseId) || currentCase;

  const handleAction = (actionName: string) => {
    useToastStore.getState().showToast('info', `TODO(WO-08): ${actionName} 功能开发中`);
  };

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: 24 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="flex-1 flex flex-col h-full overflow-hidden p-6 space-y-4"
      id="case-detail-page"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-3">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onBack}
            className="p-2 rounded-xl border flex items-center space-x-1.5 text-xs font-medium cursor-pointer transition-colors"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
            id="case-detail-back"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>返回案件看板</span>
          </motion.button>
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {caseData?.clientName || '加载中...'}
            </h2>
            {caseData?.lender && (
              <span className="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400">
                {caseData.lender}
              </span>
            )}
            {caseData?.stage && (
              <span className="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                {caseData.stage}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 flex space-x-6 overflow-hidden min-h-0">
        {/* Left Partition Nav */}
        <div className="w-40 flex-shrink-0 space-y-1.5 pt-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.key;
            return (
              <motion.button
                key={t.key}
                whileTap={{ scale: 0.97 }}
                onClick={() => setActiveTab(t.key)}
                className={`relative w-full px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center space-x-2 cursor-pointer transition-colors ${
                  isActive ? 'text-[var(--accent)] bg-[var(--accent-soft)]' : 'text-secondary hover:text-primary'
                }`}
                id={`case-detail-nav-${t.key}`}
              >
                {isActive && !reduced && (
                  <motion.span
                    layoutId="case-detail-nav-indicator"
                    className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full"
                    style={{ backgroundColor: 'var(--accent)' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  />
                )}
                {isActive && reduced && (
                  <span
                    className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full"
                    style={{ backgroundColor: 'var(--accent)' }}
                  />
                )}
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
              </motion.button>
            );
          })}
        </div>

        {/* Right Content Area */}
        <div className="flex-1 overflow-y-auto no-scrollbar pr-1 min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.15 }}
              className="h-full"
            >
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 rounded-2xl border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}>
                      <p className="text-[11px] text-muted">贷款金额</p>
                      <p className="text-sm font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>
                        ${(caseData?.loanAmount || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}>
                      <p className="text-[11px] text-muted">LVR</p>
                      <p className="text-sm font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>
                        {caseData?.lvr ? `${caseData.lvr}%` : '80%'}
                      </p>
                    </div>
                    <div className="p-4 rounded-2xl border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}>
                      <p className="text-[11px] text-muted">清单进度</p>
                      <p className="text-sm font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>
                        {caseData?.checklistDone ?? 0} / {caseData?.checklistTotal ?? 0} ({caseData?.checklistProgress ?? 0}%)
                      </p>
                      <div className="w-full bg-black/5 dark:bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${caseData?.checklistProgress ?? 0}%`, backgroundColor: 'var(--accent)' }}
                        />
                      </div>
                    </div>
                    <div className="p-4 rounded-2xl border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}>
                      <p className="text-[11px] text-muted">阶段停留天数</p>
                      <p className="text-sm font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>
                        {caseData?.stageDays ?? 3} 天
                      </p>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl border space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                    <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>生命周期操作</h3>
                    <div className="flex flex-wrap gap-3">
                      {[
                        { label: '暂停案件', icon: PauseCircle, action: '暂停案件' },
                        { label: '更换银行', icon: ArrowLeftRight, action: '更换银行' },
                        { label: '撤回重新递交', icon: RotateCcw, action: '撤回重新递交' },
                        { label: '终止案件', icon: OctagonX, action: '终止案件' },
                      ].map((item) => {
                        const BtnIcon = item.icon;
                        return (
                          <motion.button
                            key={item.label}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => handleAction(item.action)}
                            className="px-3 py-2 rounded-xl border text-xs font-medium flex items-center space-x-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                            style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                          >
                            <BtnIcon className="w-3.5 h-3.5 text-purple-500" />
                            <span>{item.label}</span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'checklist' && <ChecklistDrawerContent caseId={caseId} />}
              {activeTab === 'timeline' && <TimelinePanel caseId={caseId} />}
              {activeTab === 'brain' && <BrainPanel caseId={caseId} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
