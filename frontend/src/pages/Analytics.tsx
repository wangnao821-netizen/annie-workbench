import { useState, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Building2, Zap, BarChart2, AlertCircle } from 'lucide-react';
import { Granularity, AnalyticsOverview, AnalyticsPipeline, AnalyticsLenders, AnalyticsEfficiency } from '../types/api';
import { getOverview, getPipeline, getLenders, getEfficiency } from '../services/api/analytics';

interface AnalyticsProps { onBack: () => void; }

export function Analytics({ onBack }: AnalyticsProps) {
  const [granularity, setGranularity] = useState<Granularity>('week');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [pipeline, setPipeline] = useState<AnalyticsPipeline | null>(null);
  const [lenders, setLenders] = useState<AnalyticsLenders | null>(null);
  const [efficiency, setEfficiency] = useState<AnalyticsEfficiency | null>(null);
  const reduced = useReducedMotion();

  const loadData = useCallback(async (g: Granularity) => {
    setLoading(true); setError(null);
    try {
      const [ov, pl, ld, ef] = await Promise.all([getOverview(g), getPipeline(g), getLenders(g), getEfficiency(g)]);
      setOverview(ov); setPipeline(pl); setLenders(ld); setEfficiency(ef);
    } catch (err: any) { setError(err?.message || '数据加载失败，请重试'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(granularity); }, [granularity, loadData]);

  const renderTrend = (pct?: number | null, trend?: string) => {
    if (pct === null) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-bold border text-muted bg-[var(--bg-subtle)] border-border">
          <span>—</span>
        </span>
      );
    }
    if (pct === undefined && !trend) return null;
    const isUp = trend === 'up' || (pct !== undefined && pct > 0);
    const isDown = trend === 'down' || (pct !== undefined && pct < 0);
    const cls = isUp ? 'text-[var(--green)] bg-[var(--green-soft)] border-[var(--green-soft)]' : isDown ? 'text-[var(--red)] bg-[var(--red-soft)] border-[var(--red-soft)]' : 'text-muted bg-[var(--bg-subtle)] border-border';
    const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
    return (
      <span className={`inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded-md text-xs font-bold border ${cls}`}>
        <Icon className="w-3 h-3" />
        {pct !== undefined && <span>{Math.abs(pct).toFixed(1)}%</span>}
      </span>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 space-y-6 select-none" id="analytics-page">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-3">
          <motion.button whileTap={{ scale: 0.95 }} onClick={onBack} id="analytics-back-btn"
            className="p-2 rounded-xl border flex items-center justify-center hover:opacity-80 transition-opacity cursor-pointer"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
            <ArrowLeft className="w-4 h-4" />
          </motion.button>
          <div>
            <h2 className="text-base font-extrabold flex items-center space-x-2" style={{ color: 'var(--text-primary)' }}><span>📊 统计分析</span></h2>
            <p className="text-xs text-muted">案件 Pipeline 转化、银行审贷时效及 AI 协同效率全景</p>
          </div>
        </div>

        {/* Granularity Control */}
        <div id="analytics-granularity" className="p-1 rounded-xl border flex items-center space-x-1" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          {(['day', 'week', 'month'] as Granularity[]).map((g) => {
            const labels: Record<Granularity, string> = { day: '天', week: '周', month: '月' };
            const isActive = granularity === g;
            return (
              <motion.button key={g} whileTap={{ scale: 0.97 }} onClick={() => setGranularity(g)} id={`granularity-tab-${g}`}
                className={`relative px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${isActive ? 'text-[var(--accent)]' : 'text-muted hover:text-primary'}`}>
                <span>{labels[g]}</span>
                {isActive && !reduced && (<motion.span layoutId="analytics-granularity-slider" className="absolute inset-0 rounded-lg -z-10" style={{ backgroundColor: 'var(--accent-soft)' }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} />)}
                {isActive && reduced && <span className="absolute inset-0 rounded-lg -z-10" style={{ backgroundColor: 'var(--accent-soft)' }} />}
              </motion.button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl border bg-[var(--red-soft)] border-[var(--red-soft)] text-[var(--red)] text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2"><AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span></div>
          <button type="button" onClick={() => loadData(granularity)} className="font-bold underline cursor-pointer">重试</button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-28 rounded-2xl border bg-[var(--bg-subtle)]" style={{ borderColor: 'var(--border)' }} />)}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Overview */}
          {overview && (() => {
            const cur = overview?.current;
            const prev = overview?.previous;
            const pct = (c: number, p: number) =>
              p > 0 ? Math.round(((c - p) / p) * 1000) / 10 : null;

            const cards = [
              { label: '活跃案件', value: cur?.active_cases ?? 0, pct: pct(cur?.active_cases ?? 0, prev?.active_cases ?? 0) },
              { label: '新增案件', value: cur?.new_cases ?? 0, pct: pct(cur?.new_cases ?? 0, prev?.new_cases ?? 0) },
              { label: '递交审批', value: cur?.submitted ?? 0, pct: pct(cur?.submitted ?? 0, prev?.submitted ?? 0) },
              { label: '获得批复', value: cur?.approved ?? 0, pct: pct(cur?.approved ?? 0, prev?.approved ?? 0) },
              { label: '完成结算', value: cur?.settled ?? 0, pct: pct(cur?.settled ?? 0, prev?.settled ?? 0) },
              { label: '预计佣金', value: cur?.commission_estimate ?? 0, pct: pct(cur?.commission_estimate ?? 0, prev?.commission_estimate ?? 0), currency: true },
            ];

            return (
              <div className="p-4 rounded-2xl border space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }} id="analytics-overview-card">
                <span className="font-bold text-xs flex items-center space-x-1.5" style={{ color: 'var(--text-primary)' }}>
                  <BarChart2 className="w-4 h-4 text-[var(--purple)]" />
                  <span>业务总体概览 ({overview.granularity === 'day' ? '日' : overview.granularity === 'month' ? '月' : '周'})</span>
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {cards.map((item, idx) => (
                    <div key={idx} className="p-3 rounded-xl border bg-[var(--bg-subtle)] flex flex-col justify-between space-y-1.5" style={{ borderColor: 'var(--border)' }}>
                      <span className="text-[11px] text-muted">{item.label}</span>
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>
                          {item.currency ? `$${item.value.toLocaleString()}` : item.value.toLocaleString()}
                        </span>
                        {renderTrend(item.pct)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Pipeline */}
          {pipeline && (
            <div className="p-4 rounded-2xl border space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }} id="analytics-pipeline-card">
              <span className="font-bold text-xs flex items-center space-x-1.5" style={{ color: 'var(--text-primary)' }}>
                <TrendingUp className="w-4 h-4 text-[var(--accent)]" /><span>Pipeline 漏斗与转化趋势</span>
              </span>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b text-muted font-medium text-[11px]" style={{ borderColor: 'var(--border)' }}>
                      <th className="py-2 px-3">时间周期</th><th className="py-2 px-3">新增</th><th className="py-2 px-3">递交</th><th className="py-2 px-3">获批</th><th className="py-2 px-3">结算</th><th className="py-2 px-3 text-right">预估佣金</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                    {(pipeline.series?.length ?? 0) === 0 ? <tr><td colSpan={6} className="py-4 text-center text-muted">暂无数据</td></tr> : pipeline.series.map((b, idx) => (
                      <tr key={idx} className="hover:bg-[var(--bg-subtle)]">
                        <td className="py-2 px-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{b.period}</td>
                        <td className="py-2 px-3 text-[var(--green)] font-bold">+{b.new_cases}</td>
                        <td className="py-2 px-3">{b.submitted}</td><td className="py-2 px-3 text-[var(--purple)] font-bold">{b.approved}</td>
                        <td className="py-2 px-3">{b.settled}</td><td className="py-2 px-3 text-right font-bold" style={{ color: 'var(--text-primary)' }}>${(b.commission ?? 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Lenders & Efficiency */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {lenders && (
              <div className="p-4 rounded-2xl border space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }} id="analytics-lenders-card">
                <span className="font-bold text-xs flex items-center space-x-1.5" style={{ color: 'var(--text-primary)' }}>
                  <Building2 className="w-4 h-4 text-[var(--yellow)]" /><span>合作银行时效与通过率</span>
                </span>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b text-muted font-medium text-[11px]" style={{ borderColor: 'var(--border)' }}>
                        <th className="py-2 px-2">银行</th><th className="py-2 px-2">案件数</th><th className="py-2 px-2">平均审批</th><th className="py-2 px-2">OS率</th><th className="py-2 px-2 text-right">通过率</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                      {lenders.lenders.length === 0 ? <tr><td colSpan={5} className="py-4 text-center text-muted">暂无数据</td></tr> : lenders.lenders.map((l, idx) => (
                        <tr key={idx} className="hover:bg-[var(--bg-subtle)]">
                          <td className="py-2 px-2 font-bold" style={{ color: 'var(--text-primary)' }}>{l.lender}</td>
                          <td className="py-2 px-2">{l.case_count} 宗</td><td className="py-2 px-2">{l.avg_approval_days} 天</td>
                          <td className="py-2 px-2 text-[var(--yellow)] font-medium">{l.os_rate}%</td>
                          <td className="py-2 px-2 text-right font-bold text-[var(--green)]">{l.approval_rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {efficiency && (() => {
              const ecur = efficiency?.current;
              const eprev = efficiency?.previous;
              const ePct = (c: number | null, p: number | null) =>
                (p ?? 0) > 0 && c != null ? Math.round(((c - (p ?? 0)) / (p ?? 0)) * 1000) / 10 : null;
              const effCards = [
                { label: '处理任务总数', value: ecur?.tasks_done ?? 0, pct: ePct(ecur?.tasks_done ?? 0, eprev?.tasks_done ?? 0) },
                { label: '按时完成率', value: ecur?.on_time_rate ?? 0, unit: '%', pct: ePct(ecur?.on_time_rate ?? 0, eprev?.on_time_rate ?? 0) },
                { label: '清单确认率', value: ecur?.checklist_confirm_rate ?? 0, unit: '%', pct: ePct(ecur?.checklist_confirm_rate ?? 0, eprev?.checklist_confirm_rate ?? 0) },
                { label: 'AI 深度采纳', value: ecur?.ai_adoption_count ?? 0, pct: ePct(ecur?.ai_adoption_count ?? 0, eprev?.ai_adoption_count ?? 0) },
                { label: '客户平均回复', value: ecur?.avg_client_reply_days, unit: '天', pct: null },
              ];

              return (
                <div className="p-4 rounded-2xl border space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }} id="analytics-efficiency-card">
                  <span className="font-bold text-xs flex items-center space-x-1.5" style={{ color: 'var(--text-primary)' }}>
                    <Zap className="w-4 h-4 text-[var(--green)]" /><span>人效与 AI 深度协同</span>
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {effCards.map((item, idx) => (
                      <div key={idx} className="p-3 rounded-xl border bg-[var(--bg-subtle)] space-y-1" style={{ borderColor: 'var(--border)' }}>
                        <div className="flex items-center justify-between text-[11px] text-muted">
                          <span>{item.label}</span>
                          {renderTrend(item.pct)}
                        </div>
                        <div className="flex items-baseline space-x-1">
                          <span className="text-base font-extrabold" style={{ color: 'var(--text-primary)' }}>
                            {item.value !== null && item.value !== undefined ? `${item.value}${item.unit || ''}` : '—'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
