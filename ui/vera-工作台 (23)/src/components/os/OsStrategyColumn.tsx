import { useState } from 'react';
import { motion } from 'motion/react';
import { Zap, CheckCircle2, ShieldCheck } from 'lucide-react';

interface StrategyItem {
  id: number;
  title: string;
  feasibility: '高' | '中' | '低';
  description: string;
  reasoning: string;
}

const STRATEGIES: StrategyItem[] = [
  {
    id: 1,
    title: '策略一：提交 12 个月 BAS + 会计师补充说明信 (最推荐)',
    feasibility: '高',
    description: '针对 ANZ 缺失租金流水问题，直接附带会计师对首套投资房租金预估信及 ATO 12个月 BAS 递交记录。',
    reasoning: '符合 ANZ BDM 线下特批指引，可最快在 24 小时内获得条件豁免。',
  },
  {
    title: '策略二：提供同区域相同房型租金评估报告 (Rental Appraisal)',
    id: 2,
    feasibility: '中',
    description: '联系中介生成官方持牌 Agent 租金评估报告，替代银行对租金流水的追问。',
    reasoning: '需等待中介 1 个工作日出具报告，适合 Finance Due 尚有缓冲的案件。',
  },
  {
    id: 3,
    title: '策略三：启动备选转案预案（同步准备 CBA 递交）',
    feasibility: '低',
    description: '若 ANZ 坚决拒豁免，立即利用已有材料一键打包投递 CBA 快速审批通道。',
    reasoning: '转案需要重新评估，作为最终保底备选方案。',
  },
];

export function OsStrategyColumn() {
  const [selectedId, setSelectedId] = useState<number>(1);

  const getFeasibilityBadge = (f: '高' | '中' | '低') => {
    if (f === '高') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    if (f === '中') return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
  };

  return (
    <div className="flex-1 flex flex-col space-y-4 min-w-0" id="os-strategy-column">
      <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2">
          <Zap className="w-4 h-4 text-purple-500 fill-purple-500/20" />
          <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
            AI 攻坚方案（3 条策略）
          </h3>
        </div>
        <span className="text-[10px] font-mono text-muted">
          已选择策略 #{selectedId}
        </span>
      </div>

      <p className="text-[11px] font-mono text-muted">
        TODO(WO-03/后端): 真实方案来自 os_workbench 后端
      </p>

      <div className="space-y-3 flex-1 overflow-y-auto no-scrollbar">
        {STRATEGIES.map((strat) => {
          const isSelected = selectedId === strat.id;
          return (
            <motion.div
              key={strat.id}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedId(strat.id)}
              className={`p-4 rounded-2xl border space-y-2.5 cursor-pointer transition-all ${
                isSelected
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]/20 shadow-md ring-1 ring-[var(--accent)]'
                  : 'hover:bg-[var(--bg-card-hover)]'
              }`}
              style={{ backgroundColor: isSelected ? undefined : 'var(--bg-card)', borderColor: isSelected ? undefined : 'var(--border)' }}
              id={`os-strategy-${strat.id}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 min-w-0">
                  <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-[var(--accent)]' : 'text-muted'}`} />
                  <h4 className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                    {strat.title}
                  </h4>
                </div>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border flex-shrink-0 ${getFeasibilityBadge(strat.feasibility)}`}>
                  可行性: {strat.feasibility}
                </span>
              </div>

              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {strat.description}
              </p>

              <div className="pt-2 border-t flex items-start space-x-1.5 text-[11px]" style={{ borderColor: 'var(--border)' }}>
                <ShieldCheck className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                <span className="text-muted leading-tight">
                  <strong style={{ color: 'var(--text-primary)' }}>决策依据：</strong> {strat.reasoning}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
