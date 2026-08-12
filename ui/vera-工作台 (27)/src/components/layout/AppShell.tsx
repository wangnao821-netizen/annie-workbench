import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { KpiBar } from './KpiBar';
import { FilterBar } from './FilterBar';
import { ViewId, FilterId } from '../../types/navigation';
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
import { NewCaseModal } from '../cases/NewCaseModal';
import { NewTaskModal } from '../cases/NewTaskModal';
import { OsWorkbench } from '../os/OsWorkbench';
import { useUiStore } from '../../stores/uiStore';
import { useCaseStore } from '../../stores/caseStore';
import { CaseListSidebar } from '../brain/CaseListSidebar';
import { BrainChat } from '../brain/BrainChat';
import { CasePanorama } from '../brain/CasePanorama';
import { GlobalStatsPanel } from '../brain/GlobalStatsPanel';

export function AppShell() {
  const [view, setView] = useState<ViewId>("brain");
  const [activeFilter, setActiveFilter] = useState<FilterId>("all");
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
      className="h-screen w-screen flex overflow-hidden select-none transition-colors duration-200"
      style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)' }}
      id="app-shell"
    >
      {view === "brain" ? (
        /* Three-column AI First Brain Workspace */
        <div className="w-full h-full flex overflow-hidden" id="brain-workspace">
          <CaseListSidebar activeView={view} onNavigate={(v) => setView(v)} />
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
      ) : (
        /* Legacy Sub-views Layout with Left Sidebar */
        <>
          <Sidebar 
            activeTab={view} 
            onTabChange={(v) => setView(v)} 
          />

          <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0" id="main-content">
            {/* Top Bar with "Back to Brain Chat" Button */}
            <div className="px-4 py-2 border-b flex items-center justify-between flex-shrink-0" style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setView("brain")}
                className="px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center space-x-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                id="back-to-brain-btn"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-purple-500" />
                <span>返回对话</span>
              </motion.button>
            </div>

            {/* Top KPI Bar */}
            <KpiBar onNewTask={() => setView("tasks")} />

            {/* Filter Bar (Visible in Tasks Workbench) */}
            {view === "tasks" && (
              <FilterBar 
                activeFilter={activeFilter} 
                onFilterChange={setActiveFilter} 
              />
            )}

            {/* Dynamic Page View Router */}
            <div className="flex-1 flex overflow-hidden relative" id="page-router-view">
              {view === "tasks" && <TaskWorkbench activeFilter={activeFilter} />}
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
                <Analytics onBack={() => setView("cases")} />
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
            </div>
          </div>
        </>
      )}

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
