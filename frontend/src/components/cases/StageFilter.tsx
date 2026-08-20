import { motion, useReducedMotion } from 'motion/react';

export type CaseStageFilter = "all" | "pre_review" | "submitted" | "os_condition" | "approval" | "settlement";

interface StageFilterProps {
  activeStage: CaseStageFilter;
  onStageChange: (stage: CaseStageFilter) => void;
}

const STAGE_OPTIONS: { id: CaseStageFilter; label: string; count?: number }[] = [
  { id: "all", label: "全部" },
  { id: "pre_review", label: "预审" },
  { id: "submitted", label: "递件中" },
  { id: "os_condition", label: "补件 (OS)" },
  { id: "approval", label: "审批" },
  { id: "settlement", label: "Settlement" },
];

export function StageFilter({ activeStage, onStageChange }: StageFilterProps) {
  const reduced = useReducedMotion();
  return (
    <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-1" id="case-stage-filter">
      {STAGE_OPTIONS.map((opt) => {
        const isActive = activeStage === opt.id;
        return (
          <motion.button
            key={opt.id}
            whileTap={reduced ? undefined : { scale: 0.95 }}
            onClick={() => onStageChange(opt.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border ${
              isActive ? 'shadow-2xs' : ''
            }`}
            style={{
              backgroundColor: isActive ? 'var(--accent)' : 'var(--bg-card)',
              color: isActive ? '#ffffff' : 'var(--text-secondary)',
              borderColor: isActive ? 'transparent' : 'var(--border)',
            }}
          >
            {opt.label}
          </motion.button>
        );
      })}
    </div>
  );
}
