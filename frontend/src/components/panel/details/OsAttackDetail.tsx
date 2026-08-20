import { motion, useReducedMotion } from 'motion/react';
import { Landmark, FileCheck, FileX, Zap, Mail } from 'lucide-react';
import { TaskItem } from '../../../types';
import { useUiStore } from '../../../stores/uiStore';
import { useToastStore } from '../../../stores/toastStore';

interface OsAttackDetailProps {
  task: TaskItem;
}

interface OsCondition {
  id: string;
  conditionName: string;
  evidenceName: string;
  available: boolean;
}

const OS_CONDITIONS: OsCondition[] = [
  {
    id: "os-1",
    conditionName: "Updated payslips (last 2 pay periods)",
    evidenceName: "Payslip_Jul.pdf 可用",
    available: true,
  },
  {
    id: "os-2",
    conditionName: "Evidence of rental income / Rental Statement",
    evidenceName: "缺失 — 需客户提供",
    available: false,
  },
  {
    id: "os-3",
    conditionName: "Signed contract of sale (all pages including special conditions)",
    evidenceName: "Contract_signed.pdf 可用",
    available: true,
  },
];

export function OsAttackDetail({ task }: OsAttackDetailProps) {
  const reduced = useReducedMotion();
  const openOsWorkbench = useUiStore((s) => s.openOsWorkbench);
  const showToast = useToastStore((s) => s.showToast);

  const handleEnterWorkbench = () => {
    openOsWorkbench(task.id);
  };

  const handleRemindClient = () => {
    showToast('info', '已生成面向客户的补件提醒邮件草稿');
  };

  return (
    <div className="space-y-6" id="os-attack-detail">
      {/* 1. OS Conditions Card */}
      <div className="rounded-2xl p-5 border space-y-4 shadow-2xs" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center space-x-2">
            <Landmark className="w-4 h-4" style={{ color: 'var(--orange)' }} />
            <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
              🏦 ANZ Outstanding 条件清单与证据映射
            </h3>
          </div>
          <span className="text-xs font-mono px-2 py-0.5 rounded font-bold" style={{ backgroundColor: 'var(--red-soft)', color: 'var(--red)' }}>
            Finance Due: 3 天内
          </span>
        </div>

        {/* Condition Cards */}
        <div className="space-y-2.5">
          {OS_CONDITIONS.map((cond) => (
            <div 
              key={cond.id}
              className="p-3.5 rounded-xl border flex items-start space-x-3 text-xs shadow-2xs transition-all"
              style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}
            >
              <div 
                className="w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ borderColor: cond.available ? 'var(--green)' : 'var(--red)', backgroundColor: 'var(--bg-card)' }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cond.available ? 'var(--green)' : 'var(--red)' }} />
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <span className="font-semibold block leading-snug" style={{ color: 'var(--text-primary)' }}>
                  {cond.conditionName}
                </span>

                <div className="flex items-center space-x-1.5 text-[11px] font-mono">
                  {cond.available ? (
                    <span className="flex items-center space-x-1 font-medium" style={{ color: 'var(--green)' }}>
                      <FileCheck className="w-3.5 h-3.5" />
                      <span>📎 证据: {cond.evidenceName}</span>
                    </span>
                  ) : (
                    <span className="flex items-center space-x-1 font-medium" style={{ color: 'var(--red)' }}>
                      <FileX className="w-3.5 h-3.5" />
                      <span>📎 证据: {cond.evidenceName}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <motion.button
            whileTap={reduced ? undefined : { scale: 0.95 }}
            onClick={handleEnterWorkbench}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer text-white shadow-xs"
            style={{ backgroundColor: 'var(--accent)' }}
            id="os-enter-workbench-btn"
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>⚡ 进入 OS 攻坚工作台</span>
          </motion.button>

          <motion.button
            whileTap={reduced ? undefined : { scale: 0.95 }}
            onClick={handleRemindClient}
            className="px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer border"
            style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            id="os-remind-client-btn"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>📧 催客户补件</span>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
