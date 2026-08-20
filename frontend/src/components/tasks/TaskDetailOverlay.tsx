import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X, CheckCircle2, ArrowUpRight, MessageSquare, Briefcase } from 'lucide-react';
import { TaskItem } from '../../types';
import { useCaseStore } from '../../stores/caseStore';
import { useUiStore } from '../../stores/uiStore';
import { ContextBar } from '../panel/ContextBar';
import { EmailDispatchDetail } from '../panel/details/EmailDispatchDetail';
import { NewClientDetail } from '../panel/details/NewClientDetail';
import { GeneralEmailDetail } from '../panel/details/GeneralEmailDetail';
import { FileMatchDetail } from '../panel/details/FileMatchDetail';
import { OsAttackDetail } from '../panel/details/OsAttackDetail';
import { BossDecisionDetail } from '../panel/details/BossDecisionDetail';
import { OverdueDetail } from '../panel/details/OverdueDetail';
import { SettlementDetail } from '../panel/details/SettlementDetail';
import { ContextDrawer } from '../panel/ContextDrawer';
import { ChecklistDrawerContent } from '../panel/ChecklistDrawerContent';
import { TimelinePanel } from '../panel/details/TimelinePanel';
import { BrainPanel } from '../panel/details/BrainPanel';

interface TaskDetailOverlayProps {
  task: TaskItem | null;
  onClose: () => void;
}

export function TaskDetailOverlay({ task, onClose }: TaskDetailOverlayProps) {
  const reduced = useReducedMotion();
  const { currentCase, setCurrentCase, cases } = useCaseStore();
  const [drawer, setDrawer] = useState<null | 'checklist' | 'timeline' | 'brain'>(null);

  // Sync active task context to caseStore so ContextBar displays case facts correctly
  useEffect(() => {
    if (!task) return;

    if (task.type === 'NEW_CLIENT') {
      if (currentCase !== null) setCurrentCase(null);
    } else if (task.caseName) {
      const targetCaseId = task.caseId || 'CASE-2026-0801';
      if (currentCase?.caseId !== targetCaseId) {
        const foundCase = cases.find((c) => c.caseId === targetCaseId);
        if (foundCase) {
          setCurrentCase(foundCase);
        } else {
          setCurrentCase({
            caseId: targetCaseId,
            clientName: task.caseName,
            lender: task.caseBank || 'NAB Bank',
            loanAmount: task.loanAmount || 850000,
            stage: task.completed ? '已完成归档' : '补件与条件审理',
            checklistDone: 8,
            checklistTotal: 12,
            checklistProgress: 67,
            summary: task.aiSummary || '案件跟进中，自动匹配全量银行回复。',
            deadline: '8 天内 (Finance Due)',
            lvr: 80,
          });
        }
      }
    }
  }, [task, currentCase, setCurrentCase, cases]);

  // Esc key press closes overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!task) return null;

  const renderDetailContent = () => {
    switch (task.type) {
      case 'EMAIL_DISPATCH':
        return <EmailDispatchDetail task={task} />;
      case 'FILE_MATCH':
        return <FileMatchDetail task={task} />;
      case 'OS_ATTACK':
        return <OsAttackDetail task={task} />;
      case 'BOSS_DECISION':
        return <BossDecisionDetail task={task} />;
      case 'OVERDUE_REMINDER':
        return <OverdueDetail task={task} />;
      case 'SETTLEMENT':
        return <SettlementDetail task={task} />;
      case 'NEW_CLIENT':
        return <NewClientDetail task={task} />;
      case 'GENERAL_EMAIL':
        return <GeneralEmailDetail task={task} />;
      default:
        return <EmailDispatchDetail task={task} />;
    }
  };

  const hasCaseContext = task.type !== 'NEW_CLIENT' && Boolean(task.caseName);
  const activeCaseId = task.caseId || currentCase?.caseId || 'CASE-2026-0801';

  const handleEnterBrainChat = () => {
    let targetCase = cases.find((c) => c.caseId === task.caseId);
    if (!targetCase && task.caseName) {
      const cleanName = task.caseName.replace(/\(.*?\)/g, '').trim();
      targetCase = cases.find((c) => c.clientName.includes(cleanName));
    }
    if (!targetCase) {
      targetCase = {
        caseId: task.caseId || 'CASE-2026-0801',
        clientName: task.caseName || '客户',
        lender: task.caseBank || '贷款银行',
        loanAmount: task.loanAmount || 850000,
        stage: '补件与条件审理',
        checklistDone: 8,
        checklistTotal: 12,
        checklistProgress: 67,
        summary: task.aiSummary || '跟进中',
        deadline: '',
      };
    }
    setCurrentCase(targetCase);
    onClose();
    useUiStore.getState().setPendingChatPrompt(`针对任务"${task.title}"的跟进方案：`);
    window.dispatchEvent(new CustomEvent('app-navigate', { detail: 'brain' }));
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 bg-[var(--bg-app)]/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 select-none"
        onClick={onClose}
        id="task-detail-overlay-backdrop"
      >
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full max-w-6xl h-[92vh] max-h-[900px] bg-[var(--bg-app)] rounded-2xl shadow-2xl border flex flex-col overflow-hidden relative"
          style={{ borderColor: 'var(--border)' }}
          onClick={(e) => e.stopPropagation()}
          id="task-detail-overlay-panel"
        >
          {/* Header */}
          <div
            className="px-5 py-3.5 border-b flex items-center justify-between flex-shrink-0 glass-panel"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-center space-x-3 min-w-0 flex-1 pr-4">
              <div className="p-2 rounded-xl bg-[var(--purple-soft)] text-[var(--purple)] flex-shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center space-x-2 flex-wrap">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--purple)]">
                    任务处理详情 (Task #{task.id})
                  </span>
                  {task.caseName && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--bg-subtle)] text-secondary flex items-center">
                      <Briefcase className="w-3 h-3 mr-1 inline" />
                      {task.caseName} {task.caseBank ? `(${task.caseBank})` : ''}
                    </span>
                  )}
                  {((task.status === 'in_progress' && (task.assignee === 'vera' || task.delegatedTo === 'vera')) || (task.assignee === 'vera' && !task.completed)) && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-soft)]">
                      🙋 Vera 正在跟进
                    </span>
                  )}
                  {task.completed && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--green-soft)] text-[var(--green)]">
                      已完成
                    </span>
                  )}
                </div>
                <h2 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)] truncate">
                  {task.title || task.subtitle}
                </h2>
              </div>
            </div>

            {/* Action buttons & Close */}
            <div className="flex items-center space-x-2 flex-shrink-0">
              {(task.caseId || task.caseName) && (
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={handleEnterBrainChat}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs flex items-center space-x-1 cursor-pointer transition-opacity"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
                  id="task-overlay-brain-btn"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>进入案件对话</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </motion.button>
              )}

              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={onClose}
                className="p-1.5 rounded-xl border text-muted hover:text-primary cursor-pointer transition-colors"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                id="task-overlay-close-btn"
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>
          </div>

          {/* ContextBar (displayed if case context exists) */}
          {hasCaseContext && <ContextBar onOpenDrawer={setDrawer} />}

          {/* Detail Workshop View */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 no-scrollbar relative" id="task-overlay-body">
            <div className="max-w-4xl mx-auto space-y-6">
              {renderDetailContent()}
            </div>
          </div>

          {/* Drawer Overlays (Checklist / Timeline / Brain) */}
          <ContextDrawer
            open={drawer !== null}
            onClose={() => setDrawer(null)}
            title={
              drawer === 'checklist'
                ? '材料缺口清单'
                : drawer === 'timeline'
                ? '证据链与时间线'
                : 'CASE 大脑总结'
            }
          >
            {drawer === 'checklist' && <ChecklistDrawerContent caseId={activeCaseId} />}
            {drawer === 'timeline' && <TimelinePanel caseId={activeCaseId} />}
            {drawer === 'brain' && <BrainPanel caseId={activeCaseId} />}
          </ContextDrawer>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
