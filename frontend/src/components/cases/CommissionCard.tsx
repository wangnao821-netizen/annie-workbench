import { useMemo } from 'react';
import { DollarSign, TrendingUp, Briefcase } from 'lucide-react';
import { useCaseStore } from '../../stores/caseStore';

export function CommissionCard() {
  const cases = useCaseStore((s) => s.cases);

  const { settledCommissionStr, pendingCommissionStr, activeCount } = useMemo(() => {
    // 活跃案件：非交割/结案/关闭状态
    const activeCases = cases.filter((c) => {
      const s = (c.stage || '').toLowerCase();
      return !s.includes('交割') && !s.includes('settled') && !s.includes('结案') && !s.includes('closed') && !s.includes('关闭');
    });

    // 已结案/已交割案件
    const settledCases = cases.filter((c) => {
      const s = (c.stage || '').toLowerCase();
      return s.includes('交割') || s.includes('settled') || s.includes('结案');
    });

    // 澳洲信贷行业标准预估佣金（按 0.6% Upfront Commission 计算）
    const activeTotalLoan = activeCases.reduce((acc, c) => acc + (Number(c.loanAmount) || 0), 0);
    const settledTotalLoan = settledCases.reduce((acc, c) => acc + (Number(c.loanAmount) || 0), 0);

    const pendingComm = Math.round(activeTotalLoan * 0.006);
    const settledComm = Math.round(settledTotalLoan * 0.006);

    return {
      settledCommissionStr: `$${settledComm.toLocaleString('en-US')}`,
      pendingCommissionStr: `$${pendingComm.toLocaleString('en-US')}`,
      activeCount: activeCases.length,
    };
  }, [cases]);

  return (
    <div
      id="commission-card"
      className="p-4 rounded-2xl border shadow-2xs grid grid-cols-1 sm:grid-cols-3 gap-4 transition-all duration-200"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border)',
      }}
    >
      {/* 本月已结佣 */}
      <div className="flex items-center space-x-3">
        <div 
          className="p-2.5 rounded-xl flex-shrink-0"
          style={{ backgroundColor: 'var(--green-soft, rgba(16, 185, 129, 0.1))', color: 'var(--green, #10b981)' }}
        >
          <DollarSign className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>本月已结佣</p>
          <p className="text-sm font-extrabold font-mono" style={{ color: 'var(--text-primary)' }}>
            {settledCommissionStr}
          </p>
        </div>
      </div>

      {/* 预估在途佣金 */}
      <div className="flex items-center space-x-3 sm:border-l sm:pl-4" style={{ borderColor: 'var(--border)' }}>
        <div 
          className="p-2.5 rounded-xl flex-shrink-0"
          style={{ backgroundColor: 'var(--accent-soft, rgba(30, 94, 65, 0.1))', color: 'var(--accent, #1e5e41)' }}
        >
          <TrendingUp className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>预估在途佣金</p>
          <p className="text-sm font-extrabold font-mono" style={{ color: 'var(--text-primary)' }}>
            {pendingCommissionStr}
          </p>
        </div>
      </div>

      {/* 活跃案件 */}
      <div className="flex items-center space-x-3 sm:border-l sm:pl-4" style={{ borderColor: 'var(--border)' }}>
        <div 
          className="p-2.5 rounded-xl flex-shrink-0"
          style={{ backgroundColor: 'var(--yellow-soft, rgba(245, 158, 11, 0.1))', color: 'var(--yellow, #f59e0b)' }}
        >
          <Briefcase className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>活跃案件</p>
          <p className="text-sm font-extrabold font-mono" style={{ color: 'var(--text-primary)' }}>
            {activeCount}
          </p>
        </div>
      </div>
    </div>
  );
}
