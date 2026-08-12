import { CaseResponse } from '../types/api';
import { CaseInfo } from '../stores/caseStore';

export function mapCaseResponse(c: CaseResponse): CaseInfo {
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
    deadline: '',
    lastActivity: c.last_activity,
  };
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
