import { motion } from 'motion/react';
import { Landmark, Calendar, FileText, ChevronRight } from 'lucide-react';
import { CaseInfo } from '../../stores/caseStore';

interface CaseCardProps {
  caseData: CaseInfo;
  onClick?: () => void;
}

export function CaseCard({ caseData, onClick }: CaseCardProps) {
  const {
    clientName,
    lender,
    loanAmount,
    stage,
    checklistDone,
    checklistTotal,
    checklistProgress,
    deadline,
  } = caseData;

  return (
    <motion.div
      whileHover={{ y: -4, transition: { duration: 0.15 } }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="p-4 rounded-2xl border flex flex-col justify-between cursor-pointer space-y-3.5 shadow-2xs hover:shadow-md transition-all group"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border)',
      }}
      id={`case-card-${caseData.caseId}`}
    >
      {/* Top Header: Client name & Stage badge */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold group-hover:text-amber-500 transition-colors" style={{ color: 'var(--text-primary)' }}>
            {clientName}
          </h3>
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

        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg border" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--accent)' }}>
          {stage}
        </span>
      </div>

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
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-app)' }}>
          <div 
            className="h-full rounded-full transition-all duration-300"
            style={{ 
              width: `${checklistProgress}%`,
              background: 'linear-gradient(90deg, var(--accent) 0%, var(--green) 100%)'
            }}
          />
        </div>
      </div>

      {/* Bottom Footer info */}
      <div className="pt-2 border-t flex items-center justify-between text-[11px]" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
        <div className="flex items-center space-x-1 font-mono">
          <Calendar className="w-3 h-3 text-amber-500" />
          <span>{deadline || "跟进中"}</span>
        </div>

        <span className="flex items-center space-x-0.5 font-medium group-hover:translate-x-1 transition-transform" style={{ color: 'var(--accent)' }}>
          <span>详情</span>
          <ChevronRight className="w-3 h-3" />
        </span>
      </div>
    </motion.div>
  );
}
