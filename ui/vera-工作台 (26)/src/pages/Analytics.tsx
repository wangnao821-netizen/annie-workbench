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

  const renderTrend = (pct?: number, trend?: string) => {
    if (pct === undefined && !trend) return null;
    const isUp = trend === 'up' || (pct !== undefined && pct > 0);
    const isDown = trend === 'down' || (pct !== undefined && pct < 0);
    const cls = isUp ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' : isDown ? 'text-rose-500 bg-rose-500/10 border-rose-500/20' : 'text-muted bg-black/5 dark:bg-white/5 border-border';
    const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
    return (
      <span className={`inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${cls}`}>
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
                {isActive && !reduced && (<motion.span layoutId="analytics-granularity-slider" className="absolute inset-0 rounded-lg -z-10" style={{ backgroundColor: 'var(--accent-soft)' }} transition={{ type: 'spring', damping: 25, stiffness: 350 }} />)}
                {isActive && reduced && <span className="absolute inset-0 rounded-lg -z-10" style={{ backgroundColor: 'var(--accent-soft)' }} />}
              </motion.button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl border bg-rose-500/10 border-rose-500/20 text-rose-600 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2"><AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span></div>
          <button type="button" onClick={() => loadData(granularity)} className="font-bold underline cursor-pointer">重试</button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-28 rounded-2xl border bg-black/5 dark:bg-white/5" style={{ borderColor: 'var(--border)' }} />)}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Overview */}
          {overview && (
            <div className="p-4 rounded-2xl border space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }} id="analytics-overview-card">
              <span className="font-bold text-xs flex items-center space-x-1.5" style={{ color: 'var(--text-primary)' }}>
                <BarChart2 className="w-4 h-4 text-purple-500" /><span>业务总体概览 ({overview.compare_label || '本期 vs 上期'})</span>
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: '活跃案件', m: overview.active_cases, prefix: '' }, { label: '新增案件', m: overview.new_cases, prefix: '' },
                  { label: '递交审批', m: overview.submitted_cases, prefix: '' }, { label: '获得批复', m: overview.approved_cases, prefix: '' },
                  { label: '完成结算', m: overview.settled_cases, prefix: '' }, { label: '预计佣金', m: overview.commission, prefix: '$' },
                ].map((item, idx) => (
                  <div key={idx} className="p-3 rounded-xl border bg-black/5 dark:bg-white/5 flex flex-col justify-between space-y-1.5" style={{ borderColor: 'var(--border)' }}>
                    <span className="text-[11px] text-muted">{item.label}</span>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>{item.prefix}{item.m.value.toLocaleString()}</span>
                      {renderTrend(item.m.change_pct, item.m.trend)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pipeline */}
          {pipeline && (
            <div className="p-4 rounded-2xl border space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }} id="analytics-pipeline-card">
              <span className="font-bold text-xs flex items-center space-x-1.5" style={{ color: 'var(--text-primary)' }}>
                <TrendingUp className="w-4 h-4 text-indigo-500" /><span>Pipeline 漏斗与转化趋势</span>
              </span>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b text-muted font-medium text-[11px]" style={{ borderColor: 'var(--border)' }}>
                      <th className="py-2 px-3">时间周期</th><th className="py-2 px-3">新增</th><th className="py-2 px-3">递交</th><th className="py-2 px-3">获批</th><th className="py-2 px-3">结算</th><th className="py-2 px-3 text-right">预估佣金</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                    {pipeline.buckets.length === 0 ? <tr><td colSpan={6} className="py-4 text-center text-muted">暂无数据</td></tr> : pipeline.buckets.map((b, idx) => (
                      <tr key={idx} className="hover:bg-black/5 dark:hover:bg-white/5">
                        <td className="py-2 px-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{b.period}</td>
                        <td className="py-2 px-3 text-emerald-600 dark:text-emerald-400 font-bold">+{b.new_cases}</td>
                        <td className="py-2 px-3">{b.submitted}</td><td className="py-2 px-3 text-purple-600 dark:text-purple-400 font-bold">{b.approved}</td>
                        <td className="py-2 px-3">{b.settled}</td><td className="py-2 px-3 text-right font-bold" style={{ color: 'var(--text-primary)' }}>${b.commission.toLocaleString()}</td>
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
                  <Building2 className="w-4 h-4 text-amber-500" /><span>合作银行时效与通过率</span>
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
                        <tr key={idx} className="hover:bg-black/5 dark:hover:bg-white/5">
                          <td className="py-2 px-2 font-bold" style={{ color: 'var(--text-primary)' }}>{l.lender_name}</td>
                          <td className="py-2 px-2">{l.case_count} 宗</td><td className="py-2 px-2">{l.avg_approval_days} 天</td>
                          <td className="py-2 px-2 text-amber-600 dark:text-amber-400 font-medium">{l.os_rate}%</td>
                          <td className="py-2 px-2 text-right font-bold text-emerald-600 dark:text-emerald-400">{l.approval_rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {efficiency && (
              <div className="p-4 rounded-2xl border space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }} id="analytics-efficiency-card">
                <span className="font-bold text-xs flex items-center space-x-1.5" style={{ color: 'var(--text-primary)' }}>
                  <Zap className="w-4 h-4 text-emerald-500" /><span>人效与 AI 深度协同</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { label: '处理任务总数', m: efficiency.tasks_processed }, { label: '按时完成率', m: efficiency.on_time_rate },
                    { label: '清单确认率', m: efficiency.checklist_completion_rate }, { label: 'AI 深度采纳', m: efficiency.ai_adoption_count },
                    { label: '客户平均回复', m: efficiency.avg_client_response_days },
                  ].map((item, idx) => (
                    <div key={idx} className="p-3 rounded-xl border bg-black/5 dark:bg-white/5 space-y-1" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex items-center justify-between text-[11px] text-muted"><span>{item.label}</span>{renderTrend(item.m.change_pct, item.m.trend)}</div>
                      <div className="flex items-baseline space-x-1">
                        <span className="text-base font-extrabold" style={{ color: 'var(--text-primary)' }}>{item.m.current}{item.m.unit || ''}</span>
                        <span className="text-[10px] text-muted">(前期: {item.m.previous}{item.m.unit || ''})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
