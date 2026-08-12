import { AlertCircle, AlertTriangle, Info } from 'lucide-react';

interface RiskSectionProps {
  risks: string[];
  specialCircumstances?: string | null;
  hasUndisclosed: boolean;
}

export function RiskSection({ risks, specialCircumstances, hasUndisclosed }: RiskSectionProps) {
  const hasSpecial = !!specialCircumstances && specialCircumstances.trim() !== '' && specialCircumstances.trim() !== '无';
  const hasRisks = risks && risks.length > 0;

  if (!hasRisks && !hasSpecial && !hasUndisclosed) {
    return null;
  }

  return (
    <div
      className="p-3 rounded-xl border space-y-2 bg-amber-500/10 border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs"
      id="risk-section"
    >
      {/* Title */}
      <div className="flex items-center space-x-1.5 font-extrabold text-amber-800 dark:text-amber-300 text-[11px]">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <span>风险与注意事项</span>
      </div>

      {/* Undisclosed Warning Banner */}
      {hasUndisclosed && (
        <div
          className="px-2.5 py-1.5 rounded-lg border bg-amber-500/20 border-amber-500/30 text-amber-900 dark:text-amber-200 font-bold text-[11px] flex items-center space-x-1.5"
          id="undisclosed-warning-banner"
        >
          <span>⚠️ 含未披露事项（递交前需确认）</span>
        </div>
      )}

      {/* Risks List */}
      {hasRisks && (
        <div className="space-y-1">
          {risks.map((r, idx) => (
            <div key={idx} className="flex items-start space-x-1.5 text-[11px] leading-snug">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <span>{r}</span>
            </div>
          ))}
        </div>
      )}

      {/* Special Circumstances */}
      {hasSpecial && (
        <div className="flex items-start space-x-1.5 text-[11px] leading-snug opacity-90 pt-0.5 border-t border-amber-500/20">
          <Info className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <span>特殊情况：{specialCircumstances}</span>
        </div>
      )}
    </div>
  );
}
