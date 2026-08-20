// TODO(WO-03): 后端 /api/commission 就绪后替换为真实数据
import { DollarSign, TrendingUp, Briefcase } from 'lucide-react';

export function CommissionCard() {
  return (
    <div
      id="commission-card"
      className="p-4 rounded-2xl border shadow-2xs grid grid-cols-1 sm:grid-cols-3 gap-4"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="flex items-center space-x-3">
        <div className="p-2.5 rounded-xl bg-[var(--green-soft)] text-[var(--green)] flex-shrink-0">
          <DollarSign className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>本月已结佣</p>
          <p className="text-sm font-extrabold font-mono" style={{ color: 'var(--text-primary)' }}>$12,350</p>
        </div>
      </div>

      <div className="flex items-center space-x-3 sm:border-l sm:pl-4" style={{ borderColor: 'var(--border)' }}>
        <div className="p-2.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex-shrink-0">
          <TrendingUp className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>预估在途佣金</p>
          <p className="text-sm font-extrabold font-mono" style={{ color: 'var(--text-primary)' }}>$8,900</p>
        </div>
      </div>

      <div className="flex items-center space-x-3 sm:border-l sm:pl-4" style={{ borderColor: 'var(--border)' }}>
        <div className="p-2.5 rounded-xl bg-[var(--yellow-soft)] text-[var(--yellow)] flex-shrink-0">
          <Briefcase className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>活跃案件</p>
          <p className="text-sm font-extrabold font-mono" style={{ color: 'var(--text-primary)' }}>28</p>
        </div>
      </div>
    </div>
  );
}
