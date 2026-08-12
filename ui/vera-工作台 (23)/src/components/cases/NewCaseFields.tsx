import { UserCheck, Sparkles, Link as LinkIcon, UserPlus } from 'lucide-react';
import { motion } from 'motion/react';

export interface NewCaseFormValues {
  clientName: string; clientEmail: string; clientPhone: string; brokerName: string;
  lender: string; loanAmount: string; propertyValue: string; purpose: string;
  interestRate: string; financeClauseDate: string; incomeDescription: string;
  submissionPlatform: string; clientGoal: string; specialCircumstances: string;
  rawText: string; isForceNewClient?: boolean; linkedClientId?: string | null;
}

interface Props {
  values: NewCaseFormValues;
  onChange: (patch: Partial<NewCaseFormValues>) => void;
  highlightedFields: string[];
  onParse: () => void;
  isParsing: boolean;
}

const SPECIALS = ['首付款含大额境外赠予', '海外兼职收入', '试用期', '自雇 ABN 不足 2 年'];

export function NewCaseFields({ values, onChange, highlightedFields, onParse, isParsing }: Props) {
  const loanVal = parseFloat(values.loanAmount) || 0;
  const propVal = parseFloat(values.propertyValue) || 0;
  const lvrText = propVal > 0 && loanVal > 0 ? `${((loanVal / propVal) * 100).toFixed(1)}% LVR` : null;
  const specials = values.specialCircumstances ? values.specialCircumstances.split(';').filter(Boolean) : [];

  const toggleSpecial = (opt: string) => {
    const next = specials.includes(opt) ? specials.filter((s) => s !== opt) : [...specials, opt];
    onChange({ specialCircumstances: next.join(';') });
  };

  const isH = (key: string) => highlightedFields.includes(key);
  const getB = (key: string) => isH(key) ? 'var(--orange)' : 'var(--border)';
  const showMatch = (values.clientName.trim() || values.clientEmail.trim()) && !values.isForceNewClient && !values.linkedClientId;

  return (
    <div className="space-y-3.5 text-xs">
      {/* 区分 一：客户基础信息 */}
      <div className="space-y-2 p-3 rounded-xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}>
        <div className="font-bold text-[11px] uppercase flex items-center space-x-1" style={{ color: 'var(--accent)' }}>
          <UserCheck className="w-3.5 h-3.5" /><span>一、客户基础信息</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="font-semibold block mb-0.5">姓名 <span className="text-red-500">*</span></label>
            <input id="newcase-client-name" required value={values.clientName} onChange={(e) => onChange({ clientName: e.target.value })} placeholder="例如: 张伟" className="w-full px-2.5 py-1 rounded-lg border bg-transparent outline-none" style={{ borderColor: getB('clientName') }} />
            {isH('clientName') && <p id="newcase-warn-clientName" className="text-[10px] text-amber-500">AI 标注：置信度较低，请手动核验</p>}
          </div>
          <div>
            <label className="font-semibold block mb-0.5">负责 Broker</label>
            <select id="newcase-broker" value={values.brokerName} onChange={(e) => onChange({ brokerName: e.target.value })} className="w-full px-2.5 py-1 rounded-lg border bg-transparent outline-none" style={{ borderColor: 'var(--border)' }}>
              <option value="Brandon">Brandon</option><option value="Judy">Judy</option><option value="其他">其他</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="font-semibold block mb-0.5">邮箱 <span className="text-red-500">*</span></label>
            <input id="newcase-client-email" type="email" required value={values.clientEmail} onChange={(e) => onChange({ clientEmail: e.target.value })} placeholder="client@example.com" className="w-full px-2.5 py-1 rounded-lg border bg-transparent outline-none" style={{ borderColor: getB('clientEmail') }} />
          </div>
          <div>
            <label className="font-semibold block mb-0.5">电话</label>
            <input id="newcase-client-phone" value={values.clientPhone} onChange={(e) => onChange({ clientPhone: e.target.value })} placeholder="0400 000 000" className="w-full px-2.5 py-1 rounded-lg border bg-transparent outline-none" style={{ borderColor: 'var(--border)' }} />
          </div>
        </div>

        {(showMatch || values.linkedClientId || values.isForceNewClient) && (
          <div id="newcase-client-match" className="p-2 rounded-lg border bg-amber-500/5 space-y-1" style={{ borderColor: 'rgba(245,158,11,0.3)' }}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-amber-600">检测到系统内已有同名/同邮箱客户 (1 匹配)</span>
              {values.linkedClientId && <span className="text-emerald-600 font-bold text-[10px]">已选择关联历史客户</span>}
              {values.isForceNewClient && <span className="text-indigo-600 font-bold text-[10px]">已选择强制新建独立客户</span>}
            </div>
            <div className="flex items-center space-x-2">
              <button type="button" onClick={() => onChange({ linkedClientId: 'CLI-MOCK-01', isForceNewClient: false })} className={`px-2 py-0.5 rounded border text-[10px] font-medium flex items-center space-x-1 cursor-pointer ${values.linkedClientId ? 'bg-amber-500 text-white border-amber-500' : 'text-amber-600 border-amber-500/40 hover:bg-amber-500/10'}`}>
                <LinkIcon className="w-3 h-3" /><span>关联为现有客户</span>
              </button>
              <button type="button" onClick={() => onChange({ isForceNewClient: true, linkedClientId: null })} className={`px-2 py-0.5 rounded border text-[10px] font-medium flex items-center space-x-1 cursor-pointer ${values.isForceNewClient ? 'bg-indigo-600 text-white border-indigo-600' : 'text-indigo-600 border-indigo-500/40 hover:bg-indigo-500/10'}`}>
                <UserPlus className="w-3 h-3" /><span>确认新建为同名独立新客户</span>
              </button>
            </div>
            <p className="text-[9px] text-muted italic font-mono">* TODO(WO-03): 后端客户查重端点就绪后真实调用</p>
          </div>
        )}
      </div>

      {/* 区分 二：贷款与财务 */}
      <div className="space-y-2 p-3 rounded-xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}>
        <div className="font-bold text-[11px] uppercase flex items-center justify-between" style={{ color: 'var(--accent)' }}>
          <span>二、贷款与财务</span>
          {lvrText && <span className="px-1.5 py-0.5 rounded font-mono font-bold bg-purple-500/10 text-purple-600">{lvrText}</span>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="font-semibold block mb-0.5">申请贷款额（万澳元） <span className="text-red-500">*</span></label>
            <input id="newcase-loan-amount" type="number" required value={values.loanAmount} onChange={(e) => onChange({ loanAmount: e.target.value })} placeholder="85" className="w-full px-2.5 py-1 rounded-lg border bg-transparent outline-none font-mono" style={{ borderColor: getB('loanAmount') }} />
          </div>
          <div>
            <label className="font-semibold block mb-0.5">房产总价值（万澳元）</label>
            <input id="newcase-property-value" type="number" value={values.propertyValue} onChange={(e) => onChange({ propertyValue: e.target.value })} placeholder="100" className="w-full px-2.5 py-1 rounded-lg border bg-transparent outline-none font-mono" style={{ borderColor: getB('propertyValue') }} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="font-semibold block mb-0.5">推荐/意向银行</label>
            <select id="newcase-lender" value={values.lender} onChange={(e) => onChange({ lender: e.target.value })} className="w-full px-2.5 py-1 rounded-lg border bg-transparent outline-none" style={{ borderColor: 'var(--border)' }}>
              {['ANZ', 'CBA', 'NAB', 'Westpac', 'Macquarie', 'Bankwest', 'Suncorp', 'St.George', '其他'].map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="font-semibold block mb-0.5">申请用途</label>
            <select id="newcase-purpose" value={values.purpose} onChange={(e) => onChange({ purpose: e.target.value })} className="w-full px-2.5 py-1 rounded-lg border bg-transparent outline-none" style={{ borderColor: 'var(--border)' }}>
              {['自住购房', '投资购房', '转贷', '套现'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="font-semibold block mb-0.5">申请利率 %</label>
            <input id="newcase-interest-rate" type="number" step="0.01" value={values.interestRate} onChange={(e) => onChange({ interestRate: e.target.value })} placeholder="6.14" className="w-full px-2 py-1 rounded-lg border bg-transparent outline-none font-mono" style={{ borderColor: getB('interestRate') }} />
            {isH('interestRate') && <p id="newcase-warn-interestRate" className="text-[9px] text-amber-500">AI 标注：置信度较低，请手动核验</p>}
          </div>
          <div>
            <label className="font-semibold block mb-0.5">Finance Clause 截止</label>
            <input id="newcase-finance-clause-date" type="date" value={values.financeClauseDate} onChange={(e) => onChange({ financeClauseDate: e.target.value })} className="w-full px-2 py-0.5 rounded-lg border bg-transparent outline-none text-[11px]" style={{ borderColor: getB('financeClauseDate') }} />
            {isH('financeClauseDate') && <p id="newcase-warn-financeClauseDate" className="text-[9px] text-amber-500">AI 标注：置信度较低，请手动核验</p>}
          </div>
          <div>
            <label className="font-semibold block mb-0.5">递交平台</label>
            <select id="newcase-submission-platform" value={values.submissionPlatform} onChange={(e) => onChange({ submissionPlatform: e.target.value })} className="w-full px-2 py-1 rounded-lg border bg-transparent outline-none" style={{ borderColor: 'var(--border)' }}>
              <option value="ApplyOnline">ApplyOnline</option><option value="Loanapp">Loanapp</option><option value="手动递交">手动递交</option>
            </select>
          </div>
        </div>
      </div>

      {/* 区分 三：收入与背景 */}
      <div className="space-y-2 p-3 rounded-xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}>
        <div className="font-bold text-[11px] uppercase" style={{ color: 'var(--accent)' }}>三、收入与背景</div>
        <div>
          <label className="font-semibold block mb-0.5">年收入与职业属性描述</label>
          <textarea id="newcase-income-description" rows={2} value={values.incomeDescription} onChange={(e) => onChange({ incomeDescription: e.target.value })} placeholder="例如: 全职软件工程师，年薪 $18万..." className="w-full px-2.5 py-1 rounded-lg border bg-transparent outline-none text-[11px]" style={{ borderColor: getB('incomeDescription') }} />
          {isH('incomeDescription') && <p id="newcase-warn-incomeDescription" className="text-[10px] text-amber-500">AI 标注：置信度较低，请手动核验</p>}
        </div>
        <div>
          <label className="font-semibold block mb-0.5">客户目标</label>
          <input id="newcase-client-goal" value={values.clientGoal} onChange={(e) => onChange({ clientGoal: e.target.value })} placeholder="例如: 赶在 Finance Clause 到期前获得 Formal Approval" className="w-full px-2.5 py-1 rounded-lg border bg-transparent outline-none" style={{ borderColor: 'var(--border)' }} />
        </div>
        <div id="newcase-special-circumstances" className="space-y-1">
          <label className="font-semibold block">特殊情况选择</label>
          <div className="grid grid-cols-2 gap-1">
            {SPECIALS.map((opt) => (
              <label key={opt} className="flex items-center space-x-1.5 cursor-pointer text-[11px]">
                <input type="checkbox" checked={specials.includes(opt)} onChange={() => toggleSpecial(opt)} className="rounded accent-[var(--accent)]" />
                <span style={{ color: 'var(--text-secondary)' }}>{opt}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* 区分 四：AI 解析 */}
      <div className="space-y-2 p-3 rounded-xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}>
        <div className="flex items-center justify-between">
          <div className="font-bold text-[11px] uppercase flex items-center space-x-1" style={{ color: 'var(--purple)' }}>
            <Sparkles className="w-3.5 h-3.5" /><span>四、粘贴聊天记录 AI 自动解析</span>
          </div>
          <motion.button whileTap={{ scale: 0.95 }} type="button" id="newcase-ai-parse-btn" disabled={isParsing} onClick={onParse} className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-white flex items-center space-x-1 bg-purple-600 hover:bg-purple-700 cursor-pointer disabled:opacity-50">
            <Sparkles className="w-3 h-3" /><span>{isParsing ? '解析中...' : '🤖 AI 智能解析'}</span>
          </motion.button>
        </div>
        <textarea id="newcase-raw-text" rows={2} value={values.rawText} onChange={(e) => onChange({ rawText: e.target.value })} placeholder="粘贴客户微信对话、邮件摘要原文..." className="w-full p-2 rounded-lg border bg-transparent outline-none font-mono text-[11px]" style={{ borderColor: 'var(--border)' }} />
      </div>
    </div>
  );
}
