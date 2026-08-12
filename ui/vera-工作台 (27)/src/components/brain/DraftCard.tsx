import { useState } from 'react';
import { Mail, CheckCircle, AlertTriangle, Copy, Languages, ChevronDown, ChevronUp } from 'lucide-react';
import { DraftPayload } from '../../types/api';
import { useToastStore } from '../../stores/toastStore';

interface DraftCardProps {
  draft: DraftPayload;
  clientName: string;
  lender: string;
}

export function DraftCard({ draft, clientName, lender }: DraftCardProps) {
  const [expanded, setExpanded] = useState(true);
  const showToast = useToastStore((s) => s.showToast);

  const needsReview = draft.disclosure?.needs_review ?? false;
  const items = draft.disclosure?.items || [];
  const undisclosedItems = items.filter((item) => !item.disclosed);
  const hasUndisclosed = needsReview && undisclosedItems.length > 0;

  const handleActionToast = () => {
    showToast('info', 'WO-18 后可用');
  };

  return (
    <div
      className="p-3.5 rounded-2xl border space-y-3 shadow-xs transition-all text-xs my-2"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      id="draft-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2 truncate">
          <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <Mail className="w-4 h-4" />
          </div>
          <span className="font-extrabold text-xs truncate" style={{ color: 'var(--text-primary)' }}>
            {draft.subject || '邮件草稿'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-muted hover:text-primary p-1 rounded-lg"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Mandatory Client Confirmation Line */}
      <div className="px-2.5 py-1.5 rounded-xl border bg-black/5 dark:bg-white/5 font-semibold text-[11px] flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <span className="text-muted">收件客户确认</span>
        <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
          {clientName || '客户'} {lender ? `（${lender}）` : ''}
        </span>
      </div>

      {expanded && (
        <>
          {/* Email Body */}
          <div className="p-3 rounded-xl border bg-black/5 dark:bg-white/5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-text" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
            {draft.body}
          </div>

          {/* Disclosure Check Section */}
          <div>
            {hasUndisclosed ? (
              <div className="p-2.5 rounded-xl border bg-amber-500/10 border-amber-500/20 text-amber-900 dark:text-amber-200 text-[11px] space-y-1">
                <div className="flex items-center space-x-1.5 font-bold text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>以下信息未标记可披露：</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 opacity-90 pl-1">
                  {undisclosedItems.map((item, idx) => (
                    <li key={idx}>
                      <code className="font-mono bg-amber-500/20 px-1 py-0.5 rounded text-[10px] mr-1">{item.fact_key}</code>
                      {item.text && <span>({item.text})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="p-2 rounded-xl border bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[11px] flex items-center space-x-1.5 font-bold">
                <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>✅ 披露检查通过</span>
              </div>
            )}
          </div>

          {/* Bottom Action Buttons */}
          <div className="flex items-center justify-end space-x-2 pt-1">
            <button
              type="button"
              onClick={handleActionToast}
              className="px-3 py-1.5 rounded-xl border text-[11px] font-semibold cursor-pointer hover:opacity-80 transition-opacity flex items-center space-x-1"
              style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              id="draft-translate-btn"
            >
              <Languages className="w-3.5 h-3.5" />
              <span>翻译英文</span>
            </button>
            <button
              type="button"
              onClick={handleActionToast}
              className="px-3 py-1.5 rounded-xl text-[11px] font-semibold text-white cursor-pointer hover:opacity-90 transition-opacity flex items-center space-x-1 shadow-xs"
              style={{ backgroundColor: 'var(--accent)' }}
              id="draft-copy-btn"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>复制</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
