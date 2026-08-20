import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { X, PauseCircle, RefreshCw, Undo2, XCircle, Trash2, PlayCircle, LockOpen, AlertTriangle, Calendar, Building2, DollarSign, Check, Loader2 } from 'lucide-react';
import { CaseInfo, useCaseStore } from '../../stores/caseStore';
import { useToastStore } from '../../stores/toastStore';
import { 
  holdCase, 
  resubmitCase, 
  withdrawCase, 
  declineCase, 
  resumeCase, 
  reopenCase, 
  deleteCase 
} from '../../services/api/cases';

export type CaseActionType = 'hold' | 'resubmit' | 'withdraw' | 'decline' | 'delete' | 'resume' | 'reopen';

interface CaseActionModalProps {
  caseData: CaseInfo;
  actionType: CaseActionType | null;
  onClose: () => void;
  onSuccess?: () => void;
}

const REASONS_MAP: Record<'hold' | 'resubmit' | 'withdraw' | 'decline', string[]> = {
  hold: [
    '估值过低等待复议',
    '客户在凑材料或首付',
    '等待外部结果(律师/估值师/保险)',
    '客户暂时不想推进',
    '市场变化观望',
    '其他',
  ],
  resubmit: [
    '估值过低',
    '银行拒绝(政策不符)',
    '利率或产品不合适',
    '审批时间太长',
    '银行要求无法满足',
    '其他',
  ],
  withdraw: [
    '客户找到更好利率',
    '客户不想买或做了',
    '客户嫌审批太慢',
    '客户嫌服务不好',
    '同时提交多家选了别人',
    '客户财务变化',
    '其他',
  ],
  decline: [
    '银行拒绝(不可上诉)',
    '估值过低无法挽救',
    '客户条件不够',
    '多次Resub失败放弃',
    '估值费申请费未付',
    '其他',
  ],
};

const COMMON_BANKS = ['CBA', 'Westpac', 'ANZ', 'NAB', 'Macquarie', 'St George', 'Bankwest', 'Suncorp'];

export function CaseActionModal({ caseData, actionType, onClose, onSuccess }: CaseActionModalProps) {
  const reduced = useReducedMotion();
  const showToast = useToastStore((s) => s.showToast);
  const { fetchCases, setCurrentCase } = useCaseStore();

  const [selectedReason, setSelectedReason] = useState<string>('');
  const [customReason, setCustomReason] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [reminderDate, setReminderDate] = useState<string>('');
  const [newLender, setNewLender] = useState<string>('');
  const [newLoanAmount, setNewLoanAmount] = useState<string>('');
  const [inheritKnowledge, setInheritKnowledge] = useState<boolean>(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (actionType && ['hold', 'resubmit', 'withdraw', 'decline'].includes(actionType)) {
      const list = REASONS_MAP[actionType as keyof typeof REASONS_MAP];
      if (list && list.length > 0) {
        setSelectedReason(list[0]);
      }
    }
    setCustomReason('');
    setNote('');
    setReminderDate('');
    setNewLender('');
    setNewLoanAmount('');
    setInheritKnowledge(true);
    setError(null);
  }, [actionType]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!actionType) return null;

  const getFinalReason = () => {
    if (selectedReason === '其他' && customReason.trim()) {
      return `其他: ${customReason.trim()}`;
    }
    return selectedReason || '操作备注';
  };

  const handleSubmit = async () => {
    if (loading) return;
    setError(null);

    const finalReason = getFinalReason();

    if (['hold', 'resubmit', 'withdraw', 'decline'].includes(actionType)) {
      if (!selectedReason) {
        setError('请选择具体原因');
        return;
      }
      if (selectedReason === '其他' && !customReason.trim()) {
        setError('请补充填写具体的其他原因');
        return;
      }
    }

    if (actionType === 'resubmit' && !newLender.trim()) {
      setError('请输入或选择新意向审贷银行');
      return;
    }

    setLoading(true);
    try {
      if (actionType === 'hold') {
        await holdCase(caseData.caseId, {
          reason: finalReason,
          note: note.trim() || undefined,
          reminder_date: reminderDate || undefined,
        });
        showToast('success', `案件 ${caseData.clientName} 已暂停跟进`);
      } else if (actionType === 'resubmit') {
        const parsedAmount = newLoanAmount ? parseFloat(newLoanAmount) * (newLoanAmount.includes('000') ? 1 : 10000) : undefined;
        await resubmitCase(caseData.caseId, {
          reason: finalReason,
          note: note.trim() || undefined,
          new_lender: newLender.trim(),
          new_loan_amount: Number.isFinite(parsedAmount) ? parsedAmount : undefined,
          inherit_knowledge: inheritKnowledge,
        });
        showToast('success', `案件已转交并重新递交至 ${newLender.trim()}`);
      } else if (actionType === 'withdraw') {
        await withdrawCase(caseData.caseId, {
          reason: finalReason,
          note: note.trim() || undefined,
        });
        showToast('info', `案件 ${caseData.clientName} 客户已撤回`);
      } else if (actionType === 'decline') {
        await declineCase(caseData.caseId, {
          reason: finalReason,
          note: note.trim() || undefined,
        });
        showToast('info', `案件 ${caseData.clientName} 已终止并归档`);
      } else if (actionType === 'resume') {
        await resumeCase(caseData.caseId);
        showToast('success', `案件 ${caseData.clientName} 已恢复正常跟进`);
      } else if (actionType === 'reopen') {
        await reopenCase(caseData.caseId);
        showToast('success', `案件 ${caseData.clientName} 已重新解封激活`);
      } else if (actionType === 'delete') {
        await deleteCase(caseData.caseId);
        showToast('success', '案件已删除');
        setCurrentCase(null);
      }

      await fetchCases();
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || '操作执行失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const getHeaderMeta = () => {
    switch (actionType) {
      case 'hold':
        return { title: '暂停案件跟进', icon: PauseCircle, color: 'var(--yellow)', btnText: '确认暂停', btnBg: 'var(--yellow)' };
      case 'resubmit':
        return { title: '换银行重新递交', icon: RefreshCw, color: 'var(--accent)', btnText: '确认重新递交', btnBg: 'var(--accent)' };
      case 'withdraw':
        return { title: '客户主动撤回', icon: Undo2, color: 'var(--orange)', btnText: '确认撤回', btnBg: 'var(--orange)' };
      case 'decline':
        return { title: '终止案件', icon: XCircle, color: 'var(--red)', btnText: '确认终止', btnBg: 'var(--red)' };
      case 'resume':
        return { title: '恢复案件跟进', icon: PlayCircle, color: 'var(--green)', btnText: '确认恢复', btnBg: 'var(--green)' };
      case 'reopen':
        return { title: '解封历史案件', icon: LockOpen, color: 'var(--purple)', btnText: '确认解封', btnBg: 'var(--purple)' };
      case 'delete':
        return { title: '删除案件', icon: Trash2, color: 'var(--red)', btnText: '确认删除', btnBg: 'var(--red)' };
    }
  };

  const meta = getHeaderMeta();
  const Icon = meta.icon;
  const isReasonAction = ['hold', 'resubmit', 'withdraw', 'decline'].includes(actionType);
  const reasonsList = isReasonAction ? REASONS_MAP[actionType as keyof typeof REASONS_MAP] : [];

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      id="case-action-modal-overlay"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)', backdropFilter: 'blur(8px) saturate(140%)' }}
    >
      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', damping: 25, stiffness: 400 }}
        className="w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
        id="case-action-modal-content"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--bg-app)', color: meta.color }}>
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                {meta.title}
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                当前案件: <span className="font-semibold text-primary">{caseData.clientName}</span> · {caseData.lender}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭对话框"
            className="p-1.5 rounded-lg hover:opacity-70 transition-opacity cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4 overflow-y-auto no-scrollbar flex-1 text-xs">
          {error && (
            <div className="p-3 rounded-xl border flex items-center space-x-2 bg-red-500/10 text-red-500 text-xs font-medium" style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Delete Prompt */}
          {actionType === 'delete' && (
            <div className="p-4 rounded-xl border bg-red-500/5 space-y-2" style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}>
              <div className="flex items-center space-x-2 text-red-500 font-bold">
                <AlertTriangle className="w-4 h-4" />
                <span>危险操作：不可撤销</span>
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                您确定要彻底删除客户 <strong className="text-primary">{caseData.clientName}</strong>（{caseData.lender} · 贷款额度 ${(caseData.loanAmount / 10000).toFixed(0)}万 AUD）的案件记录吗？关联的任务和对话历史都将被清理。
              </p>
            </div>
          )}

          {/* Resume / Reopen Prompt */}
          {(actionType === 'resume' || actionType === 'reopen') && (
            <div className="p-4 rounded-xl border space-y-2" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}>
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                {actionType === 'resume' 
                  ? '确定将此暂停案件恢复为进行中状态吗？系统将重新启用常规提醒与 Finance Clause 跟进。'
                  : '确定将此终态档案重新解封吗？案件将激活并回到预审看板，供您继续补充材料与跟进。'}
              </p>
            </div>
          )}

          {/* Reason Selection */}
          {isReasonAction && (
            <div className="space-y-2">
              <label className="block font-semibold" style={{ color: 'var(--text-primary)' }}>
                {actionType === 'hold' ? '暂停原因' : actionType === 'resubmit' ? '重递原因' : actionType === 'withdraw' ? '撤回原因' : '终止原因'}
                <span className="text-red-500 ml-0.5">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {reasonsList.map((r) => {
                  const isSelected = selectedReason === r;
                  return (
                    <button
                      type="button"
                      key={r}
                      onClick={() => setSelectedReason(r)}
                      className={`p-2.5 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all ${
                        isSelected ? 'border-indigo-500 font-bold bg-indigo-500/10' : 'hover:opacity-80'
                      }`}
                      style={{
                        borderColor: isSelected ? meta.color : 'var(--border)',
                        backgroundColor: isSelected ? 'var(--bg-app)' : 'transparent',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <span className="truncate">{r}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 ml-1 flex-shrink-0" style={{ color: meta.color }} />}
                    </button>
                  );
                })}
              </div>

              {selectedReason === '其他' && (
                <div className="pt-1">
                  <input
                    type="text"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="请输入具体的其他原因..."
                    className="w-full px-3 py-2 rounded-xl border outline-none text-xs"
                    style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    id="case-action-custom-reason"
                  />
                </div>
              )}
            </div>
          )}

          {/* Hold Specific: Reminder Date */}
          {actionType === 'hold' && (
            <div className="space-y-1.5 pt-1">
              <label className="block font-semibold flex items-center space-x-1" style={{ color: 'var(--text-primary)' }}>
                <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--yellow)' }} />
                <span>唤醒/回访提醒日期 (可选)</span>
              </label>
              <input
                type="date"
                value={reminderDate}
                onChange={(e) => setReminderDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border outline-none text-xs"
                style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                id="case-action-reminder-date"
              />
            </div>
          )}

          {/* Resubmit Specific: New Lender & Loan Amount & Inherit */}
          {actionType === 'resubmit' && (
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <label className="block font-semibold flex items-center space-x-1" style={{ color: 'var(--text-primary)' }}>
                  <Building2 className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                  <span>新意向银行</span>
                  <span className="text-red-500 ml-0.5">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {COMMON_BANKS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setNewLender(b)}
                      className={`px-2 py-0.5 rounded-lg border text-[11px] font-medium cursor-pointer transition-all ${
                        newLender === b ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500 font-bold' : 'hover:opacity-80'
                      }`}
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    >
                      {b}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={newLender}
                  onChange={(e) => setNewLender(e.target.value)}
                  placeholder="例如: Macquarie Bank 或自填其他银行"
                  className="w-full px-3 py-2 rounded-xl border outline-none text-xs"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  id="case-action-new-lender"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-semibold flex items-center space-x-1" style={{ color: 'var(--text-primary)' }}>
                  <DollarSign className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} />
                  <span>新贷款额度 ($万 AUD，留空保持 ${(caseData.loanAmount / 10000).toFixed(0)}万)</span>
                </label>
                <input
                  type="number"
                  value={newLoanAmount}
                  onChange={(e) => setNewLoanAmount(e.target.value)}
                  placeholder={`保持原额 ${(caseData.loanAmount / 10000).toFixed(0)}`}
                  className="w-full px-3 py-2 rounded-xl border outline-none text-xs"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  id="case-action-new-amount"
                />
              </div>

              <label className="flex items-center space-x-2 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={inheritKnowledge}
                  onChange={(e) => setInheritKnowledge(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-0"
                  id="case-action-inherit-checkbox"
                />
                <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>
                  继承已沉淀的客户知识库与材料清单 (推荐)
                </span>
              </label>
            </div>
          )}

          {/* Optional Note */}
          <div className="space-y-1.5 pt-1">
            <label className="block font-semibold" style={{ color: 'var(--text-primary)' }}>
              补充说明 / 备注 (可选)
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="记录经办人备注或交代..."
              className="w-full p-2.5 rounded-xl border outline-none text-xs resize-none"
              style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              id="case-action-note"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t flex items-center justify-end space-x-2.5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-app)' }}>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl border font-semibold text-xs cursor-pointer hover:opacity-80 disabled:opacity-50"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            id="case-action-cancel-btn"
          >
            取消
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 rounded-xl font-bold text-xs flex items-center space-x-1.5 text-white cursor-pointer hover:opacity-90 shadow-md disabled:opacity-50"
            style={{ backgroundColor: meta.btnBg }}
            id="case-action-submit-btn"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{meta.btnText}</span>
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
