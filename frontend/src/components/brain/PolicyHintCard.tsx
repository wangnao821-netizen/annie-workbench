import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { 
  ShieldAlert, ShieldCheck, AlertTriangle, X, ChevronRight, Info, Building2, ChevronDown, ChevronUp
} from 'lucide-react';
import { PolicyCheckResult } from '../../types/api';

interface PolicyHintCardProps {
  result: PolicyCheckResult;
  onClose?: () => void;
  defaultCollapsed?: boolean;
}

export function PolicyHintCard({ result, onClose, defaultCollapsed = false }: PolicyHintCardProps) {
  const reduced = useReducedMotion();
  const [closed, setClosed] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (closed) return null;

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    setClosed(true);
    if (onClose) onClose();
  };

  const getOverallConfig = (overall: string) => {
    switch (overall?.toLowerCase()) {
      case 'green':
        return {
          icon: ShieldCheck,
          label: '建议可行',
          headline: '🟢 政策画像良好',
          bgColor: 'bg-[var(--green-soft)] dark:bg-[var(--green-soft)]',
          borderColor: 'border-[var(--green-soft)]',
          textColor: 'text-[var(--green)]',
          badgeBg: 'bg-[var(--green-soft)]',
        };
      case 'red':
        return {
          icon: ShieldAlert,
          label: '高风险',
          headline: '🔴 存在高风险政策限制',
          bgColor: 'bg-[var(--red-soft)] dark:bg-[var(--red-soft)]',
          borderColor: 'border-[var(--red-soft)]',
          textColor: 'text-[var(--red)]',
          badgeBg: 'bg-[var(--red-soft)]',
        };
      case 'amber':
      default:
        return {
          icon: AlertTriangle,
          label: '注意风控',
          headline: '🟡 存在中度风控提示',
          bgColor: 'bg-[var(--yellow-soft)] dark:bg-[var(--yellow-soft)]',
          borderColor: 'border-[var(--yellow-soft)]',
          textColor: 'text-[var(--yellow)] dark:text-[var(--yellow)]',
          badgeBg: 'bg-[var(--yellow-soft)]',
        };
    }
  };

  const config = getOverallConfig(result.overall);
  const IconComponent = config.icon;

  if (collapsed) {
    return (
      <div
        onClick={() => setCollapsed(false)}
        className={`px-3 py-1.5 min-h-[36px] rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-all hover:opacity-90 shadow-2xs ${config.bgColor} ${config.borderColor}`}
        id="policy-hint-card-collapsed"
      >
        <div className="flex items-center space-x-2 min-w-0 flex-1 mr-2">
          <IconComponent className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="font-extrabold text-xs truncate" style={{ color: 'var(--text-primary)' }}>
            {config.headline} ({result.lender || '银行政策'})
          </span>
        </div>
        <div className="flex items-center space-x-1 text-xs font-bold text-muted flex-shrink-0">
          <span>展开</span>
          <ChevronDown className="w-3.5 h-3.5" />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95  }}
      whileHover={reduced ? undefined : { y: -2 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className={`rounded-2xl p-3.5 border shadow-2xs space-y-3 relative transition-all ${config.bgColor} ${config.borderColor}`}
      id="policy-hint-card"
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start space-x-2.5">
          <div className={`p-1.5 rounded-xl flex-shrink-0 mt-0.5 ${config.badgeBg} ${config.textColor}`}>
            <IconComponent className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <span className="text-xs font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                {result.lender ? `${result.lender} 政策提示` : '银行政策比对评估'}
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${config.badgeBg} ${config.textColor}`}>
                {config.label}
              </span>
            </div>
            <p className="text-[11px] font-medium text-muted leading-relaxed mt-1">
              {result.summary}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="p-1 rounded-lg hover:bg-[var(--bg-subtle)] text-muted transition-colors cursor-pointer"
            title="折叠政策提示"
            id="policy-hint-fold-btn"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-lg hover:bg-[var(--bg-subtle)] text-muted transition-colors cursor-pointer"
            title="关闭政策提示"
            id="policy-hint-close-btn"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Issues list (if any) */}
      {result.issues && result.issues.length > 0 && (
        <div className="space-y-2 pt-1">
          <span className="text-[11px] font-extrabold text-secondary block">
            风控与政策审查列表 ({result.issues.length} 项)：
          </span>
          <div className="space-y-2">
            {result.issues.map((issue, idx) => {
              const isRed = issue.level === 'red';
              const isGreen = issue.level === 'green';
              return (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-xs space-y-1 shadow-2xs"
                >
                  <div className="flex items-center justify-between font-extrabold text-primary">
                    <div className="flex items-center space-x-1.5">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        isRed ? 'bg-[var(--red)]' : isGreen ? 'bg-[var(--green)]' : 'bg-[var(--yellow)]'
                      }`} />
                      <span>{issue.title}</span>
                    </div>
                    <span className={`text-[11px] font-mono font-bold px-1.5 py-0.2 rounded ${
                      isRed ? 'bg-[var(--red-soft)] text-[var(--red)]' : isGreen ? 'bg-[var(--green-soft)] text-[var(--green)]' : 'bg-[var(--yellow-soft)] text-[var(--yellow)]'
                    }`}>
                      {issue.level?.toUpperCase()}
                    </span>
                  </div>

                  <p className="text-[11px] text-muted leading-relaxed">
                    {issue.detail}
                  </p>

                  {issue.suggestion && (
                    <div className="pt-1 flex items-start space-x-1 text-[11px] text-[var(--purple)] dark:text-[var(--purple)] font-semibold">
                      <ChevronRight className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      <span>建议方案：{issue.suggestion}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Alternative Lenders */}
      {result.alternative_lenders && result.alternative_lenders.length > 0 && (
        <div className="flex items-center space-x-2 pt-2 border-t border-[var(--border)] text-xs">
          <Building2 className="w-3.5 h-3.5 text-[var(--purple)] flex-shrink-0" />
          <span className="text-[11px] font-bold text-muted flex-shrink-0">备选替代银行：</span>
          <div className="flex items-center space-x-1 flex-wrap gap-y-1">
            {result.alternative_lenders.map((alt, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-lg text-xs font-extrabold bg-[var(--bg-card)] border border-[var(--border)] text-primary shadow-2xs"
              >
                {alt}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      {result.disclaimer && (
        <div className="flex items-center space-x-1 text-[11px] text-muted opacity-80 pt-0.5">
          <Info className="w-3 h-3 flex-shrink-0" />
          <span className="truncate" title={result.disclaimer}>{result.disclaimer}</span>
        </div>
      )}
    </motion.div>
  );
}
