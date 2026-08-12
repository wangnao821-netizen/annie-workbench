import { useState } from 'react';
import { ViewId } from '../../types/navigation';
import { TaskWorkbench } from '../../pages/TaskWorkbench';
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
import { NewCaseModal } from '../cases/NewCaseModal';
import { NewTaskModal } from '../cases/NewTaskModal';
import { OsWorkbench } from '../os/OsWorkbench';
import { useUiStore } from '../../stores/uiStore';
import { useCaseStore } from '../../stores/caseStore';
import { TopNavBar } from './TopNavBar';
import { CaseListSidebar } from '../brain/CaseListSidebar';
import { BrainChat } from '../brain/BrainChat';
import { CasePanorama } from '../brain/CasePanorama';
import { GlobalStatsPanel } from '../brain/GlobalStatsPanel';

export function AppShell() {
  const [view, setView] = useState<ViewId>("home");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [panoramaCollapsed, setPanoramaCollapsed] = useState(false);

  const newCaseOpen = useUiStore((s) => s.newCaseOpen);
  const setNewCaseOpen = useUiStore((s) => s.setNewCaseOpen);
  const newTaskOpen = useUiStore((s) => s.newTaskOpen);
  const setNewTaskOpen = useUiStore((s) => s.setNewTaskOpen);
  const osWorkbenchTaskId = useUiStore((s) => s.osWorkbenchTaskId);
  const closeOsWorkbench = useUiStore((s) => s.closeOsWorkbench);

  const currentCase = useCaseStore((s) => s.currentCase);
  const setCurrentCase = useCaseStore((s) => s.setCurrentCase);

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
              />
              {currentCase ? (
                <CasePanorama
                  caseId={currentCase.caseId}
                  collapsed={panoramaCollapsed}
                  onToggle={() => setPanoramaCollapsed(!panoramaCollapsed)}
                />
              ) : (
                <GlobalStatsPanel onNavigate={(v) => setView(v)} />
              )}
            </div>
          )}

          {view === "tasks" && <TaskWorkbench activeFilter="all" />}

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
      <NewCaseModal
        open={newCaseOpen}
        onClose={() => setNewCaseOpen(false)}
        onCreated={(c) => {
          setCurrentCase(c);
          setView("brain");
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
    </div>
  );
}
