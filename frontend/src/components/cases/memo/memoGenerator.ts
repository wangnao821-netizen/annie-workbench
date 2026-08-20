import { BrainFact, CaseContext } from '../../../types/api';
import { CaseInfo } from '../../../stores/caseStore';
import { KEY_LABELS, formatFactValue } from '../../brain/FactCard';

export function formatMoneyDisplay(val?: number | string): string {
  if (val === undefined || val === null || val === '') return '—';
  const num = typeof val === 'string' ? parseFloat(val.replace(/[^0-9.-]/g, '')) : val;
  if (isNaN(num)) return String(val);
  if (num >= 10000) {
    const wan = (num / 10000).toFixed(num % 10000 === 0 ? 0 : 2);
    return `$${num.toLocaleString()} (约 ${wan} 万)`;
  }
  return `$${num.toLocaleString()}`;
}

export function formatMoneyWanSimple(val?: number | string): string {
  if (val === undefined || val === null || val === '') return '—';
  const num = typeof val === 'string' ? parseFloat(val.replace(/[^0-9.-]/g, '')) : val;
  if (isNaN(num)) return String(val);
  if (num >= 1000000) {
    return `$${(num / 1000000).toFixed(2)}M`;
  }
  if (num >= 10000) {
    return `$${(num / 10000).toFixed(0)}万`;
  }
  return `$${num.toLocaleString()}`;
}

export function calculateLvr(loan?: number, val?: number, fallbackLvr?: number): string {
  if (loan && val && val > 0) {
    return `${((loan / val) * 100).toFixed(1)}%`;
  }
  if (fallbackLvr) {
    return `${fallbackLvr}%`;
  }
  return '—';
}

export function generateCaseMemo(
  clientName: string,
  caseData: Partial<CaseInfo> | null,
  context: CaseContext | null,
  facts: BrainFact[],
  isBankView: boolean = false
): string {
  const factMap: Record<string, string> = {};
  facts.forEach((f) => {
    if (f.key) factMap[f.key] = f.value;
  });

  const borrower = context?.facts.client_name || caseData?.clientName || clientName || '客户';
  const coBorrowers = factMap['identity.co_borrowers']
    ? formatFactValue(factMap['identity.co_borrowers'])
    : null;

  const rawLoanAmount =
    context?.facts.loan_amount ??
    (typeof caseData?.loanAmount === 'number' ? caseData.loanAmount : undefined) ??
    (factMap['loan.amount'] ? parseFloat(factMap['loan.amount']) : undefined);

  const rawPropertyValue =
    context?.facts.property_value ??
    (typeof (caseData as any)?.propertyValue === 'number' ? (caseData as any).propertyValue : undefined) ??
    (factMap['property.value'] ? parseFloat(factMap['property.value']) : undefined);

  const loanAmountText = formatMoneyDisplay(rawLoanAmount);
  const propertyValueText = formatMoneyDisplay(rawPropertyValue);
  const lvrText = calculateLvr(rawLoanAmount, rawPropertyValue, context?.facts.lvr || caseData?.lvr);

  const lender = context?.facts.lender || caseData?.lender || factMap['bank.lender'] || '待定银行';
  const interestRate =
    context?.facts.interest_rate ||
    factMap['loan.rate'] ||
    (caseData as any)?.interestRate ||
    '按最新政策利率';

  const propertyAddress =
    factMap['property.address'] ||
    (caseData as any)?.propertyAddress ||
    (context?.facts as any)?.property_address ||
    '抵押房产待定';

  const referralSource =
    factMap['referral.source'] ||
    (caseData as any)?.referralSource ||
    '渠道推荐 / 直客';

  const employment =
    factMap['employment.status'] ||
    (context as any)?.facts?.employment_type ||
    '全职雇佣 (PAYG) / 自雇经营';

  const residency =
    factMap['identity.status'] ||
    (context as any)?.facts?.residency ||
    '澳洲公民 / 永居 (PR)';

  const income =
    factMap['income.annual'] ||
    factMap['income.payslip'] ||
    (context as any)?.facts?.income_description ||
    '已满足银行审贷偿付能力标准';

  const clientGoalText =
    context?.facts.client_goal ||
    factMap['loan.goal'] ||
    context?.summary ||
    '客户拟通过本次贷款申请完成优质资产配置与融资诉求，置换高成本负债或获取充裕流动性支持。';

  const specialCircumstancesText =
    context?.facts.special_circumstances ||
    factMap['special.circumstances'] ||
    factMap['special.circumstance'] ||
    '当前案卷各关键要件已对齐银行审贷口径，在途材料正加速推进中。';

  // Extract internal-only facts
  const internalFacts = facts.filter(
    (f) => f.track === 'internal' || f.disclosure === 'internal_only'
  );

  let doc = `# 📑 案卷全景备忘录 · ${borrower}

## 🎯 客户核心诉求与目标 (Client Goal)
${clientGoalText}

## 🚨 当前核心卡点与在途攻坚 (Special Circumstances)
${specialCircumstancesText}

## 🪪 借款人与财务画像
- **借款主体**：${borrower}${coBorrowers ? `、${coBorrowers}` : ''}
- **身份/居留**：${residency}
- **雇佣与职业**：${employment}（核定收入：${income}）
- **抵押物业**：${propertyAddress}（房产评估估值：${propertyValueText}）
- **融资方案**：拟向 **${lender}** 申请 **${loanAmountText}**（预估 LVR：${lvrText}，申请利率：${interestRate}）
- **推荐人渠道**：${referralSource}
`;

  if (!isBankView && internalFacts.length > 0) {
    const factLines = internalFacts
      .map(
        (f) =>
          `> - **${KEY_LABELS[f.key] || f.key}**：${formatFactValue(f.value)}`
      )
      .join('\n');

    doc += `
## 🔒 内部保密事实声明
> [!CAUTION] 🔒 内部保密事实（严禁披露给银行）
> 以下信息仅供 Vera 内部经纪人团队与操盘手参考，递交放款行时已自动屏蔽：
${factLines}
`;
  }

  return doc;
}

/**
 * Filter out CAUTION blocks and internal sections from Markdown when in Bank View
 */
export function filterMemoForBankView(markdown: string): string {
  let cleaned = markdown.replace(
    /##\s*🔒\s*内部保密事实声明[\s\S]*?(?=\n##|$)/g,
    ''
  );

  cleaned = cleaned.replace(
    />\s*\[!CAUTION\][\s\S]*?(?=\n\n|\n[^\>]|$)/g,
    ''
  );

  return cleaned.trim();
}
