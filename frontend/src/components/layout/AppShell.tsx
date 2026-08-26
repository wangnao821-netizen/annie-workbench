import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { PanelRightOpen } from 'lucide-react';
import { ViewId } from '../../types/navigation';
import { CaseBoard } from '../../pages/CaseBoard';
import { CaseDetail } from '../../pages/CaseDetail';
import { KnowledgeCenter } from '../../pages/KnowledgeCenter';
import { Settings } from '../../pages/Settings';
import { DraftsBox } from '../../pages/DraftsBox';
import { Archive } from '../../pages/Archive';
import { ImportHistory } from '../../pages/ImportHistory';
import { Migration } from '../../pages/Migration';
import { Analytics } from '../../pages/Analytics';
import { HomePage } from '../brain/HomePage';
import { NewCaseSheet } from '../cases/NewCaseSheet';
import { NewTaskModal } from '../cases/NewTaskModal';
import { OsWorkbench } from '../os/OsWorkbench';
import { TaskDetailOverlay } from '../tasks/TaskDetailOverlay';
import { useUiStore } from '../../stores/uiStore';
import { useCaseStore } from '../../stores/caseStore';
import { useTaskStore } from '../../stores/taskStore';
import { TopNavBar } from './TopNavBar';
import { CaseListSidebar } from '../brain/CaseListSidebar';
import { BrainChat } from '../brain/BrainChat';
import { CasePanorama } from '../brain/CasePanorama';
import { GlobalStatsPanel } from '../brain/GlobalStatsPanel';
import { RightDeckTabs } from '../brain/RightDeckTabs';
import { ChecklistDeck } from '../brain/ChecklistDeck';
import { TaskDeckContent } from '../brain/TaskDeckContent';
import { FileDeckContent } from '../brain/FileDeckContent';
import { OnboardingModal } from '../onboarding/OnboardingModal';

export function AppShell() {
  const [view, setView] = useState<ViewId>("home");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [panoramaCollapsed, setPanoramaCollapsed] = useState(false);

  useEffect(() => {
    const handleOpenCaseDetail = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        setSelectedCaseId(customEvent.detail);
        setView("case-detail");
      }
    };
    const handleOpenCaseBrain = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        setSelectedCaseId(customEvent.detail);
        useUiStore.getState().setRightDeckTab('checklist');
        setView("brain");
      }
    };
    const handleOpenArchiveHub = () => {
      setView("archive");
    };
    window.addEventListener('open-case-detail', handleOpenCaseDetail);
    window.addEventListener('open-case-brain', handleOpenCaseBrain);
    window.addEventListener('open-archive-hub', handleOpenArchiveHub);
    return () => {
      window.removeEventListener('open-case-detail', handleOpenCaseDetail);
      window.removeEventListener('open-case-brain', handleOpenCaseBrain);
      window.removeEventListener('open-archive-hub', handleOpenArchiveHub);
    };
  }, []);

  const newCaseOpen = useUiStore((s) => s.newCaseOpen);
  const setNewCaseOpen = useUiStore((s) => s.setNewCaseOpen);
  const newTaskOpen = useUiStore((s) => s.newTaskOpen);
  const setNewTaskOpen = useUiStore((s) => s.setNewTaskOpen);
  const osWorkbenchTaskId = useUiStore((s) => s.osWorkbenchTaskId);
  const closeOsWorkbench = useUiStore((s) => s.closeOsWorkbench);

  const taskDetailOpen = useUiStore((s) => s.taskDetailOpen);
  const activeTaskDetailId = useUiStore((s) => s.activeTaskDetailId);
  const closeTaskDetail = useUiStore((s) => s.closeTaskDetail);
  const onboardingOpen = useUiStore((s) => s.onboardingOpen);
  const setOnboardingOpen = useUiStore((s) => s.setOnboardingOpen);
  const tasks = useTaskStore((s) => s.tasks);
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId);

  const currentCase = useCaseStore((s) => s.currentCase);
  const setCurrentCase = useCaseStore((s) => s.setCurrentCase);

  const reduced = useReducedMotion();
  const rightDeckTab = useUiStore((s) => s.rightDeckTab);

  const targetOverlayTaskId = activeTaskDetailId ?? selectedTaskId;
  const activeOverlayTask = tasks.find((t) => t.id === targetOverlayTaskId) ?? null;

  return (
    <div 
      className="h-screen w-screen flex flex-col overflow-hidden select-none transition-colors duration-200"
      style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)' }}
      id="app-shell"
    >
      {/* 1. 顶部固定应用工具栏 (Top Application Header Bar) */}
      <TopNavBar onNavigate={(v) => setView(v)} />

      {/* 2. 主体骨架 (Sidebar + Router Area) */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative" id="app-workspace-body">
        {/* 左侧固定导航栏 (Fixed Case List & Bottom Nav Sidebar) */}
        <CaseListSidebar 
          activeView={view} 
          onNavigate={(v) => setView(v)} 
        />

        {/* 主内容路由区 (Main Scrollable Workspace Router) */}
        <main className="flex-1 flex overflow-hidden min-w-0 relative" id="main-workbench-content">
          {view === "home" && (
            <HomePage onNavigate={(v) => setView(v)} />
          )}

          {view === "brain" && (
            <div className="w-full h-full flex overflow-hidden" id="brain-workspace">
              <BrainChat
                caseId={currentCase?.caseId ?? null}
                onTogglePanorama={() => setPanoramaCollapsed(!panoramaCollapsed)}
                onToggleRightDeck={currentCase ? () => setPanoramaCollapsed(!panoramaCollapsed) : undefined}
                isRightDeckCollapsed={panoramaCollapsed}
              />
              {currentCase ? (
                <motion.aside
                  id="right-working-deck"
                  initial={false}
                  animate={{ width: panoramaCollapsed ? 28 : 420 }}
                  transition={reduced ? { duration: 0.15 } : { type: 'spring', damping: 25, stiffness: 300 }}
                  className="h-full shrink-0 border-l select-none overflow-hidden relative flex flex-col"
                  style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
                >
                  {panoramaCollapsed ? (
                    <div
                      className="h-full w-full flex flex-col items-center justify-between py-4 cursor-pointer"
                      onClick={() => setPanoramaCollapsed(false)}
                      title="点击展开工作台"
                      id="expand-right-deck-btn"
                    >
                      <motion.button whileTap={{ scale: 0.92 }} className="p-1 rounded text-muted hover:text-primary">
                        <PanelRightOpen className="w-4 h-4" />
                      </motion.button>
                      <span
                        className="text-[11px] font-extrabold text-muted tracking-widest whitespace-nowrap"
                        style={{ writingMode: 'vertical-rl' }}
                      >
                        {rightDeckTab === 'panorama' ? '客户全景' : rightDeckTab === 'checklist' ? '材料清单' : rightDeckTab === 'files' ? '案卷文件' : '客户任务'}
                      </span>
                      <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                    </div>
                  ) : (
                    <div className="h-full flex flex-col overflow-hidden">
                      {/* Top Deck Header: RightDeckTabs */}
                      <RightDeckTabs />

                      {/* Deck View Content */}
                      <div className="flex-1 overflow-hidden min-h-0 relative">
                        {rightDeckTab === 'panorama' && (
                          <CasePanorama
                            caseId={currentCase.caseId}
                            collapsed={false}
                            onToggle={() => setPanoramaCollapsed(!panoramaCollapsed)}
                            hideOuterHeader
                          />
                        )}
                        {rightDeckTab === 'checklist' && (
                          <ChecklistDeck caseId={currentCase.caseId} />
                        )}
                        {rightDeckTab === 'files' && (
                          <FileDeckContent caseId={currentCase.caseId} />
                        )}
                        {rightDeckTab === 'tasks' && (
                          <TaskDeckContent caseId={currentCase.caseId} />
                        )}
                      </div>
                    </div>
                  )}
                </motion.aside>
              ) : (
                <GlobalStatsPanel onNavigate={(v) => setView(v)} />
              )}
            </div>
          )}

          {view === "tasks" && (
            <HomePage onNavigate={(v) => setView(v)} />
          )}

          {view === "cases" && (
            <CaseBoard
              onOpenCase={(caseId) => {
                setSelectedCaseId(caseId);
                setView("case-detail");
              }}
              onViewAnalytics={() => setView("analytics")}
            />
          )}

          {view === "analytics" && (
            <Analytics onBack={() => setView("home")} />
          )}

          {view === "case-detail" && selectedCaseId && (
            <CaseDetail
              caseId={selectedCaseId}
              onBack={() => setView("cases")}
            />
          )}

          {view === "knowledge" && <KnowledgeCenter />}
          {view === "settings" && <Settings />}
          {view === "drafts" && <DraftsBox />}
          {view === "archive" && <Archive />}
          {view === "imports" && <ImportHistory />}
          {view === "migration" && <Migration />}
        </main>
      </div>

      {/* 3. 全局 Modals & Drawer Overlays */}
      <NewCaseSheet
        open={newCaseOpen}
        onClose={() => setNewCaseOpen(false)}
        onCreated={(c) => {
          setCurrentCase(c);
          setView("brain");
          useCaseStore.getState().fetchCases();
        }}
      />

      <NewTaskModal
        open={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
        onOpenNewCase={() => {
          setNewTaskOpen(false);
          setNewCaseOpen(true);
        }}
      />

      {osWorkbenchTaskId !== null && (
        <OsWorkbench
          taskId={osWorkbenchTaskId}
          onClose={closeOsWorkbench}
        />
      )}

      {taskDetailOpen && activeOverlayTask && (
        <TaskDetailOverlay
          task={activeOverlayTask}
          onClose={closeTaskDetail}
        />
      )}

      <OnboardingModal
        forceOpen={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
      />
    </div>
  );
}
