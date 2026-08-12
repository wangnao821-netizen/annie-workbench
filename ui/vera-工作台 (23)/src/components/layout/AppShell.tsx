import { useState } from 'react';
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

export function AppShell() {
  const [view, setView] = useState<ViewId>("tasks");
  const [activeFilter, setActiveFilter] = useState<FilterId>("all");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  const newCaseOpen = useUiStore((s) => s.newCaseOpen);
  const setNewCaseOpen = useUiStore((s) => s.setNewCaseOpen);
  const newTaskOpen = useUiStore((s) => s.newTaskOpen);
  const setNewTaskOpen = useUiStore((s) => s.setNewTaskOpen);
  const osWorkbenchTaskId = useUiStore((s) => s.osWorkbenchTaskId);
  const closeOsWorkbench = useUiStore((s) => s.closeOsWorkbench);
  const setCurrentCase = useCaseStore((s) => s.setCurrentCase);

  return (
    <div 
      className="h-screen w-screen flex overflow-hidden select-none transition-colors duration-200"
      style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)' }}
      id="app-shell"
    >
      {/* Left Sidebar (60px) */}
      <Sidebar 
        activeTab={view} 
        onTabChange={(v) => setView(v)} 
      />

      {/* Main Content Area (flex: 1, column) */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0" id="main-content">
        {/* Top KPI Bar */}
        <KpiBar onNewTask={() => setView("tasks")} />

        {/* Filter Bar (Visible in Tasks Workbench) */}
        {view === "tasks" && (
          <FilterBar 
            activeFilter={activeFilter} 
            onFilterChange={setActiveFilter} 
          />
        )}

        {/* Dynamic Page View */}
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

      <NewCaseModal
        open={newCaseOpen}
        onClose={() => setNewCaseOpen(false)}
        onCreated={(c) => {
          setCurrentCase(c);
          setView("tasks");
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
