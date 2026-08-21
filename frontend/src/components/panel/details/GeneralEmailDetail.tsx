import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Mail, Sparkles, User, UserCheck, Paperclip, FileText } from 'lucide-react';
import { TaskItem } from '../../../types';
import { useTaskStore } from '../../../stores/taskStore';
import { useUiStore } from '../../../stores/uiStore';
import { DelegateDialog } from '../DelegateDialog';
import { DelegateRequest, EmailAnalyzeResponse } from '../../../types/api';
import { analyzeEmail } from '../../../services/api/inbox';
import { useToastStore } from '../../../stores/toastStore';
import { FilePreviewPanel } from './FilePreviewPanel';

interface GeneralEmailDetailProps { task: TaskItem; }

const CATEGORY_MAP: Record<string, string> = {
  bank_os: '银行补件', bank_status: '银行进度', bank_approval: '批贷通知', valuation: '估值',
  settlement: '结算', client_doc: '客户材料', client_reply: '客户回复', new_lead: '新客户询盘',
  lender_bdm: '银行BDM/产品', newsletter_marketing: '利率/营销', colleague_internal: '内部/同事', personal_junk: '个人/垃圾',
};

export function GeneralEmailDetail({ task }: GeneralEmailDetailProps) {
  const { dispatchTaskAction, delegateTaskAction } = useTaskStore();
  const [delegateDialogOpen, setDelegateDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ name: string; docType: string } | null>(null);
  const showToast = useToastStore((s) => s.showToast);
  const attachments = task.emailAttachments ?? [];

  // AI Analysis state
  const [analysis, setAnalysis] = useState<EmailAnalyzeResponse | null>(null);

  const msgId = String(task.sourceMsgId || task.id);

  const triggerAnalyze = useCallback(async () => {
    if (!msgId) return;
    try {
      const res = await analyzeEmail(msgId);
      setAnalysis(res);
    } catch {
      // Keep existing or graceful state
    }
  }, [msgId]);

  useEffect(() => {
    triggerAnalyze();
  }, [triggerAnalyze]);

  const categoryCode = task.type === 'NEW_CLIENT' ? 'new_lead' : 'client_doc';
  const categoryText = CATEGORY_MAP[categoryCode] || '客户材料';

  const summary = analysis?.summary || task.aiSummary || '等待 AI 邮件分析...';
  const conditionsStr = Array.isArray(analysis?.conditions)
    ? analysis.conditions.join('；')
    : (analysis?.conditions || '需补齐相关材料');

  const handleDispatch = (type: string) => {
    if (type === 'me') dispatchTaskAction(task.id, 'claim');
    else if (type === 'boss') { setPresetName('Brandon'); setDelegateDialogOpen(true); }
    else if (type === 'judy') { setPresetName('Judy'); setDelegateDialogOpen(true); }
    else if (type === 'ignore') dispatchTaskAction(task.id, 'reject');
  };

  const handleDelegateSubmit = (body: DelegateRequest) => {
    delegateTaskAction(task.id, body);
    setDelegateDialogOpen(false);
  };

  return (
    <div className="space-y-4 text-xs select-none" id="general-email-detail">
      {/* 1. 核心材料与客户诉求事实 (Why & Request) */}
      <div className="rounded-2xl p-4 border space-y-3 shadow-2xs bg-[var(--bg-card)]" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-[var(--accent)]" />
            <span className="font-bold text-xs" style={{ color: 'var(--text-primary)' }}>
              客户补充材料与诉求
            </span>
          </div>

          <div className="flex items-center space-x-1.5">
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[var(--green-soft)] text-[var(--green)]">
              已归入案卷
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[var(--accent-soft)] text-[var(--accent)]">
              {categoryText}
            </span>
          </div>
        </div>

        {/* 摘要与说明 */}
        <div className="p-3 rounded-xl border space-y-1.5 leading-relaxed" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}>
          <div className="font-semibold text-xs text-[var(--text-primary)]">
            {summary}
          </div>
          {conditionsStr && (
            <div className="text-[11.5px] font-mono text-[var(--accent)] pt-1 border-t border-[var(--border)]/40 flex items-start space-x-1">
              <span className="font-bold flex-shrink-0">📋 涉及材料:</span>
              <span>{conditionsStr}</span>
            </div>
          )}
        </div>

        {/* 邮件正文/原始对话摘录 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted">
            <span className="flex items-center space-x-1">
              <Mail className="w-3.5 h-3.5 text-muted" />
              <span>来源: {task.emailFrom || task.title} · {task.createdAt || '最新'}</span>
            </span>
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="hover:underline cursor-pointer font-semibold text-[var(--accent)]"
            >
              {expanded ? '收起原文 ▴' : '展开邮件原文 ▾'}
            </button>
          </div>

          {expanded && (
            <div className="p-3 rounded-xl border text-[11.5px] leading-relaxed font-mono whitespace-pre-wrap max-h-56 overflow-y-auto" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              {task.emailBodyText || task.subtitle || "无原始长正文（已提取为结构化记录）"}
            </div>
          )}
        </div>
      </div>

      {/* 2. 关联材料与附件 (Evidence) */}
      <div className="rounded-2xl p-4 border space-y-2.5 shadow-2xs bg-[var(--bg-card)]" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between pb-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center space-x-1.5 font-bold text-xs" style={{ color: 'var(--text-primary)' }}>
            <Paperclip className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>材料附件 ({attachments.length})</span>
          </div>
          <span className="text-[11px] text-muted">点击即可原位预览</span>
        </div>

        {attachments.length === 0 ? (
          <p className="text-[11px] text-muted py-2 text-center">暂无附件（可通过左侧案卷目录补充材料）</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {attachments.map((att) => (
              <div
                key={att.id}
                onClick={() => {
                  setPreviewFile({
                    name: att.name,
                    docType: att.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image',
                  });
                }}
                className="p-2 rounded-xl border flex items-center justify-between cursor-pointer hover:border-[var(--accent)] hover:shadow-2xs transition-all"
                style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center space-x-2 min-w-0">
                  <FileText className="w-4 h-4 text-[var(--accent)] flex-shrink-0" />
                  <span className="text-xs font-mono font-medium truncate text-[var(--text-primary)]">{att.name}</span>
                </div>
                <span className="text-[11px] font-mono text-muted flex-shrink-0">{att.size}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. 立即行动栏 (Broker Actions) */}
      <div className="rounded-2xl p-4 border space-y-3 bg-[var(--bg-card)] shadow-2xs" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-1.5 text-xs font-bold text-[var(--text-primary)]">
          <span>⚡ 极速行动</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => handleDispatch('me')}
            className="px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 cursor-pointer bg-[var(--accent)] text-[var(--on-accent)] shadow-xs"
          >
            <User className="w-3.5 h-3.5" />
            <span>我来跟进</span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => handleDispatch('boss')}
            className="px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 cursor-pointer border bg-[var(--yellow-soft)] text-[var(--yellow)] border-[var(--yellow)]/30"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>转交老板</span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              useTaskStore.getState().completeTask(task.id);
              showToast('success', '已标记任务处理完毕');
              useUiStore.getState().closeTaskDetail();
            }}
            className="px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 cursor-pointer border bg-[var(--green-soft)] text-[var(--green)] border-[var(--green)]/30"
          >
            <span>✅ 标记已处理</span>
          </motion.button>
        </div>
      </div>

      <DelegateDialog open={delegateDialogOpen} presetName={presetName} onCancel={() => setDelegateDialogOpen(false)} onSubmit={handleDelegateSubmit} />
      {previewFile && (
        <FilePreviewPanel
          filename={previewFile.name}
          docType={previewFile.docType}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}
