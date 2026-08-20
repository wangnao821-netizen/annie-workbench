import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X, Copy, Check, Brain } from 'lucide-react';
import { CaseContext } from '../../types/api';
import { useToastStore } from '../../stores/toastStore';

interface ContextPreviewModalProps {
  open: boolean;
  onClose: () => void;
  context: CaseContext | null;
  loading: boolean;
}

export function ContextPreviewModal({ open, onClose, context, loading }: ContextPreviewModalProps) {
  const reduced = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const showToast = useToastStore((s) => s.showToast);

  if (!open) return null;

  const formattedJson = context ? JSON.stringify(context, null, 2) : '';

  const handleCopy = () => {
    if (!formattedJson) return;
    navigator.clipboard.writeText(formattedJson);
    setCopied(true);
    showToast('success', '已复制 AI 上下文到剪贴板');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-app)]/80 backdrop-blur-xs">
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10  }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10  }}
          className="w-full max-w-2xl max-h-[85vh] flex flex-col p-5 rounded-2xl border shadow-2xl space-y-4 glass-panel"
          style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-xl bg-[var(--purple-soft)] text-[var(--purple)]">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm" style={{ color: 'var(--text-primary)' }}>导出案件上下文</h3>
                <p className="text-[11px] text-muted">案件数据包，非 AI 内部提示词（包含当前事实大纲、待办状态、风险清单与近期记忆）</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleCopy}
                disabled={!formattedJson || loading}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-xl border font-bold text-xs bg-[var(--purple-soft)] hover:bg-[var(--purple-soft)] text-[var(--purple)] transition-colors cursor-pointer border-[var(--purple-soft)] disabled:opacity-50"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? '已复制' : '复制上下文'}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-muted hover:text-primary transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 text-xs">
            {loading ? (
              <div className="p-8 text-center text-muted animate-pulse">正在读取 AI 上下文...</div>
            ) : !context ? (
              <div className="p-8 text-center text-muted">暂无上下文数据</div>
            ) : (
              <div className="space-y-3">
                {/* Structured Highlights */}
                <div className="p-3 rounded-xl border bg-[var(--bg-subtle)] space-y-2" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between font-bold text-[11px]" style={{ color: 'var(--text-primary)' }}>
                    <span>🧠 AI 核心记忆概括 (Memory)</span>
                  </div>
                  <p className="text-xs text-muted leading-relaxed whitespace-pre-wrap">{context.memory || '暂无全局记忆'}</p>
                </div>

                {/* Raw JSON Preview */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-muted px-1">
                    <span>JSON 结构（只读）</span>
                    <span className="font-mono text-[11px]">GET /api/cases/{context.case_id}/context</span>
                  </div>
                  <pre className="p-3 rounded-xl border bg-[var(--bg-subtle-strong)] font-mono text-[11px] leading-relaxed text-[var(--green)] overflow-x-auto select-all max-h-80" style={{ borderColor: 'var(--border)' }}>
                    {formattedJson}
                  </pre>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="pt-2 border-t flex justify-end flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl border font-bold text-xs text-muted hover:text-primary transition-colors cursor-pointer"
              style={{ borderColor: 'var(--border)' }}
            >
              关闭
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
