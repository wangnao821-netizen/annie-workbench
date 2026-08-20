import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { X, Mail, Calendar, User, UserCheck, Paperclip, Loader2, AlertCircle } from 'lucide-react';
import { getCaseMailPreview } from '../../../services/api/cases';
import { MailPreviewResponse } from '../../../types/api';

interface MailPreviewModalProps {
  caseId: string;
  filename: string;
  onClose: () => void;
}

export function MailPreviewModal({ caseId, filename, onClose }: MailPreviewModalProps) {
  const reduced = useReducedMotion();
  const [data, setData] = useState<MailPreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getCaseMailPreview(caseId, filename)
      .then(setData)
      .catch((err) => setError(err?.message || '邮件解析失败'))
      .finally(() => setLoading(false));
  }, [caseId, filename]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
      id="mail-preview-modal-backdrop"
    >
      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-3xl max-h-[85vh] h-[85vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden bg-[var(--bg-card)]"
        style={{ borderColor: 'var(--border)' }}
        onClick={(e) => e.stopPropagation()}
        id="mail-preview-modal-container"
      >
        {/* Header */}
        <div
          className="px-5 py-4 border-b flex items-center justify-between flex-shrink-0 bg-[var(--bg-panel)]"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Mail className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold truncate" style={{ color: 'var(--text-primary)' }}>
                {data?.subject || filename}
              </h3>
              <p className="text-xs text-muted font-mono truncate">证据文件: {filename}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg border text-muted hover:text-primary cursor-pointer transition-colors"
            style={{ borderColor: 'var(--border)' }}
            aria-label="关闭邮件预览"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 no-scrollbar">
          {loading ? (
            <div className="h-60 flex flex-col items-center justify-center space-y-2 text-muted">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
              <span className="text-xs">正在就地读取邮件原件...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : data ? (
            <>
              {/* Mail Meta Header */}
              <div
                className="p-3.5 rounded-xl border bg-[var(--bg-subtle)] space-y-1.5 text-xs"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center space-x-1.5 text-secondary">
                    <User className="w-3.5 h-3.5 text-muted" />
                    <span>
                      发件人: <strong className="text-primary font-mono">{data.sender}</strong>
                    </span>
                  </div>
                  {data.date && (
                    <div className="flex items-center space-x-1 text-muted font-mono text-[11px]">
                      <Calendar className="w-3 h-3" />
                      <span>{data.date}</span>
                    </div>
                  )}
                </div>
                {data.to && (
                  <div className="flex items-center space-x-1.5 text-secondary">
                    <UserCheck className="w-3.5 h-3.5 text-muted" />
                    <span>
                      收件人: <span className="font-mono">{data.to}</span>
                    </span>
                  </div>
                )}
              </div>

              {/* Attachments */}
              {data.attachments && data.attachments.length > 0 && (
                <div
                  className="p-2.5 rounded-xl border bg-[var(--bg-app)] space-y-1.5"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span className="text-[11px] font-bold text-muted flex items-center space-x-1">
                    <Paperclip className="w-3 h-3" />
                    <span>包含附件 ({data.attachments.length}):</span>
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {data.attachments.map((att, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-[var(--bg-card)] border border-[var(--border)] text-secondary"
                      >
                        📎 {att}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Mail Body */}
              <div
                className="p-4 rounded-xl border bg-[var(--bg-app)] text-xs text-primary leading-relaxed whitespace-pre-wrap font-sans"
                style={{ borderColor: 'var(--border)' }}
              >
                {data.body_text || '（邮件无正文内容）'}
              </div>
            </>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}
