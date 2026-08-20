import { motion, useReducedMotion } from 'motion/react';
import { AlertCircle, CheckCircle2, Sparkles, FileText, ArrowRight } from 'lucide-react';
import { GapAnalysisPayload } from '../../types/api';
import { createManualDraft } from '../../services/api/drafts';
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
  const summary = payload?.summary || '经过 Vera AI 对比审贷 Policy 规则，已梳理材料缺口与建议清单：';

  const handleGenerateDraftList = async () => {
    if (!caseId) {
      useToastStore.getState().showToast('info', '请先选择案件，再生成建议清单草稿');
      return;
    }
    const draftTitle = `材料缺口补件清单草稿 (${new Date().toLocaleDateString()})`;
    const draftContent = `【补件清单建议】\n` +
      missing.map((m, i) => `${i + 1}. 【缺】${m.name || m.item || ''} — 原因：${m.reason}`).join('\n') +
      `\n\n【处理建议】\n` +
      suggestions.map((s, i) => `${i + 1}. ${s.title || s.item || s.item_name || ''}: ${s.description || s.suggestion || ''}`).join('\n');
    try {
      await createManualDraft({ case_id: caseId, subject: draftTitle, body: draftContent, track: 'internal' });
      useToastStore.getState().showToast('success', '已存入草稿箱 (只出草稿，绝不发送)');
      window.dispatchEvent(new CustomEvent('drafts_updated'));
    } catch (err: any) {
      const detail = err?.detail || err?.message || '';
      if (/404|不存在/.test(detail)) {
        useToastStore.getState().showToast('error', '保存草稿失败：案件不存在，请刷新后重试');
      } else if (/422|校验/.test(detail)) {
        useToastStore.getState().showToast('error', `保存草稿失败：${detail}`);
      } else {
        useToastStore.getState().showToast('error', `保存草稿失败：${detail || '后端不可用'}`);
      }
    }
  };

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

      {/* Summary Banner */}
      <div
        className="p-2.5 rounded-xl border bg-[var(--yellow-soft)] border-[var(--yellow-soft)] text-xs leading-relaxed"
        style={{ color: 'var(--text-primary)' }}
      >
        <span className="font-semibold text-[var(--yellow)]">💡 评估总结：</span>
        {summary}
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
          whileTap={reduced ? undefined : { scale: 0.95 }}
          onClick={handleGenerateDraftList}
          className="px-3.5 py-2 rounded-xl text-xs font-bold shadow-xs flex items-center space-x-1.5 cursor-pointer transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
          id="generate-draft-checklist-btn"
        >
          <span>生成建议清单</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </motion.button>
      </div>
    </div>
  );
}
