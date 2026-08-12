import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { 
  Sparkles, Search, Bell, SunMoon, X, Home
} from 'lucide-react';
import { ViewId } from '../../types/navigation';
import { useCaseStore } from '../../stores/caseStore';
import { useThemeStore } from '../../stores/themeStore';
import { THEMES, ThemeId } from '../../themes';

interface TopNavBarProps {
  onNavigate: (v: ViewId) => void;
  activeView?: ViewId;
}

interface NotificationItem {
  id: number;
  type: 'urgent' | 'warning' | 'success';
  title: string;
  subtitle: string;
  time: string;
  read: boolean;
  caseId?: string;
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  { id: 1, type: 'urgent', title: '陈伟 (NAB Bank) 补件超期预警', subtitle: '已逾期 2 天，需要立刻回复 2025 年 NOA 税单', time: '10 分钟前', read: false, caseId: 'CASE-2025-001' },
  { id: 2, type: 'warning', title: 'PERSON_1 (CBA) 补件已提交', subtitle: '银行审贷系统重新评估中', time: '30 分钟前', read: false, caseId: 'CASE-2025-002' },
  { id: 3, type: 'success', title: '西太银行 (Westpac) 预审通过通知', subtitle: '预计放款产生佣金 $12,500 AUD', time: '1 小时前', read: false, caseId: 'CASE-2025-003' },
];

export function TopNavBar({ onNavigate, activeView: activeViewProp }: TopNavBarProps) {
  const reduced = useReducedMotion();
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [internalActiveView, setInternalActiveView] = useState<ViewId>('home');

  const { cases, currentCase, setCurrentCase } = useCaseStore();
  const { current: themeId, setTheme } = useThemeStore();

  useEffect(() => {
    const handleCustomNav = (e: Event) => {
      const detail = (e as CustomEvent<ViewId>).detail;
      if (detail) {
        setInternalActiveView(detail);
      }
    };
    window.addEventListener('app-navigate', handleCustomNav);
    return () => window.removeEventListener('app-navigate', handleCustomNav);
  }, []);

  const currentActiveView = activeViewProp ?? internalActiveView;

  const handleNav = (v: ViewId) => {
    setInternalActiveView(v);
    window.dispatchEvent(new CustomEvent('app-navigate', { detail: v }));
    onNavigate(v);
  };

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  // Search results
  const searchResults = useMemo(() => {
    if (!globalSearch.trim()) return [];
    const q = globalSearch.toLowerCase().trim();
    return cases.filter(c => 
      c.clientName.toLowerCase().includes(q) || 
      c.lender.toLowerCase().includes(q) || 
      c.caseId.toLowerCase().includes(q) ||
      c.stage.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [cases, globalSearch]);

  const handleCycleTheme = () => {
    const cycleOrder: ThemeId[] = ['dark', 'light', 'royal', 'ocean', 'sand'];
    const idx = cycleOrder.indexOf(themeId);
    const nextTheme = cycleOrder[(idx + 1) % cycleOrder.length];
    
    document.documentElement.style.transition = 'background-color 200ms ease, color 200ms ease';
    setTheme(nextTheme);
    setTimeout(() => {
      document.documentElement.style.transition = '';
    }, 250);
  };

  const handleMarkAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleSelectSearchedCase = (c: typeof cases[0]) => {
    setCurrentCase(c);
    setGlobalSearch('');
    setSearchFocused(false);
    handleNav('brain');
  };

  return (
    <header 
      className="h-14 border-b flex items-center justify-between px-4 flex-shrink-0 z-30 glass-panel relative"
      style={{ borderColor: 'var(--border)' }}
      id="top-app-header"
    >
      {/* 1. Left: Brand Area + Main Navigation Tabs */}
      <div className="flex items-center space-x-3">
        <motion.button 
          whileTap={{ scale: 0.96 }}
          onClick={() => handleNav('home')} 
          className="flex items-center space-x-2.5 cursor-pointer text-left hover:opacity-85 transition-opacity"
          id="header-app-logo-btn"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-amber-500 flex items-center justify-center text-white shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="font-extrabold text-sm tracking-tight text-primary leading-none flex items-center space-x-1">
              <span>Vera Workbench</span>
            </div>
            <span className="text-[10px] text-muted leading-none mt-0.5 block">AI-Powered Mortgage Broker Desktop</span>
          </div>
        </motion.button>

        {/* 页面级主入口 Tabs (今日工作台 / 全局咨询) */}
        <div className="hidden sm:flex items-center space-x-1 pl-3 border-l" style={{ borderColor: 'var(--border)' }}>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => handleNav('home')}
            id="top-nav-home-btn"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
              currentActiveView === 'home'
                ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-extrabold'
                : 'text-secondary hover:bg-[var(--bg-card-hover)] hover:text-primary'
            }`}
            title="今日工作台"
          >
            <Home className="w-3.5 h-3.5 flex-shrink-0" />
            <span>今日工作台</span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setCurrentCase(null);
              handleNav('brain');
            }}
            id="top-nav-global-chat-btn"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
              currentActiveView === 'brain' && currentCase === null
                ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-extrabold'
                : 'text-secondary hover:bg-[var(--bg-card-hover)] hover:text-primary'
            }`}
            title="全局咨询"
          >
            <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
            <span>全局咨询</span>
          </motion.button>
        </div>
      </div>

      {/* 2. Center: Global Search Bar */}
      <div className="flex-1 max-w-sm mx-4 relative hidden md:block">
        <div 
          className={`flex items-center px-3 py-1.5 rounded-xl border space-x-2 transition-all shadow-2xs ${
            searchFocused ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/10' : 'border-[var(--border)]'
          }`} 
          style={{ backgroundColor: 'var(--bg-input)' }}
        >
          <Search className="w-4 h-4 text-muted flex-shrink-0" />
          <input
            type="text"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchFocused(false);
              } else if (e.key === 'Enter' && searchResults.length > 0) {
                handleSelectSearchedCase(searchResults[0]);
              }
            }}
            placeholder="全局搜索案件、客户姓名、审贷银行..."
            className="bg-transparent border-none outline-none text-xs w-full text-primary"
            id="global-header-search-input"
          />
          {globalSearch ? (
            <button onClick={() => setGlobalSearch('')} className="text-muted hover:text-primary cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span className="text-[10px] font-mono text-muted px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 flex-shrink-0">⌘K</span>
          )}
        </div>

        {/* Search Results Dropdown (Clean Single Column) */}
        <AnimatePresence>
          {searchFocused && globalSearch.trim() !== '' && (
            <motion.div
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
              className="absolute left-0 right-0 top-full mt-1.5 p-1.5 rounded-xl border shadow-xl z-50 glass-card space-y-0.5"
              style={{ borderColor: 'var(--border)' }}
            >
              {searchResults.length === 0 ? (
                <div className="p-3 text-center text-xs text-muted font-medium">没有匹配结果</div>
              ) : (
                searchResults.map((c) => (
                  <button
                    key={c.caseId}
                    onMouseDown={(e) => {
                      e.preventDefault(); // prevent input blur before onClick
                      handleSelectSearchedCase(c);
                    }}
                    className="w-full px-3 py-2 rounded-lg text-left hover:bg-[var(--bg-card-hover)] transition-colors flex items-center justify-between cursor-pointer group"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <span className="font-bold text-xs text-primary truncate">{c.clientName}</span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-black/5 dark:bg-white/10 text-secondary flex-shrink-0">
                        {c.lender}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted flex-shrink-0 ml-2">{c.stage}</span>
                  </button>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 3. Right: Notifications, Theme Switcher, User Profile */}
      <div className="flex items-center space-x-2">
        {/* Notification Bell */}
        <div className="relative">
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={() => setNotifOpen(!notifOpen)}
            className="p-2 rounded-xl border text-muted hover:text-primary transition-colors cursor-pointer relative"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
            id="header-notif-btn"
            title="业务通知"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                {unreadCount}
              </span>
            )}
          </motion.button>

          {/* Notification Dropdown Panel */}
          <AnimatePresence>
            {notifOpen && (
              <motion.div
                initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                className="absolute right-0 top-full mt-2 w-80 p-3 rounded-2xl border shadow-2xl z-50 glass-card space-y-2.5"
                style={{ borderColor: 'var(--border)' }}
                id="header-notif-popover"
              >
                <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center space-x-1.5">
                    <Bell className="w-3.5 h-3.5 text-purple-500" />
                    <span className="font-extrabold text-xs text-primary">实时业务通知</span>
                    {unreadCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-500">
                        {unreadCount} 条未读
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-1">
                    {unreadCount > 0 && (
                      <button 
                        onClick={handleMarkAllRead} 
                        className="text-[10px] font-bold text-[var(--accent)] hover:underline cursor-pointer"
                      >
                        全部已读
                      </button>
                    )}
                    <button onClick={() => setNotifOpen(false)} className="text-muted hover:text-primary cursor-pointer p-0.5">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 max-h-64 overflow-y-auto no-scrollbar">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-muted">暂无任何通知</div>
                  ) : (
                    notifications.map((n) => (
                      <div 
                        key={n.id}
                        onClick={() => {
                          if (n.caseId) {
                            const matched = cases.find(c => c.caseId === n.caseId);
                            if (matched) setCurrentCase(matched);
                            onNavigate('brain');
                          } else {
                            onNavigate('home');
                          }
                          setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, read: true } : item));
                          setNotifOpen(false);
                        }}
                        className={`p-2.5 rounded-xl border hover:bg-[var(--bg-card-hover)] cursor-pointer transition-colors space-y-1 text-xs relative ${
                          n.read ? 'opacity-60 bg-transparent' : 'bg-[var(--bg-card)]'
                        }`}
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`font-bold text-[11px] ${n.type === 'urgent' ? 'text-rose-500' : n.type === 'warning' ? 'text-amber-500' : 'text-emerald-500'}`}>
                            {n.title}
                          </span>
                          <span className="text-[10px] text-muted">{n.time}</span>
                        </div>
                        <p className="text-[10px] text-muted leading-tight">{n.subtitle}</p>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Theme Switcher Button */}
        <motion.button
          whileTap={{ scale: 0.93 }}
          onClick={handleCycleTheme}
          className="p-2 rounded-xl border text-muted hover:text-primary transition-colors cursor-pointer"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          id="header-theme-toggle-btn"
          title={`当前主题: ${THEMES.find(t => t.id === themeId)?.name} (点击切换)`}
        >
          <SunMoon className="w-4 h-4 text-purple-500" />
        </motion.button>

        {/* User Profile */}
        <div className="flex items-center space-x-2 pl-2 border-l" style={{ borderColor: 'var(--border)' }}>
          <div className="relative">
            <div className="w-7.5 h-7.5 rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-white text-xs font-black shadow-xs">
              V
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-black" />
          </div>
          <div className="hidden lg:flex flex-col text-left">
            <span className="text-xs font-extrabold leading-none text-primary">Vera</span>
            <span className="text-[10px] text-muted leading-none mt-0.5">资深信贷顾问</span>
          </div>
        </div>
      </div>
    </header>
  );
}
