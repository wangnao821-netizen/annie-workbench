import { motion } from 'motion/react';
import { Landmark, Calendar, FileText, ChevronRight, Flame, Clock, CheckCircle2 } from 'lucide-react';
import { CaseInfo, useCaseStore } from '../../stores/caseStore';
import { getFinanceDeadlineDays } from '../../services/caseMapper';

interface CaseCardProps {
  caseData: CaseInfo;
  onClick?: () => void;
}

export function CaseCard({ caseData, onClick }: CaseCardProps) {
  const cases = useCaseStore((s) => s.cases);

  const {
    clientName,
    lender,
    loanAmount,
    stage,
    checklistDone,
    checklistTotal,
    checklistProgress,
    deadline,
    summary,
    financeDeadline,
    osPendingCount = 0,
  } = caseData;

  const deadlineDays = getFinanceDeadlineDays(financeDeadline);
  const linkedCount = cases.filter((c) => c.clientName === clientName).length;

  return (
    <motion.div
      whileHover={{ y: -4, transition: { duration: 0.15 } }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="p-4 rounded-2xl border flex flex-col justify-between cursor-pointer space-y-3 shadow-2xs hover:shadow-md transition-all group relative"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border)',
      }}
      id={`case-card-${caseData.caseId}`}
    >
      {/* Top Header: Client name & Badges */}
      <div className="flex items-start justify-between min-w-0">
        <div className="min-w-0 pr-2">
          <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
            <h3 className="text-sm font-bold group-hover:text-amber-500 transition-colors truncate" style={{ color: 'var(--text-primary)' }}>
              {clientName}
            </h3>

            {/* OS 角标 */}
            {osPendingCount > 0 && (
              <span id="case-os-badge" className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-500 text-white flex items-center space-x-0.5">
                <Flame className="w-2.5 h-2.5 fill-white" />
                <span>OS {osPendingCount}</span>
              </span>
            )}

            {/* 关联案件 */}
            {linkedCount > 1 && (
              <span id="case-linked-badge" className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-600">
                ×{linkedCount} 关联
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2 text-xs font-mono mt-0.5" style={{ color: 'var(--text-muted)' }}>
            <span className="flex items-center space-x-1">
              <Landmark className="w-3 h-3" />
              <span>{lender}</span>
            </span>
            <span>•</span>
            <span className="font-semibold text-primary">
              ${loanAmount ? (loanAmount >= 10000 ? `${(loanAmount / 10000).toFixed(0)}万` : loanAmount.toLocaleString()) : '0'}
            </span>
          </div>
        </div>

        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg border flex-shrink-0" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--accent)' }}>
          {stage}
        </span>
      </div>

      {/* 一句话摘要 */}
      {summary && (
        <p className="text-[11px] text-muted truncate leading-tight" style={{ color: 'var(--text-secondary)' }}>
          {summary}
        </p>
      )}

      {/* Checklist Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="flex items-center space-x-1" style={{ color: 'var(--text-secondary)' }}>
            <FileText className="w-3 h-3" />
            <span>清单进度</span>
          </span>
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            {checklistDone} / {checklistTotal} ({checklistProgress}%)
          </span>
        </div>

        {/* Progress Track */}
        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-app)' }}>
          <div 
            className="h-full rounded-full transition-all duration-300"
            style={{ 
              width: `${checklistProgress}%`,
              background: 'linear-gradient(90deg, var(--accent) 0%, var(--green) 100%)'
            }}
          />
        </div>
      </div>

      {/* Bottom Footer info: Finance Due 倒计时 & 详情指示 */}
      <div className="pt-2 border-t flex items-center justify-between text-[11px]" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
        <div className="flex items-center space-x-1 font-mono">
          {deadlineDays !== null ? (
            <span
              id="case-due-badge"
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center space-x-1 ${
                deadlineDays < 3
                  ? 'bg-red-500/10 text-red-600'
                  : deadlineDays < 7
                  ? 'bg-amber-500/10 text-amber-600'
                  : 'bg-emerald-500/10 text-emerald-600'
              }`}
            >
              {deadlineDays < 3 ? (
                <Flame className="w-3 h-3" />
              ) : deadlineDays < 7 ? (
                <Clock className="w-3 h-3" />
              ) : (
                <CheckCircle2 className="w-3 h-3" />
              )}
              <span>
                {deadlineDays < 3
                  ? `🔥 ${deadlineDays <= 0 ? '今天到期' : `${deadlineDays} 天`}`
                  : deadlineDays < 7
                  ? `⏰ ${deadlineDays} 天`
                  : `✓ 充裕 (${deadlineDays}天)`}
              </span>
            </span>
          ) : (
            <span className="flex items-center space-x-1 text-muted">
              <Calendar className="w-3 h-3 text-amber-500" />
              <span>{deadline || '跟进中'}</span>
            </span>
          )}
        </div>

        {/* TODO(WO-09): 委派状态接入 */}

        <span className="flex items-center space-x-0.5 font-medium group-hover:translate-x-1 transition-transform" style={{ color: 'var(--accent)' }}>
          <span>客户全景</span>
          <ChevronRight className="w-3 h-3" />
        </span>
      </div>
    </motion.div>
  );
}
