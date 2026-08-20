import { motion, useReducedMotion } from 'motion/react';
import { ShieldAlert, X } from 'lucide-react';
import { useModeStore } from '../../stores/modeStore';

export function SubmissionBanner() {
  const mode = useModeStore((s) => s.mode);
  const setMode = useModeStore((s) => s.setMode);
  const reduced = useReducedMotion();

  if (mode !== 'external') {
    return null;
  }

  return (
    <motion.div
      id="submission-banner"
      initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0, y: -8 }}
      animate={{ height: 'auto', opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0, y: -8 }}
      transition={
        reduced
          ? { duration: 0.15 }
          : { type: 'spring', damping: 25, stiffness: 300 }
      }
      className="flex-shrink-0 overflow-hidden border-b bg-[var(--yellow-soft)] backdrop-blur-md border-[var(--yellow-soft)] text-[var(--yellow)] dark:text-[var(--yellow)]"
    >
      <div className="px-4 py-2 flex items-center justify-between text-xs font-semibold">
        <div className="flex items-center space-x-2 truncate">
          <ShieldAlert className="w-4 h-4 text-[var(--yellow)] flex-shrink-0" />
          <span className="truncate">
            🟡 递交模式：AI 只引用已披露/外线内容
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMode('internal')}
          id="exit-submission-mode-btn"
          className="ml-3 px-2.5 py-1 rounded-lg border text-[11px] font-bold bg-[var(--yellow-soft)] border-[var(--yellow-soft)] text-[var(--yellow)] hover:bg-[var(--yellow)]/30 transition-colors cursor-pointer flex items-center space-x-1 flex-shrink-0"
        >
          <span>退出递交</span>
          <X className="w-3 h-3" />
        </button>
      </div>
    </motion.div>
  );
}
