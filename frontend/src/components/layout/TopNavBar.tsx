import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { 
  Search, Bell, SunMoon, X, Clock,
  Brain, Archive, FileText, Settings, MessageSquare,
  Minus, Square, Copy
} from 'lucide-react';
import { ViewId } from '../../types/navigation';
import { useCaseStore } from '../../stores/caseStore';
import { useThemeStore } from '../../stores/themeStore';
import { THEMES, ThemeId } from '../../themes';
import { getVersion } from '../../services/api/system';
import { AuTimePanel } from './AuTimePanel';


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

const INITIAL_NOTIFICATIONS: NotificationItem[] = [];

const AVATAR_NAV_ITEMS: { id: ViewId; label: string; icon: typeof Brain }[] = [
  { id: 'knowledge', label: '知识中心', icon: Brain },
  { id: 'archive', label: '档案库', icon: Archive },
  { id: 'drafts', label: '草稿箱', icon: FileText },
  { id: 'settings', label: '设置', icon: Settings },
];

export function TopNavBar({ onNavigate, activeView: activeViewProp }: TopNavBarProps) {
  const reduced = useReducedMotion();
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [auTimeOpen, setAuTimeOpen] = useState(false);
  const [auTimeStr, setAuTimeStr] = useState('');
  const [version, setVersion] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [internalActiveView, setInternalActiveView] = useState<ViewId>('home');
  const [maximized, setMaximized] = useState(false);

  const isElectron = typeof window !== 'undefined' && !!window.veraElectron;

  const { cases, currentCase, setCurrentCase } = useCaseStore();
  const { current: themeId, setTheme } = useThemeStore();

  useEffect(() => {
    if (!window.veraElectron?.onMaximizedChange) return;
    const off = window.veraElectron.onMaximizedChange((m: boolean) => setMaximized(m));
    window.veraElectron.isMaximized?.().then(setMaximized);
    return off;
  }, []);

  useEffect(() => {
    const appShell = document.getElementById('app-shell');
    if (appShell) {
      if (maximized) {
        appShell.setAttribute('data-maximized', 'true');
      } else {
        appShell.removeAttribute('data-maximized');
      }
    }
  }, [maximized]);

  useEffect(() => {
    const updateTime = () => {
      try {
        const str = new Intl.DateTimeFormat('en-AU', {
          timeZone: 'Australia/Sydney',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(new Date());
        setAuTimeStr(str);
      } catch {
        setAuTimeStr('—');
      }
    };
    updateTime();
    const timer = setInterval(updateTime, 10000);
    return () => clearInterval(timer);
  }, []);


  useEffect(() => {
    getVersion()
      .then((res) => {
        if (res && res.version) {
          setVersion(res.version);
        } else {
          setVersion(null);
        }
      })
      .catch(() => {
        setVersion(null);
      });
  }, []);

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
    const cycleOrder: ThemeId[] = ['dark', 'light', 'ivory', 'eyecare', 'blush', 'sand'];
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
      className="h-14 border-b flex items-center justify-between px-4 flex-shrink-0 z-30 relative electron-drag"
      style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
      id="top-app-header"
    >
      {/* 1. Left: Brand Area */}
      <div className="flex items-center space-x-3">
        <motion.button 
          whileTap={{ scale: 0.96 }}
          onClick={() => handleNav('home')} 
          className="flex items-center space-x-2.5 cursor-pointer text-left hover:opacity-90 transition-opacity"
          id="header-app-logo-btn"
          title="EVERSTONES FINANCIAL SERVICES"
        >
          {/* 左侧微徽章 (Icon Mark) */}
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center shadow-xs border flex-shrink-0 transition-colors"
            style={{ backgroundColor: 'var(--accent)', borderColor: 'var(--border)', color: 'var(--on-accent)' }}
          >
            <span className="font-extrabold text-[12px] tracking-tight font-sans select-none" style={{ color: 'var(--on-accent)' }}>ES</span>
          </div>
          {/* 右侧主品牌名 */}
          <div className="flex items-center select-none">
            <span className="font-black text-[15px] tracking-[0.15em] uppercase leading-none transition-colors" style={{ color: 'var(--text-primary)' }}>
              EVERSTONES
            </span>
          </div>
        </motion.button>
      </div>

      {/* 2. Center: Global Search Bar with Embedded Global Chat Button */}
      <div className="flex-1 max-w-md mx-4 relative hidden md:block">
        <div 
          className={`flex items-center rounded-xl border transition-all shadow-2xs overflow-hidden ${
            searchFocused ? 'border-[var(--border-active)] ring-1 ring-[var(--ring)]' : 'border-[var(--border)]'
          }`} 
          style={{ backgroundColor: 'var(--bg-input)' }}
        >
          {/* Embedded "全局咨询" Button */}
          <button
            type="button"
            onClick={() => {
              setCurrentCase(null);
              handleNav('brain');
            }}
            id="top-nav-global-chat-btn"
            className={`px-3 py-1.5 text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer flex-shrink-0 border-r ${
              currentActiveView === 'brain' && currentCase === null
                ? 'bg-[var(--purple-soft)] text-[var(--purple)] border-[var(--purple-soft)]'
                : 'text-secondary hover:bg-[var(--bg-card-hover)] hover:text-primary border-[var(--border)]'
            }`}
            title="全局咨询"
          >
            <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="whitespace-nowrap">全局咨询</span>
          </button>

          {/* Search Input Area */}
          <div className="flex items-center flex-1 px-3 py-1.5 space-x-2 min-w-0">
            <Search className="w-3.5 h-3.5 text-muted flex-shrink-0" />
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
              className="bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-xs w-full text-primary"
              id="global-header-search-input"
            />
            {globalSearch ? (
              <button onClick={() => setGlobalSearch('')} className="text-muted hover:text-primary cursor-pointer flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <span className="text-[11px] font-mono text-muted px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] flex-shrink-0">⌘K</span>
            )}
          </div>
        </div>

        {/* Search Results Dropdown (Clean Single Column) */}
        <AnimatePresence>
          {searchFocused && globalSearch.trim() !== '' && (
            <motion.div
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
              className="absolute left-0 right-0 top-full mt-1.5 p-1.5 rounded-xl border shadow-xl z-50 glass-card space-y-0.5"
              style={{ transformOrigin: 'top center', borderColor: 'var(--border)' }}
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
                      <span className="px-1.5 py-0.2 rounded text-xs font-bold bg-[var(--bg-subtle)] text-secondary flex-shrink-0">
                        {c.lender}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted flex-shrink-0 ml-2">{c.stage}</span>
                  </button>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 3. Right: AU Time, Notifications, Theme Switcher, User Profile */}
      <div className="flex items-center space-x-2">
        {/* Australian Time Button & Panel */}
        <div className="relative">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setAuTimeOpen(!auTimeOpen);
              setNotifOpen(false);
              setAvatarOpen(false);
            }}
            id="header-au-time-btn"
            title="堪培拉/悉尼时间 & 假期面板"
            className="px-2.5 py-1.5 rounded-xl border text-xs font-bold font-mono flex items-center space-x-1.5 cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors text-primary"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <Clock className="w-3.5 h-3.5 text-[var(--text-secondary)] flex-shrink-0" />
            <span className="hidden md:inline text-muted font-sans font-normal">堪培拉</span>
            <span>{auTimeStr || '—'}</span>
          </motion.button>

          <AnimatePresence>
            {auTimeOpen && (
              <motion.div
                initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="absolute right-0 top-full mt-2 z-50"
                style={{ transformOrigin: 'top right' }}
              >
                <AuTimePanel onNavigate={(v) => { onNavigate(v); setAuTimeOpen(false); }} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Notification Bell */}

        <div className="relative">
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={() => {
              setNotifOpen(!notifOpen);
              setAuTimeOpen(false);
              setAvatarOpen(false);
            }}
            className="p-2 rounded-xl border text-muted hover:text-primary transition-colors cursor-pointer relative"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
            id="header-notif-btn"
            title="业务通知"
          >

            <Bell className="w-4 h-4 text-[var(--text-secondary)]" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white text-xs font-bold flex items-center justify-center shadow-xs" style={{ backgroundColor: 'var(--red)' }}>
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
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="absolute right-0 top-full mt-2 w-80 p-3 rounded-2xl border shadow-2xl z-50 space-y-2.5"
                style={{ transformOrigin: 'top right', backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                id="header-notif-popover"
              >
                <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center space-x-1.5">
                    <Bell className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    <span className="font-extrabold text-xs text-primary">实时业务通知</span>
                    {unreadCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-xs font-bold bg-[var(--red-soft)] text-[var(--red)]">
                        {unreadCount} 条未读
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-1">
                    {unreadCount > 0 && (
                      <button 
                        onClick={handleMarkAllRead} 
                        className="text-xs font-bold text-[var(--accent)] hover:underline cursor-pointer"
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
                          <span className={`font-bold text-[11px] ${n.type === 'urgent' ? 'text-[var(--red)]' : n.type === 'warning' ? 'text-[var(--yellow)]' : 'text-[var(--green)]'}`}>
                            {n.title}
                          </span>
                          <span className="text-[11px] text-muted">{n.time}</span>
                        </div>
                        <p className="text-[11px] text-muted leading-tight">{n.subtitle}</p>
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
          <SunMoon className="w-4 h-4 text-[var(--text-secondary)]" />
        </motion.button>

        {/* User Profile & Dropdown */}
        <div className="relative pl-2 border-l" style={{ borderColor: 'var(--border)' }}>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setAvatarOpen(!avatarOpen);
              setNotifOpen(false);
              setAuTimeOpen(false);
            }}
            className="flex items-center space-x-2 p-1 rounded-xl hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
            id="header-user-avatar-btn"
            title="个人中心与工具"
          >
            <div className="relative">
              <div className="w-7.5 h-7.5 rounded-full flex items-center justify-center text-xs font-black shadow-xs" style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}>
                V
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2" style={{ backgroundColor: 'var(--green)', borderColor: 'var(--bg-card)' }} />
            </div>
          </motion.button>

          {/* Avatar Dropdown Panel */}
          <AnimatePresence>
            {avatarOpen && (
              <motion.div
                initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="absolute right-0 top-full mt-2 w-48 p-1.5 rounded-2xl border shadow-2xl z-50 space-y-1"
                style={{ transformOrigin: 'top right', backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                id="header-avatar-popover"
              >
                {AVATAR_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isItemActive = currentActiveView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        handleNav(item.id);
                        setAvatarOpen(false);
                      }}
                      className={`w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center space-x-2.5 transition-colors cursor-pointer ${
                        isItemActive
                          ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                          : 'text-secondary hover:bg-[var(--bg-card-hover)] hover:text-primary'
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}

                {/* Divider */}
                <div className="border-t my-1" style={{ borderColor: 'var(--border)' }} />

                {/* Version Info */}
                <div className="px-3 py-1.5 flex items-center justify-between text-[11px] text-muted font-mono">
                  <span>版本号</span>
                  <span className="font-bold">{version ? `v${version}` : '—'}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Electron Window Controls (Conditional Rendering) */}
        {isElectron && (
          <div className="flex items-center space-x-1 pl-2 border-l" style={{ borderColor: 'var(--border)' }}>
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => window.veraElectron?.minimize()}
              className="p-2 rounded-lg border text-muted hover:text-primary transition-colors cursor-pointer"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
              id="electron-window-minimize"
              title="最小化"
              aria-label="最小化窗口"
            >
              <Minus className="w-4 h-4" />
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => window.veraElectron?.toggleMaximize()}
              className="p-2 rounded-lg border text-muted hover:text-primary transition-colors cursor-pointer"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
              id="electron-window-maximize"
              title={maximized ? '还原' : '最大化'}
              aria-label={maximized ? '向下还原窗口' : '最大化窗口'}
            >
              {maximized ? <Copy className="w-4 h-4" /> : <Square className="w-4 h-4" />}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => window.veraElectron?.close()}
              className="p-2 rounded-lg border text-muted hover:text-[var(--red)] hover:border-[var(--red)] transition-colors cursor-pointer"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
              id="electron-window-close"
              title="关闭"
              aria-label="关闭窗口"
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>
        )}
      </div>
    </header>
  );
}

