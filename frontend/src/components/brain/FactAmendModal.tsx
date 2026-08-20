import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X, Edit3, ShieldAlert } from 'lucide-react';
import { BrainFact } from '../../types/api';

interface FactAmendModalProps {
  open: boolean;
  fact: BrainFact | null;
  onClose: () => void;
  onSubmit: (newValue: string, reason: string) => Promise<void>;
}

export function FactAmendModal({ open, fact, onClose, onSubmit }: FactAmendModalProps) {
  const reduced = useReducedMotion();
  const [newValue, setNewValue] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (fact) {
      setNewValue(fact.value);
      setReason('');
    }
  }, [fact]);

  if (!open || !fact) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newValue.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(newValue.trim(), reason.trim());
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
              <div className="p-2 rounded-xl bg-[var(--purple-soft)] text-[var(--purple)]">
                <Edit3 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm" style={{ color: 'var(--text-primary)' }}>修正案情事实</h3>
                <p className="text-[11px] text-muted">替换旧事实，旧值将记录在审计退场链中，新值自动锁定</p>
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
            {/* Key Field Display */}
            <div>
              <label className="block text-[11px] font-bold text-muted mb-1">事实标识 (Key)</label>
              <div className="p-2 rounded-xl border bg-[var(--bg-subtle)] font-mono text-[11px]" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                {fact.key} ({fact.category})
              </div>
            </div>

            {/* Current Value */}
            <div>
              <label className="block text-[11px] font-bold text-muted mb-1">原事实值 (Current Value)</label>
              <div className="p-2.5 rounded-xl border bg-[var(--bg-subtle)] text-muted leading-relaxed line-through decoration-[var(--red)]" style={{ borderColor: 'var(--border)' }}>
                {fact.value}
              </div>
            </div>

            {/* New Value Input */}
            <div>
              <label className="block text-[11px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                修正后的新值 <span className="text-[var(--red)]">*</span>
              </label>
              <input
                type="text"
                required
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="请输入核实后的新事实内容"
                className="w-full px-3 py-2 rounded-xl border bg-[var(--bg-subtle)] font-semibold text-xs focus:outline-none focus:ring-2 focus:ring-[var(--purple)]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            {/* Reason Input */}
            <div>
              <label className="block text-[11px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                修正原因 / 依据 (Reason)
              </label>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="例如：客户已补充最新工资单，核实实际年薪为 $120,000"
                className="w-full px-3 py-2 rounded-xl border bg-[var(--bg-subtle)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--purple)]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            <div className="p-2.5 rounded-xl bg-[var(--yellow-soft)] border border-[var(--yellow-soft)] text-[11px] text-[var(--yellow)] flex items-start space-x-1.5">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>提交后，原事实行将被废弃，新事实行将继承分类并自动标记为“人工锁定”，防止 AI 自动覆盖。</span>
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
                disabled={!newValue.trim() || submitting}
                className="px-4 py-1.5 rounded-xl bg-[var(--purple)] hover:bg-[var(--purple)] text-[var(--on-purple)] font-bold transition-all disabled:opacity-50 cursor-pointer shadow-md"
              >
                {submitting ? '提交修正中...' : '确认修正'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
