import { Check, Undo2, FileCheck, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';
import { ChecklistItemType } from '../../../types';

interface ChecklistItemProps {
  item: ChecklistItemType;
  onToggle: (id: string) => void;
  onRevoke?: (id: string, fileId?: string) => void;
  onPreviewFile?: (fileId?: string, filename?: string) => void;
}

export function ChecklistItem({ item, onToggle, onRevoke, onPreviewFile }: ChecklistItemProps) {
  const isRequired = item.category === 'required';
  const isAiSuggested = item.category === 'ai_suggested';
  const isReceived = item.checked || item.status === 'received' || item.status === 'confirmed';
  const hasMatchedFile = Boolean(item.fileMatched || item.fileId);

  return (
    <div
      className={`p-3 rounded-xl border flex flex-col space-y-1.5 transition-all ${
        isReceived ? 'bg-[var(--bg-card)] border-[var(--border)]' : 'bg-[var(--bg-app)] border-[var(--border)]'
      }`}
      style={{
        borderColor: isReceived ? 'var(--border)' : 'var(--border)',
      }}
      id={`checklist-item-${item.id}`}
    >
      <div
        onClick={() => onToggle(item.id)}
        className="flex items-start space-x-2.5 cursor-pointer select-none"
      >
        {/* Checkbox */}
        <motion.div
          whileTap={{ scale: 0.92 }}
          className={`w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 border transition-all ${
            isReceived ? 'border-transparent' : ''
          }`}
          style={{
            backgroundColor: isReceived
              ? isRequired
                ? 'var(--green)'
                : 'var(--accent)'
              : 'var(--bg-card)',
            borderColor: isAiSuggested ? 'var(--yellow)' : 'var(--border)',
          }}
          id={`checklist-checkbox-${item.id}`}
        >
          {isReceived && <Check className="w-3 h-3 text-white stroke-[3]" />}
        </motion.div>

        {/* Label and badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-xs font-semibold ${isReceived ? 'text-primary' : 'text-muted'}`}
              style={{ color: isReceived ? 'var(--text-primary)' : 'var(--text-secondary)' }}
            >
              {item.label}
            </span>

            <div className="flex items-center space-x-1.5 flex-shrink-0">
              {item.isAutoMatched && (
                <span className="text-xs font-mono px-1.5 py-0.5 rounded-full font-bold bg-[var(--green-soft)] text-[var(--green)] border border-[var(--green-soft)]">
                  已收（自动）
                </span>
              )}

              {isRequired && !item.isAutoMatched && (
                <span className="text-xs font-mono px-1.5 py-0.5 rounded-full font-bold bg-[var(--green-soft)] text-[var(--green)] border border-[var(--green-soft)]">
                  银行必选
                </span>
              )}

              {isAiSuggested && !item.isAutoMatched && (
                <span className="text-xs font-mono px-1.5 py-0.5 rounded-full font-bold bg-[var(--yellow-soft)] text-[var(--yellow)] border border-[var(--yellow-soft)]">
                  AI 建议
                </span>
              )}
            </div>
          </div>

          {/* AI Reason note */}
          {item.reason && (
            <p className="text-[11px] leading-tight mt-0.5 text-muted italic">
              "{item.reason}"
            </p>
          )}

          {/* Matched File Traceability Capsule & Revoke Button */}
          {isReceived && hasMatchedFile && item.fileMatched && (
            <div className="flex items-center justify-between mt-2 pt-1.5 border-t flex-wrap gap-1.5" style={{ borderColor: 'var(--border)' }}>
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onPreviewFile) {
                    onPreviewFile(item.fileId || item.fileMatched, item.fileMatched);
                  }
                }}
                title={`点击查看已匹配文件: ${item.fileMatched}`}
                className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[var(--green-soft)] text-[var(--green)] border border-[var(--green-soft)] hover:border-[var(--green)] hover:shadow-xs transition-all cursor-pointer max-w-[260px] truncate"
                id={`checklist-matched-file-${item.id}`}
              >
                <FileCheck className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">✓ 已自动关联: {item.fileMatched}</span>
                <ExternalLink className="w-2.5 h-2.5 opacity-70 flex-shrink-0 ml-0.5" />
              </motion.button>

              {(item.isAutoMatched || item.fileId) && onRevoke && (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRevoke(item.id, item.fileId);
                  }}
                  className="px-2 py-0.5 rounded-md text-xs font-bold text-[var(--red)] bg-[var(--red-soft)] hover:bg-[var(--red-soft)] flex items-center space-x-1 transition-colors cursor-pointer ml-auto"
                  title="撤销文件自动匹配"
                  id={`revoke-btn-${item.id}`}
                >
                  <Undo2 className="w-3 h-3 stroke-[2.5]" />
                  <span>撤销</span>
                </motion.button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
