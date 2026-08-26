import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X, Copy, Check, FileText, Clock, User, Hash, AlertCircle, Loader2 } from 'lucide-react';
import { getDraftById } from '../../services/api/drafts';
import { DraftResponse } from '../../types/api';
import { useToastStore } from '../../stores/toastStore';

interface DraftDetailModalProps {
  draftId: number | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DraftDetailModal({ draftId, isOpen, onClose }: DraftDetailModalProps) {
  const reduced = useReducedMotion();
  const showToast = useToastStore((s) => s.showToast);

  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen || !draftId) {
      setDraft(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    getDraftById(draftId)
      .then((data) => setDraft(data))
      .catch((err: any) => setError(err?.message || '加载草稿详情失败'))
      .finally(() => setLoading(false));
  }, [isOpen, draftId]);

  const handleCopy = async () => {
    const textToCopy = draft?.body || draft?.body_en || draft?.body_zh;
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      showToast('success', '草稿正文已复制到剪贴板');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('error', '复制失败，请手动选择复制');
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-app)]/70 backdrop-blur-xs"
        onClick={onClose}
      >
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full max-w-2xl rounded-2xl border p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          onClick={(e) => e.stopPropagation()}
          id="draft-detail-modal"
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center space-x-2.5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shadow-xs"
                style={{ backgroundColor: 'var(--purple-soft)', color: 'var(--purple)' }}
              >
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm tracking-tight" style={{ color: 'var(--text-primary)' }}>
                  邮件草稿详情
                </h3>
                <p className="text-xs text-muted">查看与复制 AI 建议/协同生成的邮件全文</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:opacity-75 transition-opacity cursor-pointer text-muted"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body content */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs no-scrollbar">
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-2 text-muted">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
                <span>正在加载草稿全文...</span>
              </div>
            ) : error ? (
              <div className="p-4 rounded-xl bg-[var(--red-soft)] text-[var(--red)] flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            ) : draft ? (
              <>
                {/* Meta info capsule */}
                <div
                  className="p-3 rounded-xl border grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs"
                  style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border)' }}
                >
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-muted flex items-center space-x-1">
                      <User className="w-3 h-3" />
                      <span>收件人</span>
                    </span>
                    <p className="font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                      {draft.client_name || draft.to_email || '客户'}
                    </p>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] text-muted flex items-center space-x-1">
                      <Hash className="w-3 h-3" />
                      <span>案件 ID</span>
                    </span>
                    <p className="font-mono font-bold truncate" style={{ color: 'var(--accent)' }}>
                      {draft.case_id || '通用'}
                    </p>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] text-muted">状态</span>
                    <p>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--purple-soft)] text-[var(--purple)]">
                        {draft.status === 'confirmed' ? '已确认' : draft.status === 'sent' ? '已发送' : '草稿 (Draft)'}
                      </span>
                    </p>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] text-muted flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>版本 / 更新</span>
                    </span>
                    <p className="font-mono text-[11px] text-muted">
                      v{draft.version || 1} · {draft.created_at ? new Date(draft.created_at).toLocaleDateString('zh-CN') : '刚刚'}
                    </p>
                  </div>
                </div>

                {/* Subject */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-muted">邮件主题 (Subject)</span>
                  <div
                    className="p-2.5 rounded-xl border font-bold text-xs select-text"
                    style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  >
                    {draft.subject || '（无主题）'}
                  </div>
                </div>

                {/* Body */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-muted">邮件正文 (Body)</span>
                  <div
                    className="p-3.5 rounded-xl border text-xs leading-relaxed font-mono whitespace-pre-wrap select-text max-h-72 overflow-y-auto"
                    style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  >
                    {draft.body || draft.body_en || draft.body_zh || '（无正文内容）'}
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {/* Footer actions */}
          <div className="pt-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl border text-xs font-semibold text-muted hover:text-primary cursor-pointer"
              style={{ borderColor: 'var(--border)' }}
            >
              关闭
            </button>

            <motion.button
              whileTap={reduced ? undefined : { scale: 0.95 }}
              onClick={handleCopy}
              disabled={!(draft?.body || draft?.body_en || draft?.body_zh)}
              className="px-4 py-1.5 rounded-xl text-xs font-bold text-white flex items-center space-x-1.5 cursor-pointer shadow-md disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-white" />
                  <span>已复制！</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-white" />
                  <span>一键复制邮件全文</span>
                </>
              )}
            </motion.button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
