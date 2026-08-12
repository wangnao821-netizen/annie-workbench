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
  match_status?: string | null;
}

export interface CreateTaskRequest {
  title: string;
  case_id: string;
  deadline?: string | null;
  priority?: string;
  source_channel?: string;
  suggested_action?: string;
}

export interface ContextEventRequest {
  source_type: string;     // e.g. "manual_note"
  content: string;
  track?: 'internal' | 'external' | string;
}

export interface ContextEvent {
  id: number;
  case_id: string;
  source_type: string;
  content: string;
  track: 'internal' | 'external';
  status: 'pending' | 'confirmed' | 'superseded';
  superseded_by: number | null;
  supersede_reason: string | null;
  created_at: string | null;
}

export interface ContextEventResponse {
  id?: number;
  status?: string;
  message?: string;
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
  finance_deadline?: string | null;
  os_pending_count?: number;
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
export interface DraftListItem {
  id: number;
  action_id: number | null;
  case_id: string | null;
  client_name: string | null;
  subject: string;
  status: string;          // draft | confirmed | sent
  version: number;
  updated_at: string | null;
}

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

export interface ArchivedCase extends CaseResponse {
  closed_at: string | null;
  close_reason: string | null;
}

export interface ImportRecord {
  id: number;
  source: string;
  status: string;
  file_count: number;
  message_count: number;
  started_at: string | null;
  finished_at: string | null;
  note: string | null;
}

export interface CaseContext {
  case_id: string;
  facts: {
    client_name: string | null;
    lender: string | null;
    loan_amount: number | null;
    property_value: number | null;
    lvr: number | null;
    purpose: string | null;
    interest_rate: string | null;
    stage: string | null;
    client_goal: string | null;
    special_circumstances: string | null;
    internal_notes?: string | null;
  };
  checklist: { done: number; total: number; missing: string[] };
  os: { pending_count: number; items: { raw_text: string; status: string }[] };
  deadlines: { finance_due: string | null; days_left: number | null };
  risk: string[];
  timeline: { event_type: string; title: string; description: string | null; created_at: string | null }[];
  memory: string;
  summary?: string;
}

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

// Analytics
export type Granularity = 'day' | 'week' | 'month';

export interface AnalyticsMetricItem {
  value: number;
  previous?: number;
  change_pct?: number;
  trend?: 'up' | 'down' | 'flat' | string;
}

export interface AnalyticsOverview {
  active_cases: AnalyticsMetricItem;
  new_cases: AnalyticsMetricItem;
  submitted_cases: AnalyticsMetricItem;
  approved_cases: AnalyticsMetricItem;
  settled_cases: AnalyticsMetricItem;
  commission: AnalyticsMetricItem;
  compare_label?: string;
}

export interface PipelineBucketItem {
  period: string;
  new_cases: number;
  submitted: number;
  approved: number;
  settled: number;
  commission: number;
}

export interface AnalyticsPipeline {
  granularity: Granularity;
  buckets: PipelineBucketItem[];
}

export interface LenderPerformanceItem {
  lender_name: string;
  case_count: number;
  avg_approval_days: number;
  os_rate: number;
  approval_rate: number;
}

export interface AnalyticsLenders {
  lenders: LenderPerformanceItem[];
}

export interface EfficiencyMetricItem {
  current: number;
  previous: number;
  unit?: string;
  change_pct?: number;
  trend?: 'up' | 'down' | 'flat' | string;
}

export interface AnalyticsEfficiency {
  tasks_processed: EfficiencyMetricItem;
  on_time_rate: EfficiencyMetricItem;
  checklist_completion_rate: EfficiencyMetricItem;
  ai_adoption_count: EfficiencyMetricItem;
  avg_client_response_days: EfficiencyMetricItem;
}

