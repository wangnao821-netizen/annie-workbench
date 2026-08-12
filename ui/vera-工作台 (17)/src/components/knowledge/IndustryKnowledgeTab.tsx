import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Building2, Layers, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';

type SubTab = 'policies' | 'platforms' | 'compliance';

const SUB_TABS: { key: SubTab; label: string; icon: React.ElementType }[] = [
  { key: 'policies', label: '银行政策', icon: Building2 },
  { key: 'platforms', label: '平台规则', icon: Layers },
  { key: 'compliance', label: '合规红线', icon: ShieldAlert },
];

const BANK_POLICIES = [
  {
    bank: 'CBA',
    points: '自雇 ABN 须 18 个月以上，配合会计师信审批；海外转款需全额 Gift Letter。',
    fit: '自雇人士 / 快速审批 / 多套投资房',
    unfit: '12 个月以下新 ABN / 无证明海外汇款',
  },
  {
    bank: 'ANZ',
    points: '预批效期 3 个月；自雇 ABN 硬性要求 24 个月；暂不接受单一海外纯收入。',
    fit: '极速转案 / 复杂身份评估',
    unfit: '18 个月 ABN 自雇 / 纯海外薪资递交',
  },
  {
    bank: 'NAB',
    points: '支持预批转正式批复；容许 NOA 与 Payslip $100 以内交叉差异。',
    fit: '复杂红线案件 / 转案重审',
    unfit: '无澳洲本地身份',
  },
  {
    bank: 'Westpac',
    points: '租金收入打折系数 80%；现房交割支持加急专线。',
    fit: '多套房投资组合 / 现房加急',
    unfit: '缺少完整租约凭证',
  },
];

const PLATFORM_RULES = [
  { name: 'ApplyOnline', desc: 'PDF 附件必须去除密码保护；多文件合并上传不能超过 25MB；命名必须包含 Client Name + Doc Type。' },
  { name: 'Loanapp', desc: '身份证明文件必须全彩扫描（不能黑白）；工资单需要包含雇主 ABN 与 YTD 累计总额。' },
];

const COMPLIANCE_REDLINES = [
  { title: 'API Key & 敏感秘钥保护', text: '不硬编码 API Key 和路径，一律从环境变量读取，不提交进代码。' },
  { title: '演示数据脱敏', text: 'Mock 数据必须脱敏，使用 PERSON_1、$100,000 等占位，禁止写入真实客户真实联系方式。' },
  { title: '禁止自动触发动作', text: '所有发送、提交类动作必须 Vera 显式点击确认，并提供可撤销/回退出口。' },
  { title: '金额与银行名称原样展示', text: '金额、银行名、日期原样展示（$850,000、CBA、Westpac 保持原样，不格式化改写）。' },
];

export function IndustryKnowledgeTab() {
  const reduced = useReducedMotion();
  const [subTab, setSubTab] = useState<SubTab>('policies');

  return (
    <div className="space-y-4" id="industry-knowledge-tab">
      {/* Sub tabs bar */}
      <div className="flex items-center space-x-2 border-b pb-2" style={{ borderColor: 'var(--border)' }}>
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = subTab === tab.key;
          return (
            <motion.button
              key={tab.key}
              whileTap={{ scale: 0.97 }}
              onClick={() => setSubTab(tab.key)}
              className={`relative px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 cursor-pointer transition-colors ${
                isActive ? 'text-[var(--accent)]' : 'text-secondary hover:text-primary'
              }`}
              id={`industry-subtab-${tab.key}`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {isActive && !reduced && (
                <motion.span
                  layoutId="industry-subtab-underline"
                  className="absolute -bottom-2 left-1.5 right-1.5 h-[2px] rounded-full"
                  style={{ backgroundColor: 'var(--accent)' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              {isActive && reduced && (
                <span className="absolute -bottom-2 left-1.5 right-1.5 h-[2px] rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
              )}
            </motion.button>
          );
        })}
      </div>

      <p className="text-[11px] font-mono text-muted">
        TODO(WO-03/后端): 数据源 config/lender_policies.yaml 种子灌入后替换
      </p>

      {/* Sub tab contents */}
      <AnimatePresence mode="wait">
        <motion.div
          key={subTab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.15 }}
          className="space-y-3"
        >
          {subTab === 'policies' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {BANK_POLICIES.map((p) => (
                <div key={p.bank} className="p-4 rounded-2xl border space-y-2.5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}>
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400">{p.bank}</span>
                    <span className="text-[10px] text-muted">政策规则要点</span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{p.points}</p>
                  <div className="pt-2 border-t space-y-1.5" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center space-x-1.5 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      <span className="text-muted">适合：</span>
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{p.fit}</span>
                    </div>
                    <div className="flex items-center space-x-1.5 text-[11px]">
                      <XCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                      <span className="text-muted">不适合：</span>
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{p.unfit}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {subTab === 'platforms' && (
            <div className="space-y-3">
              {PLATFORM_RULES.map((rule) => (
                <div key={rule.name} className="p-4 rounded-2xl border space-y-2" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}>
                  <div className="flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-amber-500" />
                    <h4 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{rule.name} 递交平台规范</h4>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{rule.desc}</p>
                </div>
              ))}
            </div>
          )}

          {subTab === 'compliance' && (
            <div className="space-y-3">
              {COMPLIANCE_REDLINES.map((red) => (
                <div key={red.title} className="p-4 rounded-2xl border space-y-1.5 border-rose-500/20" style={{ backgroundColor: 'var(--bg-card)', boxShadow: 'var(--shadow-card)' }}>
                  <div className="flex items-center space-x-2">
                    <ShieldAlert className="w-4 h-4 text-rose-500" />
                    <h4 className="text-xs font-bold text-rose-500">{red.title}</h4>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{red.text}</p>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
