import { useState, useEffect } from 'react';
import { useTaskStore } from '../../stores/taskStore';
import { useCaseStore } from '../../stores/caseStore';
import { ContextBar } from './ContextBar';
import { EmptyDetail } from './EmptyDetail';
import { EmailDispatchDetail } from './details/EmailDispatchDetail';
import { NewClientDetail } from './details/NewClientDetail';
import { GeneralEmailDetail } from './details/GeneralEmailDetail';
import { FileMatchDetail } from './details/FileMatchDetail';
import { OsAttackDetail } from './details/OsAttackDetail';
import { BossDecisionDetail } from './details/BossDecisionDetail';
import { OverdueDetail } from './details/OverdueDetail';
import { SettlementDetail } from './details/SettlementDetail';
import { ContextDrawer } from './ContextDrawer';
import { ChecklistDrawerContent } from './ChecklistDrawerContent';
import { TimelinePanel } from './details/TimelinePanel';
import { BrainPanel } from './details/BrainPanel';
import { ChatPanel } from '../chat/ChatPanel';
import { PanelDivider } from './PanelDivider';

export function DetailPanel() {
  const { tasks, selectedTaskId } = useTaskStore();
  const { currentCase, setCurrentCase } = useCaseStore();
  const [drawer, setDrawer] = useState<null | "checklist" | "timeline" | "brain">(null);

  const [isWide, setIsWide] = useState(() => window.innerWidth >= 1280);
  const [chatWidth, setChatWidth] = useState(() => {
    const saved = Number(localStorage.getItem('vera-chat-width'));
    return saved >= 300 && saved <= 560 ? saved : 380;
  });
  const [chatHeight, setChatHeight] = useState(() => {
    const saved = Number(localStorage.getItem('vera-chat-height'));
    return saved >= 160 && saved <= 480 ? saved : 320;
  });
  const [chatCollapsed, setChatCollapsed] = useState(() => localStorage.getItem('vera-chat-collapsed') === '1');

  useEffect(() => {
    const handleResize = () => setIsWide(window.innerWidth >= 1280);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    localStorage.setItem('vera-chat-collapsed', chatCollapsed ? '1' : '0');
  }, [chatCollapsed]);

  const activeTask = tasks.find((t) => t.id === selectedTaskId);

  // Sync current active task to caseStore for ContextBar
  useEffect(() => {
    if (!activeTask) {
      if (currentCase !== null) setCurrentCase(null);
      return;
    }

    if (activeTask.type === "NEW_CLIENT") {
      if (currentCase !== null) setCurrentCase(null);
    } else if (activeTask.caseName) {
      const targetCaseId = activeTask.caseId || "CASE-2026-0801";
      if (currentCase?.caseId !== targetCaseId) {
        setCurrentCase({
          caseId: targetCaseId,
          clientName: activeTask.caseName,
          lender: activeTask.caseBank || "NAB Bank",
          loanAmount: activeTask.loanAmount || 850000,
          stage: activeTask.completed ? "已完成归档" : "补件与条件审理",
          checklistDone: 8,
          checklistTotal: 12,
          checklistProgress: 67,
          summary: activeTask.aiSummary || "案件跟进中，自动匹配全量银行回复。",
          deadline: "8 天内 (Finance Due)",
          lvr: 80,
        });
      }
    }
  }, [activeTask, currentCase, setCurrentCase]);

  if (!activeTask) {
    return <EmptyDetail />;
  }

  const renderDetailContent = () => {
    switch (activeTask.type) {
      case "EMAIL_DISPATCH": return <EmailDispatchDetail task={activeTask} />;
      case "FILE_MATCH": return <FileMatchDetail task={activeTask} />;
      case "OS_ATTACK": return <OsAttackDetail task={activeTask} />;
      case "BOSS_DECISION": return <BossDecisionDetail task={activeTask} />;
      case "OVERDUE_REMINDER": return <OverdueDetail task={activeTask} />;
      case "SETTLEMENT": return <SettlementDetail task={activeTask} />;
      case "NEW_CLIENT": return <NewClientDetail task={activeTask} />;
      case "GENERAL_EMAIL": return <GeneralEmailDetail task={activeTask} />;
      default: return <EmailDispatchDetail task={activeTask} />;
    }
  };

  const hasCaseContext = activeTask.type !== "NEW_CLIENT" && !!activeTask.caseName;
  const activeCaseId = activeTask.caseId || currentCase?.caseId || "CASE-2026-0801";

  return (
    <div 
      className="flex-1 flex flex-col h-full overflow-hidden transition-colors"
      style={{ backgroundColor: 'var(--bg-app)' }}
      id="workbench-detail-panel"
    >
      {/* 1. ContextBar (Only displayed if task has case context) */}
      {hasCaseContext && <ContextBar onOpenDrawer={setDrawer} />}

      {/* 1.5 Enter Case Chat Banner for caseId */}
      {activeTask.caseId && (
        <div className="flex items-center justify-between px-6 py-2 bg-[var(--accent-soft)] border-b border-[var(--accent-soft)] text-xs flex-shrink-0">
          <span className="font-semibold text-[var(--accent)]">
            关联案件: {activeTask.caseName || activeTask.caseId} ({activeTask.caseBank || '银行'})
          </span>
          <button
            onClick={() => {
              const cases = useCaseStore.getState().cases;
              let targetCase = cases.find((c) => c.caseId === activeTask.caseId);
              if (!targetCase) {
                targetCase = {
                  caseId: activeTask.caseId!,
                  clientName: activeTask.caseName || '案件客户',
                  lender: activeTask.caseBank || '贷款银行',
                  loanAmount: activeTask.loanAmount || 0,
                  stage: '补件与条件审理',
                  checklistDone: 8,
                  checklistTotal: 12,
                  checklistProgress: 67,
                  summary: activeTask.aiSummary || '跟进中',
                  deadline: '',
                };
              }
              useCaseStore.getState().setCurrentCase(targetCase);
              window.dispatchEvent(new CustomEvent('app-navigate', { detail: 'brain' }));
            }}
            className="px-3 py-1 rounded-lg text-xs font-bold text-white btn-primary shadow-2xs flex items-center space-x-1 cursor-pointer transition-colors"
            id="detail-enter-brain-btn"
          >
            <span>💬 进入案件对话</span>
          </button>
        </div>
      )}

      {/* 2. Scrollable Detail Area & ChatPanel */}
      <div className={`flex-1 flex overflow-hidden ${isWide ? 'flex-row' : 'flex-col'}`}>
        {/* Left/Top: Task Detail */}
        <div className="flex-1 overflow-y-auto p-4 no-scrollbar" id="task-detail-area">
          <div className="max-w-4xl mx-auto space-y-6">
            {renderDetailContent()}
          </div>
        </div>

        {/* Wide screen: Resizable PanelDivider + ChatPanel */}
        {isWide && !chatCollapsed && (
          <>
            <PanelDivider
              orientation="vertical"
              initialWidth={chatWidth}
              minWidth={300}
              maxWidth={560}
              onResize={(w) => {
                setChatWidth(w);
                localStorage.setItem('vera-chat-width', String(w));
              }}
            />
            <div style={{ width: chatWidth }} className="h-full flex-shrink-0">
              <ChatPanel caseId={hasCaseContext ? activeCaseId : null} onToggleCollapse={() => setChatCollapsed(true)} />
            </div>
          </>
        )}

        {/* Wide screen & Collapsed: collapsed strip */}
        {isWide && chatCollapsed && (
          <div className="w-10 flex-shrink-0 border-l flex flex-col items-center py-2" style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}>
            <button onClick={() => setChatCollapsed(false)} title="展开 AI 对话" id="chat-expand-btn" className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] cursor-pointer text-xs font-bold">🤖</button>
          </div>
        )}

        {/* Narrow screen: Bottom AI Chat Panel */}
        {!isWide && !chatCollapsed && (
          <>
            <PanelDivider
              orientation="horizontal"
              initialWidth={chatHeight}
              minWidth={160}
              maxWidth={480}
              onResize={(h) => {
                setChatHeight(h);
                localStorage.setItem('vera-chat-height', String(h));
              }}
            />
            <div style={{ height: chatHeight }} className="flex-shrink-0">
              <ChatPanel
                caseId={hasCaseContext ? activeCaseId : null}
                onToggleCollapse={() => setChatCollapsed(true)}
              />
            </div>
          </>
        )}
        {/* Narrow screen & Collapsed: bottom 40px bar */}
        {!isWide && chatCollapsed && (
          <div
            className="h-10 flex-shrink-0 border-t flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
          >
            <button
              onClick={() => setChatCollapsed(false)}
              id="chat-expand-btn"
              className="text-xs font-semibold flex items-center space-x-1.5 cursor-pointer hover:opacity-80 transition-opacity"
              style={{ color: 'var(--accent)' }}
            >
              <span>🤖 展开 AI 对话</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. Context Drawers */}
      <ContextDrawer title="递交清单" open={drawer === "checklist"} onClose={() => setDrawer(null)}>
        <ChecklistDrawerContent caseId={activeCaseId} />
      </ContextDrawer>
      <ContextDrawer title="案件时间线" open={drawer === "timeline"} onClose={() => setDrawer(null)}>
        <TimelinePanel caseId={activeCaseId} />
      </ContextDrawer>
      <ContextDrawer title="客户全景" open={drawer === "brain"} onClose={() => setDrawer(null)}>
        <BrainPanel caseId={activeCaseId} />
      </ContextDrawer>
    </div>
  );
}
