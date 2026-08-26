import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  X,
  Mail,
  Copy,
  Check,
  Save,
  Edit3,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';
import { previewPreliminaryEmailDraft } from '../../services/api/cases';
import { createManualDraft } from '../../services/api/drafts';

interface PreliminaryEmailModalProps {
  caseId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function PreliminaryEmailModal({ caseId, isOpen, onClose }: PreliminaryEmailModalProps) {
  const reduced = useReducedMotion();
  const showToast = useToastStore((s) => s.showToast);

  const [toEmail, setToEmail] = useState('');
  const [ccEmail, setCcEmail] = useState('Brandon.He@everstones.com.au');
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !caseId) return;

    setLoading(true);
    setError(null);
    previewPreliminaryEmailDraft(caseId)
      .then((res) => {
        setSubject(res.subject || '');
        setToEmail(res.recipient_email || '');
        setCcEmail(res.cc_email || 'Brandon.He@everstones.com.au');
        setBodyText(res.body_text || '');
      })
      .catch((err: any) => {
        setError(err?.message || '加载标准邮件草稿失败');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, caseId]);

  const handleCopy = async () => {
    if (!bodyText) return;
    try {
      const fullText = `To: ${toEmail}\nCc: ${ccEmail}\nSubject: ${subject}\n\n${bodyText}`;
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      showToast('success', '标准英文邮件全文（含收件人与主题）已复制到剪贴板');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('error', '复制失败，请手动选择复制');
    }
  };

  const handleSaveToDrafts = async () => {
    if (saving || !bodyText) return;
    setSaving(true);
    try {
      await createManualDraft({
        case_id: caseId,
        subject: subject.trim(),
        body: bodyText.trim(),
        track: 'external',
      });
      showToast('success', '🎉 邮件已成功存入草稿箱，可随时在草稿箱查看！');
      onClose();
    } catch (err: any) {
      showToast('error', err?.message || '保存至草稿箱失败');
    } finally {
      setSaving(false);
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
          className="w-full max-w-3xl rounded-2xl border p-5 shadow-2xl space-y-4 max-h-[90vh] flex flex-col"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          onClick={(e) => e.stopPropagation()}
          id="preliminary-email-modal"
        >
          {/* 头部标题 */}
          <div className="flex items-start justify-between pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center space-x-2.5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shadow-xs"
                style={{ backgroundColor: 'var(--green-soft)', color: 'var(--green)' }}
              >
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm tracking-tight" style={{ color: 'var(--text-primary)' }}>
                  首次材料索要邮件 (Preliminary Assessment) · 标准英文核对与微调
                </h3>
                <p className="text-xs text-muted">
                  已严格根据 8 大板块标准英文模板与当前已勾选材料实时排版。支持在线编辑、一键复制与存入草稿箱。
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:opacity-75 transition-opacity cursor-pointer text-muted"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 邮件 Meta 字段区 (To / Cc / Subject) */}
          <div className="space-y-2 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-muted mb-0.5">收件人 (To)</label>
                <input
                  type="text"
                  value={toEmail}
                  onChange={(e) => setToEmail(e.target.value)}
                  placeholder="客户邮箱（如 client@example.com）"
                  className="w-full p-2 rounded-lg border bg-[var(--bg-app)] border-[var(--border)] text-xs outline-none focus:border-[var(--green)]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-muted mb-0.5">抄送 (Cc)</label>
                <input
                  type="text"
                  value={ccEmail}
                  onChange={(e) => setCcEmail(e.target.value)}
                  className="w-full p-2 rounded-lg border bg-[var(--bg-app)] border-[var(--border)] text-xs outline-none focus:border-[var(--green)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-muted mb-0.5">邮件主题 (Subject)</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full p-2 rounded-lg border font-bold bg-[var(--bg-app)] border-[var(--border)] text-xs outline-none focus:border-[var(--green)]"
              />
            </div>
          </div>

          {/* 邮件正文编辑与微调区 */}
          <div className="flex-1 min-h-0 flex flex-col space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-muted flex items-center space-x-1">
                <Edit3 className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>邮件正文 (8 大板块标准英文，支持直接微调编辑)</span>
              </label>
              <span className="text-[10px] text-muted font-mono">
                {bodyText.length} 字符
              </span>
            </div>

            {loading ? (
              <div className="flex-1 min-h-48 flex flex-col items-center justify-center space-y-2 border rounded-xl bg-[var(--bg-app)] text-muted" style={{ borderColor: 'var(--border)' }}>
                <Loader2 className="w-6 h-6 animate-spin text-[var(--green)]" />
                <span>正在生成标准英文邮件...</span>
              </div>
            ) : error ? (
              <div className="p-4 rounded-xl bg-[var(--red-soft)] text-[var(--red)] flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            ) : (
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={12}
                className="w-full flex-1 p-3.5 rounded-xl border font-mono text-xs leading-relaxed outline-none focus:border-[var(--green)] resize-none select-text"
                style={{
                  backgroundColor: 'var(--bg-app)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            )}
          </div>

          {/* 底部操作栏 */}
          <div className="pt-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl border text-xs font-semibold text-muted hover:text-primary cursor-pointer"
              style={{ borderColor: 'var(--border)' }}
            >
              取消
            </button>

            <div className="flex items-center space-x-2">
              <motion.button
                whileTap={reduced ? undefined : { scale: 0.95 }}
                type="button"
                onClick={handleCopy}
                disabled={!bodyText || loading}
                className="px-4 py-2 rounded-xl border text-xs font-bold flex items-center space-x-1.5 cursor-pointer bg-[var(--bg-card)] hover:bg-[var(--bg-subtle)] text-[var(--text-primary)] transition-all disabled:opacity-50"
                style={{ borderColor: 'var(--border)' }}
                id="copy-preliminary-email-btn"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[var(--green)]" />
                    <span className="text-[var(--green)]">已复制全文！</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-muted" />
                    <span>一键复制全文</span>
                  </>
                )}
              </motion.button>

              <motion.button
                whileTap={reduced ? undefined : { scale: 0.95 }}
                type="button"
                onClick={handleSaveToDrafts}
                disabled={saving || !bodyText || loading}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[var(--green)] hover:opacity-90 flex items-center space-x-1.5 cursor-pointer shadow-md disabled:opacity-50"
                id="save-preliminary-email-btn"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? '正在保存...' : '确认存入草稿箱'}</span>
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
