import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { 
  CheckSquare, 
  Briefcase, 
  Brain, 
  MoreHorizontal, 
  Settings, 
  FileText, 
  Archive, 
  History, 
  Database, 
  Palette 
} from 'lucide-react';
import { ViewId } from '../../types/navigation';
import { useThemeStore } from '../../stores/themeStore';
import { THEMES } from '../../themes';

interface SidebarProps {
  activeTab: ViewId;
  onTabChange: (tab: ViewId) => void;
}

type MainTabId = ViewId | 'more';

const MAIN_TABS: { id: MainTabId; icon: React.ElementType; label: string; badge?: number }[] = [
  { id: 'tasks', icon: CheckSquare, label: '任务工作台', badge: 8 },
  { id: 'cases', icon: Briefcase, label: '案件看板' },
  { id: 'knowledge', icon: Brain, label: '知识中心' },
  { id: 'more', icon: MoreHorizontal, label: '更多' },
];

const MORE_ITEMS: { id: ViewId; label: string; icon: React.ElementType }[] = [
  { id: 'settings', label: '系统设置', icon: Settings },
  { id: 'drafts', label: '草稿箱', icon: FileText },
  { id: 'archive', label: '档案库', icon: Archive },
  { id: 'imports', label: '导入历史', icon: History },
  { id: 'migration', label: '数据迁移', icon: Database },
];

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { current, setTheme } = useThemeStore();

  const isMoreActive = ['settings', 'drafts', 'archive', 'imports', 'migration'].includes(activeTab);

  const cycleTheme = () => {
    const themeIds = THEMES.map(t => t.id);
    const nextIdx = (themeIds.indexOf(current) + 1) % themeIds.length;
    setTheme(themeIds[nextIdx]);
  };

  useEffect(() => {
    if (!moreOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [moreOpen]);

  return (
    <aside
      className="w-[60px] flex-shrink-0 flex flex-col items-center py-4 border-r sticky top-0 h-screen z-30 transition-colors duration-200 select-none"
      style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
      id="app-sidebar"
    >
      {/* Top Logo */}
      <div 
        className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-base shadow-md cursor-pointer mb-6 relative group"
        style={{ 
          background: 'linear-gradient(135deg, var(--accent) 0%, var(--purple) 100%)',
          boxShadow: 'var(--shadow-card)' 
        }}
        onClick={cycleTheme}
        title="点击快速切换主题"
        id="sidebar-logo-brand"
      >
        <span>V</span>
        <span 
          className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2" 
          style={{ backgroundColor: 'var(--green)', borderColor: 'var(--bg-panel)' }} 
        />
      </div>

      {/* Navigation Icons List */}
      <nav className="flex-1 flex flex-col space-y-4 items-center" id="sidebar-nav-items">
        {MAIN_TABS.map((tab) => {
          const Icon = tab.icon;
          const isMore = tab.id === 'more';
          const isActive = isMore ? isMoreActive : activeTab === tab.id;
          const isHovered = hoveredTab === tab.id;

          return (
            <div 
              key={tab.id} 
              className="relative flex items-center"
              onMouseEnter={() => setHoveredTab(tab.id)}
              onMouseLeave={() => setHoveredTab(null)}
            >
              <motion.button
                whileTap={{ scale: 0.92 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                onClick={() => {
                  if (isMore) {
                    setMoreOpen(!moreOpen);
                  } else {
                    onTabChange(tab.id as ViewId);
                    setMoreOpen(false);
                  }
                }}
                aria-expanded={isMore ? moreOpen : undefined}
                aria-label={tab.label}
                className="w-[44px] h-[44px] rounded-xl flex items-center justify-center relative cursor-pointer transition-colors duration-150"
                style={{
                  backgroundColor: isActive ? 'var(--accent-soft)' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                }}
                id={`sidebar-btn-${tab.id}`}
              >
                <Icon className="w-5 h-5 stroke-[2]" />

                {tab.badge && tab.badge > 0 && (
                  <span 
                    className="absolute -top-1 -right-1 px-1.5 py-0.2 text-[10px] font-bold text-white rounded-full flex items-center justify-center min-w-[18px] h-[18px] border-2 shadow-sm"
                    style={{ backgroundColor: 'var(--red)', borderColor: 'var(--bg-panel)' }}
                    id={`sidebar-badge-${tab.id}`}
                  >
                    {tab.badge}
                  </span>
                )}
              </motion.button>

              {/* Hover Tooltip Popup */}
              <AnimatePresence>
                {isHovered && !moreOpen && (
                  <motion.div
                    initial={{ opacity: 0, x: 8, scale: 0.95 }}
                    animate={{ opacity: 1, x: 14, scale: 1 }}
                    exit={{ opacity: 0, x: 6, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    className="absolute left-full z-50 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shadow-lg border pointer-events-none"
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)',
                      boxShadow: 'var(--shadow-overlay)'
                    }}
                  >
                    {tab.label}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* More Popover */}
              {isMore && (
                <AnimatePresence>
                  {moreOpen && (
                    <motion.div
                      ref={menuRef}
                      id="more-menu"
                      style={{
                        backgroundColor: 'var(--bg-card)',
                        borderColor: 'var(--border)',
                        boxShadow: 'var(--shadow-overlay)',
                        transformOrigin: 'top left',
                      }}
                      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, x: 6, y: -4 }}
                      animate={{ opacity: 1, scale: 1, x: 12, y: 0 }}
                      exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, x: 6, y: -4 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      className="absolute left-full top-0 z-50 w-44 p-1.5 rounded-xl border flex flex-col space-y-0.5"
                    >
                      {MORE_ITEMS.map((item) => {
                        const ItemIcon = item.icon;
                        const isSubActive = activeTab === item.id;
                        return (
                          <motion.button
                            key={item.id}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => {
                              onTabChange(item.id);
                              setMoreOpen(false);
                            }}
                            className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center space-x-2.5 cursor-pointer transition-colors ${
                              isSubActive
                                ? 'text-[var(--accent)] bg-[var(--accent-soft)]'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            <ItemIcon className="w-4 h-4 stroke-[2]" />
                            <span>{item.label}</span>
                          </motion.button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom Quick Theme Pill / System Status */}
      <div className="mt-auto flex flex-col items-center space-y-3">
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={cycleTheme}
          className="w-10 h-10 rounded-xl border flex items-center justify-center cursor-pointer transition-colors shadow-xs"
          style={{ 
            backgroundColor: 'var(--bg-card)', 
            borderColor: 'var(--border)', 
            color: 'var(--accent)' 
          }}
          title="点击切换外观主题"
          id="sidebar-theme-toggle"
        >
          <Palette className="w-4 h-4 stroke-[2]" />
        </motion.button>
      </div>
    </aside>
  );
}
