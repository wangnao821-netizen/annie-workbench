import { motion } from 'motion/react';
import { Plus, Zap, Clock, Mail, Coins, Layers } from 'lucide-react';
import { useUiStore } from '../../stores/uiStore';
import { NotificationBell } from '../notifications/NotificationBell';

interface KpiBarProps {
  onNewTask?: () => void;
}

export function KpiBar({ onNewTask }: KpiBarProps) {
  const handleNewCase = () => {
    useUiStore.getState().setNewCaseOpen(true);
    if (onNewTask) onNewTask();
  };
  return (
    <div
      className="px-6 py-2.5 border-b flex items-center justify-between flex-shrink-0 transition-colors duration-200 select-none overflow-x-auto no-scrollbar"
      style={{
        backgroundColor: 'var(--surface-translucent)',
        borderColor: 'var(--border)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)'
      }}
      id="kpi-summary-bar"
    >
      {/* KPI Pills List */}
      <div className="flex items-center space-x-3 text-xs font-medium">
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
          <span className="text-sm font-bold font-mono" style={{ color: 'var(--text-primary)' }}>28</span>
        </div>

        {/* Loan Volume */}
        <div
          className="px-3 py-1.5 rounded-full border flex items-center space-x-2 shadow-xs transition-colors"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          id="kpi-pill-volume"
        >
          <Coins className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} />
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>贷款总额:</span>
          <span className="text-sm font-bold font-mono" style={{ color: 'var(--green)' }}>$3,200万</span>
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
          <span className="text-sm font-bold font-mono">3</span>
        </div>

        {/* Outstanding OS Items */}
        <div
          className="px-3 py-1.5 rounded-full border flex items-center space-x-2 shadow-xs transition-colors"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          id="kpi-pill-os"
        >
          <Clock className="w-3.5 h-3.5" style={{ color: 'var(--yellow)' }} />
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>待银行 OS:</span>
          <span className="text-sm font-bold font-mono" style={{ color: 'var(--yellow)' }}>5 OS</span>
        </div>

        {/* New Emails */}
        <div
          className="px-3 py-1.5 rounded-full border flex items-center space-x-2 shadow-xs transition-colors"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          id="kpi-pill-emails"
        >
          <Mail className="w-3.5 h-3.5" style={{ color: 'var(--purple)' }} />
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>未读邮件:</span>
          <span className="text-sm font-bold font-mono" style={{ color: 'var(--text-primary)' }}>12 条</span>
        </div>
      </div>

      {/* Right New Task Button */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        onClick={handleNewCase}
        className="px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer shadow-sm text-white flex-shrink-0 ml-4"
        style={{ backgroundColor: 'var(--accent)' }}
        id="kpi-new-task-btn"
      >
        <Plus className="w-4 h-4 stroke-[2.5]" />
        <span>新建任务</span>
      </motion.button>
    </div>
  );
}
