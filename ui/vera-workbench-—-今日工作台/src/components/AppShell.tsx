import React, { useEffect } from 'react';
import { TopNavBar } from './TopNavBar';
import { LeftSidebar } from './LeftSidebar';
import { HomePage } from './brain/HomePage';
import { CaseDetailView } from './CaseDetailView';
import { KanbanView } from './KanbanView';
import { AnalyticsView } from './AnalyticsView';
import { SettingsView } from './SettingsView';
import { DraftsView, ArchiveView, ImportHistoryView, MigrationView } from './SecondaryViews';
import { NewCaseModal } from './NewCaseModal';
import { EmailComposeModal } from './EmailComposeModal';
import { useWorkbenchStore } from '../store/useStore';

export const AppShell: React.FC = () => {
  const { currentView, fetchInitialData } = useWorkbenchStore((s) => ({
    currentView: s.currentView,
    fetchInitialData: s.fetchInitialData
  }));

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const renderMainContent = () => {
    switch (currentView) {
      case 'home':
      case 'tasks':
        return <HomePage />;
      case 'case_detail':
        return <CaseDetailView />;
      case 'kanban':
        return <KanbanView />;
      case 'analytics':
        return <AnalyticsView />;
      case 'settings':
        return <SettingsView />;
      case 'drafts':
        return <DraftsView />;
      case 'archive':
        return <ArchiveView />;
      case 'import_history':
        return <ImportHistoryView />;
      case 'migration':
        return <MigrationView />;
      default:
        return <HomePage />;
    }
  };

  return (
    <div id="app-shell-root" className="h-screen w-screen flex flex-col bg-[var(--bg-app)] text-[var(--text-primary)] overflow-hidden">
      {/* 1. Fixed Top Application Bar */}
      <TopNavBar />

      {/* 2. Main Fixed Horizontal Split (Sidebar + Scrollable Main Content) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Fixed Left Sidebar */}
        <LeftSidebar />

        {/* Scrollable Main Desktop Workspace Area */}
        <main className="flex-1 overflow-y-auto relative h-full bg-[var(--bg-app)]" id="main-content-scroll-area">
          {renderMainContent()}
        </main>
      </div>

      {/* Global Modals */}
      <NewCaseModal />
      <EmailComposeModal />
    </div>
  );
};
