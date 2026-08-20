import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X, Trash2, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { ContextEvent } from '../../types/api';

interface RecordedEventsDrawerProps {
  open: boolean;
  onClose: () => void;
  events: ContextEvent[];
  onRevoke: (id: number) => void;
}

export function RecordedEventsDrawer({ open, onClose, events, onRevoke }: RecordedEventsDrawerProps) {
  const [revokeTarget, setRevokeTarget] = useState<ContextEvent | null>(null);
  const reduced = useReducedMotion();

  const handleConfirmRevoke = () => {
    if (revokeTarget) {
      onRevoke(revokeTarget.id);
      setRevokeTarget(null);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0  }}
          animate={{ opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0  }}
          className="absolute inset-0 bg-[var(--bg-subtle-strong)] dark:bg-[var(--bg-app)]/60 z-30 backdrop-blur-xs flex items-center justify-center p-4 select-none"
          onClick={onClose}
          id="recorded-events-drawer-overlay"
        >
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-[480px] max-w-[92%] h-[min(760px,90%)] rounded-2xl border shadow-2xl bg-[var(--bg-panel)] flex flex-col overflow-hidden relative select-none"
            style={{ borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
            id="recorded-events-drawer"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0 glass-panel" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-[var(--purple-soft)] text-[var(--purple)]">
                  <CheckCircle2 className="w-4 h-4 text-[var(--green)]" />
                </div>
                <h3 className="font-extrabold text-sm" style={{ color: 'var(--text-primary)' }}>
                  已记录 {events.length} 条
                </h3>
              </div>
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={onClose}
                className="p-1.5 rounded-lg border text-muted hover:text-primary transition-colors cursor-pointer"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                id="drawer-close-btn"
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>

            {/* List Body */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-2.5">
              {events.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-xs text-muted">
                  <CheckCircle2 className="w-8 h-8 text-muted mb-2 opacity-40" />
                  <span>暂无已确认记录</span>
                </div>
              ) : (
                events.map((evt) => (
                  <div
                    key={evt.id}
                    className="p-3 rounded-2xl border space-y-2 relative group transition-colors"
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                    id={`recorded-event-item-${evt.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-[var(--purple-soft)] text-[var(--purple)]">
                        {evt.source_type}
                      </span>
                      <div className="flex items-center space-x-2">
                        {evt.created_at && (
                          <span className="text-[11px] text-muted flex items-center space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>{evt.created_at}</span>
                          </span>
                        )}
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={() => setRevokeTarget(evt)}
                          className="p-1 rounded-md text-[var(--red)] hover:bg-[var(--red-soft)] transition-colors cursor-pointer"
                          title="撤销此记录"
                          id={`recorded-event-revoke-btn-${evt.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </motion.button>
                      </div>
                    </div>

                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                      {evt.content}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Revoke Confirmation Dialog */}
            <AnimatePresence>
              {revokeTarget && (
                <motion.div
                  initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10  }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, y: 10  }}
                  className="p-4 border-t space-y-3 bg-[var(--red-soft)] border-[var(--red-soft)]"
                >
                  <div className="flex items-start space-x-2">
                    <AlertTriangle className="w-4 h-4 text-[var(--red)] flex-shrink-0 mt-0.5" />
                    <p className="text-xs leading-relaxed text-[var(--red)] dark:text-[var(--red)]">
                      撤销后该记录不再参与摘要，可审计恢复。撤销？
                    </p>
                  </div>
                  <div className="flex items-center justify-end space-x-2">
                    <button
                      type="button"
                      onClick={() => setRevokeTarget(null)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer hover:opacity-80"
                      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmRevoke}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-[var(--red)] hover:bg-[var(--red)] cursor-pointer"
                      id="revoke-confirm-action-btn"
                    >
                      撤销
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
