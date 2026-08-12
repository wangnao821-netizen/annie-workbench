import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Plus, User, Building2, DollarSign, FileText } from 'lucide-react';
import { useWorkbenchStore } from '../store/useStore';

export const NewCaseModal: React.FC = () => {
  const { isNewCaseModalOpen, setNewCaseModalOpen, addCase } = useWorkbenchStore((s) => ({
    isNewCaseModalOpen: s.isNewCaseModalOpen,
    setNewCaseModalOpen: s.setNewCaseModalOpen,
    addCase: s.addCase
  }));

  const [clientName, setClientName] = useState('');
  const [bankName, setBankName] = useState('CBA');
  const [loanAmount, setLoanAmount] = useState(750000);
  const [propertyType, setPropertyType] = useState('自住房 (House)');
  const [loanType, setLoanType] = useState('浮动利率');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  if (!isNewCaseModalOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) return;

    addCase({
      clientName,
      bankName,
      loanAmount: Number(loanAmount),
      propertyType,
      loanType,
      clientEmail,
      clientPhone,
      urgency: 'normal'
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-lg bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-[var(--shadow-overlay)] overflow-hidden"
      >
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg-app)]">
          <div className="flex items-center space-x-2">
            <Plus className="w-5 h-5 text-[var(--accent)]" />
            <h2 className="text-sm font-bold text-[var(--text-primary)]">录入新贷款案件 (Create Case)</h2>
          </div>
          <button
            onClick={() => setNewCaseModalOpen(false)}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-[var(--text-primary)] mb-1">
              客户姓名 (支持 PERSON_X 脱敏格式) *
            </label>
            <input
              type="text"
              required
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="例如：PERSON_3 或 John Smith"
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-[var(--text-primary)] mb-1">
                意向银行 (Lender)
              </label>
              <select
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] text-[var(--text-primary)]"
              >
                <option value="CBA">CBA (Commonwealth Bank)</option>
                <option value="Westpac">Westpac</option>
                <option value="ANZ">ANZ</option>
                <option value="NAB">NAB</option>
                <option value="Macquarie">Macquarie</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[var(--text-primary)] mb-1">
                预计贷款金额 ($)
              </label>
              <input
                type="number"
                step="10000"
                value={loanAmount}
                onChange={(e) => setLoanAmount(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] text-[var(--text-primary)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-[var(--text-primary)] mb-1">
                物业类型
              </label>
              <select
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] text-[var(--text-primary)]"
              >
                <option value="自住房 (House)">自住房 (House)</option>
                <option value="投资房 (Apartment)">投资房 (Apartment)</option>
                <option value="联排别墅 (Townhouse)">联排别墅 (Townhouse)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[var(--text-primary)] mb-1">
                贷款类型
              </label>
              <input
                type="text"
                value={loanType}
                onChange={(e) => setLoanType(e.target.value)}
                placeholder="例如：浮动利率 + 冲抵账户"
                className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] text-[var(--text-primary)]"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end space-x-2 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={() => setNewCaseModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] font-semibold"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-[var(--accent)] text-white font-bold hover:brightness-110 shadow-xs"
            >
              录入并生成大脑跟进
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
