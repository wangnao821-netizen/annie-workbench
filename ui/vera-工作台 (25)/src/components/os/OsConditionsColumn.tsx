import { useState } from 'react';
import { motion } from 'motion/react';
import { Landmark, FileCheck, FileX, CheckCircle, Circle } from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';

export interface OsConditionItem {
  id: string;
  conditionName: string;
  evidenceName: string;
  available: boolean;
  cleared: boolean;
}

const INITIAL_CONDITIONS: OsConditionItem[] = [
  {
    id: "os-1",
    conditionName: "Updated payslips (last 2 pay periods)",
    evidenceName: "Payslip_Jul.pdf 可用",
    available: true,
    cleared: false,
  },
  {
    id: "os-2",
    conditionName: "Evidence of rental income / Rental Statement",
    evidenceName: "缺失 — 需客户提供",
    available: false,
    cleared: false,
  },
  {
    id: "os-3",
    conditionName: "Signed contract of sale (all pages including special conditions)",
    evidenceName: "Contract_signed.pdf 可用",
    available: true,
    cleared: true,
  },
];

export function OsConditionsColumn() {
  const [conditions, setConditions] = useState<OsConditionItem[]>(INITIAL_CONDITIONS);
  const showToast = useToastStore((s) => s.showToast);

  const toggleCleared = (id: string) => {
    setConditions((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const nextState = !item.cleared;
          showToast('success', `条件 "${item.conditionName.slice(0, 20)}..." 标记为${nextState ? '已清除' : '未清除'}`);
          // TODO(WO-03): POST /api/actions/{id}/os-condition
          return { ...item, cleared: nextState };
        }
        return item;
      })
    );
  };

  const clearedCount = conditions.filter((c) => c.cleared).length;

  return (
    <div className="w-full xl:w-[280px] flex-shrink-0 flex flex-col space-y-4" id="os-conditions-column">
      <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2">
          <Landmark className="w-4 h-4 text-amber-500" />
          <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
            OS 条件与证据映射
          </h3>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-amber-500/10 text-amber-500">
          已清除 {clearedCount}/{conditions.length}
        </span>
      </div>

      <p className="text-[11px] font-mono text-muted">
        TODO(WO-03): POST /api/actions/&#123;id&#125;/os-condition
      </p>

      <div className="space-y-2.5 flex-1 overflow-y-auto no-scrollbar">
        {conditions.map((cond) => (
          <motion.div
            key={cond.id}
            whileHover={{ y: -1 }}
            className={`p-3.5 rounded-xl border flex items-start space-x-3 text-xs shadow-2xs transition-all cursor-pointer ${
              cond.cleared ? 'opacity-75 bg-[var(--accent-soft)]/20' : ''
            }`}
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
            onClick={() => toggleCleared(cond.id)}
            id={`os-condition-${cond.id}`}
          >
            <button className="mt-0.5 flex-shrink-0 cursor-pointer">
              {cond.cleared ? (
                <CheckCircle className="w-4 h-4 text-emerald-500 fill-emerald-500/20" />
              ) : (
                <Circle className="w-4 h-4 text-muted hover:text-primary" />
              )}
            </button>

            <div className="flex-1 min-w-0 space-y-1">
              <span className={`font-semibold block leading-snug ${cond.cleared ? 'line-through text-muted' : ''}`} style={{ color: cond.cleared ? undefined : 'var(--text-primary)' }}>
                {cond.conditionName}
              </span>

              <div className="flex items-center justify-between text-[11px] font-mono">
                {cond.available ? (
                  <span className="flex items-center space-x-1 font-medium text-emerald-500">
                    <FileCheck className="w-3.5 h-3.5" />
                    <span>{cond.evidenceName}</span>
                  </span>
                ) : (
                  <span className="flex items-center space-x-1 font-medium text-rose-500">
                    <FileX className="w-3.5 h-3.5" />
                    <span>{cond.evidenceName}</span>
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
