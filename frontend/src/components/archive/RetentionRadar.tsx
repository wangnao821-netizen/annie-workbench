import { useState, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  Percent,
  TrendingUp,
  HeartHandshake,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { getRetentionRadar } from '../../services/api/cases';
import { RetentionOpportunityItem, RetentionRadarSummary } from '../../types/api';
import { RetentionOpportunityCard } from './RetentionOpportunityCard';
import { RetentionContactModal } from './RetentionContactModal';

type FilterLevel = 'all' | 'red' | 'yellow' | 'green' | 'blue';

export function RetentionRadar() {
  const reduced = useReducedMotion();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<RetentionRadarSummary>({
    total_opportunities: 0,
    red_count: 0,
    yellow_count: 0,
    green_count: 0,
    blue_count: 0,
  });
  const [opportunities, setOpportunities] = useState<RetentionOpportunityItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterLevel>('all');
  const [selectedContactItem, setSelectedContactItem] =
    useState<RetentionOpportunityItem | null>(null);

  const fetchRadar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getRetentionRadar();
      if (res.ok) {
        setSummary(res.summary);
        setOpportunities(res.opportunities || []);
      }
    } catch (err: any) {
      console.error('Fetch retention radar error:', err);
      setError(err?.message || '获取二次经营商机雷达数据失败，请重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRadar();
  }, [fetchRadar]);

  const filteredList = opportunities.filter((item) => {
    if (activeFilter === 'all') return true;
    return item.level === activeFilter;
  });

  return (
    <div className="space-y-6" id="retention-radar-panel">
      {/* 错误提示 */}
      {error && (
        <div className="p-3.5 rounded-2xl border bg-[var(--red-soft)] border-[var(--red-soft)] text-[var(--red)] text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={fetchRadar} className="underline font-bold cursor-pointer">
            重试
          </button>
        </div>
      )}

      {/* 1. 顶部 4 维商机胶囊指示卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* 🔴 卡片 1: 固定利率临期 */}
        <motion.div
          whileTap={reduced ? undefined : { scale: 0.97 }}
          onClick={() => setActiveFilter(activeFilter === 'red' ? 'all' : 'red')}
          className={`p-3.5 sm:p-4 rounded-2xl border cursor-pointer transition-all ${
            activeFilter === 'red' ? 'ring-2 ring-[var(--red, #ef4444)] shadow-md' : ''
          }`}
          style={{
            backgroundColor:
              activeFilter === 'red'
                ? 'var(--red-soft, rgba(239, 68, 68, 0.15))'
                : 'var(--bg-card)',
            borderColor:
              activeFilter === 'red' ? 'var(--red, #ef4444)' : 'var(--border)',
          }}
          id="radar-stat-card-red"
        >
          <div className="flex items-center justify-between">
            <div
              className="p-2 rounded-xl"
              style={{
                backgroundColor: 'var(--red-soft, rgba(239, 68, 68, 0.15))',
                color: 'var(--red, #ef4444)',
              }}
            >
              <AlertCircle className="w-4 h-4" />
            </div>
            <span
              className="text-xl font-extrabold font-mono"
              style={{ color: 'var(--red, #ef4444)' }}
            >
              {summary.red_count}
            </span>
          </div>
          <div className="mt-2.5 space-y-0.5">
            <h4
              className="text-xs font-bold truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              固定利率临期预警
            </h4>
            <p className="text-[11px] truncate text-muted">未来 90 天内到期 · 锁定新方案</p>
          </div>
        </motion.div>

        {/* 🟡 卡片 2: 满年降息体检 */}
        <motion.div
          whileTap={reduced ? undefined : { scale: 0.97 }}
          onClick={() => setActiveFilter(activeFilter === 'yellow' ? 'all' : 'yellow')}
          className={`p-3.5 sm:p-4 rounded-2xl border cursor-pointer transition-all ${
            activeFilter === 'yellow' ? 'ring-2 ring-[var(--amber, #f59e0b)] shadow-md' : ''
          }`}
          style={{
            backgroundColor:
              activeFilter === 'yellow'
                ? 'var(--amber-soft, rgba(245, 158, 11, 0.15))'
                : 'var(--bg-card)',
            borderColor:
              activeFilter === 'yellow' ? 'var(--amber, #f59e0b)' : 'var(--border)',
          }}
          id="radar-stat-card-yellow"
        >
          <div className="flex items-center justify-between">
            <div
              className="p-2 rounded-xl"
              style={{
                backgroundColor: 'var(--amber-soft, rgba(245, 158, 11, 0.15))',
                color: 'var(--amber, #f59e0b)',
              }}
            >
              <Percent className="w-4 h-4" />
            </div>
            <span
              className="text-xl font-extrabold font-mono"
              style={{ color: 'var(--amber, #f59e0b)' }}
            >
              {summary.yellow_count}
            </span>
          </div>
          <div className="mt-2.5 space-y-0.5">
            <h4
              className="text-xs font-bold truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              满年降息体检
            </h4>
            <p className="text-[11px] truncate text-muted">满 1-2 年 · 向原银行申请 Review</p>
          </div>
        </motion.div>

        {/* 🟢 卡片 3: 增值套现/再置业 */}
        <motion.div
          whileTap={reduced ? undefined : { scale: 0.97 }}
          onClick={() => setActiveFilter(activeFilter === 'green' ? 'all' : 'green')}
          className={`p-3.5 sm:p-4 rounded-2xl border cursor-pointer transition-all ${
            activeFilter === 'green' ? 'ring-2 ring-[var(--green, #22c55e)] shadow-md' : ''
          }`}
          style={{
            backgroundColor:
              activeFilter === 'green'
                ? 'var(--green-soft, rgba(34, 197, 94, 0.15))'
                : 'var(--bg-card)',
            borderColor:
              activeFilter === 'green' ? 'var(--green, #22c55e)' : 'var(--border)',
          }}
          id="radar-stat-card-green"
        >
          <div className="flex items-center justify-between">
            <div
              className="p-2 rounded-xl"
              style={{
                backgroundColor: 'var(--green-soft, rgba(34, 197, 94, 0.15))',
                color: 'var(--green, #22c55e)',
              }}
            >
              <TrendingUp className="w-4 h-4" />
            </div>
            <span
              className="text-xl font-extrabold font-mono"
              style={{ color: 'var(--green, #22c55e)' }}
            >
              {summary.green_count}
            </span>
          </div>
          <div className="mt-2.5 space-y-0.5">
            <h4
              className="text-xs font-bold truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              增值套现/再置业
            </h4>
            <p className="text-[11px] truncate text-muted">满 2 年以上 · 主动询问再置业</p>
          </div>
        </motion.div>

        {/* 🔵 卡片 4: 放款关怀与账单 */}
        <motion.div
          whileTap={reduced ? undefined : { scale: 0.97 }}
          onClick={() => setActiveFilter(activeFilter === 'blue' ? 'all' : 'blue')}
          className={`p-3.5 sm:p-4 rounded-2xl border cursor-pointer transition-all ${
            activeFilter === 'blue' ? 'ring-2 ring-[var(--accent)] shadow-md' : ''
          }`}
          style={{
            backgroundColor:
              activeFilter === 'blue' ? 'var(--accent-soft)' : 'var(--bg-card)',
            borderColor: activeFilter === 'blue' ? 'var(--accent)' : 'var(--border)',
          }}
          id="radar-stat-card-blue"
        >
          <div className="flex items-center justify-between">
            <div
              className="p-2 rounded-xl"
              style={{
                backgroundColor: 'var(--accent-soft)',
                color: 'var(--accent)',
              }}
            >
              <HeartHandshake className="w-4 h-4" />
            </div>
            <span
              className="text-xl font-extrabold font-mono"
              style={{ color: 'var(--accent)' }}
            >
              {summary.blue_count}
            </span>
          </div>
          <div className="mt-2.5 space-y-0.5">
            <h4
              className="text-xs font-bold truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              放款关怀与账单
            </h4>
            <p className="text-[11px] truncate text-muted">放款 30/180 天 · 对冲账户核对</p>
          </div>
        </motion.div>
      </div>

      {/* 2. 筛选与操作工具栏 */}
      <div
        className="flex items-center justify-between pb-3 border-b flex-wrap gap-2.5"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center space-x-1 sm:space-x-1.5 flex-wrap gap-y-1">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-[var(--accent)] text-[var(--on-accent)] shadow-xs'
                : 'bg-[var(--bg-card)] border text-secondary hover:text-primary'
            }`}
            style={{
              borderColor: activeFilter === 'all' ? 'transparent' : 'var(--border)',
            }}
          >
            全部商机 ({summary.total_opportunities})
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('red')}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer ${
              activeFilter === 'red'
                ? 'bg-[var(--red, #ef4444)] text-white shadow-xs'
                : 'bg-[var(--bg-card)] border text-secondary hover:text-primary'
            }`}
            style={{
              borderColor: activeFilter === 'red' ? 'transparent' : 'var(--border)',
            }}
          >
            <span className="w-2 h-2 rounded-full bg-[var(--red, #ef4444)]" />
            <span>固定到期 ({summary.red_count})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('yellow')}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer ${
              activeFilter === 'yellow'
                ? 'bg-[var(--amber, #f59e0b)] text-white shadow-xs'
                : 'bg-[var(--bg-card)] border text-secondary hover:text-primary'
            }`}
            style={{
              borderColor: activeFilter === 'yellow' ? 'transparent' : 'var(--border)',
            }}
          >
            <span className="w-2 h-2 rounded-full bg-[var(--amber, #f59e0b)]" />
            <span>满年降息 ({summary.yellow_count})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('green')}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer ${
              activeFilter === 'green'
                ? 'bg-[var(--green, #22c55e)] text-white shadow-xs'
                : 'bg-[var(--bg-card)] border text-secondary hover:text-primary'
            }`}
            style={{
              borderColor: activeFilter === 'green' ? 'transparent' : 'var(--border)',
            }}
          >
            <span className="w-2 h-2 rounded-full bg-[var(--green, #22c55e)]" />
            <span>增值套现 ({summary.green_count})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('blue')}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer ${
              activeFilter === 'blue'
                ? 'bg-[var(--accent)] text-white shadow-xs'
                : 'bg-[var(--bg-card)] border text-secondary hover:text-primary'
            }`}
            style={{
              borderColor: activeFilter === 'blue' ? 'transparent' : 'var(--border)',
            }}
          >
            <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
            <span>放款关怀 ({summary.blue_count})</span>
          </button>
        </div>

        <motion.button
          whileTap={reduced ? undefined : { scale: 0.97 }}
          onClick={fetchRadar}
          disabled={loading}
          className="px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 cursor-pointer hover:opacity-80 disabled:opacity-50"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border)',
            color: 'var(--text-secondary)',
          }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>刷新雷达</span>
        </motion.button>
      </div>

      {/* 3. 主列表卡片区 (Opportunities Feed) */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="p-4 rounded-2xl border animate-pulse space-y-2.5"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
              }}
            >
              <div className="h-4 bg-[var(--bg-subtle-strong)] rounded w-1/4" />
              <div className="h-3 bg-[var(--bg-subtle)] rounded w-1/2" />
              <div className="h-10 bg-[var(--bg-subtle)] rounded-xl w-full" />
            </div>
          ))}
        </div>
      ) : filteredList.length === 0 ? (
        <div
          className="rounded-2xl p-12 border flex flex-col items-center justify-center text-center space-y-2.5"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border)',
          }}
        >
          <div className="w-12 h-12 rounded-full flex items-center justify-center bg-[var(--accent-soft)] text-[var(--accent)]">
            <Sparkles className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            当前分类暂无待跟进商机
          </p>
          <p className="text-xs text-muted max-w-sm">
            随着归档案卷的放款周期推进，系统将自动雷达捕捉并推送到此处
          </p>
        </div>
      ) : (
        <div className="space-y-3" id="retention-opportunities-list">
          {filteredList.map((item) => (
            <RetentionOpportunityCard
              key={item.case_id}
              item={item}
              onContact={(target) => setSelectedContactItem(target)}
            />
          ))}
        </div>
      )}

      {/* 问候话术弹窗 */}
      <RetentionContactModal
        item={selectedContactItem}
        onClose={() => setSelectedContactItem(null)}
      />
    </div>
  );
}
