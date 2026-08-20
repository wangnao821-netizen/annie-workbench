import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';

interface ContextDrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function ContextDrawer({ open, title, onClose, children }: ContextDrawerProps) {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          {/* Backdrop */}
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0  }}
            animate={{ opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0  }}
            onClick={onClose}
            className="fixed inset-0 bg-[var(--bg-app)]/60 backdrop-blur-xs"
          />

          {/* Drawer Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="relative w-[420px] max-w-full h-full border-l flex flex-col shadow-2xl z-10"
            style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
            id="context-drawer"
          >
            {/* Header */}
            <div
              className="px-5 py-4 border-b flex items-center justify-between flex-shrink-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <h3 className="text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>
                {title}
              </h3>
              <button
                onClick={onClose}
                aria-label="关闭抽屉"
                className="p-1.5 rounded-lg hover:opacity-80 transition-opacity cursor-pointer"
                style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)' }}
                id="context-drawer-close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 no-scrollbar">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
