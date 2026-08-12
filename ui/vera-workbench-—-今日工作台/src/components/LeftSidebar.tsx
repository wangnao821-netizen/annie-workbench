import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckSquare, 
  Kanban, 
  BarChart2, 
  Settings, 
  Plus, 
  FolderGit2, 
  ChevronRight, 
  Building2, 
  FileText, 
  Archive, 
  DownloadCloud, 
  Database,
  MoreHorizontal,
  Home,
  User,
  AlertCircle
} from 'lucide-react';
import { useWorkbenchStore } from '../store/useStore';
import { ActiveView } from '../types';

export const LeftSidebar: React.FC = () => {
  const { 
    currentView, 
    setCurrentView, 
    selectedCaseId, 
    setSelectedCaseId, 
    cases, 
    searchQuery,
    setNewCaseModalOpen,
    isMoreMenuOpen,
    setMoreMenuOpen
  } = useWorkbenchStore((s) => ({
    currentView: s.currentView,
    setCurrentView: s.setCurrentView,
    selectedCaseId: s.selectedCaseId,
    setSelectedCaseId: s.setSelectedCaseId,
    cases: s.cases,
    searchQuery: s.searchQuery,
    setNewCaseModalOpen: s.setNewCaseModalOpen,
    isMoreMenuOpen: s.isMoreMenuOpen,
    setMoreMenuOpen: s.setMoreMenuOpen
  }));

  const [caseFilter, setCaseFilter] = useState<'all' | 'urgent' | 'submitting'>('all');

  // Filter cases based on search query and filter tab
  const filteredCases = cases.filter(c => {
    const matchesSearch = 
      !searchQuery || 
      c.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.bankName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (caseFilter === 'urgent') return c.urgency === 'high';
    if (caseFilter === 'submitting') return c.stage === 'submission';
    return true;
  });

  const getStageBadgeColor = (stage: string) => {
    switch (stage) {
      case 'submission': return 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300';
      case 'approval': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300';
      case 'docs_collect': return 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300';
      case 'settlement': return 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300';
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    }
  };

  const mainNavItems: { id: ActiveView; label: string; icon: React.ReactNode }[] = [
    { id: 'tasks', label: '待办', icon: <CheckSquare className="w-4 h-4" /> },
    { id: 'kanban', label: '看板', icon: <Kanban className="w-4 h-4" /> },
    { id: 'analytics', label: '统计', icon: <BarChart2 className="w-4 h-4" /> },
    { id: 'settings', label: '设置', icon: <Settings className="w-4 h-4" /> }
  ];

  return (
    <aside 
      id="left-sidebar"
      className="w-64 bg-white border-r border-[#E5E7EB] flex flex-col h-full shrink-0 select-none z-20"
    >
      {/* Brand Header */}
      <div className="p-4 border-b border-[#E5E7EB]">
        <div 
          onClick={() => setCurrentView('home')}
          className="flex items-center gap-2 mb-3 cursor-pointer group"
          id="sidebar-brand-btn"
        >
          <div className="w-8 h-8 bg-[#3B82F6] rounded flex items-center justify-center text-white font-bold text-lg shadow-xs group-hover:bg-blue-600 transition-colors">
            V
          </div>
          <span className="font-bold text-[#111827] text-base tracking-tight">
            Vera Workbench
          </span>
        </div>

        {/* Home Button */}
        <motion.button
          id="sidebar-home-btn"
          whileTap={{ scale: 0.97 }}
          onClick={() => setCurrentView('home')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-semibold transition-all ${
            currentView === 'home'
              ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200'
              : 'bg-[#F9FAFB] text-gray-700 hover:bg-gray-100 border border-[#E5E7EB]'
          }`}
          aria-label="进入今日工作台"
        >
          <div className="flex items-center space-x-2">
            <Home className="w-4 h-4 text-blue-600" />
            <span>今日工作台 (首页)</span>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">
            HQ
          </span>
        </motion.button>
      </div>

      {/* Case List Section Header */}
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          最近案件 ({filteredCases.length})
        </span>
        <motion.button
          id="new-case-btn"
          whileTap={{ scale: 0.95 }}
          onClick={() => setNewCaseModalOpen(true)}
          className="p-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-xs flex items-center space-x-1 text-[10px] font-bold px-2"
          title="新建贷款案件"
          aria-label="新建案件"
        >
          <Plus className="w-3 h-3" />
          <span>新建</span>
        </motion.button>
      </div>

      {/* Case Quick Filters */}
      <div className="px-3 py-1 flex items-center space-x-1 text-[10px] border-b border-[#E5E7EB]">
        <button
          onClick={() => setCaseFilter('all')}
          className={`px-2 py-0.5 rounded transition-colors ${caseFilter === 'all' ? 'bg-gray-100 font-bold text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
        >
          全部
        </button>
        <button
          onClick={() => setCaseFilter('urgent')}
          className={`px-2 py-0.5 rounded transition-colors ${caseFilter === 'urgent' ? 'bg-red-100 text-red-700 font-bold' : 'text-gray-500 hover:text-gray-900'}`}
        >
          高紧急
        </button>
        <button
          onClick={() => setCaseFilter('submitting')}
          className={`px-2 py-0.5 rounded transition-colors ${caseFilter === 'submitting' ? 'bg-amber-100 text-amber-800 font-bold' : 'text-gray-500 hover:text-gray-900'}`}
        >
          递交中
        </button>
      </div>

      {/* Case List Scroll Area */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {filteredCases.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-400 space-y-1">
            <AlertCircle className="w-5 h-5 mx-auto text-gray-300" />
            <p>未查找到匹配案件</p>
          </div>
        ) : (
          filteredCases.map((c) => {
            const isSelected = currentView === 'case_detail' && selectedCaseId === c.id;
            return (
              <motion.div
                key={c.id}
                id={`case-item-${c.id}`}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedCaseId(c.id)}
                className={`flex items-center px-3 py-2 text-xs rounded-md font-medium cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200 shadow-2xs'
                    : 'text-gray-600 hover:bg-gray-100 mb-0.5'
                }`}
              >
                <div className="flex-1 truncate">
                  <div className="flex items-center justify-between">
                    <span className="truncate font-semibold">{c.clientName} - {c.bankName}</span>
                    <span className="text-[10px] text-gray-400 font-normal shrink-0 ml-1">
                      ${(c.loanAmount / 1000).toFixed(0)}k
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Bottom Fixed Navigation Section (Mandatory 4 Entries + More) */}
      <div className="p-2 border-t border-[#E5E7EB] bg-white shrink-0">
        <div className="grid grid-cols-4 gap-1 mb-1">
          {mainNavItems.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                id={`bottom-nav-${item.id}`}
                onClick={() => setCurrentView(item.id)}
                title={item.label}
                className={`p-2 rounded-md flex flex-col items-center transition-opacity ${
                  isActive
                    ? 'bg-blue-50 text-blue-600 font-bold'
                    : 'opacity-70 hover:opacity-100 hover:bg-gray-100 text-gray-600'
                }`}
              >
                {item.icon}
                <span className="text-[9px] font-medium mt-1">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Expandable "More" Trigger */}
        <div className="relative">
          <motion.button
            id="more-menu-btn"
            whileTap={{ scale: 0.97 }}
            onClick={() => setMoreMenuOpen(!isMoreMenuOpen)}
            className="w-full py-1.5 px-2 rounded-md border border-[#E5E7EB] bg-[#F9FAFB] hover:bg-gray-100 text-gray-600 flex items-center justify-between text-[11px] font-medium transition-colors"
            aria-label="展开更多功能"
          >
            <div className="flex items-center space-x-1.5">
              <MoreHorizontal className="w-3.5 h-3.5 text-gray-400" />
              <span>更多能力 (草稿 / 归档)</span>
            </div>
            <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${isMoreMenuOpen ? 'rotate-90' : ''}`} />
          </motion.button>

          {/* More Popup Menu */}
          <AnimatePresence>
            {isMoreMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-full left-0 mb-1 w-full bg-white border border-[#E5E7EB] rounded-xl shadow-lg p-1.5 space-y-0.5 z-50 text-xs"
              >
                <button
                  id="more-drafts-btn"
                  onClick={() => setCurrentView('drafts')}
                  className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors text-left"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-500" />
                  <span>草稿箱 (邮件与说明书)</span>
                </button>
                <button
                  id="more-archive-btn"
                  onClick={() => setCurrentView('archive')}
                  className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors text-left"
                >
                  <Archive className="w-3.5 h-3.5 text-blue-500" />
                  <span>结案档案库</span>
                </button>
                <button
                  id="more-import-btn"
                  onClick={() => setCurrentView('import_history')}
                  className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors text-left"
                >
                  <DownloadCloud className="w-3.5 h-3.5 text-purple-500" />
                  <span>银行文件导入历史</span>
                </button>
                <button
                  id="more-migration-btn"
                  onClick={() => setCurrentView('migration')}
                  className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors text-left"
                >
                  <Database className="w-3.5 h-3.5 text-emerald-500" />
                  <span>数据迁移与备份</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </aside>
  );
};
