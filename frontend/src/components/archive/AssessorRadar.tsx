import { useState, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Sparkles,
  Copy,
  Check,
  AlertTriangle,
  UserCheck,
} from 'lucide-react';
import { listAssessors } from '../../services/api/cases';
import { AssessorInsightItem } from '../../types/api';
import { useToastStore } from '../../stores/toastStore';

export function AssessorRadar() {
  const reduced = useReducedMotion();
  const showToast = useToastStore((s) => s.showToast);
  const [loading, setLoading] = useState(false);
  const [assessors, setAssessors] = useState<AssessorInsightItem[]>([]);
  const [copiedName, setCopiedName] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAssessors();
      if (res.ok) {
        setAssessors(res.assessors || []);
      }
    } catch (err) {
      console.error('List assessors error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleCopyTips = (item: AssessorInsightItem) => {
    const text = `【${item.assessor_name} · ${item.lender || '银行'} 审批沟通锦囊】\n常见卡点：${item.common_blockers.join(
      '、'
    )}\n沟通建议：${item.communication_tips}`;

    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopiedName(item.assessor_name);
        showToast('success', `已成功复制 ${item.assessor_name} 沟通锦囊！`);
        setTimeout(() => setCopiedName(null), 2000);
      })
      .catch(() => {
        showToast('error', '复制失败，请手动选择复制');
      });
  };

  return (
    <div className="space-y-4" id="assessor-radar-module">
      {/* 顶部说明卡 */}
      <div
        className="p-4 rounded-2xl border flex items-start space-x-3"
        style={{
          backgroundColor: 'var(--purple-soft, rgba(168,85,247,0.08))',
          borderColor: 'rgba(168,85,247,0.2)',
        }}
      >
        <Sparkles className="w-5 h-5 text-[var(--purple, #a855f7)] shrink-0 mt-0.5" />
        <div className="space-y-0.5 text-xs">
          <h4 className="font-bold" style={{ color: 'var(--text-primary)' }}>
            审批官行为画像与沟通锦囊库
          </h4>
          <p className="leading-relaxed text-muted">
            沉淀历史交涉数据与审批官偏好，递件前对照画像提前规避补件卡点，提高首轮获批率（First-time Approval Rate）。
          </p>
        </div>
      </div>

      {/* 列表流 */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="p-5 rounded-2xl border animate-pulse space-y-3"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
              }}
            >
              <div className="h-4 bg-[var(--bg-subtle-strong)] rounded w-1/3" />
              <div className="h-3 bg-[var(--bg-subtle)] rounded w-1/2" />
              <div className="h-12 bg-[var(--bg-subtle)] rounded-xl w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5" id="assessor-cards-grid">
          {assessors.map((item) => (
            <motion.div
              key={item.assessor_name}
              whileTap={reduced ? undefined : { scale: 0.99 }}
              className="p-4 sm:p-5 rounded-2xl border space-y-3.5 transition-all shadow-2xs"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
              }}
              id={`assessor-card-${item.assessor_name.replace(/\s+/g, '-')}`}
            >
              {/* 头部信息 */}
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <div className="w-7 h-7 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center font-bold text-xs">
                      <UserCheck className="w-4 h-4" />
                    </div>
                    <h4
                      className="text-sm font-extrabold tracking-tight"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {item.assessor_name}
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border)]">
                      {item.lender || '主流银行'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2 text-xs font-mono text-muted pl-9">
                    <span>处理历史案件: {item.case_count} 宗</span>
                    {item.latest_case_ref && (
                      <>
                        <span>•</span>
                        <span>最新案号: {item.latest_case_ref}</span>
                      </>
                    )}
                  </div>
                </div>

                <motion.button
                  type="button"
                  whileTap={reduced ? undefined : { scale: 0.96 }}
                  onClick={() => handleCopyTips(item)}
                  className="px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 cursor-pointer shadow-2xs hover:opacity-85"
                  style={{
                    backgroundColor: 'var(--bg-panel)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-secondary)',
                  }}
                  title="复制此审批官沟通锦囊"
                >
                  {copiedName === item.assessor_name ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[var(--green)]" />
                      <span className="text-[var(--green)] font-bold">已复制</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>复制锦囊</span>
                    </>
                  )}
                </motion.button>
              </div>

              {/* 常见卡点倾向标签 */}
              <div className="space-y-1.5">
                <div className="flex items-center space-x-1 text-[11px] font-bold text-muted">
                  <AlertTriangle className="w-3 h-3 text-[var(--amber, #f59e0b)]" />
                  <span>历史常见卡点倾向:</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {item.common_blockers.map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-lg text-xs font-semibold border"
                      style={{
                        backgroundColor: 'var(--amber-soft, rgba(245, 158, 11, 0.12))',
                        borderColor: 'var(--amber, #f59e0b)',
                        color: 'var(--amber, #f59e0b)',
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* AI 沟通锦囊 */}
              <div
                className="p-3 rounded-xl border text-xs space-y-1"
                style={{
                  backgroundColor: 'var(--bg-subtle)',
                  borderColor: 'var(--border)',
                }}
              >
                <div className="flex items-center space-x-1.5 font-bold text-[var(--accent)]">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI 沟通锦囊 (Communication Tips):</span>
                </div>
                <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                  {item.communication_tips}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
