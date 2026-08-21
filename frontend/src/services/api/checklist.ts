import { request } from '../http';
import { ChecklistLibraryItem, ChecklistLibraryResponse } from '../../types/api';

// 离线/服务未就绪时的兜底全量标准清单库
export const FALLBACK_CHECKLIST_LIBRARY: ChecklistLibraryItem[] = [
  // 身份类
  { id: 'master:passport', name_zh: '有效护照', name_en: 'Passport', category: 'identity', use_count: 50, is_custom: false },
  { id: 'master:driver_license', name_zh: '驾照 (Driver Licence)', name_en: 'Driver Licence', category: 'identity', use_count: 48, is_custom: false },
  { id: 'master:medicare_card', name_zh: 'Medicare 卡', name_en: 'Medicare Card', category: 'identity', use_count: 45, is_custom: false },
  { id: 'master:visa_grant', name_zh: 'Visa 获签信 (VEVO)', name_en: 'Visa Grant Letter', category: 'identity', use_count: 30, is_custom: false },
  { id: 'master:voi_document', name_zh: '100 分身份核实文件 (VOI)', name_en: 'VOI Document', category: 'identity', use_count: 20, is_custom: false },
  { id: 'master:pr_grant_notice', name_zh: '永居批准信 (PR Grant)', name_en: 'PR Grant Notice', category: 'identity', use_count: 15, is_custom: false },
  // PAYG 收入
  { id: 'master:payslip_2', name_zh: '最新 2 期工资单 (Payslips)', name_en: 'Latest 2 Payslips', category: 'income_payg', use_count: 60, is_custom: false },
  { id: 'master:employment_letter', name_zh: '雇佣确认信 (Employment Letter)', name_en: 'Employment Letter', category: 'income_payg', use_count: 35, is_custom: false },
  { id: 'master:group_certificate', name_zh: '年度工资汇总表 (PAYG Summary)', name_en: 'Payment Summary', category: 'income_payg', use_count: 25, is_custom: false },
  { id: 'master:bonus_letter', name_zh: '奖金/提成确认信 (Bonus Letter)', name_en: 'Bonus Letter', category: 'income_payg', use_count: 18, is_custom: false },
  // 自雇收入
  { id: 'master:tax_return_2yr', name_zh: '最近 2 年个人与公司税表 (Tax Returns)', name_en: 'Tax Returns (2 years)', category: 'income_self_employed', use_count: 40, is_custom: false },
  { id: 'master:noa_2yr', name_zh: '最近 2 年税局评估信 (ATO NOA)', name_en: 'Notice of Assessment', category: 'income_self_employed', use_count: 38, is_custom: false },
  { id: 'master:accountant_letter', name_zh: '会计师确认信 (Accountant Letter)', name_en: 'Accountant Letter', category: 'income_self_employed', use_count: 32, is_custom: false },
  { id: 'master:bas_statements', name_zh: '最近 4 个季度 BAS 报税单', name_en: 'BAS Statements', category: 'income_self_employed', use_count: 28, is_custom: false },
  { id: 'master:business_bank_statement', name_zh: '最近 6 个月公司商业账户银行流水', name_en: 'Business Bank Statement', category: 'income_self_employed', use_count: 26, is_custom: false },
  { id: 'master:asic_company_search', name_zh: 'ASIC 公司注册查询摘录', name_en: 'ASIC Extract', category: 'income_self_employed', use_count: 22, is_custom: false },
  { id: 'master:profit_loss_statement', name_zh: '最新财务年度损益表 (P&L)', name_en: 'P&L Statement', category: 'income_self_employed', use_count: 20, is_custom: false },
  // 资产与负债
  { id: 'master:bank_statement_savings', name_zh: '首付存款账户 3 个月流水', name_en: 'Savings Bank Statement', category: 'special', use_count: 42, is_custom: false },
  { id: 'master:gift_letter', name_zh: '父母赠予信与转账凭证 (Gift Letter)', name_en: 'Gift Letter', category: 'special', use_count: 19, is_custom: false },
  { id: 'master:credit_card_statement', name_zh: '所有信用卡最近一期对账单', name_en: 'Credit Card Statement', category: 'special', use_count: 30, is_custom: false },
  { id: 'master:existing_mortgage_statement', name_zh: '现有房屋贷款 6 个月还款流水', name_en: 'Existing Loan Statement', category: 'special', use_count: 28, is_custom: false },
  // 房产与购房
  { id: 'master:contract_of_sale', name_zh: '购房合同完整版 (Contract of Sale)', name_en: 'Contract of Sale', category: 'property', use_count: 55, is_custom: false },
  { id: 'master:council_rates', name_zh: '现有投资房市政费账单 (Council Rates)', name_en: 'Council Rates Notice', category: 'property', use_count: 24, is_custom: false },
  { id: 'master:rental_agreement', name_zh: '投资房租约与租金流水 (Tenancy Agreement)', name_en: 'Rental Agreement', category: 'property', use_count: 22, is_custom: false },
  // 银行特定
  { id: 'master:cba_living_expenses', name_zh: 'CBA 专属生活开支申报确认表', name_en: 'CBA Living Expenses Declaration', category: 'bank_specific', bank_specific: 'CBA', use_count: 15, is_custom: false },
  { id: 'master:westpac_financial_declaration', name_zh: 'Westpac 财务真实性声明', name_en: 'Westpac Declaration', category: 'bank_specific', bank_specific: 'Westpac', use_count: 12, is_custom: false },
  { id: 'master:anz_accountant_declaration', name_zh: 'ANZ 认可格式会计师声明', name_en: 'ANZ Declaration', category: 'bank_specific', bank_specific: 'ANZ', use_count: 10, is_custom: false },
];

export async function getChecklistLibrary(): Promise<ChecklistLibraryResponse> {
  try {
    const res = await request<ChecklistLibraryResponse>('/api/checklist/library');
    if (res && Array.isArray(res.items) && res.items.length > 0) {
      return res;
    }
  } catch (err) {
    console.warn('[ChecklistLibrary] API request failed, falling back to built-in master library:', err);
  }
  return { items: FALLBACK_CHECKLIST_LIBRARY };
}
