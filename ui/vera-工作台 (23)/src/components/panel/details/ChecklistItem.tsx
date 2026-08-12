import { Check } from 'lucide-react';
import { ChecklistItemType } from '../../../types';

interface ChecklistItemProps {
  item: ChecklistItemType;
  onToggle: (id: string) => void;
}

export function ChecklistItem({ item, onToggle }: ChecklistItemProps) {
  const isRequired = item.category === 'required';
  const isAiSuggested = item.category === 'ai_suggested';

  return (
    <div 
      className="p-2.5 rounded-xl border flex flex-col space-y-1 transition-all"
      style={{ 
        backgroundColor: 'var(--bg-app)', 
        borderColor: 'var(--border)' 
      }}
      id={`checklist-item-${item.id}`}
    >
      <div 
        onClick={() => !isRequired && onToggle(item.id)}
        className={`flex items-start space-x-2.5 ${isRequired ? 'cursor-default' : 'cursor-pointer select-none'}`}
      >
        {/* Custom Styled Checkbox */}
        <div 
          className={`w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 border transition-all ${
            item.checked ? 'border-transparent' : ''
          }`}
          style={{
            backgroundColor: item.checked 
              ? (isRequired ? 'var(--green)' : 'var(--accent)') 
              : 'var(--bg-card)',
            borderColor: isAiSuggested ? 'var(--yellow)' : 'var(--border)'
          }}
        >
          {item.checked && <Check className="w-3 h-3 text-white stroke-[3]" />}
        </div>

        {/* Label */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span 
              className={`text-xs font-semibold ${item.checked ? '' : 'text-muted'}`}
              style={{ color: item.checked ? 'var(--text-primary)' : 'var(--text-secondary)' }}
            >
              {item.label}
            </span>

            {isRequired && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded font-bold" style={{ backgroundColor: 'var(--green-soft)', color: 'var(--green)' }}>
                银行必选
              </span>
            )}

            {isAiSuggested && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded font-bold" style={{ backgroundColor: 'var(--yellow-soft)', color: 'var(--yellow)' }}>
                AI 建议可去勾
              </span>
            )}
          </div>

          {/* AI Reason or File Matched note */}
          {item.reason && (
            <p className="text-[11px] leading-tight mt-0.5 italic" style={{ color: 'var(--text-muted)' }}>
              "{item.reason}"
            </p>
          )}

          {item.fileMatched && (
            <p className="text-[10px] font-mono leading-tight mt-0.5" style={{ color: 'var(--green)' }}>
              ✓ 已匹配: {item.fileMatched}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
