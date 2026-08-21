import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Zap, CheckCircle2, ShieldCheck, Sparkles, RefreshCw } from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';

export interface StrategyItem {
  id: number;
  title: string;
  feasibility: '高' | '中' | '低';
  description: string;
  reasoning: string;
}

interface OsStrategyColumnProps {
  initialStrategies?: StrategyItem[];
  caseName?: string;
  lender?: string;
}

export function OsStrategyColumn({ initialStrategies, caseName, lender }: OsStrategyColumnProps) {
  const reduced = useReducedMotion();
  const [strategies, setStrategies] = useState<StrategyItem[]>(initialStrategies || []);
  const [selectedId, setSelectedId] = useState<number | null>(strategies[0]?.id || null);
  const [generating, setGenerating] = useState(false);
  const showToast = useToastStore((s) => s.showToast);

  const getFeasibilityBadge = (f: '高' | '中' | '低') => {
    if (f === '高') return 'bg-[var(--green-soft)] text-[var(--green)] border-[var(--green-soft)]';
    if (f === '中') return 'bg-[var(--yellow-soft)] text-[var(--yellow)] border-[var(--yellow-soft)]';
    return 'bg-[var(--red-soft)] text-[var(--red)] border-[var(--red-soft)]';
  };

  const handleGenerateStrategies = () => {
    setGenerating(true);
    setTimeout(() => {
      const generated: StrategyItem[] = [
        {
          id: 1,
          title: `策略一：结合 ${lender || '银行'} 政策附送材料补件说明信 (推荐)`,
          feasibility: '高',
          description: `基于 ${caseName || '当前客户'} 案卷已收到的收入证明及流水，草拟标准回函并请求优先复核。`,
          reasoning: '符合该银行常规审件流程，可最快在 24-48 小时内推进。',
        },
        {
          id: 2,
          title: '策略二：联系 BDM/主管申请例外豁免 (Pricing/Policy Exception)',
          feasibility: '中',
          description: '若标准材料仍存在细微口径分歧，直接通过线下渠道请求 BDM 介入背书。',
          reasoning: '需等待 BDM 邮件或电话确认，适合有缓冲期的案件。',
        },
      ];
      setStrategies(generated);
      setSelectedId(1);
      setGenerating(false);
      showToast('success', 'AI 已成功生成针对当前案卷的攻坚策略');
    }, 1200);
  };

  return (
    <div className="flex-1 flex flex-col space-y-4 min-w-0" id="os-strategy-column">
      <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2">
          <Zap className="w-4 h-4 text-[var(--purple)] fill-[var(--purple-soft)]" />
          <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
            AI 攻坚方案
          </h3>
        </div>
        {strategies.length > 0 && selectedId && (
          <span className="text-[11px] font-mono text-muted">
            已选择策略 #{selectedId}
          </span>
        )}
      </div>

      <div className="space-y-3 flex-1 overflow-y-auto no-scrollbar">
        {strategies.length === 0 ? (
          <div className="h-60 flex flex-col items-center justify-center text-center p-6 rounded-2xl border space-y-3.5 bg-[var(--bg-card)] border-dashed border-[var(--border)]">
            <div className="w-10 h-10 rounded-full bg-[var(--purple-soft)] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-[var(--purple)]" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-[var(--text-primary)]">💡 暂无生成的攻坚策略</p>
              <p className="text-[11px] text-muted max-w-sm">
                点击下方按钮，由 Annie 根据案卷条件与银行政策实时生成 2-3 套攻坚与转案应对方案
              </p>
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleGenerateStrategies}
              disabled={generating}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-[var(--purple)] text-white hover:opacity-90 cursor-pointer flex items-center space-x-1.5 shadow-xs disabled:opacity-50"
              id="os-generate-strategies-btn"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
              <span>{generating ? '正在分析案卷生成策略...' : '✨ 立即生成攻坚策略'}</span>
            </motion.button>
          </div>
        ) : (
          strategies.map((strat) => {
            const isSelected = selectedId === strat.id;
            return (
              <motion.div
                key={strat.id}
                whileHover={reduced ? undefined : { y: -1 }}
                whileTap={reduced ? undefined : { scale: 0.98 }}
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
                  <span className={`px-2 py-0.5 text-xs font-bold rounded-md border flex-shrink-0 ${getFeasibilityBadge(strat.feasibility)}`}>
                    可行性: {strat.feasibility}
                  </span>
                </div>

                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {strat.description}
                </p>

                <div className="pt-2 border-t flex items-start space-x-1.5 text-[11px]" style={{ borderColor: 'var(--border)' }}>
                  <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent)] flex-shrink-0 mt-0.5" />
                  <span className="text-muted leading-tight">
                    <strong style={{ color: 'var(--text-primary)' }}>决策依据：</strong> {strat.reasoning}
                  </span>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
