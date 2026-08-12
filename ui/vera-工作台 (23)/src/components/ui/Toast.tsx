import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useToastStore, ToastType } from '../../stores/toastStore';

export function Toast() {
  const { toasts, dismissToast } = useToastStore();

  const getBorderColor = (type: ToastType) => {
    if (type === 'success') return 'var(--green)';
    if (type === 'error') return 'var(--red)';
    return 'var(--blue)';
  };

  const getIcon = (type: ToastType) => {
    if (type === 'success') return <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />;
    if (type === 'error') return <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
    return <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />;
  };

  return (
    <div className="fixed bottom-24 right-6 z-50 flex flex-col space-y-2 max-w-sm w-full pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            id={`toast-${toast.id}`}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 50, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="pointer-events-auto flex items-center justify-between p-3 rounded-xl border shadow-lg text-xs transition-colors"
            style={{
              backgroundColor: 'var(--bg-panel)',
              borderColor: 'var(--border)',
              borderLeftWidth: '4px',
              borderLeftColor: getBorderColor(toast.type),
              color: 'var(--text-primary)',
            }}
          >
            <div className="flex items-center space-x-2 mr-2 truncate">
              {getIcon(toast.type)}
              <span className="truncate">{toast.message}</span>
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              aria-label="关闭提示"
              className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
