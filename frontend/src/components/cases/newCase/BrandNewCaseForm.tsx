import {
  User,
  Landmark,
  Home,
  DollarSign,
  Percent,
  Phone,
  Mail,
} from 'lucide-react';
import { ScaffoldDirectoryPreview } from './ScaffoldDirectoryPreview';
import { AiQuickPrefillCard } from './AiQuickPrefillCard';

export interface BrandNewCaseFormValues {
  clientName: string;
  residency: string;
  employmentType: string;
  clientPhone: string;
  clientEmail: string;

  lender: string;
  loanType: string;
  docType: string;
  loanAmount: string;
  interestRate: string;

  propertyAddress: string;
  propertyValue: string;

  autoScaffold: boolean;
  parentPath: string;
}

interface BrandNewCaseFormProps {
  values: BrandNewCaseFormValues;
  onChange: (patch: Partial<BrandNewCaseFormValues>) => void;
  onBrowseParentPath: () => void;
  errors: Record<string, boolean>;
}

const COMMON_LENDERS = [
  'ORDE',
  'CBA',
  'Westpac',
  'NAB',
  'ANZ',
  'Macquarie',
  'Latrobe',
  'Pepper',
];

const RESIDENCY_OPTIONS = [
  { id: 'Citizen/PR', label: '澳洲公民 / PR' },
  { id: 'TR', label: '临时居民 TR' },
  { id: 'Foreign', label: '纯海外投资者' },
  { id: 'Other', label: '其它身份' },
];

const EMPLOYMENT_OPTIONS = [
  { id: 'Self-employed', label: '自雇 (ABN/Sole Trader)' },
  { id: 'PAYG', label: '全职/兼职 (PAYG)' },
  { id: 'Company', label: '公司名义 / 信托' },
  { id: 'Investment', label: '租金及投资收益' },
];

const LOAN_TYPES = [
  { id: 'Purchase', label: '购房 (Purchase)' },
  { id: 'Refinance', label: '转贷 (Refinance)' },
  { id: 'Commercial', label: '商业贷 (Commercial)' },
  { id: 'Construction', label: '建筑贷 (Construction)' },
];

const DOC_TYPES = [
  { id: 'Alt Doc', label: 'Alt Doc (简易材料)' },
  { id: 'Full Doc', label: 'Full Doc (标准全套)' },
  { id: 'Lite Doc', label: 'Lite Doc (快审材料)' },
  { id: 'Low Doc', label: 'Low Doc (低材料)' },
];

export function BrandNewCaseForm({
  values,
  onChange,
  onBrowseParentPath,
  errors,
}: BrandNewCaseFormProps) {
  // LVR 计算
  const loanNum = parseFloat(values.loanAmount.replace(/[^0-9.]/g, '')) || 0;
  const propValNum = parseFloat(values.propertyValue.replace(/[^0-9.]/g, '')) || 0;
  const calculatedLvr = propValNum > 0 && loanNum > 0 ? (loanNum / propValNum) * 100 : null;

  return (
    <div className="space-y-4" id="brand-new-case-form">
      {/* 0. AI 极速预填助手 (AI Smart Quick-Fill) */}
      <AiQuickPrefillCard onApplyPrefill={onChange} />

      {/* 1. 借款人基本信息 (Borrower Profile) */}
      <div
        className="p-4 rounded-2xl border space-y-3"
        style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
        id="section-borrower-profile"
      >
        <div
          className="flex items-center justify-between pb-2 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <h3
            className="text-xs font-bold flex items-center space-x-1.5"
            style={{ color: 'var(--text-primary)' }}
          >
            <User className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
            <span>1. 借款人基本信息 (Borrower Profile)</span>
          </h3>
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
            客户核心画像
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* 客户姓名 */}
          <div className="space-y-1.5">
            <label
              className="text-xs font-semibold flex items-center justify-between"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span>
                客户姓名 <span className="text-red-500 font-bold">*</span>
              </span>
              {errors.clientName && (
                <span className="text-[10px] text-red-500 font-bold">必填项</span>
              )}
            </label>
            <input
              type="text"
              value={values.clientName}
              onChange={(e) => onChange({ clientName: e.target.value })}
              placeholder="如 Li Ming / 张伟"
              className="w-full px-3 py-2 rounded-xl border text-xs transition-colors"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: errors.clientName ? 'var(--red)' : 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* 身份状态 */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              居住身份
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {RESIDENCY_OPTIONS.map((opt) => {
                const isActive = values.residency === opt.id;
                return (
                  <button
                    type="button"
                    key={opt.id}
                    onClick={() => onChange({ residency: opt.id })}
                    className="px-2 py-1.5 rounded-lg text-xs font-medium border transition-all text-center truncate cursor-pointer"
                    style={{
                      backgroundColor: isActive ? 'var(--accent-soft)' : 'var(--bg-card)',
                      borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                      color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: isActive ? 700 : 500,
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 雇佣类型 */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              雇佣与收入结构
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {EMPLOYMENT_OPTIONS.map((opt) => {
                const isActive = values.employmentType === opt.id;
                return (
                  <button
                    type="button"
                    key={opt.id}
                    onClick={() => onChange({ employmentType: opt.id })}
                    className="px-2 py-1.5 rounded-lg text-xs font-medium border transition-all text-center truncate cursor-pointer"
                    style={{
                      backgroundColor: isActive ? 'var(--accent-soft)' : 'var(--bg-card)',
                      borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                      color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: isActive ? 700 : 500,
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 联系电话 */}
          <div className="space-y-1.5">
            <label
              className="text-xs font-semibold flex items-center space-x-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Phone className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
              <span>联系电话 (可选)</span>
            </label>
            <input
              type="text"
              value={values.clientPhone}
              onChange={(e) => onChange({ clientPhone: e.target.value })}
              placeholder="04xx xxx xxx"
              className="w-full px-3 py-2 rounded-xl border text-xs transition-colors"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* 电子邮箱 */}
          <div className="space-y-1.5">
            <label
              className="text-xs font-semibold flex items-center space-x-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Mail className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
              <span>联系邮箱 (可选)</span>
            </label>
            <input
              type="email"
              value={values.clientEmail}
              onChange={(e) => onChange({ clientEmail: e.target.value })}
              placeholder="client@example.com"
              className="w-full px-3 py-2 rounded-xl border text-xs transition-colors"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>
      </div>

      {/* 2. 意向贷款方案 (Loan Structure) */}
      <div
        className="p-4 rounded-2xl border space-y-3"
        style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
        id="section-loan-structure"
      >
        <div
          className="flex items-center justify-between pb-2 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <h3
            className="text-xs font-bold flex items-center space-x-1.5"
            style={{ color: 'var(--text-primary)' }}
          >
            <Landmark className="w-3.5 h-3.5" style={{ color: 'var(--yellow)' }} />
            <span>2. 意向贷款方案 (Loan Structure)</span>
          </h3>
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
            机构与产品配置
          </span>
        </div>

        {/* 目标机构快捷选择 */}
        <div className="space-y-1.5">
          <label
            className="text-xs font-semibold flex items-center justify-between"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span>目标信贷机构 (Lender)</span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              点击快捷选定或直接输入
            </span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_LENDERS.map((bank) => {
              const isActive = values.lender === bank;
              return (
                <button
                  type="button"
                  key={bank}
                  onClick={() => onChange({ lender: bank })}
                  className="px-3 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer"
                  style={{
                    backgroundColor: isActive ? 'var(--accent-soft)' : 'var(--bg-card)',
                    borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                    color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                >
                  {bank}
                </button>
              );
            })}
          </div>
          <input
            type="text"
            value={values.lender}
            onChange={(e) => onChange({ lender: e.target.value })}
            placeholder="自定义输入机构名称，如 ORDE / NAB"
            className="w-full px-3 py-2 rounded-xl border text-xs transition-colors mt-1"
            style={{
              backgroundColor: 'var(--bg-input)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
          {/* 贷款类型 */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              贷款类型
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {LOAN_TYPES.map((lt) => {
                const isActive = values.loanType === lt.id;
                return (
                  <button
                    type="button"
                    key={lt.id}
                    onClick={() => onChange({ loanType: lt.id })}
                    className="px-2 py-1.5 rounded-lg text-xs font-medium border transition-all text-center truncate cursor-pointer"
                    style={{
                      backgroundColor: isActive ? 'var(--accent-soft)' : 'var(--bg-card)',
                      borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                      color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: isActive ? 700 : 500,
                    }}
                  >
                    {lt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 方案类型 */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              材料方案类型
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {DOC_TYPES.map((dt) => {
                const isActive = values.docType === dt.id;
                return (
                  <button
                    type="button"
                    key={dt.id}
                    onClick={() => onChange({ docType: dt.id })}
                    className="px-2 py-1.5 rounded-lg text-xs font-medium border transition-all text-center truncate cursor-pointer"
                    style={{
                      backgroundColor: isActive ? 'var(--accent-soft)' : 'var(--bg-card)',
                      borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                      color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: isActive ? 700 : 500,
                    }}
                  >
                    {dt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 预估借款金额 */}
          <div className="space-y-1.5">
            <label
              className="text-xs font-semibold flex items-center justify-between"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span className="flex items-center space-x-1">
                <DollarSign className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                <span>预估贷款金额 ($)</span>
              </span>
              <div className="space-x-1">
                {['600000', '800000', '1000000', '1500000'].map((amt) => (
                  <button
                    type="button"
                    key={amt}
                    onClick={() => onChange({ loanAmount: amt })}
                    className="text-[10px] px-1.5 py-0.5 rounded border font-mono transition-colors cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    ${parseInt(amt) / 10000}万
                  </button>
                ))}
              </div>
            </label>
            <input
              type="number"
              value={values.loanAmount}
              onChange={(e) => onChange({ loanAmount: e.target.value })}
              placeholder="例如 850000"
              className="w-full px-3 py-2 rounded-xl border text-xs font-mono transition-colors"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* 期望利率 */}
          <div className="space-y-1.5">
            <label
              className="text-xs font-semibold flex items-center space-x-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Percent className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
              <span>期望申请利率 (%)</span>
            </label>
            <input
              type="text"
              value={values.interestRate}
              onChange={(e) => onChange({ interestRate: e.target.value })}
              placeholder="例如 5.89"
              className="w-full px-3 py-2 rounded-xl border text-xs font-mono transition-colors"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>
      </div>

      {/* 3. 抵押物业 (Security Property) */}
      <div
        className="p-4 rounded-2xl border space-y-3"
        style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
        id="section-security-property"
      >
        <div
          className="flex items-center justify-between pb-2 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <h3
            className="text-xs font-bold flex items-center space-x-1.5"
            style={{ color: 'var(--text-primary)' }}
          >
            <Home className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} />
            <span>3. 抵押物业 (Security Property)</span>
          </h3>
          {calculatedLvr !== null && (
            <span
              className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full"
              style={{
                backgroundColor: calculatedLvr <= 80 ? 'var(--green-soft)' : 'var(--yellow-soft)',
                color: calculatedLvr <= 80 ? 'var(--green)' : 'var(--yellow)',
              }}
            >
              LVR: {calculatedLvr.toFixed(1)}% {calculatedLvr <= 80 ? '(安全区间)' : '(需 LMI / 特批)'}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* 物业地址 */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              抵押物业地址
            </label>
            <input
              type="text"
              value={values.propertyAddress}
              onChange={(e) => onChange({ propertyAddress: e.target.value })}
              placeholder="例如 123 George St, Sydney NSW 2000"
              className="w-full px-3 py-2 rounded-xl border text-xs transition-colors"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* 预估价值 */}
          <div className="space-y-1.5">
            <label
              className="text-xs font-semibold flex items-center justify-between"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span>预估房产估值 ($)</span>
              <div className="space-x-1">
                {['800000', '1000000', '1200000', '2000000'].map((amt) => (
                  <button
                    type="button"
                    key={amt}
                    onClick={() => onChange({ propertyValue: amt })}
                    className="text-[10px] px-1.5 py-0.5 rounded border font-mono transition-colors cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    ${parseInt(amt) / 10000}万
                  </button>
                ))}
              </div>
            </label>
            <input
              type="number"
              value={values.propertyValue}
              onChange={(e) => onChange({ propertyValue: e.target.value })}
              placeholder="例如 1100000"
              className="w-full px-3 py-2 rounded-xl border text-xs font-mono transition-colors"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>
      </div>

      {/* 4. 本地工作目录自动脚手架 (Directory Scaffolding) */}
      <ScaffoldDirectoryPreview
        autoScaffold={values.autoScaffold}
        onToggleAutoScaffold={(val) => onChange({ autoScaffold: val })}
        parentPath={values.parentPath}
        onChangeParentPath={(path) => onChange({ parentPath: path })}
        onBrowseParentPath={onBrowseParentPath}
        clientName={values.clientName}
        loanType={values.loanType}
        lender={values.lender}
        propertyAddress={values.propertyAddress}
      />
    </div>
  );
}
