import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Calculator,
  X,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Play,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Building2,
} from 'lucide-react';
import { ApiError } from '../../services/http';
import {
  assessCalculator,
} from '../../services/api/calculator';
import { listBrainFacts } from '../../services/api/cases';
import {
  CalculatorAssessResponse,
  CalculatorCommitment,
} from '../../types/api';
import { useToastStore } from '../../stores/toastStore';
import { useCaseStore } from '../../stores/caseStore';
import { ComparisonMatrix } from './ComparisonMatrix';

export interface CalculatorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  caseId?: string;
  defaultBank?: string;
}

const SUPPORTED_BANKS = [
  { id: 'cba', name: 'CBA' },
  { id: 'macquarie', name: 'Macquarie' },
  { id: 'boc', name: 'BOC' },
  { id: 'ma_money', name: 'MA Money' },
  { id: 'latrobe', name: 'LaTrobe' },
  { id: 'resimac', name: 'Resimac' },
];

const COMMITMENT_TYPES = [
  { value: 'mortgage_oo', label: '自住房贷 (Mortgage OO)' },
  { value: 'mortgage_inv', label: '投资房贷 (Mortgage INV)' },
  { value: 'personal', label: '个人贷款 (Personal Loan)' },
  { value: 'credit_card', label: '信用卡 (Credit Card)' },
  { value: 'overdraft', label: '透支额度 (Overdraft)' },
  { value: 'line_of_credit', label: '信用线路 (Line of Credit)' },
  { value: 'hire_purchase', label: '分期付款 (Hire Purchase)' },
  { value: 'lease', label: '租赁 (Lease)' },
  { value: 'bnpl', label: '先买后付 (BNPL)' },
  { value: 'other', label: '其他负债 (Other)' },
];

export function CalculatorPanel({
  isOpen,
  onClose,
  caseId,
}: CalculatorPanelProps) {
  const reduced = useReducedMotion();
  const showToast = useToastStore((s) => s.showToast);
  const currentCase = useCaseStore((s) => s.currentCase);

  // Multi-bank selection state
  const [selectedBanks, setSelectedBanks] = useState<string[]>(
    SUPPORTED_BANKS.map((b) => b.id)
  );

  // Missing fields tracking
  const [missingFields, setMissingFields] = useState<string[]>([]);

  // Form states
  const [baseIncome, setBaseIncome] = useState<string>('120000');
  const [showAdvancedIncome, setShowAdvancedIncome] = useState<boolean>(false);

  // Additional income
  const [overtime, setOvertime] = useState<string>('0');
  const [bonusCommission, setBonusCommission] = useState<string>('0');
  const [casual, setCasual] = useState<string>('0');
  const [investmentIncome] = useState<string>('0');
  const [dividends, setDividends] = useState<string>('0');
  const [foreignIncome, setForeignIncome] = useState<string>('0');
  const [rentalIncome, setRentalIncome] = useState<string>('0');
  const [governmentBenefits] = useState<string>('0');
  const [otherTaxable] = useState<string>('0');

  // Loan particulars
  const [loanAmount, setLoanAmount] = useState<string>('550000');
  const [interestRate, setInterestRate] = useState<string>('6.15');
  const [termYears, setTermYears] = useState<string>('30');
  const [ioYears] = useState<string>('0');
  const [purpose, setPurpose] = useState<'OO' | 'INV'>('OO');
  const [repayment, setRepayment] = useState<'PI' | 'IO'>('PI');
  const [securityValue, setSecurityValue] = useState<string>('750000');
  const [state, setState] = useState<string>('NSW');
  const [postcode] = useState<string>('2000');

  // Household & Living expenses
  const [maritalStatus, setMaritalStatus] = useState<'Single' | 'Couple'>('Single');
  const [dependents, setDependents] = useState<string>('0');
  const [declaredBasicMonthly, setDeclaredBasicMonthly] = useState<string>('2100');
  const [declaredNonHem, setDeclaredNonHem] = useState<string>('0');

  // Commitments
  const [commitments, setCommitments] = useState<CalculatorCommitment[]>([]);

  // Assessment results & loading
  const [assessing, setAssessing] = useState<boolean>(false);
  const [comparisonResults, setComparisonResults] = useState<CalculatorAssessResponse[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auto prefill from case and facts
  const autoPrefillFromCase = useCallback(async (targetCaseId: string) => {
    const activeCase = currentCase?.caseId === targetCaseId ? currentCase : useCaseStore.getState().cases.find((c) => c.caseId === targetCaseId);
    const missing: string[] = [];

    // 1. Loan Amount
    if (activeCase && activeCase.loanAmount && activeCase.loanAmount > 0) {
      setLoanAmount(String(activeCase.loanAmount));
    } else {
      missing.push('贷款金额');
    }

    // 2. Interest Rate & Purpose
    const cAny = activeCase as any;
    if (cAny?.interestRate && Number(cAny.interestRate) > 0) {
      setInterestRate(String(cAny.interestRate));
    } else {
      setInterestRate('6.15');
    }

    if (cAny?.purpose) {
      const p = String(cAny.purpose).toUpperCase();
      setPurpose(p.includes('INV') || p.includes('投资') ? 'INV' : 'OO');
    }

    // 3. Security Value (Property Value)
    if (activeCase?.loanAmount && activeCase.lvr && activeCase.lvr > 0) {
      const calculatedSecurity = Math.round((activeCase.loanAmount / activeCase.lvr) * 100);
      setSecurityValue(String(calculatedSecurity));
    }

    // 4. Fetch Brain Facts for Income and Property
    try {
      const facts = await listBrainFacts(targetCaseId);
      if (facts && facts.length > 0) {
        let foundIncome = false;
        let foundSecurity = false;

        for (const f of facts) {
          const key = (f.key || '').toLowerCase();
          const val = f.value || '';

          // Match base income
          if (key.includes('income') || key.includes('salary') || key.includes('employment')) {
            const num = parseFloat(val.replace(/[^0-9.]/g, ''));
            if (!isNaN(num) && num > 20000) {
              setBaseIncome(String(num));
              foundIncome = true;
            }
          }

          // Match property value
          if (key.includes('property') || key.includes('security') || key.includes('value')) {
            const num = parseFloat(val.replace(/[^0-9.]/g, ''));
            if (!isNaN(num) && num > 50000) {
              setSecurityValue(String(num));
              foundSecurity = true;
            }
          }

          // Match loan amount if still not set
          if (!activeCase?.loanAmount && (key.includes('loan.amount') || key.includes('loan_amount'))) {
            const num = parseFloat(val.replace(/[^0-9.]/g, ''));
            if (!isNaN(num) && num > 10000) {
              setLoanAmount(String(num));
              const loanIdx = missing.indexOf('贷款金额');
              if (loanIdx >= 0) missing.splice(loanIdx, 1);
            }
          }
        }

        if (!foundIncome) missing.push('申请人年薪');
        if (!foundSecurity && (!activeCase?.lvr || !activeCase.loanAmount)) missing.push('房产估值');
      } else {
        missing.push('申请人年薪');
        if (!activeCase?.lvr) missing.push('房产估值');
      }
    } catch {
      missing.push('申请人年薪');
    }

    setMissingFields(missing);
  }, [currentCase]);

  useEffect(() => {
    if (isOpen) {
      if (caseId) {
        autoPrefillFromCase(caseId);
      } else {
        setMissingFields([]);
      }
    } else {
      setComparisonResults([]);
      setErrorMsg(null);
    }
  }, [isOpen, caseId, autoPrefillFromCase]);

  const toggleBank = (bankId: string) => {
    setSelectedBanks((prev) =>
      prev.includes(bankId)
        ? prev.filter((id) => id !== bankId)
        : [...prev, bankId]
    );
  };

  const selectAllBanks = () => {
    setSelectedBanks(SUPPORTED_BANKS.map((b) => b.id));
  };

  const clearBanks = () => {
    setSelectedBanks([]);
  };

  const addCommitment = () => {
    setCommitments((prev) => [
      ...prev,
      { type: 'credit_card', limit: 10000, declared_monthly: 300 },
    ]);
  };

  const removeCommitment = (index: number) => {
    setCommitments((prev) => prev.filter((_, i) => i !== index));
  };

  const updateCommitment = (index: number, field: keyof CalculatorCommitment, val: any) => {
    setCommitments((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: val } : item))
    );
  };

  const handleMultiBankAssess = async () => {
    const base = parseFloat(baseIncome);
    const amount = parseFloat(loanAmount);
    const ratePct = parseFloat(interestRate);

    if (isNaN(base) || base <= 0) {
      showToast('error', '请输入有效的基础年薪');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      showToast('error', '请输入有效的贷款金额');
      return;
    }
    if (selectedBanks.length === 0) {
      showToast('error', '请至少勾选一家参与对比的银行机构');
      return;
    }

    setAssessing(true);
    setErrorMsg(null);
    setComparisonResults([]);

    const commonPayloadPart = {
      applicants: [
        {
          base,
          overtime: parseFloat(overtime) || 0,
          bonus_commission: parseFloat(bonusCommission) || 0,
          casual: parseFloat(casual) || 0,
          investment_income: parseFloat(investmentIncome) || 0,
          dividends: parseFloat(dividends) || 0,
          foreign_income: parseFloat(foreignIncome) || 0,
          rental_income: parseFloat(rentalIncome) || 0,
          government_benefits: parseFloat(governmentBenefits) || 0,
          other_taxable: parseFloat(otherTaxable) || 0,
        },
      ],
      loan: {
        portions: [
          {
            amount,
            rate: ratePct ? ratePct / 100 : 0.0615,
            term_years: parseInt(termYears) || 30,
            io_years: parseInt(ioYears) || 0,
            purpose,
            repayment,
          },
        ],
        security_value: parseFloat(securityValue) || undefined,
        state,
        postcode,
      },
      household: {
        status: maritalStatus,
        dependents: parseInt(dependents) || 0,
      },
      living_expenses: {
        declared_basic_monthly: parseFloat(declaredBasicMonthly) || undefined,
        declared_non_hem: parseFloat(declaredNonHem) || undefined,
      },
      commitments: commitments.map((c) => ({
        ...c,
        balance: c.balance ? parseFloat(String(c.balance)) : undefined,
        limit: c.limit ? parseFloat(String(c.limit)) : undefined,
        rate: c.rate ? parseFloat(String(c.rate)) / 100 : undefined,
        declared_monthly: c.declared_monthly ? parseFloat(String(c.declared_monthly)) : undefined,
      })),
    };

    try {
      const promises = selectedBanks.map((bankId) =>
        assessCalculator({
          ...commonPayloadPart,
          bank: bankId,
        }).catch(() => {
          const bankName = SUPPORTED_BANKS.find((b) => b.id === bankId)?.name || bankId;
          return {
            bank: bankName,
            result: 'FAIL',
            surplus: 0,
            max_loan: 0,
            dti: 0,
            lvr: 80,
            profile_version: '2026.8',
            steps: [],
          } as CalculatorAssessResponse;
        })
      );

      const results = await Promise.all(promises);
      setComparisonResults(results);
      showToast('success', `已完成 ${results.length} 家银行多维度服务能力对比测算`);
    } catch (err: any) {
      const detail = err instanceof ApiError ? err.detail : err?.message || '测算失败';
      setErrorMsg(detail);
      showToast('error', `计算失败: ${detail}`);
    } finally {
      setAssessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 overflow-hidden">
        {/* Backdrop */}
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative z-10 w-full max-w-4xl max-h-[92vh] rounded-2xl border shadow-2xl bg-[var(--bg-card)] border-[var(--border)] flex flex-col overflow-hidden text-[var(--text-primary)]"
          id="calculator-modal-container"
        >
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between shrink-0 bg-[var(--bg-panel)]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
                <Calculator className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-[var(--text-primary)]">
                    Vera 贷款服务能力测算与多银行横向比选
                  </h2>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] font-semibold">
                    Multi-Bank Benchmark
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  案卷画像自动注入 · 缺失字段智能标注 · APRA Buffer 3.0% 规则模型横向对比
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-subtle)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              id="calc-close-btn"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body Content - Scrollable */}
          <div className="p-4 sm:p-5 space-y-4 overflow-y-auto no-scrollbar flex-1 bg-[var(--bg-card)]">
            {/* Auto Prefill / Missing State Alert Banner */}
            {caseId && currentCase && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs ${
                  missingFields.length > 0
                    ? 'bg-[var(--yellow-soft)] border-amber-500/30 text-amber-500'
                    : 'bg-[var(--green-soft)] border-emerald-500/30 text-emerald-500'
                }`}
              >
                {missingFields.length > 0 ? (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <div>
                      <span>
                        ⚠️ 检测到案卷中【<strong>{missingFields.join('、')}</strong>】尚未归档，已填充参考值，请核实后测算
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div>
                      <span>
                        ✓ 已成功从案卷加载【<strong>{currentCase.clientName}</strong>】的完整财务与借款画像
                      </span>
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {/* Multi-Bank Benchmark Selector */}
            <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span className="text-xs font-bold text-[var(--text-primary)]">参与对比的银行机构:</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={selectAllBanks}
                    className="px-2 py-0.5 rounded text-[11px] font-medium bg-[var(--accent-soft)] text-[var(--accent)] hover:opacity-80 transition-colors cursor-pointer"
                  >
                    全选银行对比 (All)
                  </button>
                  <button
                    type="button"
                    onClick={clearBanks}
                    className="px-2 py-0.5 rounded text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                  >
                    清空
                  </button>
                </div>
              </div>

              {/* Tag Chips */}
              <div className="flex flex-wrap gap-2 pt-0.5">
                {SUPPORTED_BANKS.map((b) => {
                  const isSelected = selectedBanks.includes(b.id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => toggleBank(b.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--accent-strong)] text-[var(--on-accent-strong)] shadow-xs'
                          : 'bg-[var(--bg-input)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]'
                      }`}
                    >
                      <span>{b.name}</span>
                      {isSelected && <span className="text-[10px] opacity-80">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Form Input Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Box 1: Applicant Income */}
              <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] space-y-2.5">
                <span className="font-bold text-[var(--text-primary)] block pb-1 border-b border-[var(--border)]">
                  1. 申请人收入 (Applicant Annual Income)
                </span>

                <div className="space-y-1">
                  <label className="text-[var(--text-secondary)] block font-medium">主申请人 Base 年薪 ($AUD) *</label>
                  <input
                    type="number"
                    value={baseIncome}
                    onChange={(e) => setBaseIncome(e.target.value)}
                    placeholder="如: 120000"
                    className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] font-mono outline-none text-[var(--text-primary)] focus:border-[var(--accent)]"
                    id="calc-input-base-income"
                  />
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => setShowAdvancedIncome(!showAdvancedIncome)}
                    className="text-[11px] font-medium flex items-center gap-1 cursor-pointer hover:underline text-[var(--accent)]"
                  >
                    <span>{showAdvancedIncome ? '收起其他津贴与副业收入' : '+ 展开加班费/奖金/租金/海外等收入细节'}</span>
                    {showAdvancedIncome ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>

                  {showAdvancedIncome && (
                    <div className="pt-2 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] text-[var(--text-muted)] block">加班费 (Overtime)</label>
                          <input type="number" value={overtime} onChange={(e) => setOvertime(e.target.value)} className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-input)] font-mono text-[11px] text-[var(--text-primary)]" />
                        </div>
                        <div>
                          <label className="text-[11px] text-[var(--text-muted)] block">奖金/佣金 (Bonus)</label>
                          <input type="number" value={bonusCommission} onChange={(e) => setBonusCommission(e.target.value)} className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-input)] font-mono text-[11px] text-[var(--text-primary)]" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] text-[var(--text-muted)] block">临时工 (Casual)</label>
                          <input type="number" value={casual} onChange={(e) => setCasual(e.target.value)} className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-input)] font-mono text-[11px] text-[var(--text-primary)]" />
                        </div>
                        <div>
                          <label className="text-[11px] text-[var(--text-muted)] block">租金收入 (Rental)</label>
                          <input type="number" value={rentalIncome} onChange={(e) => setRentalIncome(e.target.value)} className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-input)] font-mono text-[11px] text-[var(--text-primary)]" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] text-[var(--text-muted)] block">海外收入 (Foreign)</label>
                          <input type="number" value={foreignIncome} onChange={(e) => setForeignIncome(e.target.value)} className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-input)] font-mono text-[11px] text-[var(--text-primary)]" />
                        </div>
                        <div>
                          <label className="text-[11px] text-[var(--text-muted)] block">投资分红 (Dividends)</label>
                          <input type="number" value={dividends} onChange={(e) => setDividends(e.target.value)} className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-input)] font-mono text-[11px] text-[var(--text-primary)]" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Box 2: Loan Particulars */}
              <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] space-y-2.5">
                <span className="font-bold text-[var(--text-primary)] block pb-1 border-b border-[var(--border)]">
                  2. 拟申请贷款 (Proposed Loan)
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[var(--text-secondary)] block font-medium">贷款金额 ($AUD) *</label>
                    <input
                      type="number"
                      value={loanAmount}
                      onChange={(e) => setLoanAmount(e.target.value)}
                      placeholder="550000"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] font-mono outline-none text-[var(--text-primary)] focus:border-[var(--accent)]"
                      id="calc-input-loan-amount"
                    />
                  </div>
                  <div>
                    <label className="text-[var(--text-secondary)] block font-medium">产品实际利率 (% p.a.)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={interestRate}
                      onChange={(e) => setInterestRate(e.target.value)}
                      placeholder="6.15"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] font-mono outline-none text-[var(--text-primary)] focus:border-[var(--accent)]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block">年限 (年)</label>
                    <input type="number" value={termYears} onChange={(e) => setTermYears(e.target.value)} className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-input)] font-mono text-[11px] text-[var(--text-primary)]" />
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block">房屋估值 ($)</label>
                    <input type="number" value={securityValue} onChange={(e) => setSecurityValue(e.target.value)} className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-input)] font-mono text-[11px] text-[var(--text-primary)]" />
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block">所在州</label>
                    <input type="text" value={state} onChange={(e) => setState(e.target.value)} className="w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-input)] text-[11px] text-[var(--text-primary)]" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block mb-1">用途 (Purpose)</label>
                    <div className="flex rounded-lg border border-[var(--border)] p-0.5 bg-[var(--bg-input)]">
                      <button
                        type="button"
                        onClick={() => setPurpose('OO')}
                        className={`flex-1 py-0.5 rounded text-xs font-bold transition-all cursor-pointer ${
                          purpose === 'OO' ? 'bg-[var(--accent-strong)] text-[var(--on-accent-strong)] shadow-xs' : 'text-[var(--text-muted)]'
                        }`}
                      >
                        自住 (OO)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPurpose('INV')}
                        className={`flex-1 py-0.5 rounded text-xs font-bold transition-all cursor-pointer ${
                          purpose === 'INV' ? 'bg-[var(--accent-strong)] text-[var(--on-accent-strong)] shadow-xs' : 'text-[var(--text-muted)]'
                        }`}
                      >
                        投资 (INV)
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block mb-1">还款类型 (Repayment)</label>
                    <div className="flex rounded-lg border border-[var(--border)] p-0.5 bg-[var(--bg-input)]">
                      <button
                        type="button"
                        onClick={() => setRepayment('PI')}
                        className={`flex-1 py-0.5 rounded text-xs font-bold transition-all cursor-pointer ${
                          repayment === 'PI' ? 'bg-[var(--accent-strong)] text-[var(--on-accent-strong)] shadow-xs' : 'text-[var(--text-muted)]'
                        }`}
                      >
                        本息 (P&I)
                      </button>
                      <button
                        type="button"
                        onClick={() => setRepayment('IO')}
                        className={`flex-1 py-0.5 rounded text-xs font-bold transition-all cursor-pointer ${
                          repayment === 'IO' ? 'bg-[var(--accent-strong)] text-[var(--on-accent-strong)] shadow-xs' : 'text-[var(--text-muted)]'
                        }`}
                      >
                        只还息 (IO)
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Box 3: Household & Commitments */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Household */}
              <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] space-y-2">
                <span className="font-bold text-[var(--text-primary)] block pb-1 border-b border-[var(--border)]">
                  3. 家庭结构与生活费 (Household & Expenses)
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block mb-1">婚姻状况</label>
                    <select
                      value={maritalStatus}
                      onChange={(e: any) => setMaritalStatus(e.target.value)}
                      className="w-full px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-[var(--text-primary)] font-medium outline-none cursor-pointer"
                    >
                      <option value="Single">单身 (Single)</option>
                      <option value="Couple">已婚/同居 (Couple)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block mb-1">抚养人数 (Dependents)</label>
                    <input
                      type="number"
                      value={dependents}
                      onChange={(e) => setDependents(e.target.value)}
                      className="w-full px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] font-mono text-[11px] text-[var(--text-primary)]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block">申报月基础生活费 ($)</label>
                    <input
                      type="number"
                      value={declaredBasicMonthly}
                      onChange={(e) => setDeclaredBasicMonthly(e.target.value)}
                      placeholder="2100"
                      className="w-full px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] font-mono text-[11px] text-[var(--text-primary)]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block">非 HEM 额外月开支 ($)</label>
                    <input
                      type="number"
                      value={declaredNonHem}
                      onChange={(e) => setDeclaredNonHem(e.target.value)}
                      placeholder="0"
                      className="w-full px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] font-mono text-[11px] text-[var(--text-primary)]"
                    />
                  </div>
                </div>
              </div>

              {/* Commitments */}
              <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-[var(--border)]">
                  <span className="font-bold text-[var(--text-primary)]">
                    4. 存量负债 ({commitments.length} 笔)
                  </span>
                  <button
                    type="button"
                    onClick={addCommitment}
                    className="text-xs font-semibold text-[var(--accent)] flex items-center gap-0.5 hover:underline cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>添加负债</span>
                  </button>
                </div>

                {commitments.length === 0 ? (
                  <p className="text-[11px] text-[var(--text-muted)] py-2 text-center">无现有房贷、车贷或信用卡负债</p>
                ) : (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto no-scrollbar pr-1">
                    {commitments.map((c, idx) => (
                      <div key={idx} className="p-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] space-y-1">
                        <div className="flex items-center justify-between">
                          <select
                            value={c.type}
                            onChange={(e) => updateCommitment(idx, 'type', e.target.value)}
                            className="text-[11px] font-semibold border-none outline-none bg-transparent text-[var(--text-primary)] cursor-pointer"
                          >
                            {COMMITMENT_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => removeCommitment(idx)}
                            className="text-[var(--text-muted)] hover:text-rose-500 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          <div>
                            <span className="text-[10px] text-[var(--text-muted)] block">额度 Limit ($)</span>
                            <input
                              type="number"
                              value={c.limit || ''}
                              onChange={(e) => updateCommitment(idx, 'limit', e.target.value)}
                              placeholder="10000"
                              className="w-full px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg-card)] font-mono text-[11px] text-[var(--text-primary)]"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] text-[var(--text-muted)] block">月供/还款 ($)</span>
                            <input
                              type="number"
                              value={c.declared_monthly || ''}
                              onChange={(e) => updateCommitment(idx, 'declared_monthly', e.target.value)}
                              placeholder="300"
                              className="w-full px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg-card)] font-mono text-[11px] text-[var(--text-primary)]"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Run Assessment Button */}
            <div className="pt-1">
              <motion.button
                whileTap={reduced ? undefined : { scale: 0.97 }}
                onClick={handleMultiBankAssess}
                disabled={assessing}
                className="w-full py-2.5 px-5 rounded-xl font-bold text-[var(--on-accent-strong)] bg-[var(--accent-strong)] hover:opacity-90 shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 text-xs transition-colors"
                id="calc-submit-assess-btn"
              >
                {assessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>正在并发执行 {selectedBanks.length} 家银行 Servicing 规则模型计算…</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>开始多银行服务能力横向对比测算 ({selectedBanks.length} 家银行)</span>
                  </>
                )}
              </motion.button>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-[var(--red-soft)] border border-red-500/30 text-rose-500 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Comparison Matrix Deck & Step Trace */}
            {comparisonResults.length > 0 && (
              <ComparisonMatrix
                results={comparisonResults}
                clientName={currentCase?.clientName}
                loanAmount={parseFloat(loanAmount) || 0}
                baseIncome={parseFloat(baseIncome) || 0}
                onClose={onClose}
              />
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
