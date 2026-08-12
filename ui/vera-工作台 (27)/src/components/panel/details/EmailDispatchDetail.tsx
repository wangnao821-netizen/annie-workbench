import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Mail, UserCheck, User, Clock, VolumeX, Sparkles, Paperclip, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { TaskItem } from '../../../types';
import { useTaskStore } from '../../../stores/taskStore';
import { DelegateDialog } from '../DelegateDialog';
import { DelegateRequest } from '../../../types/api';
import { DraftEditor } from '../DraftEditor';
import { muteSender } from '../../../services/api/inbox';
import { useToastStore } from '../../../stores/toastStore';
import { FilePreviewPanel } from './FilePreviewPanel';

interface EmailDispatchDetailProps { task: TaskItem; }

const CATEGORY_MAP: Record<string, string> = {
  bank_os: '银行补件', bank_status: '银行进度', bank_approval: '批贷通知', valuation: '估值',
  settlement: '结算', client_doc: '客户材料', client_reply: '客户回复', new_lead: '新客户询盘',
  lender_bdm: '银行BDM/产品', newsletter_marketing: '利率/营销', colleague_internal: '内部/同事', personal_junk: '个人/垃圾',
};

const MOCK_ATTACHMENTS = [
  { id: 'att-1', name: 'Payslip_Jul.pdf', size: '1.2 MB' },
  { id: 'att-2', name: 'Contract_of_Sale.pdf', size: '3.4 MB' },
];

export function EmailDispatchDetail({ task }: EmailDispatchDetailProps) {
  const { dispatchTaskAction, delegateTaskAction } = useTaskStore();
  const [delegateDialogOpen, setDelegateDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ name: string; docType: string } | null>(null);
  const reduced = useReducedMotion();
  const showToast = useToastStore((s) => s.showToast);

  const match = task.meta?.match(/(\d+)%/);
  const confidence = match ? `${match[1]}%` : '--';

  const channelMap: Record<string, string> = { email: '邮件', file: '文件', wechat: '微信', manual: '手动' };
  const channelText = channelMap[task.sourceChannel || 'email'] || '邮件';

  const prioText = { urgent: '🔥 紧急', high: '✨ 高', normal: '普通', low: '低' }[task.priority] || '普通';
  const categoryText = CATEGORY_MAP['bank_os'] || '银行补件';

  const handleDispatch = (type: string) => {
    if (type === 'me') dispatchTaskAction(task.id, 'approve');
    else if (type === 'boss') { setPresetName('Brandon'); setDelegateDialogOpen(true); }
    else if (type === 'judy') { setPresetName('Judy'); setDelegateDialogOpen(true); }
    else if (type === 'ignore') dispatchTaskAction(task.id, 'reject');
  };

  const handleDelegateSubmit = (body: DelegateRequest) => {
    delegateTaskAction(task.id, body);
    setDelegateDialogOpen(false);
  };

  const handleMuteSender = async () => {
    if (!task.sourceMsgId) return;
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      showToast('info', '（演示）已静音该发件人');
      return;
    }
    try {
      await muteSender(task.sourceMsgId);
      showToast('success', '已静音该发件人');
    } catch {
      showToast('error', '静音失败');
    }
  };

  return (
    <div className="space-y-5" id="email-dispatch-detail">
      {/* 1. AI Analysis Result Section */}
      <div className="rounded-2xl p-4 border space-y-2.5 shadow-2xs" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }} id="email-ai-analysis">
        <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>AI 邮件智能分析</span>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400" id="email-category-tag">
            {categoryText}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="col-span-2 p-2.5 rounded-xl border space-y-1" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}>
            <span className="text-[10px] text-muted">AI 摘要</span>
            <p className="font-medium text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>
              {task.aiSummary || '等待 AI 分析...'}
            </p>
          </div>
          <div className="p-2.5 rounded-xl border space-y-1" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}>
            <span className="text-[10px] text-muted">匹配度 / 渠道</span>
            <div className="font-mono font-bold flex items-center justify-between" style={{ color: 'var(--text-primary)' }}>
              <span>{confidence}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-500">{channelText}</span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl border space-y-1" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}>
            <span className="text-[10px] text-muted">客户 / 紧急度</span>
            <div className="font-semibold flex items-center justify-between truncate" style={{ color: 'var(--text-primary)' }}>
              <span className="truncate">{task.caseName || 'NAB'}</span>
              <span className="text-[10px] font-mono">{prioText}</span>
            </div>
          </div>
        </div>
        <p className="text-[10px] font-mono text-muted text-right">TODO(WO-03): 分类字段来自后端 inbox 分析</p>
      </div>

      {/* 2. Email Body and Attachments */}
      <div className="rounded-2xl p-4 border space-y-3 shadow-2xs" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between pb-2 border-b text-xs" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center space-x-2">
            <Mail className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>From: assessment@nab.com.au</span>
            <span style={{ color: 'var(--text-muted)' }}>· 今天 10:32</span>
          </div>
          <span className="px-2 py-0.5 rounded font-mono text-[10px]" style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-secondary)' }}>NAB Assessment</span>
        </div>

        <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{task.title}</h3>

        <div className="space-y-2">
          <motion.div
            animate={{ height: expanded ? 'auto' : reduced ? 'auto' : '120px' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`p-3.5 rounded-xl text-xs leading-relaxed font-mono border overflow-hidden ${!expanded ? 'line-clamp-6' : ''}`}
            style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <p>Dear Broker,</p>
            <p>The above application has been <mark className="px-1 py-0.5 rounded font-bold" style={{ backgroundColor: 'var(--yellow-soft)', color: 'var(--yellow)' }}>[conditionally approved]</mark>.</p>
            <p>Outstanding Conditions required prior to unconditional approval:</p>
            <ol className="list-decimal list-inside space-y-1 pl-1">
              <li><mark className="px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--yellow-soft)', color: 'var(--yellow)' }}>[Updated payslips]</mark> for applicant Chen Wei (last 2 pay periods).</li>
              <li><mark className="px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--yellow-soft)', color: 'var(--yellow)' }}>[Signed contract of sale]</mark> duly executed by all vendor parties.</li>
              <li><mark className="px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--yellow-soft)', color: 'var(--yellow)' }}>[Rental income evidence]</mark> letter from licensed real estate agent.</li>
            </ol>
          </motion.div>

          <button onClick={() => setExpanded(!expanded)} className="flex items-center space-x-1 text-xs font-semibold hover:underline cursor-pointer" style={{ color: 'var(--accent)' }} id="email-body-toggle">
            {expanded ? <><ChevronUp className="w-3.5 h-3.5" /><span>收起 ▴</span></> : <><ChevronDown className="w-3.5 h-3.5" /><span>展开全文 ▾</span></>}
          </button>
        </div>

        {/* Attachments */}
        <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--border)' }} id="email-attachments">
          <div className="flex items-center space-x-1.5 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
            <Paperclip className="w-3.5 h-3.5" />
            <span>邮件附件 ({MOCK_ATTACHMENTS.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {MOCK_ATTACHMENTS.map((att) => (
              <div
                key={att.id}
                onClick={() => {
                  setPreviewFile({
                    name: att.name,
                    docType: att.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image',
                  });
                }}
                className="p-2 rounded-xl border flex items-center justify-between cursor-pointer hover:border-[var(--accent)] transition-colors"
                style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center space-x-2 min-w-0">
                  <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <span className="text-xs font-mono font-medium truncate" style={{ color: 'var(--text-primary)' }}>{att.name}</span>
                </div>
                <span className="text-[10px] font-mono text-muted flex-shrink-0">{att.size}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Dispatch Triage Bar */}
      <div className="rounded-2xl p-4 border space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-1.5 text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
          <span>🎯 派单分流</span>
          <span className="text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>(决定此邮件的处理责任人)</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleDispatch('me')} className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 cursor-pointer text-white shadow-xs" style={{ backgroundColor: 'var(--accent)' }}>
            <User className="w-3.5 h-3.5" /><span>🙋 我来做</span>
          </motion.button>
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleDispatch('boss')} className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 cursor-pointer border" style={{ backgroundColor: 'var(--purple-soft)', color: 'var(--purple)', borderColor: 'rgba(168,85,247,0.3)' }}>
            <UserCheck className="w-3.5 h-3.5" /><span>👔 给老板</span>
          </motion.button>
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleDispatch('judy')} className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 cursor-pointer border" style={{ backgroundColor: 'var(--green-soft)', color: 'var(--green)', borderColor: 'rgba(16,185,129,0.3)' }}>
            <Clock className="w-3.5 h-3.5" /><span>📋 给 Judy</span>
          </motion.button>
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleDispatch('ignore')} className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 cursor-pointer border" style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
            <span>🔇 忽略</span>
          </motion.button>
          {task.sourceMsgId && (
            <motion.button whileTap={{ scale: 0.95 }} onClick={handleMuteSender} id="mute-sender-btn" className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 cursor-pointer border" style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
              <VolumeX className="w-3.5 h-3.5" /><span>🔕 静音发件人</span>
            </motion.button>
          )}
        </div>
      </div>

      <DraftEditor actionId={task.id} />
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
