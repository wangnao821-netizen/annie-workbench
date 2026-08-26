import { useState } from 'react';
import { Mail, CheckCircle2, AlertTriangle, Copy, Languages, ChevronDown, ChevronUp, Sparkles, FolderDown, Check } from 'lucide-react';
import { DraftPayload } from '../../types/api';
import { createManualDraft } from '../../services/api/drafts';
import { useToastStore } from '../../stores/toastStore';

interface DraftCardProps {
  draft: DraftPayload;
  clientName: string;
  lender: string;
  version?: string;
  body_cn?: string;
  caseId?: string;
}

export function DraftCard({ draft, clientName, lender, version = 'V1', body_cn, caseId }: DraftCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [showCnTranslation, setShowCnTranslation] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const showToast = useToastStore((s) => s.showToast);

  const needsReview = draft.disclosure?.needs_review ?? false;
  const items = draft.disclosure?.items || [];
  const undisclosedItems = items.filter((item) => !item.disclosed);
  const hasUndisclosed = needsReview && undisclosedItems.length > 0;

  const handleCopy = () => {
    if (draft.body) {
      navigator.clipboard.writeText(draft.body);
      setCopied(true);
      showToast('success', '已复制英文邮件正文');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSaveToDraftsBox = async () => {
    if (!caseId) {
      showToast('info', '请先在左侧选择案件，再保存至草稿箱');
      return;
    }
    setSaving(true);
    try {
      await createManualDraft({
        case_id: caseId,
        subject: draft.subject || `邮件草稿 (${version})`,
        body: draft.body || '',
        track: 'internal',
      });
      setIsSaved(true);
      showToast('success', '已存入草稿箱 (只出草稿，绝不自动发送)');
      window.dispatchEvent(new CustomEvent('drafts_updated'));
    } catch (err: any) {
      showToast('error', `存入草稿箱失败: ${err?.detail || err?.message || '未知错误'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenFullscreenCoCreate = () => {
    window.dispatchEvent(
      new CustomEvent('open-co-create-flow', {
        detail: { flowKey: 'followup', caseId },
      })
    );
  };

  const chineseText = body_cn || (draft.body
    ? `尊敬的审贷团队：\n\n关于 ${clientName} (${lender || '贷款机构'}) 的贷款申请：\n现呈递经核对的补充材料与说明，请协助审查。如有任何疑问请随时与我们联系。\n\n此致，\nEverstones 金融团队`
    : '暂无中文翻译对照');

  return (
    <div
      className="p-3.5 rounded-2xl border space-y-3 shadow-xs transition-all text-xs my-2 select-text"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      id="draft-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2 truncate">
          <div className="p-1.5 rounded-lg bg-[var(--purple-soft)] text-[var(--purple)] flex-shrink-0">
            <Mail className="w-4 h-4" />
          </div>
          <div className="flex items-center space-x-1.5 truncate">
            <span className="font-extrabold text-xs truncate" style={{ color: 'var(--text-primary)' }}>
              {draft.subject || '邮件草稿'}
            </span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold font-mono bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-soft)]">
              {version}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-muted hover:text-primary p-1 rounded-lg cursor-pointer"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Target Recipient Line */}
      <div className="px-2.5 py-1.5 rounded-xl border bg-[var(--bg-input)] font-semibold text-[11px] flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <span className="text-muted">收件对象</span>
        <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
          {clientName || '客户'} {lender ? `（${lender}）` : ''}
        </span>
      </div>

      {expanded && (
        <>
          {/* Email English Body */}
          <div className="p-3.5 rounded-xl border bg-[var(--bg-input)] font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-text" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
            {draft.body}
          </div>

          {/* Chinese Translation Panel */}
          {showCnTranslation && (
            <div className="p-3.5 rounded-xl border bg-[var(--purple-soft)] border-[var(--purple-soft)] text-[11px] leading-relaxed space-y-1.5">
              <div className="font-bold text-[var(--purple)] flex items-center space-x-1">
                <Languages className="w-3.5 h-3.5" />
                <span>中文对照参考 (方便快速核对)</span>
              </div>
              <p className="whitespace-pre-wrap font-sans" style={{ color: 'var(--text-primary)' }}>
                {chineseText}
              </p>
            </div>
          )}

          {/* Disclosure Check Section */}
          {hasUndisclosed ? (
            <div className="p-2.5 rounded-xl border bg-[var(--yellow-soft)] border-[var(--yellow-soft)] text-[var(--yellow)] text-[11px] space-y-1">
              <div className="flex items-center space-x-1.5 font-bold text-[var(--yellow)]">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>以下信息未在主系统登记可披露：</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 opacity-90 pl-1">
                {undisclosedItems.map((item, idx) => (
                  <li key={idx}>
                    <code className="font-mono bg-[var(--yellow-soft)] px-1 py-0.5 rounded text-xs mr-1">{item.fact_key}</code>
                    {item.text && <span>({item.text})</span>}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="p-2 rounded-xl border bg-[var(--green-soft)] border-[var(--green-soft)] text-[var(--green)] text-[11px] flex items-center space-x-1.5 font-bold">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              <span>✅ 仅含合规已披露数据（只出草稿，绝不自动发送）</span>
            </div>
          )}

          {/* Bottom Action Buttons */}
          <div className="flex items-center justify-between pt-1 border-t flex-wrap gap-2" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => setShowCnTranslation(!showCnTranslation)}
                className="px-2.5 py-1.5 rounded-xl border text-[11px] font-bold cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors flex items-center space-x-1"
                style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                id="draft-translate-btn"
              >
                <Languages className="w-3.5 h-3.5" />
                <span>{showCnTranslation ? '隐藏中文' : '中文对照'}</span>
              </button>

              <button
                type="button"
                onClick={handleCopy}
                className="px-2.5 py-1.5 rounded-xl border text-[11px] font-bold cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors flex items-center space-x-1"
                style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                id="draft-copy-btn"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[var(--green)]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? '已复制' : '复制英文'}</span>
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleSaveToDraftsBox}
                disabled={saving || isSaved}
                className="px-3 py-1.5 rounded-xl text-[11px] font-bold border flex items-center space-x-1 cursor-pointer transition-colors shadow-2xs hover:bg-[var(--bg-card-hover)] disabled:opacity-60"
                style={{
                  borderColor: 'var(--border)',
                  backgroundColor: isSaved ? 'var(--green-soft)' : 'var(--bg-card)',
                  color: isSaved ? 'var(--green)' : 'var(--text-primary)',
                }}
                id="draft-save-box-btn"
              >
                <FolderDown className="w-3.5 h-3.5" />
                <span>{isSaved ? '已存入草稿箱' : saving ? '正在保存...' : '存入草稿箱'}</span>
              </button>

              <button
                type="button"
                onClick={handleOpenFullscreenCoCreate}
                className="px-3 py-1.5 rounded-xl text-[11px] font-bold text-white cursor-pointer hover:opacity-90 transition-opacity flex items-center space-x-1 shadow-xs btn-primary"
                id="draft-fullscreen-cocreate-btn"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>全屏深谈共创 →</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
