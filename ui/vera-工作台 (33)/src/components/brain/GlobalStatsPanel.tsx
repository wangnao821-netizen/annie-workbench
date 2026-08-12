import { useState, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { BarChart3, ArrowUpRight, ArrowDownRight, ArrowRight, Cpu, Sparkles } from 'lucide-react';
import { ViewId } from '../../types/navigation';
import { Granularity, AnalyticsOverview, AnalyticsPipeline, AnalyticsUsage } from '../../types/api';
import { getOverview, getPipeline, getUsage } from '../../services/api/analytics';

interface GlobalStatsPanelProps {
  onNavigate: (v: ViewId) => void;
}

const GRANULARITY_LABELS: Record<Granularity, string> = {
  day: '日',
  week: '周',
  month: '月',
};

export function GlobalStatsPanel({ onNavigate }: GlobalStatsPanelProps) {
  const [granularity, setGranularity] = useState<Granularity>('week');
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [pipeline, setPipeline] = useState<AnalyticsPipeline | null>(null);
  const [usage, setUsage] = useState<AnalyticsUsage | null>(null);
  const [loading, setLoading] = useState(true);

  const reduced = useReducedMotion();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [resOverview, resPipeline, resUsage] = await Promise.all([
        getOverview(granularity),
        getPipeline(granularity, 5),
        getUsage(granularity),
      ]);
      setOverview(resOverview);
      setPipeline(resPipeline);
      setUsage(resUsage);
    } catch {
      // Mock fallbacks are already inside service methods
    } finally {
      setLoading(false);
    }
  }, [granularity]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const overviewCards = overview
    ? [
        { key: 'active', label: '活跃案件', item: overview.active_cases },
        { key: 'new', label: '新增案件', item: overview.new_cases },
        { key: 'submitted', label: '递交案件', item: overview.submitted_cases },
        { key: 'approved', label: '批准案件', item: overview.approved_cases },
        { key: 'settled', label: '结算案件', item: overview.settled_cases },
        { key: 'commission', label: '预期佣金', item: overview.commission, isCurrency: true },
      ]
    : [];

  const buckets = pipeline?.buckets || [];
  const maxVal = Math.max(
    ...buckets.map((b) => Math.max(b.new_cases || 0, b.submitted || 0, b.approved || 0)),
    1
  );

  const currentUsage = usage?.current;

  return (
    <motion.aside
      id="global-stats-panel"
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={reduced ? { duration: 0.15 } : { type: 'spring', damping: 20, stiffness: 300 }}
      className="w-[360px] h-full flex-shrink-0 border-l select-none overflow-hidden relative flex flex-col glass-panel"
      style={{ borderColor: 'var(--border)' }}
    >
      {/* Panel Header */}
      <div className="p-3 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2">
          <BarChart3 className="w-4 h-4 text-purple-500" />
          <span className="font-extrabold text-xs" style={{ color: 'var(--text-primary)' }}>业务概览</span>
        </div>

        {/* Granularity Switcher Pills */}
        <div className="flex items-center p-0.5 rounded-lg bg-black/5 dark:bg-white/5 border" style={{ borderColor: 'var(--border)' }}>
          {(['day', 'week', 'month'] as Granularity[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGranularity(g)}
              className={`px-2 py-0.5 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                granularity === g ? 'text-white shadow-xs' : 'text-muted hover:text-primary'
              }`}
              style={granularity === g ? { backgroundColor: 'var(--accent)' } : {}}
              id={`granularity-btn-${g}`}
            >
              {GRANULARITY_LABELS[g]}
            </button>
          ))}
        </div>
      </div>

      {/* Panel Body */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-3.5 text-xs">
        {loading ? (
          <div className="space-y-3 animate-pulse">
            <div className="grid grid-cols-2 gap-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-black/5 dark:bg-white/5" />
              ))}
            </div>
            <div className="h-28 rounded-xl bg-black/5 dark:bg-white/5" />
            <div className="h-14 rounded-xl bg-black/5 dark:bg-white/5" />
          </div>
        ) : (
          <>
            {/* Overview Metric Cards Grid */}
            <div className="grid grid-cols-2 gap-2" id="overview-metrics-grid">
              {overviewCards.map(({ key, label, item, isCurrency }) => {
                const val = item?.value ?? 0;
                const formattedVal = isCurrency
                  ? `$${val.toLocaleString()}`
                  : val.toLocaleString();
                const pct = item?.change_pct ?? 0;
                const isUp = item?.trend === 'up' || pct > 0;
                const isDown = item?.trend === 'down' || pct < 0;

                return (
                  <motion.div
                    key={key}
                    whileHover={reduced ? undefined : { y: -2 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                    className="p-2.5 rounded-xl border flex flex-col justify-between space-y-1 hover:shadow-xs transition-shadow"
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                  >
                    <span className="text-[11px] font-medium text-muted truncate">{label}</span>
                    <div className="flex items-baseline justify-between">
                      <span className="font-extrabold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                        {formattedVal}
                      </span>
                      {pct !== 0 && (
                        <div
                          className={`flex items-center text-[10px] font-bold ${
                            isUp
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : isDown
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-muted'
                          }`}
                        >
                          {isUp ? (
                            <ArrowUpRight className="w-3 h-3" />
                          ) : isDown ? (
                            <ArrowDownRight className="w-3 h-3" />
                          ) : null}
                          <span>{Math.abs(pct)}%</span>
                        </div>
                      )}
                    </div>
                    {overview?.compare_label && (
                      <span className="text-[9px] text-muted opacity-80 truncate">{overview.compare_label}</span>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Mini Trend Pipeline Section */}
            <div
              className="p-3 rounded-xl border space-y-2"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
              id="mini-trend-section"
            >
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-[11px]" style={{ color: 'var(--text-primary)' }}>近期走势</span>
                {/* Legend */}
                <div className="flex items-center space-x-2 text-[10px] text-muted">
                  <span className="flex items-center space-x-1">
                    <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
                    <span>新增</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                    <span>递交</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    <span>批准</span>
                  </span>
                </div>
              </div>

              {/* 5-bucket Bar Chart */}
              <div className="pt-2 pb-1 grid grid-cols-5 gap-1 items-end h-24 border-b" style={{ borderColor: 'var(--border)' }}>
                {buckets.map((b, idx) => {
                  const hNew = (b.new_cases / maxVal) * 100;
                  const hSub = (b.submitted / maxVal) * 100;
                  const hApp = (b.approved / maxVal) * 100;

                  return (
                    <div key={idx} className="flex flex-col items-center h-full justify-end space-y-1">
                      <div className="w-full flex items-end justify-center space-x-0.5 h-16">
                        <div
                          className="w-1.5 rounded-t bg-purple-500 transition-all"
                          style={{ height: `${Math.max(hNew, b.new_cases > 0 ? 6 : 0)}%` }}
                          title={`新增: ${b.new_cases}`}
                        />
                        <div
                          className="w-1.5 rounded-t bg-amber-500 transition-all"
                          style={{ height: `${Math.max(hSub, b.submitted > 0 ? 6 : 0)}%` }}
                          title={`递交: ${b.submitted}`}
                        />
                        <div
                          className="w-1.5 rounded-t bg-emerald-500 transition-all"
                          style={{ height: `${Math.max(hApp, b.approved > 0 ? 6 : 0)}%` }}
                          title={`批准: ${b.approved}`}
                        />
                      </div>
                      <span className="text-[9px] text-muted truncate w-full text-center" title={b.period}>
                        {b.period}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AI Usage Section */}
            {currentUsage && (
              <div
                className="p-3 rounded-xl border space-y-1"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                id="ai-usage-section"
              >
                <div className="flex items-center space-x-1.5 text-purple-600 dark:text-purple-400 font-extrabold text-[11px]">
                  <Cpu className="w-3.5 h-3.5" />
                  <span>AI 用量概况</span>
                </div>
                <div className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  <span>调用 {currentUsage.calls} 次</span>
                  <span> · ${currentUsage.cost_usd.toFixed(2)}</span>
                  <span> · 缓存命中 {Math.round((currentUsage.cache_hit_rate ?? 0) * 100)}%</span>
                  {currentUsage.corrected_count > 0 && (
                    <span className="text-muted"> · 已纠正 {currentUsage.corrected_count} 次</span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer Navigate Button */}
      <div className="p-3 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          onClick={() => onNavigate('analytics')}
          id="view-full-analytics-btn"
          className="w-full py-2 rounded-xl border text-xs font-bold cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center space-x-1.5"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-500" />
          <span>查看完整统计分析</span>
          <ArrowRight className="w-3.5 h-3.5 text-muted" />
        </button>
      </div>
    </motion.aside>
  );
}
