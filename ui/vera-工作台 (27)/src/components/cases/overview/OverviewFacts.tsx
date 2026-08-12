import { AlertTriangle, CheckCircle2, Clock, Landmark, ShieldCheck, UserCheck } from 'lucide-react';
import { CaseContext } from '../../../types/api';
import { useCaseStore } from '../../../stores/caseStore';

interface OverviewFactsProps {
  context: CaseContext;
}

export function OverviewFacts({ context }: OverviewFactsProps) {
  const cases = useCaseStore((s) => s.cases);

  const { facts, checklist, os, deadlines, risk } = context;
  const clientName = facts.client_name || 'PERSON_1';
  const linkedCasesCount = cases.filter((c) => c.clientName === clientName).length || 1;

  const daysLeft = deadlines.days_left;
  const done = checklist.done || 0;
  const total = checklist.total || 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" id="overview-facts-grid">
      {/* 1. 身份与关系 */}
      <div className="p-3.5 rounded-2xl border space-y-1.5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center space-x-1"><UserCheck className="w-3.5 h-3.5 text-blue-500" /><span>身份与关系</span></span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-600">关联 {linkedCasesCount} 个案件</span>
        </div>
        <div className="text-xs space-y-0.5">
          <p className="font-extrabold text-sm" style={{ color: 'var(--text-primary)' }}>{clientName}</p>
          <p className="text-[11px] text-muted">客户目标: {facts.client_goal || '暂无设定'}</p>
          {facts.special_circumstances && (
            <p className="text-[10px] text-amber-600 font-medium">特殊情况: {facts.special_circumstances}</p>
          )}
        </div>
      </div>

      {/* 2. 交易结构 */}
      <div className="p-3.5 rounded-2xl border space-y-1.5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center space-x-1"><Landmark className="w-3.5 h-3.5 text-purple-500" /><span>交易结构</span></span>
          <span className="font-mono text-purple-600 font-bold">{facts.lender || '未设定'}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
          <div><span className="text-muted">贷款金额: </span><span className="font-bold font-mono text-primary">{facts.loan_amount ? `$${(facts.loan_amount / 10000).toFixed(0)}万` : '未设定'}</span></div>
          <div><span className="text-muted">房产估值: </span><span className="font-bold font-mono text-primary">{facts.property_value ? `$${(facts.property_value / 10000).toFixed(0)}万` : '未设定'}</span></div>
          <div><span className="text-muted">LVR: </span><span className="font-bold font-mono text-primary">{facts.lvr ? `${facts.lvr}%` : '未计算'}</span></div>
          <div><span className="text-muted">用途: </span><span className="font-medium text-primary truncate block">{facts.purpose || '自住购房'}</span></div>
          <div><span className="text-muted">申请利率: </span><span className="font-bold font-mono text-primary">{facts.interest_rate || '5.99%'}</span></div>
          <div><span className="text-muted">当前阶段: </span><span className="font-bold text-amber-600">{facts.stage || '预审中'}</span></div>
        </div>
      </div>

      {/* 3. 关键日期倒计时 */}
      <div className="p-3.5 rounded-2xl border space-y-1.5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between text-[11px] font-bold" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center space-x-1"><Clock className="w-3.5 h-3.5 text-amber-500" /><span>关键日期倒计时</span></span>
          {daysLeft !== null ? (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${daysLeft < 3 ? 'bg-red-500/10 text-red-600' : daysLeft < 7 ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'}`}>
              Finance Clause: {daysLeft <= 0 ? '已到期' : `${daysLeft} 天`}
            </span>
          ) : (
            <span className="text-[10px] text-muted">未设置</span>
          )}
        </div>
        <div className="text-[11px] space-y-1 pt-0.5">
          <p style={{ color: 'var(--text-primary)' }}>Finance Clause 截止: <span className="font-mono font-bold">{deadlines.finance_due ? deadlines.finance_due.split('T')[0] : '未设置'}</span></p>
        </div>
      </div>

      {/* 4. 清单进度 */}
      <div className="p-3.5 rounded-2xl border space-y-2" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between text-[11px] font-bold">
          <span className="flex items-center space-x-1" style={{ color: 'var(--text-primary)' }}><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /><span>清单进度 ({done}/{total})</span></span>
          <span className="font-mono font-bold text-emerald-600">{pct}%</span>
        </div>
        <div className="w-full bg-black/5 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
        <div id="overview-checklist-gaps" className="space-y-1">
          {checklist.missing.slice(0, 5).map((item, idx) => (
            <div key={idx} className="p-1.5 rounded bg-[var(--bg-app)] border text-[10px] flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <span className="truncate max-w-[200px]" style={{ color: 'var(--text-primary)' }}>{item}</span>
              <span className="px-1 text-[9px] font-bold text-amber-600 bg-amber-500/10 rounded">缺失</span>
            </div>
          ))}
          {checklist.missing.length === 0 && (
            <div className="text-[10px] text-emerald-600 font-medium pt-1">全量清单材料均已到位</div>
          )}
        </div>
      </div>

      {/* 5. OS 条件 */}
      <div className="p-3.5 rounded-2xl border space-y-1.5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between text-[11px] font-bold">
          <span className="flex items-center space-x-1" style={{ color: 'var(--text-primary)' }}>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span>银行 OS 条件</span>
          </span>
          {os.pending_count > 0 ? (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-500/10 text-red-600">{os.pending_count} 项待处理</span>
          ) : (
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-500/10 text-emerald-600">无 OS 阻碍</span>
          )}
        </div>
        <div className="space-y-1 text-[10px]">
          {os.items.slice(0, 3).map((item, i) => (
            <div key={i} className="p-1 rounded bg-rose-500/5 text-rose-700 dark:text-rose-300 font-medium truncate">
              • {item.raw_text}
            </div>
          ))}
          {os.items.length === 0 && (
            <p className="text-[11px] text-muted">当前阶段未触发新的银行出具条件要求。</p>
          )}
        </div>
      </div>

      {/* 6. 风险与瓶颈 */}
      <div className="p-3.5 rounded-2xl border space-y-1.5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between text-[11px] font-bold">
          <span className="flex items-center space-x-1" style={{ color: 'var(--text-primary)' }}>
            <ShieldCheck className="w-3.5 h-3.5 text-purple-500" />
            <span>风险与瓶颈分析</span>
          </span>
          <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${risk.length > 0 ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600'}`}>
            {risk.length > 0 ? `${risk.length} 个关注项` : '暂无风险'}
          </span>
        </div>
        <div className="space-y-1 text-[10px]">
          {risk.length > 0 ? (
            risk.map((r, i) => (
              <p key={i} className="text-amber-700 dark:text-amber-400 font-medium">⚠️ {r}</p>
            ))
          ) : (
            <p className="text-emerald-600 font-medium">✅ 材料与推进节点正常</p>
          )}
        </div>
      </div>
    </div>
  );
}
