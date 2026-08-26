import { motion, useReducedMotion } from 'motion/react';
import { AlertCircle, CheckCircle2, Sparkles, FileText, ArrowRight } from 'lucide-react';
import { GapAnalysisPayload } from '../../types/api';
import { useToastStore } from '../../stores/toastStore';

interface GapAnalysisCardProps {
  payload: GapAnalysisPayload;
  caseId?: string | null;
}

export function GapAnalysisCard({ payload, caseId }: GapAnalysisCardProps) {
  const reduced = useReducedMotion();
  const missing = payload?.missing || [];
  const matched = payload?.matched || [];
  const suggestions = payload?.suggestions || [];

  const handleOpenCoCreate = () => {
    if (!caseId) {
      useToastStore.getState().showToast('info', '请先选择左侧案件，再进入补件邮件共创');
      return;
    }
    window.dispatchEvent(new CustomEvent('open-co-create-flow', { detail: { flowKey: 'followup', caseId } }));
  };

  if (missing.length === 0 && matched.length === 0 && suggestions.length === 0) {
    return (
      <div className="flex items-center justify-between p-2.5 rounded-xl border bg-[var(--purple-soft)] border-[var(--purple-soft)] text-xs my-1.5" id="gap-analysis-action-rail">
        <div className="flex items-center space-x-2 text-[var(--purple)] font-bold text-[11px]">
          <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
          <span>材料缺口已核对，可一键开启催件沟通草稿</span>
        </div>
        <button
          type="button"
          onClick={handleOpenCoCreate}
          className="px-3 py-1.5 rounded-xl text-[11px] font-bold text-white cursor-pointer hover:opacity-90 flex items-center space-x-1 shadow-xs btn-primary"
          id="gap-start-cocreate-btn"
        >
          <ArrowRight className="w-3.5 h-3.5" />
          <span>进入邮件共创 →</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="p-4 rounded-2xl border space-y-3.5"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow-card)',
      }}
      id="gap-analysis-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-lg bg-[var(--yellow-soft)] border border-[var(--yellow-soft)] flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-[var(--yellow)]" />
          </div>
          <div>
            <h4 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
              🔍 主动预判 · 材料缺口分析 (gap_analysis)
            </h4>
            <p className="text-[11px] text-muted">
              基于审贷标准指南与当前上传材料智能比对
            </p>
          </div>
        </div>
      </div>

      {/* Missing Items Section */}
      {missing.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center space-x-1.5 text-xs font-bold text-[var(--red)]">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>⚠️ 缺失关键材料 ({missing.length} 项)</span>
          </div>

          <div className="space-y-1.5">
            {missing.map((item, idx) => {
              const itemName = item.name || item.item || '未命名缺失材料';
              return (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl border bg-[var(--red-soft)] border-[var(--red-soft)] space-y-1"
                  id={`gap-missing-${idx}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--red)]">
                      ❌ {itemName}
                    </span>
                    {item.priority && (
                      <span className="text-[11px] font-mono font-bold px-1.5 py-0.2 rounded bg-[var(--red-soft)] text-[var(--red)]">
                        {item.priority === 'high' ? '高优先级' : '中优先级'}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] leading-snug text-muted italic">
                    原因: {item.reason}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Matched Items Section */}
      {matched.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center space-x-1.5 text-xs font-bold text-[var(--green)]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>✅ 已匹配合格材料 ({matched.length} 项)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {matched.map((item, idx) => {
              const matchedName = item.name || item.item || '未命名文件';
              return (
                <div
                  key={idx}
                  className="p-2 rounded-lg border bg-[var(--green-soft)] border-[var(--green-soft)] text-[11px] space-y-0.5"
                  id={`gap-matched-${idx}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="font-semibold text-[var(--green)] truncate">
                      ✓ {matchedName}
                    </div>
                    <span className="text-[11px] font-mono font-bold px-1.5 py-0.2 rounded bg-[var(--green-soft)] text-[var(--green)] flex-shrink-0">
                      已收
                    </span>
                  </div>
                  {item.file && (
                    <div className="text-[11px] font-mono text-muted truncate">
                      {item.file}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Suggestions Section with Draft Badge */}
      {suggestions.length > 0 && (
        <div className="space-y-2 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center space-x-1.5 text-xs font-bold text-[var(--accent)]">
            <FileText className="w-3.5 h-3.5" />
            <span>📝 处理建议 (预配草稿)</span>
          </div>

          <div className="space-y-1.5">
            {suggestions.map((sug, idx) => {
              const sugTitle = sug.title || sug.item || sug.item_name || '处理建议';
              const sugDesc = sug.description || sug.suggestion || '';
              return (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl border space-y-1"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}
                  id={`gap-suggestion-${idx}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                      👉 {sugTitle}
                    </span>
                    <span className="text-[11px] font-mono font-bold px-1.5 py-0.2 rounded bg-[var(--purple-soft)] text-[var(--purple)] border border-[var(--purple-soft)]">
                      draft (草稿标记)
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-secondary">
                    {sugDesc.startsWith('建议：') ? sugDesc : `建议：${sugDesc}`}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Export Button */}
      <div className="pt-2 border-t flex justify-end" style={{ borderColor: 'var(--border)' }}>
        <motion.button
          type="button"
          whileTap={reduced ? undefined : { scale: 0.95 }}
          onClick={handleOpenCoCreate}
          className="px-3.5 py-2 rounded-xl text-xs font-bold shadow-xs flex items-center space-x-1.5 cursor-pointer transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
          id="open-co-create-from-gap-btn"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>进入补件邮件共创 (推敲多版本) →</span>
        </motion.button>
      </div>
    </div>
  );
}
