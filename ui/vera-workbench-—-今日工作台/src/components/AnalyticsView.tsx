import React from 'react';
import { motion } from 'motion/react';
import { BarChart3, TrendingUp, DollarSign, Building2, CheckCircle2, Clock } from 'lucide-react';
import { useWorkbenchStore } from '../store/useStore';

export const AnalyticsView: React.FC = () => {
  const { analytics } = useWorkbenchStore((s) => ({ analytics: s.analytics }));

  return (
    <div id="analytics-page" className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
        <div className="flex items-center space-x-2">
          <BarChart3 className="w-5 h-5 text-emerald-600" />
          <h1 className="text-xl font-extrabold text-[var(--text-primary)]">
            业务统计与佣金看板 (Analytics & Commissions)
          </h1>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] space-y-2">
          <p className="text-xs text-[var(--text-muted)] font-medium">预估佣金收入 (Upfront Commission)</p>
          <p className="text-2xl font-extrabold text-emerald-600">{analytics.expectedCommission}</p>
          <p className="text-[10px] text-[var(--text-secondary)]">含 CBA, Westpac, NAB 本月割接预派发款项</p>
        </div>

        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] space-y-2">
          <p className="text-xs text-[var(--text-muted)] font-medium">银行递交成功率 (Pass Rate)</p>
          <p className="text-2xl font-extrabold text-blue-600">92.8%</p>
          <p className="text-[10px] text-[var(--text-secondary)]">依靠 Vera AI 预评预审校验无误后再行递交</p>
        </div>

        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] space-y-2">
          <p className="text-xs text-[var(--text-muted)] font-medium">平均审理批复周期 (Avg SLA)</p>
          <p className="text-2xl font-extrabold text-amber-600">3.2 天</p>
          <p className="text-[10px] text-[var(--text-secondary)]">四大行快捷绿通道 (Fast-Track) 审批比率 70%</p>
        </div>
      </div>

      {/* Bank Pipeline Breakdown */}
      <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] space-y-4">
        <h2 className="text-sm font-bold text-[var(--text-primary)]">合作银行放款额度占比 (Lender Distribution)</h2>
        <div className="space-y-3">
          {[
            { bank: 'CBA (Commonwealth Bank)', amount: '$3,400,000', percentage: 40, color: 'bg-amber-500' },
            { bank: 'Westpac Banking Corporation', amount: '$2,200,000', percentage: 26, color: 'bg-red-500' },
            { bank: 'ANZ Bank', amount: '$1,800,000', percentage: 21, color: 'bg-blue-500' },
            { bank: 'Macquarie & NAB', amount: '$1,100,000', percentage: 13, color: 'bg-purple-500' }
          ].map((b, idx) => (
            <div key={idx} className="space-y-1 text-xs">
              <div className="flex justify-between font-semibold">
                <span>{b.bank}</span>
                <span className="text-[var(--text-muted)]">{b.amount} ({b.percentage}%)</span>
              </div>
              <div className="w-full h-2 rounded-full bg-[var(--bg-app)] overflow-hidden">
                <div className={`h-full ${b.color}`} style={{ width: `${b.percentage}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
