import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Sparkles,
  X,
  Target,
  Lightbulb,
  Trophy,
  Landmark,
  ShieldAlert,
  CheckCircle2,
  Copy,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { getCaseKnowledgeCard } from '../../services/api/cases';
import { KnowledgeCardData } from '../../types/api';
import { useToastStore } from '../../stores/toastStore';

interface KnowledgeCardModalProps {
  caseId: string | null;
  onClose: () => void;
}

export function KnowledgeCardModal({ caseId, onClose }: KnowledgeCardModalProps) {
  const reduced = useReducedMotion();
  const showToast = useToastStore((s) => s.showToast);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<KnowledgeCardData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!caseId) {
      setCard(null);
      return;
    }
    let isMounted = true;
    setLoading(true);
    setError(null);

    getCaseKnowledgeCard(caseId)
      .then((res) => {
        if (isMounted) {
          if (res.ok && res.card) {
            setCard(res.card);
          } else {
            setError(res.message || '未能加载先例复盘经验');
          }
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err?.message || '获取复盘知识卡失败');
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [caseId]);

  if (!caseId) return null;

  const handleCopySummary = () => {
    if (!card) return;
    const text = `【实战复盘知识卡 · ${card.client_name} (${card.lender})】
1. 背景与痛点：${card.key_challenges.join('；')}
2. 突破与策略：${card.strategy_summary}（获批条件：${card.approved_conditions}）
3. 经验启示：${card.takeaway}`;

    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        showToast('success', '已复制实战复盘经验总结至剪贴板！');
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        showToast('error', '复制失败，请手动选择复制');
      });
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden select-none"
        id="knowledge-card-modal"
      >
        {/* 背景遮罩 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.52)',
            backdropFilter: 'blur(16px) saturate(160%)',
          }}
        />

        {/* 模态框卡片主体 */}
        <motion.div
          initial={{ opacity: 0, scale: reduced ? 1 : 0.95, y: reduced ? 0 : 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: reduced ? 1 : 0.95, y: reduced ? 0 : 16 }}
          transition={{ type: 'spring', damping: 26, stiffness: 360 }}
          className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden"
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
                  backgroundColor: 'var(--purple-soft, rgba(168,85,247,0.12))',
                  color: 'var(--purple, #a855f7)',
                }}
              >
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3
                  className="text-base font-extrabold tracking-tight"
                  style={{ color: 'var(--text-primary)' }}
                >
                  实战复盘知识卡 (Knowledge Card)
                </h3>
                <p className="text-xs text-muted font-mono">
                  案号: {caseId} {card ? `· ${card.client_name}` : ''}
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

          {/* 内容展示区 */}
          <div
            className="p-6 space-y-5 overflow-y-auto no-scrollbar flex-1"
            style={{ backgroundColor: 'var(--bg-app)' }}
          >
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-2 text-muted">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
                <span className="text-xs">正在调取实战复盘档案...</span>
              </div>
            ) : error ? (
              <div className="p-4 rounded-2xl border bg-[var(--red-soft)] border-[var(--red-soft)] text-[var(--red)] text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : card ? (
              <div className="space-y-4">
                {/* 机构与放款概要 */}
                <div
                  className="p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-2 text-xs font-mono"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border)',
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <Landmark className="w-4 h-4 text-[var(--accent)]" />
                    <span className="font-bold text-primary">{card.lender}</span>
                    <span>•</span>
                    <span className="text-muted font-semibold">
                      $
                      {card.loan_amount >= 10000
                        ? `${(card.loan_amount / 10000).toFixed(0)}万`
                        : card.loan_amount.toLocaleString()}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[var(--green-soft)] text-[var(--green)]">
                    已交割结案
                  </span>
                </div>

                {/* 1. 🎯 背景与痛点 */}
                <div
                  className="p-4 rounded-2xl border space-y-2.5"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border)',
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <div
                      className="p-1.5 rounded-lg"
                      style={{
                        backgroundColor: 'var(--red-soft, rgba(239, 68, 68, 0.12))',
                        color: 'var(--red, #ef4444)',
                      }}
                    >
                      <Target className="w-4 h-4" />
                    </div>
                    <h4
                      className="text-xs font-bold tracking-tight"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      1. 背景与痛点 (Key Challenges)
                    </h4>
                  </div>
                  <div className="space-y-1.5 pl-2">
                    {card.key_challenges.map((ch, idx) => (
                      <div
                        key={idx}
                        className="flex items-start space-x-2 text-xs"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--red, #ef4444)]" />
                        <span className="leading-relaxed">{ch}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. 💡 突破与申诉策略 */}
                <div
                  className="p-4 rounded-2xl border space-y-2.5"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border)',
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <div
                      className="p-1.5 rounded-lg"
                      style={{
                        backgroundColor: 'var(--amber-soft, rgba(245, 158, 11, 0.12))',
                        color: 'var(--amber, #f59e0b)',
                      }}
                    >
                      <Lightbulb className="w-4 h-4" />
                    </div>
                    <h4
                      className="text-xs font-bold tracking-tight"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      2. 突破与申诉策略 (Strategy & Approved Terms)
                    </h4>
                  </div>
                  <div className="space-y-2 pl-2 text-xs leading-relaxed">
                    <p style={{ color: 'var(--text-secondary)' }}>{card.strategy_summary}</p>
                    <div
                      className="p-2.5 rounded-xl border flex items-start space-x-2"
                      style={{
                        backgroundColor: 'var(--bg-subtle)',
                        borderColor: 'var(--border)',
                      }}
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-[var(--green)] mt-0.2" />
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                        <span className="font-bold">获批破局点：</span>
                        {card.approved_conditions}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. 🏆 最终获批与经验启示 */}
                <div
                  className="p-4 rounded-2xl border space-y-2.5"
                  style={{
                    backgroundColor: 'var(--purple-soft, rgba(168, 85, 247, 0.08))',
                    borderColor: 'rgba(168, 85, 247, 0.25)',
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <div
                      className="p-1.5 rounded-lg"
                      style={{
                        backgroundColor: 'var(--purple-soft, rgba(168, 85, 247, 0.18))',
                        color: 'var(--purple, #a855f7)',
                      }}
                    >
                      <Trophy className="w-4 h-4" />
                    </div>
                    <h4
                      className="text-xs font-bold tracking-tight"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      3. 最终获批与经验启示 (Broker Takeaway)
                    </h4>
                  </div>
                  <p
                    className="pl-2 text-xs leading-relaxed font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {card.takeaway}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {/* Footer */}
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
              className="px-4 py-2 rounded-xl border text-xs font-semibold cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-panel)',
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              关闭
            </motion.button>

            {card && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={handleCopySummary}
                className="px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-xs"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--on-accent)',
                }}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>已复制总结</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>复制复盘精华</span>
                  </>
                )}
              </motion.button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
