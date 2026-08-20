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
    folderPath: c.folder_path ?? null,
    folderMode: c.folder_mode ?? null,
    hasBossPending: c.has_boss_pending ?? false,
    assessorName: c.assessor_name ?? null,
    lenderRef: c.lender_ref ?? null,
    activeBlocker: c.active_blocker ?? null,
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

// WO-66：后端 MILESTONE 9 级（英文 key + 规范中文）→ 看板列。唯一真源在 core/case_engine/milestones.py
export const STAGE_CATEGORY_MAP: Record<string, CaseStageCategory> = {
  gathering: "pre_review",
  收集资料: "pre_review",
  to_submit: "pre_review",
  待递交: "pre_review",
  reviewing: "submitted",
  审核中: "submitted",
  submitted: "submitted",
  "已递交(等银行)": "submitted",
  os_requested: "os_condition",
  银行补件: "os_condition",
  valuing: "os_condition",
  估值中: "os_condition",
  approved: "approval",
  已批准: "approval",
  settling: "settlement",
  结算中: "settlement",
  settled: "settlement",
  已结算: "settlement",
};

// 看板拖拽列 → 落库 stage key（WO-66 对照表；settlement 用结算中，非终态可回退）
export const KANBAN_COLUMN_STAGE: Record<Exclude<CaseStageCategory, "all">, string> = {
  pre_review: "gathering",
  submitted: "submitted",
  os_condition: "os_requested",
  approval: "approved",
  settlement: "settling",
};

// 落库 stage key → 规范中文（乐观更新用，保证与后端一致、刷新不跳变）
export const STAGE_KEY_LABEL: Record<string, string> = {
  gathering: "收集资料",
  submitted: "已递交(等银行)",
  os_requested: "银行补件",
  approved: "已批准",
  settling: "结算中",
};

// 后端 9 级 → 左栏 6 节点索引（建档=0 恒亮，当前进度 1..5）
export const STAGE_INDEX_MAP: Record<string, number> = {
  gathering: 1,
  收集资料: 1,
  reviewing: 2,
  审核中: 2,
  to_submit: 2,
  待递交: 2,
  submitted: 2,
  "已递交(等银行)": 2,
  os_requested: 3,
  银行补件: 3,
  valuing: 3,
  估值中: 3,
  approved: 4,
  已批准: 4,
  settling: 5,
  结算中: 5,
  settled: 5,
  已结算: 5,
};

export function stageCategoryFromStage(stage: string): CaseStageCategory {
  const st = (stage || "").trim();
  const exact = STAGE_CATEGORY_MAP[st];
  if (exact) return exact;
  // 兼容历史脏数据：子串兜底（未知阶段归 pre_review，不再错入 submitted）
  if (st.includes("预审") || st.includes("收集") || st.includes("待递交")) return "pre_review";
  if (st.includes("递交") || st.includes("审核") || st.includes("递件") || st.includes("审贷")) return "submitted";
  if (st.includes("补件") || st.includes("OS") || st.includes("条件") || st.includes("估值")) return "os_condition";
  if (st.includes("批准") || st.includes("审批") || st.includes("批复")) return "approval";
  if (st.includes("结算") || st.includes("交割") || st.includes("放款") || st.includes("Settlement")) return "settlement";
  return "pre_review";
}
