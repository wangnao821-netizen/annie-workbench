import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CheckCircle2, ChevronDown, ChevronUp, Clock, FileCheck } from 'lucide-react';
import { ContextEvent } from '../../types/api';

interface ConfirmCardProps {
  event: ContextEvent;
  onConfirm: (id: number) => void;
  onDismiss: (id: number) => void;
}

export function ConfirmCard({ event, onConfirm, onDismiss }: ConfirmCardProps) {
  const [expanded, setExpanded] = useState(false);
  const reduced = useReducedMotion();

  const isLong = event.content.length > 80;

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={{ type: 'spring', damping: 25, stiffness: 350 }}
      className="p-3.5 rounded-2xl border space-y-2.5 my-2 shadow-xs"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      id={`confirm-card-${event.id}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <FileCheck className="w-4 h-4 text-amber-500" />
          <span className="font-extrabold text-xs" style={{ color: 'var(--text-primary)' }}>待确认记录</span>
          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            {event.source_type}
          </span>
        </div>
        {event.created_at && (
          <span className="text-[10px] text-muted flex items-center space-x-1">
            <Clock className="w-3 h-3" />
            <span>{event.created_at}</span>
          </span>
        )}
      </div>

      <div className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>
        <p className={!expanded && isLong ? 'line-clamp-3' : ''}>
          {event.content}
        </p>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] font-bold text-purple-500 hover:underline flex items-center space-x-0.5 mt-1 cursor-pointer"
          >
            <span>{expanded ? '收起' : '展开全文'}</span>
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      <div className="flex items-center justify-end space-x-2 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => onDismiss(event.id)}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer hover:opacity-80 transition-opacity"
          style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          id={`confirm-card-dismiss-${event.id}`}
        >
          稍后
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => onConfirm(event.id)}
          className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white flex items-center space-x-1 cursor-pointer shadow-xs"
          style={{ backgroundColor: 'var(--accent)' }}
          id={`confirm-card-accept-${event.id}`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>确认</span>
        </motion.button>
      </div>
    </motion.div>
  );
}
