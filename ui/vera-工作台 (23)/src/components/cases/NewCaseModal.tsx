import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, FolderPlus } from 'lucide-react';
import { CaseInfo } from '../../stores/caseStore';
import { mapCaseResponse } from '../../services/caseMapper';
import { createCase } from '../../services/api/cases';
import { useToastStore } from '../../stores/toastStore';
import { NewCaseFields, NewCaseFormValues } from './NewCaseFields';
import { ParseResultPreview } from './ParseResultPreview';

interface NewCaseModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (caseInfo: CaseInfo) => void;
}

const INITIAL_VALUES: NewCaseFormValues = {
  clientName: '',
  clientEmail: '',
  clientPhone: '',
  brokerName: 'Brandon',
  lender: 'CBA',
  loanAmount: '',
  propertyValue: '',
  purpose: '自住购房',
  interestRate: '',
  financeClauseDate: '',
  incomeDescription: '',
  submissionPlatform: 'ApplyOnline',
  clientGoal: '',
  specialCircumstances: '',
  rawText: '',
  isForceNewClient: false,
  linkedClientId: null,
};

export function NewCaseModal({ open, onClose, onCreated }: NewCaseModalProps) {
  const [values, setValues] = useState<NewCaseFormValues>(INITIAL_VALUES);
  const [highlightedFields, setHighlightedFields] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [hasParsed, setHasParsed] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleChange = (patch: Partial<NewCaseFormValues>) => {
    setValues((prev) => ({ ...prev, ...patch }));
  };

  const handleParse = () => {
    setIsParsing(true);
    setTimeout(() => {
      setValues((prev) => ({
        ...prev,
        clientName: '张伟 (David Zhang)',
        clientEmail: 'david.zhang@example.com',
        clientPhone: '0412 345 678',
        brokerName: 'Brandon',
        lender: 'CBA',
        loanAmount: '80',
        propertyValue: '100',
        purpose: '自住购房',
        interestRate: '6.14',
        financeClauseDate: '2026-08-25',
        incomeDescription: 'IT 高管，年薪 $18万澳币，季度 Bonus $2万',
        submissionPlatform: 'ApplyOnline',
        clientGoal: '赶在 Finance Clause 到期前获得 Formal Approval',
        specialCircumstances: '试用期;首付款含大额境外赠予',
        rawText: prev.rawText || '客户张伟意向购买100万自住房，申请CBA贷款80万，年薪18万IT，8月25日Finance Clause',
      }));
      setHighlightedFields(['incomeDescription', 'financeClauseDate', 'interestRate']);
      setHasParsed(true);
      setIsParsing(false);
      useToastStore.getState().showToast('info', 'AI 解析完毕，部分低置信度字段已标记高亮');
    }, 600);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.clientName.trim()) {
      useToastStore.getState().showToast('error', '请输入客户姓名');
      return;
    }
    setLoading(true);
    const useMock = import.meta.env.VITE_USE_MOCK !== 'false';
    const loanAmtNum = parseFloat(values.loanAmount) || 85;

    if (useMock) {
      const mockCase: CaseInfo = {
        caseId: `CASE-MOCK-${Date.now().toString().slice(-4)}`,
        clientName: values.clientName.trim(),
        lender: values.lender || 'CBA',
        loanAmount: loanAmtNum * 10000,
        stage: '预提（Unsubmitted）',
        stageDays: 1,
        checklistDone: 0,
        checklistTotal: 12,
        checklistProgress: 0,
        summary: values.incomeDescription || '新建立项，等待 AI 补件解析与清单匹配',
        deadline: values.financeClauseDate || '14 天后',
        lastActivity: '刚刚',
      };
      useToastStore.getState().showToast('success', `案件已创建（演示）：${values.clientName} · ${values.lender} · ${values.loanAmount || '85'}万`);
      setLoading(false);
      onCreated(mockCase);
      onClose();
      return;
    }

    try {
      const res = await createCase({
        client_name: values.clientName.trim(),
        client_email: values.clientEmail.trim() || undefined,
        client_phone: values.clientPhone.trim() || undefined,
        broker_name: values.brokerName || undefined,
        lender: values.lender || undefined,
        loan_amount: parseFloat(values.loanAmount) || undefined,
        property_value: parseFloat(values.propertyValue) || undefined,
        purpose: values.purpose || undefined,
        interest_rate: parseFloat(values.interestRate) || undefined,
        finance_clause_date: values.financeClauseDate || undefined,
        income_description: values.incomeDescription || undefined,
        submission_platform: values.submissionPlatform || undefined,
        client_goal: values.clientGoal || undefined,
        special_circumstances: values.specialCircumstances || undefined,
        raw_text: values.rawText || undefined,
        is_force_new_client: values.isForceNewClient,
        linked_client_id: values.linkedClientId,
      });
      useToastStore.getState().showToast('success', '案件已创建');
      onCreated(mapCaseResponse(res));
      onClose();
    } catch {
      useToastStore.getState().showToast('error', '创建案件失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs" id="new-case-modal-overlay">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="w-full max-w-xl rounded-2xl border shadow-xl flex flex-col overflow-hidden"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          id="new-case-modal"
        >
          <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500"><FolderPlus className="w-5 h-5" /></div>
              <div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>新建贷款案件</h3>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>全字段实化录入与 AI 精算复核指导</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:opacity-80 cursor-pointer text-muted">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto max-h-[80vh]">
            <ParseResultPreview isParsing={isParsing} hasParsed={hasParsed} highlightedFields={highlightedFields} />
            <NewCaseFields values={values} onChange={handleChange} highlightedFields={highlightedFields} onParse={handleParse} isParsing={isParsing} />

            <div className="flex items-center justify-end space-x-2 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <button type="button" id="newcase-cancel-btn" onClick={onClose} className="px-4 py-2 rounded-xl border font-semibold text-xs cursor-pointer hover:opacity-80" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                取消
              </button>
              <motion.button whileTap={{ scale: 0.95 }} type="submit" id="newcase-submit-btn" disabled={loading || isParsing} className="px-4 py-2 rounded-xl font-semibold text-xs flex items-center space-x-1.5 cursor-pointer text-white shadow-xs" style={{ backgroundColor: 'var(--accent)' }}>
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>{loading ? '创建中...' : '确认新建案件'}</span>
              </motion.button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
