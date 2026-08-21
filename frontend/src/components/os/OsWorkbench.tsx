import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, Zap, Clock, Building2, User } from 'lucide-react';
import { useTaskStore } from '../../stores/taskStore';
import { OsConditionsColumn } from './OsConditionsColumn';
import { OsStrategyColumn } from './OsStrategyColumn';
import { OsDraftColumn } from './OsDraftColumn';

interface OsWorkbenchProps {
  taskId: number;
  onClose: () => void;
}

export function OsWorkbench({ taskId, onClose }: OsWorkbenchProps) {
  const reduced = useReducedMotion();
  const tasks = useTaskStore((s) => s.tasks);
  const task = tasks.find((t) => t.id === taskId);

  const clientName = task?.caseName || '客户';
  const lender = task?.caseBank || 'ANZ Bank';
  const stage = 'OS 条件解下攻坚';
  const deadline = 'Finance Due: 3 天内';

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: 24 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className="fixed inset-0 z-40 flex flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--bg-app)' }}
      id="os-workbench-overlay"
    >
      {/* Top Header Summary Bar */}
      <div 
        className="px-6 py-3.5 border-b flex items-center justify-between flex-shrink-0 shadow-2xs"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
        id="os-workbench-header"
      >
        <div className="flex items-center space-x-4">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 cursor-pointer transition-colors shadow-2xs"
            style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            id="os-workbench-back"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>返回任务队列</span>
          </motion.button>

          <div className="h-4 w-[1px]" style={{ backgroundColor: 'var(--border)' }} />

          <div className="flex items-center space-x-3 text-xs">
            <span className="font-extrabold flex items-center space-x-1.5" style={{ color: 'var(--text-primary)' }}>
              <Zap className="w-4 h-4 text-[var(--purple)] fill-[var(--purple-soft)]" />
              <span>OS 攻坚专属工作台</span>
            </span>

            <div className="flex items-center space-x-2 text-[11px] font-mono text-muted">
              <span className="flex items-center space-x-1">
                <User className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{clientName}</span>
              </span>
              <span>•</span>
              <span className="flex items-center space-x-1">
                <Building2 className="w-3.5 h-3.5 text-[var(--green)]" />
                <span>{lender}</span>
              </span>
              <span>•</span>
              <span className="px-2 py-0.5 rounded font-bold text-[var(--purple)] bg-[var(--purple-soft)]">
                {stage}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center space-x-1 bg-[var(--red-soft)] text-[var(--red)] border border-[var(--red-soft)]">
            <Clock className="w-3.5 h-3.5" />
            <span>{deadline}</span>
          </span>
        </div>
      </div>

      {/* 3-Column Content Body */}
      <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
        <div className="flex flex-col xl:flex-row gap-6 h-full min-h-[500px]">
          {/* Column 1: OS Conditions & Evidence */}
          <OsConditionsColumn />

          <div className="hidden xl:block w-[1px] my-2" style={{ backgroundColor: 'var(--border)' }} />

          {/* Column 2: AI Strategies */}
          <OsStrategyColumn caseName={clientName} lender={lender} />

          <div className="hidden xl:block w-[1px] my-2" style={{ backgroundColor: 'var(--border)' }} />

          {/* Column 3: Bilingual Draft & Guardrail */}
          <OsDraftColumn caseName={clientName} lender={lender} />
        </div>
      </div>
    </motion.div>
  );
}
