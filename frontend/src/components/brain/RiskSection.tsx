import { AlertCircle, AlertTriangle, Info } from 'lucide-react';

interface RiskSectionProps {
  risks: string[];
  specialCircumstances?: string | null;
  hasUndisclosed: boolean;
  undisclosedCount?: number;
}

export function RiskSection({ risks, specialCircumstances, hasUndisclosed, undisclosedCount }: RiskSectionProps) {
  const hasSpecial = !!specialCircumstances && specialCircumstances.trim() !== '' && specialCircumstances.trim() !== '无';
  const hasRisks = risks && risks.length > 0;
  const hasContent = hasRisks || hasSpecial || hasUndisclosed;

  return (
    <div
      className={`p-3 rounded-xl border space-y-2 text-xs ${
        hasContent
          ? 'bg-[var(--yellow-soft)] border-[var(--yellow-soft)] text-[var(--yellow)] dark:text-[var(--yellow)]'
          : 'bg-[var(--bg-subtle)]'
      }`}
      style={{ borderColor: hasContent ? undefined : 'var(--border)' }}
      id="risk-section"
    >
      {/* Title */}
      <div
        className={`flex items-center space-x-1.5 text-[11px] ${
          hasContent ? 'font-extrabold text-[var(--yellow)] dark:text-[var(--yellow)]' : 'font-bold'
        }`}
        style={{ color: hasContent ? undefined : 'var(--text-primary)' }}
      >
        <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 ${hasContent ? 'text-[var(--yellow)]' : 'text-[var(--yellow)]'}`} />
        <span>风险情报</span>
      </div>

      {!hasContent ? (
        <p className="text-[11px] text-muted py-0.5">暂无风险提示</p>
      ) : (
        <>
          {/* Undisclosed Warning Banner */}
          {hasUndisclosed && (
            <div
              className="px-2.5 py-1.5 rounded-lg border bg-[var(--yellow-soft)] border-[var(--yellow-soft)] text-[var(--yellow)] dark:text-[var(--yellow)] font-bold text-[11px] flex items-center space-x-1.5"
              id="undisclosed-warning-banner"
            >
              <span>⚠️ {undisclosedCount && undisclosedCount > 0 ? `${undisclosedCount} 条` : ''}标记为不能给银行看（递交前需确认）</span>
            </div>
          )}

          {/* Risks List */}
          {hasRisks && (
            <div className="space-y-1">
              {risks.map((r, idx) => (
                <div key={idx} className="flex items-start space-x-1.5 text-[11px] leading-snug">
                  <AlertCircle className="w-3.5 h-3.5 text-[var(--yellow)] flex-shrink-0 mt-0.5" />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}

          {/* Special Circumstances */}
          {hasSpecial && (
            <div className="flex items-start space-x-1.5 text-[11px] leading-snug opacity-90 pt-0.5 border-t border-[var(--yellow-soft)]">
              <Info className="w-3.5 h-3.5 text-[var(--yellow)] dark:text-[var(--yellow)] flex-shrink-0 mt-0.5" />
              <span>特殊情况：{specialCircumstances}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
