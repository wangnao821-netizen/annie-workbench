import { Cpu, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { AnalyticsUsage } from '../../types/api';

interface AiUsageBarProps {
  usage: AnalyticsUsage | null;
}

function RingProgress({ pct }: { pct: number }) {
  const r = 6;
  const circ = 2 * Math.PI * r;
  const clampedPct = Math.min(100, Math.max(0, pct));
  const offset = circ - (clampedPct / 100) * circ;
  return (
    <svg className="w-3.5 h-3.5 transform -rotate-90 flex-shrink-0" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--purple)]/20" />
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-[var(--purple)] transition-all duration-300"
      />
    </svg>
  );
}

export function AiUsageBar({ usage }: AiUsageBarProps) {
  const current = usage?.current;
  const previous = usage?.previous;

  if (!current || current.calls === 0) {
    return (
      <div
        className="p-3 rounded-xl border space-y-1.5"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
        id="ai-usage-section"
      >
        <div className="flex items-center space-x-1.5 text-[var(--purple)] font-extrabold text-[11px]">
          <Cpu className="w-3.5 h-3.5" />
          <span>AI 用量概况</span>
        </div>
        <div className="text-xs text-muted py-2 text-center">
          暂无 AI 调用数据
        </div>
      </div>
    );
  }

  const hasPrev = Boolean(previous && previous.calls > 0);

  const callsDiff = hasPrev && previous ? current.calls - previous.calls : null;
  const costDiff = hasPrev && previous ? current.cost_usd - previous.cost_usd : null;

  const hitRate = current.cache_hit_rate;
  const hitPct = hitRate != null ? Math.round(hitRate > 1 ? hitRate : hitRate * 100) : null;
  const prevHitPct = (hasPrev && previous && previous.cache_hit_rate != null)
    ? Math.round(previous.cache_hit_rate > 1 ? previous.cache_hit_rate : previous.cache_hit_rate * 100)
    : null;
  const hitDiffPct = (hitPct != null && prevHitPct != null) ? hitPct - prevHitPct : null;

  const correctedDiff = hasPrev && previous ? current.corrected_count - previous.corrected_count : null;

  const latencyStr = current.avg_latency_ms != null ? `${current.avg_latency_ms.toFixed(0)} ms` : '—';

  const promptTok = current.prompt_tokens || 0;
  const compTok = current.completion_tokens || 0;
  const cacheHitTok = current.prompt_cache_hit_tokens || 0;
  const cacheMissTok = current.prompt_cache_miss_tokens || 0;
  const cacheTotalTok = cacheHitTok + cacheMissTok;
  const showTokenBar = (promptTok + compTok > 0) && (cacheTotalTok > 0);
  const cacheHitRatio = showTokenBar ? (cacheHitTok / cacheTotalTok) * 100 : 0;

  const renderTrend = (diffVal: number | null, isCurrency = false, isPct = false) => {
    if (diffVal == null) return <span className="text-muted text-[11px]">—</span>;
    if (diffVal === 0) return <span className="text-muted text-[11px]">0</span>;
    const isUp = diffVal > 0;
    const absVal = Math.abs(diffVal);
    const formatted = isCurrency
      ? `$${absVal.toFixed(2)}`
      : isPct
      ? `${absVal}%`
      : `${absVal}`;

    return (
      <span className={`inline-flex items-center text-[11px] font-bold ${isUp ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
        {isUp ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
        {isUp ? '+' : '-'}{formatted}
      </span>
    );
  };

  return (
    <div
      className="p-3 rounded-xl border space-y-2 text-xs"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      id="ai-usage-section"
    >
      <div className="flex items-center justify-between pb-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-1.5 text-[var(--purple)] font-extrabold text-[11px]">
          <Cpu className="w-3.5 h-3.5" />
          <span>AI 用量概况</span>
        </div>
        <span className="text-[11px] text-muted">
          平均延迟 {latencyStr}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="flex flex-col space-y-0.5 p-1.5 rounded-lg bg-[var(--bg-subtle)]">
          <span className="text-[11px] text-muted">调用次数</span>
          <div className="flex items-baseline justify-between">
            <span className="font-bold text-primary">{current.calls} 次</span>
            {renderTrend(callsDiff)}
          </div>
        </div>

        <div className="flex flex-col space-y-0.5 p-1.5 rounded-lg bg-[var(--bg-subtle)]">
          <span className="text-[11px] text-muted">消费金额</span>
          <div className="flex items-baseline justify-between">
            <span className="font-bold text-primary">${current.cost_usd.toFixed(2)}</span>
            {renderTrend(costDiff, true)}
          </div>
        </div>

        <div className="flex flex-col space-y-0.5 p-1.5 rounded-lg bg-[var(--bg-subtle)]">
          <span className="text-[11px] text-muted">缓存命中率</span>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1">
              {hitPct != null && <RingProgress pct={hitPct} />}
              <span className="font-bold text-primary">{hitPct != null ? `${hitPct}%` : '—'}</span>
            </div>
            {renderTrend(hitDiffPct, false, true)}
          </div>
        </div>

        <div className="flex flex-col space-y-0.5 p-1.5 rounded-lg bg-[var(--bg-subtle)]">
          <span className="text-[11px] text-muted">已纠正次数</span>
          <div className="flex items-baseline justify-between">
            <span className="font-bold text-primary">{current.corrected_count} 次</span>
            {renderTrend(correctedDiff)}
          </div>
        </div>
      </div>

      {showTokenBar && (
        <div className="pt-1.5 border-t space-y-1" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted font-medium">Cache Hit / Miss Ratio</span>
            <span className="font-mono text-[var(--purple)] font-bold">
              {cacheHitRatio.toFixed(0)}% 命中
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[var(--bg-subtle-strong)] overflow-hidden flex">
            <div className="bg-[var(--purple)] h-full transition-all" style={{ width: `${cacheHitRatio}%` }} title={`Hit: ${cacheHitTok.toLocaleString()}`} />
            <div className="bg-[var(--purple)] dark:bg-[var(--purple)] h-full transition-all" style={{ width: `${100 - cacheHitRatio}%` }} title={`Miss: ${cacheMissTok.toLocaleString()}`} />
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted font-mono">
            <span>Prompt {promptTok.toLocaleString()}</span>
            <span>Completion {compTok.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}
