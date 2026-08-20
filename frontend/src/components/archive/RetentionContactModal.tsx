import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  MessageSquare,
  X,
  Copy,
  Check,
  Send,
  Sparkles,
  Landmark,
  Calendar,
  Percent,
} from 'lucide-react';
import { RetentionOpportunityItem } from '../../types/api';
import { useToastStore } from '../../stores/toastStore';

interface RetentionContactModalProps {
  item: RetentionOpportunityItem | null;
  onClose: () => void;
}

export function RetentionContactModal({ item, onClose }: RetentionContactModalProps) {
  const reduced = useReducedMotion();
  const showToast = useToastStore((s) => s.showToast);
  const [copied, setCopied] = useState(false);
  const [draftContent, setDraftContent] = useState<string>(item?.draft_template || '');

  if (!item) return null;

  const handleCopy = () => {
    navigator.clipboard
      ?.writeText(draftContent || item.draft_template || '')
      .then(() => {
        setCopied(true);
        showToast('success', '已成功复制问候草稿至剪贴板！');
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        showToast('error', '复制失败，请手动选择复制');
      });
  };

  const handleSimulateSend = () => {
    showToast('success', `已将问候草稿准备就绪，可直接粘贴发送给 ${item.client_name}`);
    onClose();
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden select-none"
        id="retention-contact-modal"
      >
        {/* 背景遮罩 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.48)',
            backdropFilter: 'blur(16px) saturate(160%)',
          }}
        />

        {/* 模态框主体 */}
        <motion.div
          initial={{ opacity: 0, scale: reduced ? 1 : 0.96, y: reduced ? 0 : 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: reduced ? 1 : 0.96, y: reduced ? 0 : 12 }}
          transition={{ type: 'spring', damping: 26, stiffness: 360 }}
          className="relative w-full max-w-2xl flex flex-col rounded-3xl border shadow-2xl overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border)',
            boxShadow: 'var(--shadow-overlay)',
          }}
        >
          {/* Header */}
          <div
            className="px-6 py-4 border-b flex items-center justify-between shrink-0"
            style={{
              backgroundColor: 'var(--surface-translucent)',
              borderColor: 'var(--border)',
              backdropFilter: 'blur(20px) saturate(180%)',
            }}
          >
            <div className="flex items-center space-x-3">
              <div
                className="p-2.5 rounded-2xl flex items-center justify-center shadow-xs"
                style={{
                  backgroundColor: 'var(--accent-soft)',
                  color: 'var(--accent)',
                }}
              >
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3
                  className="text-base font-extrabold tracking-tight"
                  style={{ color: 'var(--text-primary)' }}
                >
                  二次经营跟进草稿 · {item.client_name}
                </h3>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  基于放款周期与利率到期时间智能生成的客户问候方案
                </p>
              </div>
            </div>

            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={onClose}
              className="p-2 rounded-xl transition-colors cursor-pointer hover:opacity-80"
              style={{ color: 'var(--text-muted)' }}
              aria-label="关闭"
            >
              <X className="w-5 h-5" />
            </motion.button>
          </div>

          {/* 案件摘要信息 */}
          <div
            className="px-6 py-3 border-b flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono"
            style={{
              backgroundColor: 'var(--bg-panel)',
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            <span className="flex items-center space-x-1 font-bold text-primary">
              <Landmark className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>{item.lender}</span>
              <span>
                $
                {item.loan_amount
                  ? item.loan_amount >= 10000
                    ? `${(item.loan_amount / 10000).toFixed(0)}万`
                    : item.loan_amount.toLocaleString()
                  : '0'}
              </span>
            </span>

            {item.interest_rate && (
              <span className="flex items-center space-x-1">
                <Percent className="w-3.5 h-3.5" />
                <span>利率: {item.interest_rate}</span>
              </span>
            )}

            {item.settlement_date && (
              <span className="flex items-center space-x-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>交割日: {item.settlement_date}</span>
              </span>
            )}
          </div>

          {/* 编辑草稿区 */}
          <div className="p-6 space-y-4" style={{ backgroundColor: 'var(--bg-app)' }}>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  className="text-xs font-bold flex items-center space-x-1.5"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>AI 建议问候话术（支持微调）：</span>
                </label>
                <span className="text-[11px] text-muted">可直接复制发至微信/短信/邮件</span>
              </div>

              <textarea
                rows={6}
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                className="w-full p-3.5 rounded-2xl border text-xs leading-relaxed outline-none transition-all resize-none font-sans"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                  boxShadow: 'var(--shadow-card)',
                }}
                id="retention-draft-textarea"
              />
            </div>
          </div>

          {/* Footer 操作栏 */}
          <div
            className="px-6 py-4 border-t flex items-center justify-between shrink-0"
            style={{
              backgroundColor: 'var(--surface-translucent)',
              borderColor: 'var(--border)',
              backdropFilter: 'blur(20px) saturate(180%)',
            }}
          >
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-panel)',
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              关闭
            </motion.button>

            <div className="flex items-center space-x-2.5">
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={handleCopy}
                className="px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-xs"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
                id="retention-modal-copy-btn"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[var(--green)]" />
                    <span className="text-[var(--green)] font-bold">已复制</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span>复制话术</span>
                  </>
                )}
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={handleSimulateSend}
                className="px-5 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-md"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--on-accent)',
                }}
                id="retention-modal-send-btn"
              >
                <Send className="w-3.5 h-3.5" />
                <span>完成并标记跟进</span>
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
