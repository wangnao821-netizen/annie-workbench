import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Sparkles, MessageSquare, CheckCircle2, Copy, FileText, RefreshCw, Layers, GitBranch, X, UserCheck } from 'lucide-react';
import { ToolCard, DraftCardPayload, FlowCardVersion } from '../../types/api';
import { useToastStore } from '../../stores/toastStore';

interface FlowDialogCardProps {
  card: ToolCard;
  clientName?: string;
  lender?: string;
  onActionSubmit?: (actionData: {
    action: string;
    parent_message_id?: string;
    branch_label?: string;
    subject?: string;
    body?: string;
  }) => void;
}

export function FlowDialogCard({ card, clientName = '客户', lender = '银行', onActionSubmit }: FlowDialogCardProps) {
  const reduced = useReducedMotion();
  const rawPayload = (card.payload || {}) as unknown as DraftCardPayload;

  // Schema version fallback resolution
  const versions: FlowCardVersion[] = rawPayload.result?.versions || [
    {
      version: rawPayload.state?.version || 'v1',
      branch_label: rawPayload.state?.branch_label || 'A',
      subject: rawPayload.subject || `${card.title || '跟进邮件'} - ${clientName}`,
      body: rawPayload.body || 'Dear Assessor,\n\nPlease find attached the requested supplementary documents for review.\n\nBest regards,\nVera Broker Team',
      message_id: rawPayload.state?.message_id || 'msg-1',
    },
  ];

  const currentVersionId = rawPayload.state?.version || versions[versions.length - 1]?.version || 'v1';
  const currentBranchLabel = rawPayload.state?.branch_label || versions[versions.length - 1]?.branch_label || 'A';

  const initialActiveIndex = versions.findIndex(
    (v) => v.version === currentVersionId && (v.branch_label || 'A') === currentBranchLabel
  );

  const [activeIndex, setActiveIndex] = useState<number>(initialActiveIndex >= 0 ? initialActiveIndex : versions.length - 1);
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [editedSubject, setEditedSubject] = useState<string>('');
  const [editedBody, setEditedBody] = useState<string>('');
  const [status, setStatus] = useState<string>(rawPayload.status || 'draft');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  const activeVersionObj = versions[activeIndex] || versions[0];

  useEffect(() => {
    if (rawPayload.status) {
      setStatus(rawPayload.status);
    }
    const currentVersions = rawPayload.result?.versions || versions;
    if (currentVersions.length > 0) {
      setActiveIndex(currentVersions.length - 1);
    }
  }, [card]);

  useEffect(() => {
    if (activeVersionObj) {
      setEditedSubject(activeVersionObj.subject || rawPayload.subject || `${card.title || '邮件卡片'} - ${clientName}`);
      setEditedBody(activeVersionObj.body || rawPayload.body || '');
    }
  }, [activeIndex, activeVersionObj, card.title, clientName, rawPayload.body, rawPayload.subject]);

  const cardTypeLabel =
    card.type === 'flow_chaser'
      ? '补件催件流程'
      : card.type === 'flow_os_reply'
      ? 'OS 审贷回复流程'
      : '跟进沟通流程';

  // Handle version generation (Action: version)
  const handleGenerateNextVersion = async () => {
    setIsGenerating(true);
    try {
      if (onActionSubmit) {
        await onActionSubmit({
          action: 'version',
          parent_message_id: activeVersionObj?.message_id || rawPayload.state?.message_id || '12',
          branch_label: activeVersionObj?.branch_label || 'main',
          subject: editedSubject,
          body: editedBody,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle branch comparison (Action: branch)
  const handleGenerateBranchB = async () => {
    setIsGenerating(true);
    try {
      if (onActionSubmit) {
        await onActionSubmit({
          action: 'branch',
          parent_message_id: activeVersionObj?.message_id || rawPayload.state?.message_id || '12',
          branch_label: 'B',
          subject: editedSubject,
          body: editedBody,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle draft confirmation (Action: confirm) -> NO SEND BUTTON
  const handleConfirmDraft = async () => {
    setStatus('confirmed_draft');
    try {
      if (onActionSubmit) {
        await onActionSubmit({
          action: 'confirm',
          parent_message_id: activeVersionObj?.message_id || rawPayload.state?.message_id || '12',
          branch_label: activeVersionObj?.branch_label || 'main',
          subject: editedSubject,
          body: editedBody,
        });
      }
    } catch (err) {
      console.error(err);
    }
    setDialogOpen(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(`Subject: ${editedSubject}\n\n${editedBody}`);
    useToastStore.getState().showToast('success', '邮件正文已复制到剪贴板');
  };

  return (
    <>
      {/* 1. Chat Stream Inline Card */}
      <div
        className="p-4 rounded-2xl border shadow-2xs space-y-3 glass-panel transition-all hover:border-[var(--purple-soft)]"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
        id={`flow-dialog-card-${card.type}`}
      >
        {/* Card Header */}
        <div className="flex items-center justify-between pb-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center space-x-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-[var(--purple-soft)] text-[var(--purple)] flex-shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5 flex-wrap">
                <span className="text-xs font-extrabold truncate" style={{ color: 'var(--text-primary)' }}>
                  {card.title || '流程共创卡片'}
                </span>
                <span className="px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-[var(--purple-soft)] text-[var(--purple)] dark:text-[var(--purple)]">
                  {cardTypeLabel}
                </span>
              </div>
              <p className="text-[11px] text-muted truncate">
                面向：{clientName} · {lender}
              </p>
            </div>
          </div>

          {/* Status & Version Badges */}
          <div className="flex items-center space-x-1.5 flex-shrink-0">
            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-[var(--bg-subtle)] text-muted border border-[var(--border)]">
              {activeVersionObj.version.toUpperCase()}
              {activeVersionObj.branch_label ? ` · ${activeVersionObj.branch_label} 支` : ''}
            </span>

            {status === 'confirmed_draft' ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--green-soft)] text-[var(--green)] border border-[var(--green-soft)] flex items-center space-x-1">
                <CheckCircle2 className="w-3 h-3 text-[var(--green)]" />
                <span>已存草稿</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--yellow-soft)] text-[var(--yellow)] border border-[var(--yellow-soft)]">
                草稿共创中
              </span>
            )}
          </div>
        </div>

        {/* Card Version Switcher Tabs */}
        {versions.length > 1 && (
          <div className="flex items-center space-x-1.5 text-[11px] font-mono border-b pb-2" style={{ borderColor: 'var(--border)' }}>
            <span className="text-muted mr-1 font-bold">版本链:</span>
            {versions.map((v, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveIndex(idx)}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                  activeIndex === idx
                    ? 'bg-[var(--purple)] text-[var(--on-purple)] font-bold shadow-2xs'
                    : 'bg-[var(--bg-subtle)] text-muted hover:text-primary'
                }`}
              >
                {v.version.toUpperCase()} ({v.branch_label || 'A'})
              </button>
            ))}
          </div>
        )}

        {/* Content Body Preview */}
        <div className="p-3 rounded-xl border space-y-2 text-xs" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}>
          <div className="font-bold text-primary flex items-center justify-between">
            <span className="truncate">Subject: {editedSubject}</span>
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 text-muted hover:text-primary rounded cursor-pointer"
              title="复制文本"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-[11px] font-mono text-secondary whitespace-pre-wrap leading-relaxed max-h-28 overflow-y-auto no-scrollbar border-t pt-2" style={{ borderColor: 'var(--border)' }}>
            {editedBody}
          </div>
        </div>

        {/* Action Controls Footer (NO SEND BUTTON) */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <motion.button
            whileTap={reduced ? undefined : { scale: 0.96 }}
            onClick={() => setDialogOpen(true)}
            className="px-3 py-1.5 rounded-xl border text-xs font-bold text-[var(--purple)] bg-[var(--purple-soft)] hover:bg-[var(--purple-soft)] border-[var(--purple-soft)] flex items-center space-x-1.5 cursor-pointer"
            id={`open-dialog-btn-${card.type}`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>💬 展开共创深谈</span>
          </motion.button>

          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <motion.button
              whileTap={reduced ? undefined : { scale: 0.95 }}
              onClick={handleGenerateNextVersion}
              disabled={isGenerating}
              className="px-2.5 py-1.5 rounded-xl border text-xs font-semibold text-secondary hover:text-primary hover:bg-[var(--bg-subtle)] cursor-pointer flex items-center space-x-1"
              style={{ borderColor: 'var(--border)' }}
            >
              <RefreshCw className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
              <span>生成下一版</span>
            </motion.button>

            <motion.button
              whileTap={reduced ? undefined : { scale: 0.95 }}
              onClick={handleGenerateBranchB}
              disabled={isGenerating}
              className="px-2.5 py-1.5 rounded-xl border text-xs font-semibold text-secondary hover:text-primary hover:bg-[var(--bg-subtle)] cursor-pointer flex items-center space-x-1"
              style={{ borderColor: 'var(--border)' }}
            >
              <GitBranch className="w-3 h-3 text-[var(--accent)]" />
              <span>对比方案 B</span>
            </motion.button>

            <motion.button
              whileTap={reduced ? undefined : { scale: 0.96 }}
              onClick={handleConfirmDraft}
              className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-xs hover:opacity-90"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
              id={`confirm-draft-btn-${card.type}`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>确认存入草稿箱</span>
            </motion.button>
          </div>
        </div>
      </div>

      {/* 2. Co-creation Deep Discussion Modal (共创深谈弹窗) */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-app)]/80 backdrop-blur-sm animate-in fade-in duration-200">
          <motion.div
            initial={reduced ? undefined : { scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { scale: 0.95, opacity: 0  }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-2xl rounded-2xl border shadow-2xl p-6 space-y-5 flex flex-col max-h-[90vh] glass-panel"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
            id="flow-co-creation-dialog"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-[var(--purple-soft)] text-[var(--purple)] flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>
                      {card.title || '流程卡片弹窗共创'}
                    </h2>
                    <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-[var(--purple-soft)] text-[var(--purple)]">
                      WO-27 Dialog
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    客户：<strong>{clientName}</strong> · 对接机构：<strong>{lender}</strong>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="p-1.5 rounded-xl border text-muted hover:text-primary cursor-pointer hover:bg-[var(--bg-subtle)]"
                style={{ borderColor: 'var(--border)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Version switcher bar */}
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--bg-subtle)] border text-xs" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-[var(--purple)]" />
                <span className="font-bold text-primary">演化版本链 ({versions.length} 个版本):</span>
              </div>
              <div className="flex items-center space-x-1.5 font-mono">
                {versions.map((v, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveIndex(idx)}
                    className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer font-bold ${
                      activeIndex === idx
                        ? 'bg-[var(--purple)] text-[var(--on-purple)] shadow-xs'
                        : 'bg-[var(--bg-subtle)] text-muted hover:text-primary'
                    }`}
                  >
                    {v.version.toUpperCase()} ({v.branch_label || 'A'})
                  </button>
                ))}
              </div>
            </div>

            {/* Editable Content Panel */}
            <div className="space-y-3 flex-1 overflow-y-auto no-scrollbar">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted block">邮件主题 (Subject)</label>
                <input
                  type="text"
                  value={editedSubject}
                  onChange={(e) => setEditedSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border text-xs outline-none focus:border-[var(--purple)]"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-muted block">英文沟通正文 (Body - 可实时微调编辑)</label>
                  <span className="text-[11px] text-muted font-mono">English Language Standard</span>
                </div>
                <textarea
                  rows={8}
                  value={editedBody}
                  onChange={(e) => setEditedBody(e.target.value)}
                  className="w-full p-3 rounded-xl border text-xs font-mono leading-relaxed outline-none focus:border-[var(--purple)] no-scrollbar"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            {/* Modal Foot Actions (NO SEND BUTTON) */}
            <div className="pt-3 border-t flex flex-col sm:flex-row items-center justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center space-x-2 text-[11px] text-muted font-mono">
                <UserCheck className="w-3.5 h-3.5 text-[var(--green)]" />
                <span>Broker 确认出口：只存草稿箱，无自动发送权限</span>
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                <motion.button
                  whileTap={reduced ? undefined : { scale: 0.95 }}
                  onClick={handleGenerateNextVersion}
                  disabled={isGenerating}
                  className="px-3 py-2 rounded-xl border text-xs font-bold text-secondary hover:text-primary cursor-pointer flex items-center space-x-1"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                  <span>生成下一版</span>
                </motion.button>

                <motion.button
                  whileTap={reduced ? undefined : { scale: 0.95 }}
                  onClick={handleGenerateBranchB}
                  disabled={isGenerating}
                  className="px-3 py-2 rounded-xl border text-xs font-bold text-secondary hover:text-primary cursor-pointer flex items-center space-x-1"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <GitBranch className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>方案对比 B</span>
                </motion.button>

                <motion.button
                  whileTap={reduced ? undefined : { scale: 0.96 }}
                  onClick={handleConfirmDraft}
                  className="px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-md hover:opacity-90"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
                  id="dialog-confirm-save-draft-btn"
                >
                  <FileText className="w-4 h-4" />
                  <span>确认此版本 (装草稿箱)</span>
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
