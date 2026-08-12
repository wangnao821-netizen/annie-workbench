import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Zap, Clock, Mail, Coins, Layers, FolderPlus, ListPlus } from 'lucide-react';
import { useUiStore } from '../../stores/uiStore';
import { useTaskStore } from '../../stores/taskStore';
import { useCaseStore } from '../../stores/caseStore';
import { NotificationBell } from '../notifications/NotificationBell';

interface KpiBarProps {
  onNewTask?: () => void;
}

export function KpiBar({ onNewTask }: KpiBarProps) {
  const tasks = useTaskStore((s) => s.tasks);
  const cases = useCaseStore((s) => s.cases);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const pending = tasks.filter((t) => !t.completed);
  const activeCount = pending.length;
  const urgentCount = pending.filter((t) => t.priority === 'urgent').length;
  const osCount = pending.filter((t) => t.type === 'OS_ATTACK').length;
  const emailCount = pending.filter((t) =>
    ['EMAIL_DISPATCH', 'GENERAL_EMAIL', 'NEW_CLIENT'].includes(t.type)
  ).length;

  const loanVolume = cases.reduce((sum, c) => {
    const amt = c.loanAmount || 0;
    const inWan = amt >= 10000 ? amt / 10000 : amt;
    return sum + inWan;
  }, 0);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  const handleOpenNewCase = () => {
    setMenuOpen(false);
    useUiStore.getState().setNewCaseOpen(true);
    if (onNewTask) onNewTask();
  };

  const handleOpenNewTask = () => {
    setMenuOpen(false);
    useUiStore.getState().setNewTaskOpen(true);
  };

  return (
    <div
      className="px-6 py-2.5 border-b flex items-center justify-between flex-shrink-0 transition-colors duration-200 select-none relative z-30"
      style={{
        backgroundColor: 'var(--surface-translucent)',
        borderColor: 'var(--border)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)'
      }}
      id="kpi-summary-bar"
    >
      {/* KPI Pills List */}
      <div className="flex items-center space-x-3 text-xs font-medium overflow-x-auto no-scrollbar py-0.5 min-w-0 flex-1 pr-2">
        {/* Notification Bell */}
        <NotificationBell />

        {/* Active Tasks */}
        <div
          className="px-3 py-1.5 rounded-full border flex items-center space-x-2 shadow-xs transition-colors"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          id="kpi-pill-active"
        >
          <Layers className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>活跃任务:</span>
          <span className="text-sm font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{activeCount}</span>
        </div>

        {/* Loan Volume */}
        <div
          className="px-3 py-1.5 rounded-full border flex items-center space-x-2 shadow-xs transition-colors"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          id="kpi-pill-volume"
        >
          <Coins className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} />
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>贷款总额:</span>
          <span className="text-sm font-bold font-mono" style={{ color: 'var(--green)' }}>
            {loanVolume ? `${Math.round(loanVolume).toLocaleString()}万` : '0万'}
          </span>
        </div>

        {/* Urgent Items (Red Border Highlight) */}
        <div
          className="px-3 py-1.5 rounded-full border flex items-center space-x-2 shadow-xs transition-colors"
          style={{
            backgroundColor: 'var(--red-soft)',
            borderColor: 'rgba(248, 113, 113, 0.35)',
            color: 'var(--red)'
          }}
          id="kpi-pill-urgent"
        >
          <Zap className="w-3.5 h-3.5 animate-pulse fill-current" />
          <span className="text-[11px]">紧急高优先:</span>
          <span className="text-sm font-bold font-mono">{urgentCount}</span>
        </div>

        {/* Outstanding OS Items */}
        <div
          className="px-3 py-1.5 rounded-full border flex items-center space-x-2 shadow-xs transition-colors"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          id="kpi-pill-os"
        >
          <Clock className="w-3.5 h-3.5" style={{ color: 'var(--yellow)' }} />
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>待银行 OS:</span>
          <span className="text-sm font-bold font-mono" style={{ color: 'var(--yellow)' }}>{osCount}</span>
        </div>

        {/* New Emails */}
        <div
          className="px-3 py-1.5 rounded-full border flex items-center space-x-2 shadow-xs transition-colors"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          id="kpi-pill-emails"
        >
          <Mail className="w-3.5 h-3.5" style={{ color: 'var(--purple)' }} />
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>未读邮件:</span>
          <span className="text-sm font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{emailCount} 条</span>
        </div>
      </div>

      {/* Right Plus Menu Container */}
      <div className="relative ml-4 flex-shrink-0" ref={menuRef}>
        <motion.button
          whileTap={{ scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          onClick={() => setMenuOpen(!menuOpen)}
          className="px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer shadow-sm text-white flex-shrink-0"
          style={{ backgroundColor: 'var(--accent)' }}
          id="kpi-new-task-btn"
          aria-label="新建选项菜单"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>新建</span>
        </motion.button>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 4 }}
              exit={{ opacity: 0, scale: 0.92, y: -4 }}
              transition={{ type: 'spring', damping: 25, stiffness: 400 }}
              style={{
                transformOrigin: 'top right',
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
              }}
              className="absolute right-0 top-full z-[100] mt-1.5 w-36 rounded-2xl border shadow-2xl p-1.5 flex flex-col space-y-1 text-xs"
              id="kpi-plus-menu"
            >
              <button
                type="button"
                id="kpi-menu-new-case"
                onClick={handleOpenNewCase}
                className="w-full px-3 py-2 rounded-xl flex items-center space-x-2 text-left font-medium hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                style={{ color: 'var(--text-primary)' }}
              >
                <FolderPlus className="w-4 h-4 text-emerald-500" />
                <span>新建案件</span>
              </button>
              <button
                type="button"
                id="kpi-menu-new-task"
                onClick={handleOpenNewTask}
                className="w-full px-3 py-2 rounded-xl flex items-center space-x-2 text-left font-medium hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                style={{ color: 'var(--text-primary)' }}
              >
                <ListPlus className="w-4 h-4 text-purple-500" />
                <span>新建任务</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
