import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  X,
  CheckSquare,
  Square,
  Sparkles,
  ListChecks,
  Save,
} from 'lucide-react';
import { getChecklist, adjustInitialChecklist } from '../../services/api/cases';
import { useToastStore } from '../../stores/toastStore';
import { useCaseStore } from '../../stores/caseStore';

interface ChecklistAdjustModalProps {
  caseId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

// 首次材料 8 大板块 21 项标准全集
interface MasterTemplateItem {
  id: string;
  nameZh: string;
  nameEn: string;
  kind: 'document' | 'info';
  category: string;
  defaultFor?: (profile: { employmentType?: string; residency?: string; purpose?: string }) => boolean;
}

interface MasterSection {
  id: string;
  title: string;
  items: MasterTemplateItem[];
}

const MASTER_SECTIONS: MasterSection[] = [
  {
    id: 'id',
    title: '🆔 身份证明 (ID)',
    items: [
      { id: 'driver_license', nameZh: '驾照正反面 (Driver Licence)', nameEn: 'Driver Licence/Proof of ID (Front & Back)', kind: 'document', category: 'identity', defaultFor: () => true },
      { id: 'passport', nameZh: '有效护照 (Passport)', nameEn: 'Passport', kind: 'document', category: 'identity', defaultFor: () => true },
      { id: 'visa_grant', nameZh: '准签信 (VISA - 非澳公民适用)', nameEn: 'VISA (if non-AU citizen)', kind: 'document', category: 'identity', defaultFor: (p) => p.residency !== 'Citizen' && p.residency !== 'PR' },
    ],
  },
  {
    id: 'income',
    title: '💰 收入 (Income)',
    items: [
      { id: 'payslip_2', nameZh: '2 张最新工资单 (2 Payslips)', nameEn: 'Most recent 2 payslips from current employer', kind: 'document', category: 'income_payg', defaultFor: (p) => p.employmentType !== 'SelfEmployed' },
      { id: 'salary_credit_statement', nameZh: '6 个月工资入账流水 (Salary Credits)', nameEn: 'Bank Statement (Salary Credits, 6 months)', kind: 'document', category: 'income_payg', defaultFor: (p) => p.employmentType !== 'SelfEmployed' },
      { id: 'ato_income_statement', nameZh: 'ATO 收入声明 (ATO Income Statement)', nameEn: 'ATO Income Statement', kind: 'document', category: 'income_payg', defaultFor: () => true },
      { id: 'accounting_financial_report', nameZh: '最新 2 年公司财报 (Company Financials)', nameEn: 'Company Financial Statements (latest 2 financial years)', kind: 'document', category: 'income_self_employed', defaultFor: (p) => p.employmentType === 'SelfEmployed' },
      { id: 'tax_return_2yr', nameZh: '最新 2 年公司/个人税单 (Tax Returns)', nameEn: 'Tax Returns (latest 2 financial years)', kind: 'document', category: 'income_self_employed', defaultFor: (p) => p.employmentType === 'SelfEmployed' },
      { id: 'tax_return_1yr', nameZh: '1 年税单与评税通知 (Notice of Assessment)', nameEn: 'Notice of Assessment (latest 2 financial years)', kind: 'document', category: 'income_self_employed', defaultFor: (p) => p.employmentType === 'SelfEmployed' },
      { id: 'bas_statements', nameZh: '最新季度 BAS 对账单 (BAS Statements)', nameEn: 'BAS statements (latest quarters)', kind: 'document', category: 'income_self_employed', defaultFor: (p) => p.employmentType === 'SelfEmployed' },
      { id: 'rental_statement', nameZh: '投资房租金流水/协议 (Rental Statement)', nameEn: 'Rental statement/agreement for investment properties', kind: 'document', category: 'income_payg', defaultFor: () => false },
    ],
  },
  {
    id: 'employment_history',
    title: '👔 雇主历史 (Employment History)',
    items: [
      { id: 'employment_history', nameZh: '最近 3 年雇主历史 (3 Years History)', nameEn: 'Most recent 3 years employment history', kind: 'info', category: 'special', defaultFor: () => true },
    ],
  },
  {
    id: 'living_expense',
    title: '🛒 生活开支 (Living Expense)',
    items: [
      { id: 'living_expense_statement', nameZh: '6 个月生活开支主账户流水 (Living Expenses)', nameEn: "6 months' bank statement for primary living expenses", kind: 'document', category: 'special', defaultFor: () => true },
    ],
  },
  {
    id: 'liability',
    title: '💳 负债 (Liability)',
    items: [
      { id: 'existing_loan_statement', nameZh: '现有房贷 6 个月对账单 (Home Loan Statement)', nameEn: 'Most recent 6 months home loan statements', kind: 'document', category: 'special', defaultFor: (p) => p.purpose === 'Refinance' },
      { id: 'credit_card_statement', nameZh: '信用卡 60 天内对账单 (Credit Card Statement)', nameEn: 'Credit Card Statement within 60 days', kind: 'document', category: 'special', defaultFor: () => true },
      { id: 'car_loan_statement', nameZh: '车贷/个人贷款对账单 (Car/Personal Loan)', nameEn: 'Car loan / Personal loan statement', kind: 'document', category: 'special', defaultFor: () => false },
    ],
  },
  {
    id: 'living_history',
    title: '🏠 居住历史 (Living History)',
    items: [
      { id: 'living_history', nameZh: '最近 3 年居住历史 (3 Years Living History)', nameEn: 'Most recent 3 years living history (Address + dates)', kind: 'info', category: 'special', defaultFor: () => true },
    ],
  },
  {
    id: 'asset',
    title: '🏢 资产 (Asset)',
    items: [
      { id: 'council_rates_notice', nameZh: '市政费通知 (Council Rates Notice)', nameEn: 'Recent Council rates notice', kind: 'document', category: 'property', defaultFor: (p) => p.purpose === 'Refinance' },
      { id: 'contract_of_sale', nameZh: '购房合同 (Contract of Sale/Advice)', nameEn: 'Contract of Sales / Sales Advice', kind: 'document', category: 'property', defaultFor: (p) => p.purpose !== 'Refinance' },
      { id: 'deposit_receipt', nameZh: '首付定金收据 (Deposit Receipt)', nameEn: 'Deposit receipt', kind: 'document', category: 'property', defaultFor: (p) => p.purpose !== 'Refinance' },
      { id: 'savings_proof', nameZh: '存款余额证明 (Savings Proof)', nameEn: 'Savings - proof of balance', kind: 'document', category: 'special', defaultFor: () => true },
      { id: 'super_statement', nameZh: '养老金 Super 余额证明 (Superannuation)', nameEn: 'Superannuation Statement', kind: 'document', category: 'special', defaultFor: () => false },
      { id: 'vehicle_asset_info', nameZh: '车辆资产信息 (Vehicle Asset Info)', nameEn: 'Vehicle asset (Make/model/value)', kind: 'info', category: 'special', defaultFor: () => false },
      { id: 'trust_deed', nameZh: '信托契约 (Certified Trust Deed)', nameEn: 'Recently certified Trust Deed', kind: 'document', category: 'special', defaultFor: () => false },
    ],
  },
  {
    id: 'solicitor',
    title: '⚖️ 律师/过户师 (Solicitor Information)',
    items: [
      { id: 'solicitor_info', nameZh: '律师/过户师姓名与律所联系方式', nameEn: 'Solicitor / Conveyancer Info (Company, Name, Email, Phone)', kind: 'info', category: 'special', defaultFor: () => true },
    ],
  },
];

export function ChecklistAdjustModal({ caseId, isOpen, onClose, onSaved }: ChecklistAdjustModalProps) {
  const reduced = useReducedMotion();
  const showToast = useToastStore((s) => s.showToast);
  const currentCase = useCaseStore((s) => s.currentCase);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // 初始化加载当前案件既有清单项
  useEffect(() => {
    if (!isOpen || !caseId) return;
    getChecklist(caseId)
      .then((items) => {
        const activeIds = new Set<string>();
        // 匹配已存在的 master_id 或 nameZh
        for (const item of items || []) {
          if ((item.phase || 'initial') !== 'initial') continue;
          const mid = item.master_id;
          if (mid) {
            activeIds.add(mid);
          } else {
            const rawName = (item.item_name || item.name_zh || item.name || '').toLowerCase();
            const matched = MASTER_SECTIONS.flatMap((s) => s.items).find(
              (m) => rawName.includes(m.id.toLowerCase()) || rawName.includes(m.nameZh.slice(0, 2).toLowerCase())
            );
            if (matched) activeIds.add(matched.id);
          }
        }
        // 如果目前完全没有选择项，则按画像智能推荐
        if (activeIds.size === 0) {
          applyProfileDefaults(activeIds);
        }
        setSelectedIds(activeIds);
      })
      .catch(() => {
        const activeIds = new Set<string>();
        applyProfileDefaults(activeIds);
        setSelectedIds(activeIds);
      });
  }, [isOpen, caseId]);

  const applyProfileDefaults = (targetSet: Set<string>) => {
    const profile = {
      employmentType: (currentCase as any)?.employmentType || 'PAYG',
      residency: (currentCase as any)?.residency || 'PR',
      purpose: (currentCase as any)?.purpose || 'Purchase',
    };
    for (const sec of MASTER_SECTIONS) {
      for (const it of sec.items) {
        if (it.defaultFor && it.defaultFor(profile)) {
          targetSet.add(it.id);
        }
      }
    }
  };

  const handleApplyDefaults = () => {
    const fresh = new Set<string>();
    applyProfileDefaults(fresh);
    setSelectedIds(fresh);
    showToast('info', '已根据当前客户画像重置推荐勾选项');
  };

  const handleToggleItem = (itemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const all = new Set(MASTER_SECTIONS.flatMap((s) => s.items).map((i) => i.id));
    setSelectedIds(all);
  };

  const handleClearAll = () => {
    setSelectedIds(new Set());
  };

  const totalCount = useMemo(() => MASTER_SECTIONS.flatMap((s) => s.items).length, []);

  // 提交保存：原子级重设首次材料清单（杜绝叠加与重名）
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await adjustInitialChecklist(caseId, Array.from(selectedIds));
      showToast('success', `已成功配置首次材料清单（生效 ${selectedIds.size} 项）`);
      window.dispatchEvent(new CustomEvent('checklist_updated', { detail: { caseId } }));
      if (onSaved) onSaved();
      onClose();
    } catch (err: any) {
      showToast('error', err?.message || '保存清单配置失败');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-app)]/70 backdrop-blur-xs"
        onClick={onClose}
      >
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full max-w-3xl rounded-2xl border p-5 shadow-2xl space-y-4 max-h-[88vh] flex flex-col"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          onClick={(e) => e.stopPropagation()}
          id="checklist-adjust-modal"
        >
          {/* 头部标题与控制 */}
          <div className="flex items-start justify-between pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center space-x-2.5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shadow-xs"
                style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                <ListChecks className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-extrabold text-sm tracking-tight" style={{ color: 'var(--text-primary)' }}>
                    首次材料清单配置 · 8 大标准板块勾选
                  </h3>
                  <span className="px-2 py-0.2 rounded-full text-[10px] font-mono font-bold bg-[var(--accent-soft)] text-[var(--accent)]">
                    已选 {selectedIds.size} / 共 {totalCount} 项
                  </span>
                </div>
                <p className="text-xs text-muted">
                  在此勾选要向客户索要的材料。确认后右栏将只展示已勾选项作为跟进台账。
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:opacity-75 transition-opacity cursor-pointer text-muted"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 快捷操作栏 */}
          <div
            className="p-2.5 rounded-xl border flex items-center justify-between text-xs"
            style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleApplyDefaults}
                className="px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center space-x-1.5 cursor-pointer bg-[var(--bg-card)] hover:border-[var(--accent)] text-[var(--accent)] transition-all shadow-xs"
                style={{ borderColor: 'var(--border)' }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>智能画像推荐</span>
              </button>

              <button
                type="button"
                onClick={handleSelectAll}
                className="px-2 py-1 rounded-lg text-xs font-semibold text-muted hover:text-primary cursor-pointer"
              >
                全选
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="px-2 py-1 rounded-lg text-xs font-semibold text-muted hover:text-primary cursor-pointer"
              >
                清空
              </button>
            </div>

            <span className="text-[11px] text-muted">
              💡 包含 📄 文件项 与 ✍️ Fact Find 信息项
            </span>
          </div>

          {/* 8 大板块勾选列表 */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs no-scrollbar">
            {MASTER_SECTIONS.map((section) => {
              const selectedInSection = section.items.filter((it) => selectedIds.has(it.id)).length;
              return (
                <div
                  key={section.id}
                  className="rounded-xl border p-3 space-y-2.5"
                  style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border)' }}
                >
                  {/* 板块 Header */}
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-xs" style={{ color: 'var(--text-primary)' }}>
                      {section.title}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--bg-card)] text-muted">
                      {selectedInSection} / {section.items.length} 已选
                    </span>
                  </div>

                  {/* 板块内部材料项复选框 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {section.items.map((item) => {
                      const isSelected = selectedIds.has(item.id);
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleToggleItem(item.id)}
                          className={`p-2.5 rounded-xl border flex items-center space-x-2.5 transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[var(--bg-card)] border-[var(--accent)] shadow-xs'
                              : 'bg-[var(--bg-card)]/50 border-[var(--border)] opacity-70 hover:opacity-100'
                          }`}
                        >
                          <button type="button" className="flex-shrink-0 text-[var(--accent)]">
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-[var(--accent)]" />
                            ) : (
                              <Square className="w-4 h-4 text-muted" />
                            )}
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-bold text-xs truncate" style={{ color: 'var(--text-primary)' }}>
                                {item.nameZh}
                              </span>
                              {item.kind === 'info' && (
                                <span className="text-[9px] font-bold px-1 rounded bg-[var(--purple-soft)] text-[var(--purple)] flex-shrink-0">
                                  ✍️ 信息
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted truncate">{item.nameEn}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 底部保存按钮 */}
          <div className="pt-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl border text-xs font-semibold text-muted hover:text-primary cursor-pointer"
              style={{ borderColor: 'var(--border)' }}
            >
              取消
            </button>

            <motion.button
              whileTap={reduced ? undefined : { scale: 0.95 }}
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white flex items-center space-x-2 cursor-pointer shadow-md disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent)' }}
              id="confirm-adjust-checklist-btn"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? '正在保存...' : `确认保存选定的 ${selectedIds.size} 项材料`}</span>
            </motion.button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
