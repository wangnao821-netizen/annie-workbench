import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { 
  Sparkles, Search, Plus, CheckSquare, Briefcase, Brain, 
  BarChart2, MoreHorizontal, Settings, FileText, Archive, 
  History, Database, PanelLeftClose, PanelLeftOpen 
} from 'lucide-react';
import { ViewId } from '../../types/navigation';
import { useCaseStore } from '../../stores/caseStore';
import { useUiStore } from '../../stores/uiStore';

interface CaseListSidebarProps {
  activeView: ViewId;
  onNavigate: (v: ViewId) => void;
}

const BOTTOM_TABS = [
  { id: 'tasks' as ViewId, label: '任务工作台', icon: CheckSquare },
  { id: 'cases' as ViewId, label: '案件看板', icon: Briefcase },
  { id: 'knowledge' as ViewId, label: '知识中心', icon: Brain },
  { id: 'analytics' as ViewId, label: '统计分析', icon: BarChart2 },
];

const MORE_ITEMS = [
  { id: 'settings' as ViewId, label: '系统设置', icon: Settings },
  { id: 'drafts' as ViewId, label: '草稿箱', icon: FileText },
  { id: 'archive' as ViewId, label: '档案库', icon: Archive },
  { id: 'imports' as ViewId, label: '导入历史', icon: History },
  { id: 'migration' as ViewId, label: '数据迁移', icon: Database },
];

export function CaseListSidebar({ activeView, onNavigate }: CaseListSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const reduced = useReducedMotion();

  const { cases, currentCase, setCurrentCase, fetchCases } = useCaseStore();
  const setNewCaseOpen = useUiStore((s) => s.setNewCaseOpen);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  const filtered = cases.filter(
    (c) => c.clientName.toLowerCase().includes(search.toLowerCase()) || c.lender.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.aside
      id="case-list-sidebar" initial={false} animate={{ width: collapsed ? 60 : 240 }}
      transition={reduced ? { duration: 0.15 } : { type: 'spring', damping: 25, stiffness: 350 }}
      className="h-full flex-shrink-0 flex flex-col border-r select-none overflow-hidden relative"
      style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
    >
      {/* Header & Toggle */}
      <div className="p-3 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        {!collapsed && <span className="font-extrabold text-xs text-primary truncate">Vera Workbench</span>}
        <motion.button whileTap={{ scale: 0.92 }} onClick={() => setCollapsed(!collapsed)} id="sidebar-toggle-fold-btn"
          className="p-1.5 rounded-lg border text-muted hover:text-primary transition-colors cursor-pointer"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </motion.button>
      </div>

      {/* Global Chat Entry */}
      <div className="p-2 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <motion.button whileTap={{ scale: 0.97 }} onClick={() => setCurrentCase(null)} id="global-chat-entry-btn"
          className={`w-full py-2 px-2.5 rounded-xl text-xs font-bold flex items-center transition-colors cursor-pointer border ${
            currentCase === null ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30' : 'border-transparent text-secondary hover:bg-[var(--bg-card-hover)]'
          }`}>
          <Sparkles className="w-4 h-4 text-purple-500 flex-shrink-0" />
          {!collapsed && <span className="ml-2 truncate">💬 全局咨询</span>}
        </motion.button>
      </div>

      {/* Search & Add */}
      {!collapsed ? (
        <div className="p-2 space-y-2 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-muted">案件列表 ({filtered.length})</span>
            <motion.button whileTap={{ scale: 0.94 }} onClick={() => setNewCaseOpen(true)} id="sidebar-add-case-btn"
              className="px-2 py-0.5 rounded-lg text-[11px] font-bold text-white flex items-center space-x-0.5 cursor-pointer shadow-xs" style={{ backgroundColor: 'var(--accent)' }}>
              <Plus className="w-3 h-3" /><span>新案件</span>
            </motion.button>
          </div>
          <div className="flex items-center px-2 py-1 rounded-lg border space-x-1.5" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)' }}>
            <Search className="w-3.5 h-3.5 text-muted flex-shrink-0" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索客户/银行..." className="bg-transparent border-none outline-none text-xs w-full text-primary" id="sidebar-search-input" />
          </div>
        </div>
      ) : (
        <div className="py-2 border-b flex justify-center flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <motion.button whileTap={{ scale: 0.94 }} onClick={() => setCollapsed(false)} className="p-2 rounded-xl text-muted hover:text-primary transition-colors cursor-pointer">
            <Search className="w-4 h-4" />
          </motion.button>
        </div>
      )}

      {/* Case List */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-1.5 space-y-1">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted">{collapsed ? '无' : '暂无案件数据'}</div>
        ) : (
          filtered.map((c) => {
            const isSel = currentCase?.caseId === c.caseId;
            return (
              <motion.button key={c.caseId} whileTap={{ scale: 0.97 }} onClick={() => setCurrentCase(c)} id={`case-item-${c.caseId}`}
                className={`w-full p-2 rounded-xl text-left border transition-colors cursor-pointer flex flex-col ${
                  isSel ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40' : 'bg-transparent border-transparent hover:bg-[var(--bg-card-hover)]'
                }`}>
                {collapsed ? (
                  <div className="flex items-center justify-center py-1">
                    <span className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold text-xs flex items-center justify-center">{c.clientName.slice(0, 1)}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between space-x-1">
                      <span className="font-bold text-xs truncate" style={{ color: isSel ? 'var(--accent)' : 'var(--text-primary)' }}>{c.clientName}</span>
                      <span className="px-1.5 py-0.2 text-[10px] font-semibold rounded bg-black/5 dark:bg-white/10 text-muted flex-shrink-0">{c.lender}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[10px] text-muted">
                      <span className="truncate">{c.stage}</span><span className="font-medium">{c.checklistProgress}%</span>
                    </div>
                    <div className="w-full bg-black/10 dark:bg-white/10 h-1 rounded-full mt-1 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${c.checklistProgress}%`, backgroundColor: isSel ? 'var(--accent)' : 'var(--green)' }} />
                    </div>
                  </>
                )}
              </motion.button>
            );
          })
        )}
      </div>

      {/* Bottom Nav */}
      <div className="p-1.5 border-t space-y-0.5 flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        {BOTTOM_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeView === tab.id;
          return (
            <motion.button key={tab.id} whileTap={{ scale: 0.97 }} onClick={() => onNavigate(tab.id)} id={`nav-bottom-${tab.id}`}
              className={`w-full p-2 rounded-xl text-xs font-semibold flex items-center transition-colors cursor-pointer ${
                isActive ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-secondary hover:bg-[var(--bg-card-hover)] hover:text-primary'
              } ${collapsed ? 'justify-center' : 'space-x-2.5'}`} title={tab.label}>
              <Icon className="w-4 h-4 flex-shrink-0" />{!collapsed && <span className="truncate">{tab.label}</span>}
            </motion.button>
          );
        })}

        <div className="relative">
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => setMoreOpen(!moreOpen)} id="nav-bottom-more"
            className={`w-full p-2 rounded-xl text-xs font-semibold flex items-center transition-colors cursor-pointer text-secondary hover:bg-[var(--bg-card-hover)] hover:text-primary ${
              collapsed ? 'justify-center' : 'space-x-2.5'
            }`} title="更多功能">
            <MoreHorizontal className="w-4 h-4 flex-shrink-0" />{!collapsed && <span className="truncate">更多功能</span>}
          </motion.button>
          <AnimatePresence>
            {moreOpen && (
              <motion.div initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: -120 }} exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -10 }}
                transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                className="absolute bottom-full left-0 z-50 w-44 p-1.5 rounded-xl border flex flex-col space-y-0.5 shadow-xl"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                {MORE_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button key={item.id} onClick={() => { onNavigate(item.id); setMoreOpen(false); }}
                      className="w-full px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-2 hover:bg-[var(--bg-card-hover)] text-secondary hover:text-primary cursor-pointer">
                      <Icon className="w-3.5 h-3.5" /><span>{item.label}</span>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  );
}
