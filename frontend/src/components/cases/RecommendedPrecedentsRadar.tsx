import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Lightbulb, Sparkles, ChevronDown, ChevronUp, BookOpen, ShieldCheck, Trophy, MessageSquare } from 'lucide-react';
import { getCaseRecommendedPrecedents } from '../../services/api/cases';
import { RecommendedPrecedentItem } from '../../types/api';
import { KnowledgeCardModal } from '../archive/KnowledgeCardModal';
import { useToastStore } from '../../stores/toastStore';

interface RecommendedPrecedentsRadarProps {
  caseId: string;
  compact?: boolean;
}

export function RecommendedPrecedentsRadar({ caseId, compact = false }: RecommendedPrecedentsRadarProps) {
  const reduced = useReducedMotion();
  const showToast = useToastStore((s) => s.showToast);
  const [precedents, setPrecedents] = useState<RecommendedPrecedentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [selectedCaseForModal, setSelectedCaseForModal] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!caseId) return;

    setLoading(true);
    getCaseRecommendedPrecedents(caseId)
      .then((res) => {
        if (isMounted && res.ok) {
          setPrecedents(res.precedents || []);
        }
      })
      .catch((err) => {
        console.warn('Fetch recommended precedents error:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [caseId]);

  const handleBringToChat = (item: RecommendedPrecedentItem) => {
    const summary = item.strategy_summary || item.takeaway || '历史获批复议经验';
    const chatPrompt = `请参考历史相似先例【${item.title}】的破局策略（${summary}），帮我为当前在办案件起草一份向贷款审批官/BDM 申诉与复议的陈述论据。`;
    window.dispatchEvent(new CustomEvent('fill-chat-input', { detail: chatPrompt }));
    showToast('success', `已将【${item.title}】破局论据填入 AI 对话框！`);
  };

  if (loading) {
    return (
      <div
        className="p-3 rounded-2xl border animate-pulse flex items-center space-x-2 text-xs text-muted"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <Sparkles className="w-4 h-4 text-[var(--purple)] animate-spin" />
            <span>Annie 正在匹配历史破局先例...</span>
      </div>
    );
  }

  if (precedents.length === 0) return null;

  return (
    <>
      <div
        className="rounded-2xl border overflow-hidden transition-all shadow-xs"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--purple)',
        }}
        id="recommended-precedents-radar-panel"
      >
        {/* Header */}
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className={`px-3 py-2.5 flex items-center justify-between cursor-pointer select-none transition-colors hover:bg-[var(--bg-subtle)] ${
            compact ? 'text-xs' : 'p-3.5 px-4'
          }`}
          style={{ backgroundColor: 'var(--purple-soft, rgba(168, 85, 247, 0.08))' }}
        >
          <div className="flex items-center space-x-2 min-w-0 flex-1 mr-2">
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs shadow-2xs shrink-0"
              style={{ backgroundColor: 'var(--purple)', color: '#ffffff' }}
            >
              <Lightbulb className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1 truncate">
              <div className="flex items-center space-x-1.5 truncate">
                <h3 className="text-xs font-bold tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>
                  💡 历史相似破局先例
                </h3>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-[var(--purple)] text-white shrink-0">
                  {precedents.length} 条
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1 text-muted text-[11px] shrink-0">
            <span>{isExpanded ? '收起' : '展开'}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </div>

        {/* Content list */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className={`space-y-3 border-t ${compact ? 'p-3' : 'p-4 space-y-3.5'}`}
              style={{ borderColor: 'var(--border)' }}
            >
              {precedents.map((item) => (
                <div
                  key={item.precedent_id}
                  className="p-3 rounded-xl border space-y-2 transition-all hover:border-[var(--purple)]"
                  style={{
                    backgroundColor: 'var(--bg-panel)',
                    borderColor: 'var(--border)',
                  }}
                  id={`precedent-item-${item.precedent_id}`}
                >
                  <div className="flex items-start justify-between gap-1.5 flex-wrap">
                    <div className="space-y-1 min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-[var(--purple)] flex items-center space-x-1.5">
                        <Trophy className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                        <span className="truncate">{item.title}</span>
                      </h4>

                      {/* 匹配理由 Tags */}
                      <div className="flex items-center space-x-1 flex-wrap gap-y-1 pt-0.5">
                        {item.match_reasons.map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 破局策略摘要 */}
                  {item.strategy_summary && (
                    <div className="text-xs leading-relaxed p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] space-y-1">
                      <div className="flex items-center space-x-1 text-[var(--accent)] font-bold text-[10px]">
                        <Sparkles className="w-3 h-3" />
                        <span>突破策略摘要:</span>
                      </div>
                      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        {item.strategy_summary}
                      </p>
                    </div>
                  )}

                  {/* 经验启示 */}
                  {item.takeaway && (
                    <div className="flex items-start space-x-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium pt-0.5">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>经验启示: {item.takeaway}</span>
                    </div>
                  )}

                  {/* Action Buttons: 一键带入对话 + 查看完整复盘卡 */}
                  <div className="flex items-center justify-end space-x-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleBringToChat(item)}
                      className="px-2 py-1 rounded-lg border text-[11px] font-bold flex items-center space-x-1 cursor-pointer transition-colors bg-[var(--accent-soft)] hover:bg-[var(--accent)] hover:text-white border-[var(--accent)] text-[var(--accent)] shrink-0 shadow-2xs"
                      title="将成功复议论据填入 AI 对话框"
                    >
                      <MessageSquare className="w-3 h-3" />
                      <span>💬 一键带入对话</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCaseForModal(item.case_id);
                        showToast('info', `正在调阅 ${item.title} 的完整复盘卡...`);
                      }}
                      className="px-2 py-1 rounded-lg border text-[11px] font-bold flex items-center space-x-1 cursor-pointer transition-colors bg-[var(--bg-card)] hover:bg-[var(--purple-soft)] hover:border-[var(--purple)] text-[var(--purple)] shrink-0"
                    >
                      <BookOpen className="w-3 h-3" />
                      <span>查看复盘卡</span>
                    </button>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Knowledge Card Modal */}
      {selectedCaseForModal && (
        <KnowledgeCardModal
          caseId={selectedCaseForModal}
          onClose={() => setSelectedCaseForModal(null)}
        />
      )}
    </>
  );
}
