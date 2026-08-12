import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { 
  Sparkles, Search, Plus, CheckSquare, Briefcase, Brain, 
  BarChart2, MoreHorizontal, Settings, FileText, Archive, 
  History, Database, PanelLeftClose, PanelLeftOpen, Home, ChevronDown, X
} from 'lucide-react';
import { ViewId } from '../../types/navigation';
import { useCaseStore } from '../../stores/caseStore';
import { useUiStore } from '../../stores/uiStore';

interface CaseListSidebarProps {
  activeView: ViewId;
  onNavigate: (v: ViewId) => void;
}

const SYSTEM_TABS = [
  { id: 'tasks' as ViewId, label: '待办', icon: CheckSquare },
  { id: 'cases' as ViewId, label: '看板', icon: Briefcase },
  { id: 'analytics' as ViewId, label: '统计', icon: BarChart2 },
  { id: 'settings' as ViewId, label: '设置', icon: Settings },
];

const MORE_ITEMS = [
  { id: 'knowledge' as ViewId, label: '知识中心', icon: Brain },
  { id: 'drafts' as ViewId, label: '草稿箱', icon: FileText },
  { id: 'archive' as ViewId, label: '档案库', icon: Archive },
  { id: 'imports' as ViewId, label: '导入历史', icon: History },
  { id: 'migration' as ViewId, label: '数据迁移', icon: Database },
];

const STAGE_NODES = ['建档', '收集', '递交', '补件', '批准', '结算'];

function getStageIndex(stageStr: string): number {
  const st = stageStr || '';
  if (st.includes('结算') || st.includes('交割') || st.includes('放款')) return 5;
  if (st.includes('批准') || st.includes('批复') || st.includes('预批') || st.includes('通过')) return 4;
  if (st.includes('补件') || st.includes('补交')) return 3;
  if (st.includes('递交') || st.includes('审贷') || st.includes('评估')) return 2;
  if (st.includes('收集') || st.includes('准备') || st.includes('意向') || st.includes('资料') || st.includes('文档')) return 1;
  return 0; // 默认建档
}

export function CaseListSidebar({ activeView, onNavigate }: CaseListSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [caseFilter, setCaseFilter] = useState<'all' | 'urgent' | 'submitting'>('all');
  const [moreOpen, setMoreOpen] = useState(false);
  const reduced = useReducedMotion();

  const { cases, currentCase, setCurrentCase, fetchCases } = useCaseStore();
  const setNewCaseOpen = useUiStore((s) => s.setNewCaseOpen);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  const filteredCases = cases.filter((c) => {
    const matchesSearch = c.clientName.toLowerCase().includes(search.toLowerCase()) || 
                          c.lender.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    if (caseFilter === 'urgent') {
      return c.checklistProgress < 60 || c.stage.includes('补件') || c.stage.includes('准备');
    }
    if (caseFilter === 'submitting') {
      return c.stage.includes('递交') || c.stage.includes('审贷') || c.stage.includes('评估');
    }
    return true;
  });

  return (
    <motion.aside
      id="case-list-sidebar"
      initial={false}
      animate={{ width: collapsed ? 60 : 240 }}
      transition={reduced ? { duration: 0.15 } : { type: 'spring', damping: 25, stiffness: 350 }}
      className="h-full flex-shrink-0 flex flex-col border-r select-none overflow-hidden relative glass-panel z-20"
      style={{ borderColor: 'var(--border)' }}
    >
      {/* 1. 顶部案件卡片区 Header (标题 + 搜索图标 + 折叠按钮 + 筛选 Tabs) */}
      {!collapsed ? (
        <div className="p-2.5 border-b space-y-2 flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <span className="font-extrabold text-xs text-primary tracking-wide">
                案件 ({filteredCases.length})
              </span>
              <motion.button 
                whileTap={{ scale: 0.94 }} 
                onClick={() => setNewCaseOpen(true)} 
                className="p-1 rounded-md text-[10px] font-bold text-white flex items-center space-x-0.5 cursor-pointer hover:opacity-90 transition-opacity" 
                style={{ backgroundColor: 'var(--accent)' }}
                title="新建案件"
              >
                <Plus className="w-3 h-3" />
              </motion.button>
            </div>

            <div className="flex items-center space-x-1">
              <motion.button 
                whileTap={{ scale: 0.92 }} 
                onClick={() => setSearchOpen(!searchOpen)} 
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                  searchOpen || search ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30' : 'text-muted hover:text-primary'
                }`}
                style={{ backgroundColor: searchOpen || search ? undefined : 'var(--bg-card)', borderColor: 'var(--border)' }}
                title="搜索案件"
              >
                <Search className="w-3.5 h-3.5" />
              </motion.button>

              <motion.button 
                whileTap={{ scale: 0.92 }} 
                onClick={() => setCollapsed(!collapsed)} 
                className="p-1.5 rounded-lg border text-muted hover:text-primary transition-colors cursor-pointer"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                title="折叠侧栏"
              >
                <PanelLeftClose className="w-3.5 h-3.5" />
              </motion.button>
            </div>
          </div>

          {/* 可展开搜索框 */}
          <AnimatePresence>
            {searchOpen && (
              <motion.div
                initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
                className="overflow-hidden pt-0.5"
              >
                <div className="flex items-center px-2 py-1 rounded-lg border space-x-1.5" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                  <Search className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                  <input 
                    type="text" 
                    value={search} 
                    onChange={(e) => setSearch(e.target.value)} 
                    placeholder="搜索客户/银行..." 
                    autoFocus
                    className="bg-transparent border-none outline-none text-xs w-full text-primary" 
                    id="sidebar-search-input" 
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="text-muted hover:text-primary cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Filter Tabs (全部 / 紧急 / 递交中) */}
          <div className="flex items-center space-x-1 p-0.5 rounded-lg bg-black/5 dark:bg-white/5 border text-[10px] font-bold" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={() => setCaseFilter('all')}
              className={`flex-1 py-1 rounded-md text-center transition-all cursor-pointer ${
                caseFilter === 'all' ? 'bg-[var(--bg-card)] text-[var(--accent)] shadow-2xs font-extrabold' : 'text-muted hover:text-primary'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => setCaseFilter('urgent')}
              className={`flex-1 py-1 rounded-md text-center transition-all cursor-pointer ${
                caseFilter === 'urgent' ? 'bg-[var(--bg-card)] text-rose-500 shadow-2xs font-extrabold' : 'text-muted hover:text-primary'
              }`}
            >
              紧急
            </button>
            <button
              onClick={() => setCaseFilter('submitting')}
              className={`flex-1 py-1 rounded-md text-center transition-all cursor-pointer ${
                caseFilter === 'submitting' ? 'bg-[var(--bg-card)] text-amber-500 shadow-2xs font-extrabold' : 'text-muted hover:text-primary'
              }`}
            >
              递交中
            </button>
          </div>
        </div>
      ) : (
        <div className="py-2.5 border-b flex flex-col items-center space-y-2 flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <motion.button 
            whileTap={{ scale: 0.92 }} 
            onClick={() => setCollapsed(false)} 
            className="p-1.5 rounded-lg border text-muted hover:text-primary transition-colors cursor-pointer mx-auto"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
            title="展开侧栏"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </motion.button>
        </div>
      )}

      {/* 2. 案件卡片列表 (主内容区，占据主要高度) */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-1.5 space-y-1.5">
        {filteredCases.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted">
            {collapsed ? '无' : '暂无匹配案件'}
          </div>
        ) : (
          filteredCases.map((c) => {
            const isSel = activeView === 'brain' && currentCase?.caseId === c.caseId;
            return (
              <motion.button 
                key={c.caseId} 
                whileTap={{ scale: 0.97 }} 
                onClick={() => { setCurrentCase(c); onNavigate('brain'); }} 
                id={`case-item-${c.caseId}`}
                className={`w-full p-2.5 rounded-xl text-left border transition-all cursor-pointer flex flex-col relative ${
                  isSel 
                    ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 shadow-2xs font-bold' 
                    : 'bg-transparent border-transparent hover:bg-[var(--bg-card-hover)]'
                }`}
              >
                {isSel && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 bg-[var(--accent)] rounded-r-full" />
                )}

                {collapsed ? (
                  <div className="flex items-center justify-center py-1" title={`${c.clientName} (${c.lender}) - ${c.stage}`}>
                    <span className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 font-extrabold text-xs flex items-center justify-center">
                      {c.clientName.slice(0, 1)}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between space-x-1">
                      <span className="font-bold text-xs truncate" style={{ color: isSel ? 'var(--accent)' : 'var(--text-primary)' }}>
                        {c.clientName}
                      </span>
                      <span className="px-1.5 py-0.2 text-[10px] font-semibold rounded bg-black/5 dark:bg-white/10 text-muted flex-shrink-0">
                        {c.lender}
                      </span>
                    </div>

                    {/* 6 节点紧凑阶段进度条 */}
                    {(() => {
                      const stageIdx = getStageIndex(c.stage);
                      return (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between gap-0.5">
                            {STAGE_NODES.map((nodeLabel, idx) => {
                              const isPassed = idx < stageIdx;
                              const isCurrent = idx === stageIdx;
                              return (
                                <div 
                                  key={idx}
                                  className="flex-1 flex flex-col items-center"
                                  title={`${nodeLabel} ${isCurrent ? '(当前阶段)' : isPassed ? '(已完成)' : '(未到达)'}`}
                                >
                                  <div 
                                    className={`h-1.5 w-full rounded-full transition-all ${
                                      isCurrent 
                                        ? 'bg-[var(--accent)] shadow-2xs' 
                                        : isPassed 
                                        ? 'bg-[var(--accent)]/50' 
                                        : 'bg-black/10 dark:bg-white/10'
                                    }`} 
                                  />
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-muted pt-0.5">
                            <span className="truncate font-medium text-secondary">{c.stage}</span>
                            <span className="font-mono font-medium text-[9px]">{c.checklistProgress}%</span>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </motion.button>
            );
          })
        )}
      </div>

      {/* 3. 底部固定导航区 (Bottom Navigation Area: 2 Rows of System Entry Tabs) */}
      <div className="p-2 border-t space-y-1.5 flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        {collapsed ? (
          /* 折叠态：竖排图标 */
          <div className="flex flex-col space-y-1">
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => onNavigate('home')}
              className={`p-2 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                activeView === 'home' ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-secondary hover:bg-[var(--bg-card-hover)] hover:text-primary'
              }`}
              title="今日工作台"
            >
              <Home className="w-4 h-4" />
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => { setCurrentCase(null); onNavigate('brain'); }}
              className={`p-2 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                activeView === 'brain' && currentCase === null ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-secondary hover:bg-[var(--bg-card-hover)] hover:text-primary'
              }`}
              title="全局咨询"
            >
              <Sparkles className="w-4 h-4" />
            </motion.button>

            <div className="w-full h-px bg-[var(--border)] my-0.5" />

            {SYSTEM_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeView === tab.id;
              return (
                <motion.button
                  key={tab.id}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => onNavigate(tab.id)}
                  id={`nav-bottom-${tab.id}`}
                  className={`p-2 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
                    isActive
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'text-secondary hover:bg-[var(--bg-card-hover)] hover:text-primary'
                  }`}
                  title={tab.label}
                >
                  <Icon className="w-4 h-4" />
                </motion.button>
              );
            })}
          </div>
        ) : (
          /* 展开态：导航两行 */
          <div className="space-y-1.5">
            {/* 行 1：今日工作台 + 全局咨询 (2 Columns, 相同 Lucide 图标样式) */}
            <div className="grid grid-cols-2 gap-1 text-xs">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => onNavigate('home')}
                className={`py-1.5 px-2 rounded-xl flex items-center justify-center space-x-1.5 transition-all cursor-pointer relative ${
                  activeView === 'home'
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-extrabold'
                    : 'text-secondary hover:bg-[var(--bg-card-hover)] hover:text-primary'
                }`}
                title="今日工作台"
              >
                <Home className={`w-3.5 h-3.5 flex-shrink-0 ${activeView === 'home' ? 'text-[var(--accent)]' : ''}`} />
                <span className="truncate text-xs font-bold">今日工作台</span>
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => { setCurrentCase(null); onNavigate('brain'); }}
                className={`py-1.5 px-2 rounded-xl flex items-center justify-center space-x-1.5 transition-all cursor-pointer relative ${
                  activeView === 'brain' && currentCase === null
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-extrabold'
                    : 'text-secondary hover:bg-[var(--bg-card-hover)] hover:text-primary'
                }`}
                title="全局咨询"
              >
                <Sparkles className={`w-3.5 h-3.5 flex-shrink-0 ${activeView === 'brain' && currentCase === null ? 'text-[var(--accent)]' : ''}`} />
                <span className="truncate text-xs font-bold">全局咨询</span>
              </motion.button>
            </div>

            {/* 行 2：待办 · 看板 · 统计 · 设置 (4 Columns) */}
            <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-black/5 dark:bg-white/5 border" style={{ borderColor: 'var(--border)' }}>
              {SYSTEM_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeView === tab.id;
                return (
                  <motion.button
                    key={tab.id}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => onNavigate(tab.id)}
                    id={`nav-bottom-${tab.id}`}
                    className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer relative ${
                      isActive
                        ? 'bg-[var(--bg-card)] text-[var(--accent)] shadow-2xs font-extrabold'
                        : 'text-muted hover:text-primary'
                    }`}
                    title={tab.label}
                  >
                    <Icon className={`w-3.5 h-3.5 mb-0.5 ${isActive ? 'text-[var(--accent)]' : ''}`} />
                    <span className="truncate leading-none">{tab.label}</span>
                    {isActive && (
                      <span className="absolute bottom-0 left-1.5 right-1.5 h-0.5 bg-[var(--accent)] rounded-full" />
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}

        {/* 更多功能 Dropdown */}
        <div className="relative">
          <motion.button 
            whileTap={{ scale: 0.95 }} 
            onClick={() => setMoreOpen(!moreOpen)} 
            id="nav-bottom-more"
            className={`w-full py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center transition-colors cursor-pointer text-muted hover:bg-[var(--bg-card-hover)] hover:text-primary ${
              collapsed ? 'justify-center' : 'justify-between'
            }`} 
            title="更多功能"
          >
            <div className="flex items-center space-x-1.5 min-w-0">
              <MoreHorizontal className="w-3.5 h-3.5 flex-shrink-0" />
              {!collapsed && <span className="truncate">更多功能</span>}
            </div>
            {!collapsed && <ChevronDown className={`w-3 h-3 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />}
          </motion.button>

          <AnimatePresence>
            {moreOpen && (
              <motion.div 
                initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }} 
                exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                className="absolute bottom-full left-0 z-50 w-44 mb-2 p-1.5 rounded-xl border flex flex-col space-y-0.5 shadow-xl glass-card"
                style={{ borderColor: 'var(--border)' }}
              >
                {MORE_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isItemActive = activeView === item.id;
                  return (
                    <button 
                      key={item.id} 
                      onClick={() => { onNavigate(item.id); setMoreOpen(false); }}
                      className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-2 transition-colors cursor-pointer ${
                        isItemActive ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-bold' : 'hover:bg-[var(--bg-card-hover)] text-secondary hover:text-primary'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{item.label}</span>
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
