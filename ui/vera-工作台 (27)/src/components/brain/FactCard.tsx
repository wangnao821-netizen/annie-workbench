import { AlertTriangle } from 'lucide-react';
import { BrainFact } from '../../types/api';

interface FactCardProps {
  fact: BrainFact;
  categoryLabel: string;
}

const KEY_LABELS: Record<string, string> = {
  'bank.lender': '贷款银行',
  'loan.amount': '贷款金额',
  'loan.purpose': '贷款目的',
  'loan.rate': '申请利率',
  'property.value': '房产评估值',
  'stage.current': '当前阶段',
  'income.annual': '年收入',
  'income.payslip': '工资单收入',
  'employment.status': '就业状态',
  'employment.employer': '雇主名称',
  'identity.status': '居留/签证',
  'liability.credit_card': '信用卡额度',
  'liability.other': '其他负债',
  'special.circumstance': '特殊情况',
  'commitment.date': '约定时间',
};

export function FactCard({ fact }: FactCardProps) {
  // Derive key label
  const rawKey = fact.key;
  const mappedKey = KEY_LABELS[rawKey] || rawKey.split('.').pop()?.replace(/_/g, ' ') || rawKey;

  return (
    <div
      className="p-2.5 rounded-xl border flex flex-col space-y-1 relative"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      id={`fact-card-${fact.id}`}
    >
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold text-muted">{mappedKey}</span>
        {fact.conflict && (
          <span className="flex items-center space-x-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-3 h-3" />
            <span>⚠️ 已更新/冲突</span>
          </span>
        )}
      </div>
      <div className="text-xs font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
        {fact.value}
      </div>
    </div>
  );
}
