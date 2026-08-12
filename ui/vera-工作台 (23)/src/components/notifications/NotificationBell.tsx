import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Bell, AlertTriangle, CheckCircle2, Info, CheckCheck, Trash2 } from 'lucide-react';
import { useNotificationStore, NotificationLevel } from '../../stores/notificationStore';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const clearAll = useNotificationStore((s) => s.clearAll);

  const calcPanelPos = () => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect) {
      let left = rect.left;
      if (left + 360 > window.innerWidth) {
        left = window.innerWidth - 360 - 12;
      }
      setPanelPos({ top: rect.bottom + 8, left: Math.max(8, left) });
    }
  };

  const toggleOpen = () => {
    if (!open) {
      calcPanelPos();
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  // Keyboard Escape & Click Outside listener
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const panelEl = document.getElementById('notification-panel');
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        panelEl &&
        !panelEl.contains(target)
      ) {
        setOpen(false);
      }
    };

    const handleResize = () => {
      calcPanelPos();
    };

    const handleScroll = () => {
      setOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open]);

  // Reserved for desktop push in the future
  const deliverToSystem = (title: string, body?: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  };
  // Expose deliverToSystem reference for linter/future usage
  if (false as boolean) { deliverToSystem('', ''); }

  const renderIcon = (level: NotificationLevel) => {
    switch (level) {
      case 'urgent':
        return (
          <div className="w-6 h-6 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
          </div>
        );
      case 'success':
        return (
          <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          </div>
        );
      case 'info':
      default:
        return (
          <div className="w-6 h-6 rounded-lg bg-[var(--accent-soft)] border border-[var(--accent)]/20 flex items-center justify-center flex-shrink-0">
            <Info className="w-3.5 h-3.5 text-[var(--accent)]" />
          </div>
        );
    }
  };

  return (
    <div className="relative flex items-center" ref={panelRef}>
      {/* Bell Trigger Button */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={toggleOpen}
        aria-expanded={open}
        aria-label="通知中心"
        className="w-8 h-8 rounded-full border flex items-center justify-center relative cursor-pointer transition-colors"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
        id="notification-bell-btn"
      >
        <Bell className="w-4 h-4 stroke-[2]" />

        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 px-1 py-0.2 text-[9px] font-bold text-white bg-rose-500 rounded-full flex items-center justify-center min-w-[16px] h-[16px] border-2 shadow-xs"
            style={{ borderColor: 'var(--bg-app)' }}
            id="notification-badge"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </motion.button>

      {/* Anchored Popover Panel Portaled to Document Body */}
      {createPortal(
        <AnimatePresence>
          {open && panelPos && (
            <motion.div
              id="notification-panel"
              style={{
                position: 'fixed',
                top: panelPos.top,
                left: panelPos.left,
                zIndex: 100,
                width: '360px',
                maxHeight: '420px',
                transformOrigin: 'top left',
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
                boxShadow: 'var(--shadow-overlay)',
              }}
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -6 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="rounded-2xl border flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div
                className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-app)' }}
              >
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                    通知中心
                  </span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400">
                      {unreadCount} 未读
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  {unreadCount > 0 && (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={markAllRead}
                      className="text-[11px] font-medium text-muted hover:text-primary flex items-center space-x-1 cursor-pointer"
                      id="notification-mark-all"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>全部已读</span>
                    </motion.button>
                  )}
                  {notifications.length > 0 && (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={clearAll}
                      className="text-[11px] font-medium text-muted hover:text-rose-500 flex items-center space-x-1 cursor-pointer"
                      id="notification-clear-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>清空</span>
                    </motion.button>
                  )}
                </div>
              </div>

              {/* Notification List */}
              <div className="flex-1 overflow-y-auto no-scrollbar">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted">
                    暂无通知
                  </div>
                ) : (
                  notifications.map((item, idx) => (
                    <div
                      key={item.id}
                      onClick={() => markRead(item.id)}
                      className={`relative p-3.5 flex space-x-3 cursor-pointer transition-colors ${
                        idx < notifications.length - 1 ? 'border-b' : ''
                      } ${
                        !item.read ? 'bg-[var(--accent-soft)]/20' : 'hover:bg-[var(--bg-card-hover)]'
                      }`}
                      style={{ borderColor: 'var(--border)' }}
                      id={`notification-${item.id}`}
                    >
                      {!item.read && (
                        <span
                          className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full"
                          style={{ backgroundColor: 'var(--accent)' }}
                        />
                      )}

                      <div className="pt-0.5">{renderIcon(item.level)}</div>

                      <div className="flex-1 space-y-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4
                            className={`text-xs ${!item.read ? 'font-bold' : 'font-medium'}`}
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {item.title}
                          </h4>
                          <span className="text-[10px] font-mono text-muted">{item.createdAt}</span>
                        </div>
                        {item.body && (
                          <p
                            className="text-[11px] leading-relaxed line-clamp-2"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {item.body}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
