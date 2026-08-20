import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { FileText, Eye, AlertCircle, Check, Edit2 } from 'lucide-react';
import { useToastStore } from '../../../stores/toastStore';

export interface FieldItem {
  label: string;
  value: string;
  fieldType: 'date' | 'currency' | 'percentage' | 'text';
  confidence?: number;
}

interface FileFieldsPanelProps {
  fileId: string;
  filename: string;
  docType: string;
  fields: FieldItem[];
  onPreviewClick?: () => void;
}

export function FileFieldsPanel({
  fileId,
  filename,
  docType,
  fields: initialFields,
  onPreviewClick,
}: FileFieldsPanelProps) {
  const reduced = useReducedMotion();
  const [fields, setFields] = useState<FieldItem[]>(initialFields);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');
  const showToast = useToastStore((s) => s.showToast);

  const saveEdit = (idx: number) => {
    const updated = [...fields];
    updated[idx].value = editVal;
    setFields(updated);
    setEditingIdx(null);
    showToast('success', `字段「${updated[idx].label}」已更新为 ${editVal}`);
    // TODO(WO-03): POST /api/files/${fileId}/fields
  };

  const formatDisplay = (val: string, type: FieldItem['fieldType']) => {
    if (type === 'currency' && !val.startsWith('$')) return `$${val}`;
    if (type === 'percentage' && !val.endsWith('%')) return `${val}%`;
    return val;
  };

  return (
    <div
      className="p-4 rounded-2xl border space-y-3 shadow-2xs"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      id="file-fields-panel"
    >
      <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2 min-w-0">
          <FileText className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
          <button onClick={onPreviewClick} className="text-xs font-bold hover:underline truncate cursor-pointer" style={{ color: 'var(--text-primary)' }}>
            {filename}
          </button>
          <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-[var(--purple-soft)] text-[var(--purple)] flex-shrink-0">
            {docType}
          </span>
        </div>
        {onPreviewClick && (
          <motion.button
            whileTap={reduced ? undefined : { scale: 0.95 }}
            onClick={onPreviewClick}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border flex items-center space-x-1 cursor-pointer"
            style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            id={`file-fields-preview-btn-${fileId}`}
          >
            <Eye className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>预览</span>
          </motion.button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {fields.map((field, idx) => {
          const confidence = field.confidence ?? 92;
          const isLowConf = confidence < 80;
          const isEditing = editingIdx === idx;

          return (
            <div
              key={idx}
              className="p-2.5 rounded-xl border flex flex-col justify-between space-y-1"
              style={{
                backgroundColor: isLowConf ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-app)',
                borderColor: isLowConf ? 'rgba(245, 158, 11, 0.3)' : 'var(--border)',
              }}
            >
              <div className="flex items-center justify-between text-[11px] text-muted">
                <span>{field.label}</span>
                <span className={`font-mono text-[11px] ${isLowConf ? 'text-[var(--yellow)] font-bold' : 'text-[var(--green)] font-semibold'}`}>
                  {confidence}%
                </span>
              </div>

              {isEditing ? (
                <div className="flex items-center space-x-1.5 pt-0.5">
                  <input
                    type="text"
                    value={editVal}
                    onChange={(e) => setEditVal(e.target.value)}
                    className="flex-1 px-2 py-1 rounded-lg border text-xs font-mono outline-none"
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--accent)', color: 'var(--text-primary)' }}
                    autoFocus
                  />
                  <button onClick={() => saveEdit(idx)} className="p-1.5 rounded-lg bg-[var(--accent)] text-[var(--on-accent)] cursor-pointer">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between group pt-0.5">
                  <span className="text-xs font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                    {formatDisplay(field.value, field.fieldType)}
                  </span>
                  <button onClick={() => { setEditingIdx(idx); setEditVal(field.value); }} className="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-primary transition-opacity cursor-pointer">
                    <Edit2 className="w-3 h-3" />
                  </button>
                </div>
              )}

              {isLowConf && (
                <div className="flex items-center space-x-1 text-[11px] text-[var(--yellow)] font-semibold pt-0.5">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  <span>建议人工核对</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
