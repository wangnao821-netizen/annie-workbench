import { motion, useReducedMotion } from 'motion/react';

export function TaskSkeleton() {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0.6  }}
      animate={{ opacity: [0.6, 1, 0.6] }}
      transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
      className="p-3.5 rounded-2xl border space-y-2.5"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center space-x-2.5">
        <div className="w-8 h-8 rounded-xl flex-shrink-0" style={{ backgroundColor: 'var(--bg-input)' }} />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 rounded w-3/4" style={{ backgroundColor: 'var(--bg-input)' }} />
          <div className="h-2.5 rounded w-1/2" style={{ backgroundColor: 'var(--border)' }} />
        </div>
      </div>
      <div className="h-8 rounded-xl" style={{ backgroundColor: 'var(--bg-input)' }} />
      <div className="flex justify-between items-center pt-1">
        <div className="h-3 rounded w-16" style={{ backgroundColor: 'var(--border)' }} />
        <div className="h-3 rounded w-12" style={{ backgroundColor: 'var(--border)' }} />
      </div>
    </motion.div>
  );
}
