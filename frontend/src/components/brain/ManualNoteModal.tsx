import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X, FilePlus } from 'lucide-react';

interface ManualNoteModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (content: string, track: 'internal' | 'external') => Promise<void>;
}

export function ManualNoteModal({ open, onClose, onSubmit }: ManualNoteModalProps) {
  const reduced = useReducedMotion();
  const [content, setContent] = useState('');
  const [track, setTrack] = useState<'internal' | 'external'>('internal');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(content.trim(), track);
      setContent('');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-app)]/80 backdrop-blur-xs">
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10  }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10  }}
          className="w-full max-w-md p-5 rounded-2xl border shadow-2xl space-y-4 glass-panel"
          style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <FilePlus className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm" style={{ color: 'var(--text-primary)' }}>记一笔 (手动补充事件)</h3>
                <p className="text-[11px] text-muted">手动录入案件的关键事实或沟通记录，实时刷新上下文</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted hover:text-primary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Track Selector */}
            <div>
              <label className="block text-[11px] font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                分轨类型 (Track)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTrack('internal')}
                  className={`p-2.5 rounded-xl border font-bold text-center transition-all cursor-pointer ${
                    track === 'internal'
                      ? 'bg-[var(--yellow-soft)] text-[var(--yellow)] border-[var(--yellow-soft)] ring-2 ring-[var(--yellow-soft)]'
                      : 'bg-[var(--bg-subtle)] text-muted border-[var(--border)] hover:text-primary'
                  }`}
                >
                  🟡 内部路线 (Internal)
                </button>
                <button
                  type="button"
                  onClick={() => setTrack('external')}
                  className={`p-2.5 rounded-xl border font-bold text-center transition-all cursor-pointer ${
                    track === 'external'
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-soft)] ring-2 ring-[var(--accent-soft)]'
                      : 'bg-[var(--bg-subtle)] text-muted border-[var(--border)] hover:text-primary'
                  }`}
                >
                  🔵 递交路线 (External)
                </button>
              </div>
            </div>

            {/* Content Input */}
            <div>
              <label className="block text-[11px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                笔记 / 事实内容 <span className="text-[var(--red)]">*</span>
              </label>
              <textarea
                rows={4}
                required
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="例如：电话与客户确认，第二雇主试用期已过，补交雇主信证明..."
                className="w-full px-3 py-2.5 rounded-xl border bg-[var(--bg-subtle)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end space-x-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-3.5 py-1.5 rounded-xl border font-bold text-muted hover:text-primary transition-colors cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={!content.trim() || submitting}
                className="px-4 py-1.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent)] text-[var(--on-accent)] font-bold transition-all disabled:opacity-50 cursor-pointer shadow-md"
              >
                {submitting ? '提交中...' : '提交记录'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
