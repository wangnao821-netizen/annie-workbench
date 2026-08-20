import { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  Trophy, CheckCircle2, AlertTriangle, XCircle, 
  MessageSquare, Calculator, Layers
} from 'lucide-react';
import { CalculatorAssessResponse } from '../../types/api';
import { useUiStore } from '../../stores/uiStore';
import { useToastStore } from '../../stores/toastStore';

interface ComparisonMatrixProps {
  results: CalculatorAssessResponse[];
  clientName?: string;
  loanAmount: number;
  baseIncome: number;
  onClose?: () => void;
}

export function ComparisonMatrix({
  results,
  clientName,
  loanAmount,
  baseIncome,
  onClose,
}: ComparisonMatrixProps) {
  const [selectedTraceBank, setSelectedTraceBank] = useState<string | null>(null);
  const setPendingChatPrompt = useUiStore((s) => s.setPendingChatPrompt);
  const showToast = useToastStore((s) => s.showToast);

  // Find top recommended bank (Highest max_loan among PASS results, or highest overall)
  const topBank = useMemo(() => {
    if (!results || results.length === 0) return null;
    const passed = results.filter((r) => r.result === 'PASS');
    if (passed.length > 0) {
      return [...passed].sort((a, b) => (b.max_loan || 0) - (a.max_loan || 0))[0];
    }
    return [...results].sort((a, b) => (b.max_loan || 0) - (a.max_loan || 0))[0];
  }, [results]);

  const activeResultForTrace = useMemo(() => {
    if (!results || results.length === 0) return null;
    if (selectedTraceBank) {
      return results.find((r) => r.bank.toLowerCase() === selectedTraceBank.toLowerCase()) || results[0];
    }
    return topBank || results[0];
  }, [results, selectedTraceBank, topBank]);

  const handleCopyToChat = () => {
    if (!results || results.length === 0) return;

    const lines: string[] = [];
    lines.push(`### 📊 多银行服务能力（Servicing）横向测算对比报告`);
    lines.push(`- **客户画像**：${clientName || '客户'}（申报年薪 $${baseIncome.toLocaleString()}，申请贷款 $${loanAmount.toLocaleString()}）`);
    lines.push(`- **对比银行数**：${results.length} 家机构并发测算`);
    lines.push('');
    lines.push(`| 银行机构 | 审贷结论 | 最大拟可贷额度 | 月偿债净盈余 (UMI) | DTI 比例 | 预估 LVR |`);
    lines.push(`| :--- | :--- | :--- | :--- | :--- | :--- |`);

    results.forEach((r) => {
      const isTop = topBank && r.bank === topBank.bank;
      const rankTag = isTop ? '🏆 ' : '';
      const surplusStr = (r.surplus || 0) >= 0 ? `+$${(r.surplus || 0).toLocaleString()}` : `-$${Math.abs(r.surplus || 0).toLocaleString()}`;
      lines.push(`| ${rankTag}${r.bank} | **${r.result}** | $${(r.max_loan || 0).toLocaleString()} | ${surplusStr} | ${r.dti || '-'}x | ${r.lvr || '-'}% |`);
    });

    lines.push('');
    if (topBank) {
      lines.push(`**💡 Vera 决策建议**：`);
      lines.push(`优先推荐 **${topBank.bank}**，审贷结果为 **${topBank.result}**，最大借款能力达 **$${(topBank.max_loan || 0).toLocaleString()}**（超出申请额 $${Math.max(0, (topBank.max_loan || 0) - loanAmount).toLocaleString()}），月度偿债盈余达 **+$${(topBank.surplus || 0).toLocaleString()}**，符合审贷缓冲与 DTI 红线。`);
    }

    const draftText = lines.join('\n');
    setPendingChatPrompt(draftText);
    window.dispatchEvent(new CustomEvent('fill_chat_input', { detail: draftText }));
    showToast('success', '已将多银行对比方案草稿复制到 AI 对话框');
    if (onClose) {
      onClose();
    }
  };

  if (!results || results.length === 0) return null;

  return (
    <div id="calculator-comparison-matrix" className="space-y-4 pt-2">
      {/* Top Banner: Best Recommendation */}
      {topBank && (
        <motion.div 
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 rounded-xl bg-[var(--yellow-soft)] border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500">
                  🏆 最佳方案推荐
                </span>
                <span className="font-semibold text-sm text-[var(--text-primary)]">{topBank.bank}</span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                最大可贷额度 <strong className="text-emerald-500 font-bold">${(topBank.max_loan || 0).toLocaleString()}</strong>
                （超出目标 ${(Math.max(0, (topBank.max_loan || 0) - loanAmount)).toLocaleString()}），
                月度盈余 <strong className="text-emerald-500 font-medium">+${(topBank.surplus || 0).toLocaleString()}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            id="copy-matrix-to-chat-btn"
            onClick={handleCopyToChat}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-strong)] hover:opacity-90 text-[var(--on-accent-strong)] text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>💬 将对比方案复制到 AI 对话框</span>
          </button>
        </motion.div>
      )}

      {/* Benchmark Bank Cards Grid */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>多银行横向测算看板 ({results.length} 家机构)</span>
          </h4>
          <span className="text-[11px] text-[var(--text-muted)]">点击银行可查看白盒演算公式</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {results.map((item) => {
            const isTop = topBank && item.bank === topBank.bank;
            const isSelected = activeResultForTrace?.bank.toLowerCase() === item.bank.toLowerCase();
            const isPass = item.result === 'PASS';
            const isRefer = item.result === 'REFER';
            const surplus = item.surplus || 0;

            return (
              <div
                key={item.bank}
                onClick={() => setSelectedTraceBank(item.bank)}
                className={`p-3 rounded-xl border transition-all cursor-pointer relative ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-xs'
                    : isTop
                    ? 'border-amber-500/50 bg-[var(--yellow-soft)] hover:border-amber-500'
                    : 'border-[var(--border)] bg-[var(--bg-panel)] hover:border-[var(--accent)]'
                }`}
              >
                {isTop && (
                  <span className="absolute top-2 right-2 flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-500 text-black font-bold">
                    <Trophy className="w-2.5 h-2.5" /> 推荐
                  </span>
                )}

                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs text-[var(--text-primary)]">{item.bank}</span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                      isPass
                        ? 'bg-[var(--green-soft)] text-emerald-500'
                        : isRefer
                        ? 'bg-[var(--yellow-soft)] text-amber-500'
                        : 'bg-[var(--red-soft)] text-rose-500'
                    }`}
                  >
                    {isPass ? <CheckCircle2 className="w-2.5 h-2.5" /> : isRefer ? <AlertTriangle className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                    {item.result}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[var(--text-muted)] text-[11px]">最大借款能力</span>
                    <span className="font-bold text-[var(--text-primary)]">
                      ${(item.max_loan || 0).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex justify-between items-baseline">
                    <span className="text-[var(--text-muted)] text-[11px]">月度净盈余 (UMI)</span>
                    <span className={`font-semibold ${surplus >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {surplus >= 0 ? `+$${surplus.toLocaleString()}` : `-$${Math.abs(surplus).toLocaleString()}`}
                    </span>
                  </div>

                  <div className="flex justify-between items-baseline pt-1 border-t border-[var(--border)] text-[11px]">
                    <span className="text-[var(--text-muted)]">DTI: <strong className="text-[var(--text-primary)]">{item.dti || '-'}x</strong></span>
                    <span className="text-[var(--text-muted)]">LVR: <strong className="text-[var(--text-primary)]">{item.lvr || '-'}%</strong></span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Comparison Matrix Table */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-[var(--border)] bg-[var(--bg-subtle)] flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--text-primary)]">📊 银行审贷规则核心指标横向矩阵</span>
          <span className="text-[10px] text-[var(--text-muted)]">APRA Buffer 3.0% + 各行 Floor Rate</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-muted)] text-[11px]">
                <th className="py-2 px-3 font-semibold">银行机构</th>
                <th className="py-2 px-3 font-semibold">审贷结论</th>
                <th className="py-2 px-3 font-semibold">最大拟可贷</th>
                <th className="py-2 px-3 font-semibold">月净盈余 (UMI)</th>
                <th className="py-2 px-3 font-semibold">DTI</th>
                <th className="py-2 px-3 font-semibold">预估 LVR</th>
                <th className="py-2 px-3 font-semibold">模型版本</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {results.map((row) => {
                const isTop = topBank && row.bank === topBank.bank;
                const surplus = row.surplus || 0;
                return (
                  <tr 
                    key={row.bank}
                    className={`hover:bg-[var(--bg-subtle)] transition-colors ${
                      isTop ? 'bg-[var(--yellow-soft)] font-medium' : ''
                    }`}
                  >
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5">
                        {isTop && <span className="text-amber-500 text-xs">🏆</span>}
                        <span className="text-[var(--text-primary)] font-semibold">{row.bank}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        row.result === 'PASS' 
                          ? 'bg-[var(--green-soft)] text-emerald-500' 
                          : row.result === 'REFER'
                          ? 'bg-[var(--yellow-soft)] text-amber-500'
                          : 'bg-[var(--red-soft)] text-rose-500'
                      }`}>
                        {row.result}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-semibold text-[var(--text-primary)]">
                      ${(row.max_loan || 0).toLocaleString()}
                    </td>
                    <td className={`py-2 px-3 font-medium ${surplus >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {surplus >= 0 ? `+$${surplus.toLocaleString()}` : `-$${Math.abs(surplus).toLocaleString()}`}
                    </td>
                    <td className="py-2 px-3 text-[var(--text-secondary)]">{row.dti || '-'}x</td>
                    <td className="py-2 px-3 text-[var(--text-secondary)]">{row.lvr || '-'}%</td>
                    <td className="py-2 px-3 text-[10px] text-[var(--text-muted)] font-mono">{row.profile_version || '2026.8'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Step Trace Accordion for Detailed Inspection */}
      {activeResultForTrace && activeResultForTrace.steps && activeResultForTrace.steps.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <Calculator className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>【{activeResultForTrace.bank}】白盒演算轨迹 (Step Trace)</span>
            </span>
            <span className="text-[10px] text-[var(--text-muted)] font-mono">
              {activeResultForTrace.steps.length} 步骤已校验
            </span>
          </div>

          <div className="space-y-1.5">
            {activeResultForTrace.steps.map((step) => (
              <div
                key={step.step_id}
                className="p-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1"
              >
                <div>
                  <div className="font-medium text-[var(--text-primary)] flex items-center gap-1.5">
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                      {step.step_id}
                    </span>
                    <span>{step.label}</span>
                  </div>
                  {step.formula && (
                    <div className="text-[11px] text-[var(--text-muted)] font-mono mt-0.5">
                      {step.formula}
                    </div>
                  )}
                </div>
                <div className="font-semibold text-[var(--accent)] text-xs shrink-0 self-end sm:self-center">
                  {typeof step.output === 'number' ? `$${step.output.toLocaleString()}` : String(step.output)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
