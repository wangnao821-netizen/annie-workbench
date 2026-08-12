// 通用
export interface VersionInfo { version: string; name: string }
export interface HealthInfo { status: string }

// TaskResponse（GET /api/tasks/）
export interface TaskResponse {
  id: number;
  type: string;            // "EMAIL_DISPATCH" | "FILE_MATCH" | ...
  title: string;
  case_name: string;
  case_id: string;
  case_bank: string;
  loan_amount: number;
  priority: string;        // "urgent" | "high" | "normal" | "low"
  suggested_action: string;
  source_channel: string;  // "email" | "file" | "wechat" | "manual"
  created_at: string;      // ISO 8601
  deadline: string | null;
  delegated_to: string | null;
  source_msg_id: string | null;  // 关联邮件 ID（设计 §16.1 ② 复用 source_msg_id）
}

// 请求体（POST /api/tasks/{id}/dispatch）
export interface DispatchRequest { action: "approve" | "reject" | "defer" | "delegate" }
// 请求体（POST /api/tasks/{id}/delegate）
export interface DelegateRequest { delegate_to: string; deadline?: string; message?: string }
// 请求体（POST /api/tasks/{id}/boss-reply）
export interface BossReplyRequest { decision: "approve" | "reject" | "defer"; note?: string }

// CaseResponse（GET /api/cases/）
export interface CaseResponse {
  case_id: string;
  client_name: string;
  lender: string;
  loan_amount: number;
  stage: string;
  stage_days: number;
  checklist_done: number;
  checklist_total: number;
  progress_pct: number;        // 0-100
  last_activity: string | null; // ISO 8601
}

// GET /api/cases/{id}/checklist
export interface ChecklistItemResponse {
  id: string;
  name: string;             // 清单项名称（中文）
  category: string;         // "required" | "ai_suggested" | "optional"
  status: string;           // "received" | "missing" | "expired" | "pending_confirm"
  reason?: string;          // AI 建议理由
  file_ids?: string[];      // 已关联文件 ID
}

// GET /api/cases/{id}/timeline
export interface TimelineEventResponse {
  id: string;
  case_id: string;
  event_type: string;       // "email_received" | "delegation" | "stage_advance" | ...
  title: string;
  description?: string;
  source_ref?: string;
  created_at: string;       // ISO 8601
}

// GET /api/cases/{id}/files
export interface CaseFileResponse {
  id: string;
  case_id: string;
  original_name: string;
  assigned_type: string;
  confidence: number | null; // 0-1
  status: string;            // "processed" | "pending" | ...
  extracted_summary?: string;
}

// GET /api/cases/{id}/submission-check
export interface SubmissionCheckResponse {
  ready: boolean;
  result: string;            // 中文结论
  checked_at: string | null;
  items: { label: string; ok: boolean }[];
}

// 草稿（drafts，action_id 即任务 ID）
export interface DraftResponse {
  id: number;
  action_id: number;
  subject: string;
  body_zh: string;
  body_en: string;
  status: string;         // "draft" | "confirmed" | "sent"
  version: number;
  created_at: string;     // ISO
  updated_at: string;     // ISO
}

export interface DraftVersionResponse {
  version: number;
  subject: string;
  body_zh: string;
  body_en: string;
  source: string;         // "ai" | "manual" | "refine"
  updated_at: string;
}

export interface DraftRefineRequest { instruction: string }

// AI 对话（chat）
export interface ChatRequest { message: string; case_id?: string }
export interface ChatResponse { reply: string; suggested_actions: string[] }
export interface ChatMessageResponse {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggested_actions?: string[];
  created_at: string;
}

// POST /api/cases/
export interface CreateCaseRequest {
  client_name: string;
  client_email?: string;
  client_phone?: string;
  lender?: string;
  loan_amount?: number;
  purpose?: string;
  raw_text?: string;        // 粘贴的客户信息原文，后端 AI 解析
  broker_name?: string;
  property_value?: number;         // 房产总价值（万元）
  income_description?: string;     // 年收入与职业属性描述
  submission_platform?: string;    // 递交平台
  interest_rate?: number;          // 申请利率 %
  finance_clause_date?: string;    // Finance Clause 截止日期 ISO
  client_goal?: string;            // 客户目标（core 已支持）
  special_circumstances?: string;  // 特殊情况（core 已支持）
  is_force_new_client?: boolean;   // 同名客户强制新建
  linked_client_id?: string | null; // 关联历史客户
}
export type CreateCaseResponse = CaseResponse;

// inbox
export interface InboxMessageResponse {
  id: string;
  sender_email: string;
  subject: string;
  body_preview: string;
  status: string;            // "unmatched" | "matched" | "muted" | ...
  received_at: string;       // ISO
  matched_case_id?: string;
}

