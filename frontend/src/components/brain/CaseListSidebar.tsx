import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { 
  Search, Plus, CheckSquare, Briefcase, 
  BarChart2, Settings, PanelLeftClose, PanelLeftOpen, X
} from 'lucide-react';
import { ViewId } from '../../types/navigation';
import { useCaseStore } from '../../stores/caseStore';
import { useUiStore } from '../../stores/uiStore';

interface CaseListSidebarProps {
  activeView: ViewId;
  onNavigate: (v: ViewId) => void;
}

const SYSTEM_TABS = [
  { id: 'home' as ViewId, label: '首页', icon: CheckSquare },
  { id: 'cases' as ViewId, label: '看板', icon: Briefcase },
  { id: 'analytics' as ViewId, label: '统计', icon: BarChart2 },
  { id: 'settings' as ViewId, label: '设置', icon: Settings },
];

// TODO(V2): 历史项目批量导入恢复时升级为导入中心
// TODO(Phase 2): 设置页"数据与备份"区入口

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

function getDeadlineDays(financeDeadline?: string | null): number | null {
  if (!financeDeadline) return null;
  const target = new Date(financeDeadline).getTime();
  if (isNaN(target)) return null;
  const now = new Date().getTime();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

export function CaseListSidebar({ activeView, onNavigate }: CaseListSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [caseFilter, setCaseFilter] = useState<'all' | 'urgent' | 'lender' | 'waiting' | 'boss'>('all');
  const reduced = useReducedMotion();

  const { cases, currentCase, setCurrentCase, fetchCases } = useCaseStore();
  const setNewCaseOpen = useUiStore((s) => s.setNewCaseOpen);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  const handleNav = (v: ViewId) => {
    window.dispatchEvent(new CustomEvent('app-navigate', { detail: v }));
    onNavigate(v);
  };

  const filteredCases = cases.filter((c) => {
    const matchesSearch = c.clientName.toLowerCase().includes(search.toLowerCase()) || 
                          c.lender.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    if (caseFilter === 'urgent') {
      const days = getDeadlineDays(c.financeDeadline);
      const isUrgentByDeadline = days !== null && days <= 7;
      const isUrgentByOs = (c.osPendingCount ?? 0) > 0;
      const isUrgentByChecklist = c.checklistProgress < 40;
      return isUrgentByDeadline || isUrgentByOs || isUrgentByChecklist;
    }
    if (caseFilter === 'lender') {
      const st = c.stage || '';
      return st.includes('递交') || st.includes('审贷') || st.includes('评估') || st.includes('批复') || st.includes('预批');
    }
    if (caseFilter === 'waiting') {
      const st = c.stage || '';
      return st.includes('收集') || st.includes('补件') || st.includes('准备') || st.includes('资料');
    }
    if (caseFilter === 'boss') {
      return c.hasBossPending === true;
    }
    return true;
  });

  return (
    <motion.aside
      id="case-list-sidebar"
      initial={false}
      animate={{ width: collapsed ? 60 : 240 }}
      transition={reduced ? { duration: 0.15 } : { type: 'spring', damping: 25, stiffness: 300 }}
      className="h-full flex-shrink-0 flex flex-col border-r select-none overflow-hidden relative z-20"
      style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
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
                className="p-1 rounded-md text-xs font-bold flex items-center space-x-0.5 cursor-pointer hover:opacity-90 transition-opacity" 
                style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
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
                <div className="flex items-center px-2 py-1 rounded-lg border space-x-1.5 transition-colors focus-within:border-[var(--border-active)]" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                  <Search className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                  <input 
                    type="text" 
                    value={search} 
                    onChange={(e) => setSearch(e.target.value)} 
                    placeholder="搜索客户/银行..." 
                    autoFocus
                    className="bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-xs w-full text-primary" 
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

          {/* Filter Tabs (5 类筛选: 全部 / 紧急 / 审贷 / 材料 / 老板) */}
          <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-[var(--bg-subtle)] border text-[11px] font-medium" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={() => setCaseFilter('all')}
              className={`py-1 rounded-lg text-center transition-all cursor-pointer ${
                caseFilter === 'all'
                  ? 'bg-[var(--bg-card)] text-[var(--text-primary)] font-bold shadow-2xs'
                  : 'text-muted hover:text-primary'
              }`}
              title="全部案件"
              id="case-filter-all"
            >
              全部
            </button>
            <button
              onClick={() => setCaseFilter('urgent')}
              className={`py-1 rounded-lg text-center transition-all cursor-pointer ${
                caseFilter === 'urgent'
                  ? 'bg-[var(--red-soft)] text-[var(--red)] font-bold border border-[var(--red-soft)]'
                  : 'text-muted hover:text-[var(--red)]'
              }`}
              title="紧急 (Finance Due ≤ 7天 / OS > 0 / 进度 < 40%)"
              id="case-filter-urgent"
            >
              紧急
            </button>
            <button
              onClick={() => setCaseFilter('lender')}
              className={`py-1 rounded-lg text-center transition-all cursor-pointer ${
                caseFilter === 'lender'
                  ? 'bg-[var(--yellow-soft)] text-[var(--yellow)] font-bold border border-[var(--yellow-soft)]'
                  : 'text-muted hover:text-[var(--yellow)]'
              }`}
              title="审贷中 (递交/审贷/评估/批复/预批)"
              id="case-filter-lender"
            >
              审贷
            </button>
            <button
              onClick={() => setCaseFilter('waiting')}
              className={`py-1 rounded-lg text-center transition-all cursor-pointer ${
                caseFilter === 'waiting'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-bold border border-[var(--accent-soft)]'
                  : 'text-muted hover:text-[var(--accent)]'
              }`}
              title="等材料 (收集/补件/准备/资料)"
              id="case-filter-waiting"
            >
              材料
            </button>
            <button
              onClick={() => setCaseFilter('boss')}
              className={`py-1 rounded-lg text-center transition-all cursor-pointer ${
                caseFilter === 'boss'
                  ? 'bg-[var(--yellow-soft)] text-[var(--yellow)] font-bold border border-[var(--yellow-soft)]'
                  : 'text-muted hover:text-[var(--yellow)]'
              }`}
              title="待老板 (hasBossPending)"
              id="case-filter-boss"
            >
              老板
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
                    <span className="w-7 h-7 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] font-extrabold text-xs flex items-center justify-center">
                      {c.clientName.slice(0, 1)}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center space-x-1 w-full">
                      <span className="font-bold text-xs min-w-0 flex-1 truncate" style={{ color: isSel ? 'var(--accent)' : 'var(--text-primary)' }}>
                        {c.clientName}
                      </span>
                      <span className="px-1.5 py-0.2 text-xs font-semibold rounded bg-[var(--bg-subtle)] text-muted ml-auto flex-shrink-0">
                        {c.lender}
                      </span>
                    </div>

                    {/* 6 节点紧凑阶段进度条 */}
                    {(() => {
                      const stageIdx = getStageIndex(c.stage);
                      return (
                        <div className="mt-2 space-y-1 w-full">
                          <div className="flex items-center gap-0.5 w-full">
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
                                        : 'bg-[var(--bg-subtle-strong)]'
                                    }`} 
                                  />
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex items-center text-[11px] text-muted pt-0.5 w-full">
                            <span className="font-medium text-secondary min-w-0 flex-1 truncate">{c.stage}</span>
                            <span className="font-mono font-medium text-[11px] ml-auto flex-shrink-0">{c.checklistProgress}%</span>
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

      {/* 3. 底部固定导航区 (Bottom Navigation Area: System Entry Tabs + More Dropdown) */}
      <div className="p-2 border-t space-y-1.5 flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        {collapsed ? (
          /* 折叠态：竖排图标 */
          <div className="flex flex-col space-y-1">
            {SYSTEM_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeView === tab.id;
              return (
                <motion.button
                  key={tab.id}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => handleNav(tab.id)}
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
          /* 展开态：待办 · 看板 · 统计 · 设置 (4 Columns) */
          <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[var(--bg-subtle)] border" style={{ borderColor: 'var(--border)' }}>
            {SYSTEM_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeView === tab.id;
              return (
                <motion.button
                  key={tab.id}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => handleNav(tab.id)}
                  id={`nav-bottom-${tab.id}`}
                  className={`flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg text-xs font-bold transition-all cursor-pointer relative ${
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
        )}
      </div>
    </motion.aside>
  );
}
