import { CaseResponse } from '../types/api';
import { CaseInfo } from '../stores/caseStore';

export function mapCaseResponse(c: CaseResponse): CaseInfo {
  const financeDeadline = c.finance_deadline ?? null;
  const osPendingCount = c.os_pending_count ?? 0;
  return {
    caseId: c.case_id,
    clientName: c.client_name,
    lender: c.lender,
    loanAmount: c.loan_amount,
    stage: c.stage,
    stageDays: c.stage_days,
    checklistDone: c.checklist_done,
    checklistTotal: c.checklist_total,
    checklistProgress: c.progress_pct,
    summary: `清单 ${c.checklist_done}/${c.checklist_total} · 阶段停留 ${c.stage_days} 天`,
    deadline: financeDeadline ? `Finance Due: ${financeDeadline.split('T')[0]}` : '',
    financeDeadline,
    osPendingCount,
    lastActivity: c.last_activity,
  };
}

export function getFinanceDeadlineDays(financeDeadline?: string | null): number | null {
  if (!financeDeadline) return null;
  const target = new Date(financeDeadline).getTime();
  if (isNaN(target)) return null;
  const now = new Date().getTime();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

export function isUrgentCase(c: CaseInfo): boolean {
  if ((c.osPendingCount ?? 0) > 0) return true;
  const days = getFinanceDeadlineDays(c.financeDeadline);
  if (days !== null && days < 7) return true;
  return false;
}

export type CaseStageCategory = "all" | "pre_review" | "submitted" | "os_condition" | "approval" | "settlement";

export function stageCategoryFromStage(stage: string): CaseStageCategory {
  if (stage.includes("预审") || stage.includes("收集")) {
    return "pre_review";
  }
  if (stage.includes("递交") || stage.includes("递件")) {
    return "submitted";
  }
  if (stage.includes("补件") || stage.includes("OS") || stage.includes("条件")) {
    return "os_condition";
  }
  if (stage.includes("批准") || stage.includes("审批")) {
    return "approval";
  }
  if (stage.includes("结算") || stage.includes("Settlement")) {
    return "settlement";
  }
  return "submitted";
}
