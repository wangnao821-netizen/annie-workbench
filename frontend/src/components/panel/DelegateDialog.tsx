import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X, UserCheck } from 'lucide-react';
import { DelegateRequest } from '../../types/api';

interface DelegateDialogProps {
  open: boolean;
  presetName: string;
  onCancel: () => void;
  onSubmit: (body: DelegateRequest) => void;
}

export function DelegateDialog({ open, presetName, onCancel, onSubmit }: DelegateDialogProps) {
  const reduced = useReducedMotion();
  const [delegateTo, setDelegateTo] = useState(presetName);
  const [deadline, setDeadline] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setDelegateTo(presetName);
  }, [presetName, open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!delegateTo.trim()) return;
    onSubmit({
      delegate_to: delegateTo.trim(),
      deadline: deadline ? new Date(deadline + 'T00:00:00').toISOString() : undefined,
      message: message.trim() || undefined,
    });
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-app)]/60 backdrop-blur-xs">
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10  }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10  }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="w-full max-w-md rounded-2xl border shadow-xl p-5 space-y-4"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center space-x-2">
              <UserCheck className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <h3 className="text-sm font-bold">任务委派</h3>
            </div>
            <button
              onClick={onCancel}
              className="p-1 rounded-lg hover:bg-[var(--bg-subtle)]"
              style={{ color: 'var(--text-muted)' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            <div className="space-y-1">
              <label className="block font-medium" style={{ color: 'var(--text-secondary)' }}>
                委派对象 <span className="text-[var(--red)]">*</span>
              </label>
              <input
                type="text"
                value={delegateTo}
                onChange={(e) => setDelegateTo(e.target.value)}
                placeholder="请输入负责人姓名..."
                required
                className="w-full px-3 py-2 rounded-xl border bg-transparent outline-none"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            <div className="space-y-1">
              <label className="block font-medium" style={{ color: 'var(--text-secondary)' }}>
                截止日期 (可选)
              </label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border bg-transparent outline-none"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            <div className="space-y-1">
              <label className="block font-medium" style={{ color: 'var(--text-secondary)' }}>
                备注说明 (可选)
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="补充处理要求或注意事项..."
                className="w-full px-3 py-2 rounded-xl border bg-transparent outline-none resize-none"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <button
                type="button"
                id="delegate-cancel-btn"
                onClick={onCancel}
                className="px-4 py-2 rounded-xl border font-medium hover:opacity-80 transition-opacity"
                style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                取消
              </button>
              <button
                type="submit"
                id="delegate-confirm-btn"
                className="px-4 py-2 rounded-xl font-semibold text-white shadow-xs hover:opacity-90 transition-opacity"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                确认委派
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
