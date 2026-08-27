// 通用
export interface VersionInfo { version: string; name: string }
export interface HealthInfo { status: string }

// AI 助手设置 (F-32)
export interface AIPersona {
  key: string;
  name: string;
  role: string;
  style: string;
}

export interface AssistantSettingsResponse {
  ai_name: string | null;
  user_address: string | null;
  persona_key: string | null;
  default_persona: string;
  personas: AIPersona[];
  onboarding_needed: boolean;
}

export interface UpdateAssistantSettingsRequest {
  ai_name?: string | null;
  user_address?: string | null;
  persona_key?: string | null;
}

// AI 模型配置 (F-48)
export interface ProviderAiConfig {
  key_configured: boolean;
  base_url: string | null;
}

export interface AiSettingsResponse {
  deepseek: ProviderAiConfig;
  gemini: ProviderAiConfig;
}

export interface UpdateAiSettingsRequest {
  deepseek_api_key?: string;
  deepseek_base_url?: string;
  gemini_api_key?: string;
  gemini_base_url?: string;
}

export interface TestAiSettingsRequest {
  provider: 'deepseek' | 'gemini';
  api_key?: string;
  base_url?: string;
}

export interface TestAiSettingsResponse {
  ok: boolean;
  message: string;
}

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
  escalated_to_boss?: boolean;
  boss_decision?: string | null;
  status?: string;
  assignee?: string | null;
}

export interface CreateTaskRequest {
  title: string;
  case_id: string;
  deadline?: string | null;
  priority?: string;
  assignee?: string | null;
  source_channel?: string;
  suggested_action?: string;
}

export interface ContextEventRequest {
  source_type: string;     // e.g. "manual_note"
  content: string;
  track?: 'internal' | 'external' | string;
  status?: 'pending' | 'confirmed' | 'superseded' | string;
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

export interface BrainFact {
  id: number;
  case_id: string;
  key: string;        // "category.key"，如 "bank.lender"
  value: string;
  category: string;   // identity/income/employment/property/loan/liability/bank/stage/commitment/disclosure/special
  track: 'internal' | 'external';
  event_id: number;
  superseded_by: number | null;
  conflict: boolean;  // true 时卡片加 ⚠️ 角标
  valid_to: string | null;
  created_at: string | null;
  locked_by_user?: boolean;
  disclosure?: 'disclosed' | 'internal_only' | null;
}

// 请求体（POST /api/tasks/{id}/dispatch）
export interface DispatchRequest { action: "approve" | "reject" | "defer" | "delegate" | "claim" }
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
  folder_path?: string | null;
  folder_mode?: 'existing' | 'create' | 'auto' | string | null;
  is_imported?: boolean;
  has_boss_pending?: boolean;
  assessor_name?: string | null;
  lender_ref?: string | null;
  active_blocker?: string | null;
}

export interface AssociateFolderRequest {
  mode: 'existing' | 'create' | 'auto';
  path?: string;
  folder_name?: string;
}

export interface AssociateFolderResponse {
  case_id: string;
  folder_path: string;
  mode: 'existing' | 'create' | 'auto' | string;
}

export interface ParsedFolderMetadata {
  path: string;
  client_name?: string;
  lender?: string;
  loan_amount?: number;
  property_value?: number;
  purpose?: string;
  employment_type?: string;
  broker_name?: string;
  residency?: string;
  notes?: string;
}

export interface FolderBrowseItem {
  path: string;
  name: string;
  is_dir: boolean;
  size?: number;
  mtime?: string;
}

export interface FolderBrowseResponse {
  current_path: string;
  items: FolderBrowseItem[];
}

// 存量导入预览 (WO-50)
export interface LegacyImportSubmission {
  platform: string;        // "Lender" | "Infynity" | ...
  dir_name: string;        // "Send to Lender"
  file_count: number;
  is_lender: boolean;
}

export interface LegacyImportPreviewResponse {
  ok: boolean;
  message?: string | null;
  broker_notes_found: boolean;
  broker_notes_name?: string | null;
  prefilled: Record<string, unknown>;   // 与 CasePrefilledFields 同构
  submissions: LegacyImportSubmission[];
  submitted_platforms: string[];
}

export interface RevokeFolderFileResponse {
  success: boolean;
  message?: string;
}

// folder_lookup 结果卡类型 (WO-32)
export interface FolderLookupFile {
  rel_path: string;
  size?: number;
  mtime?: string;
  doc_type?: string;
  parsed_summary?: string;
}

export interface FolderLookupPayload {
  files: FolderLookupFile[];
  case_id?: string;
  query?: string;
}

// gap_analysis 缺口卡类型 (WO-33)
export interface GapItem {
  master_id?: string;
  name?: string;
  item?: string;
  reason: string;
  priority?: 'high' | 'medium' | 'low' | string;
}

export interface MatchedItem {
  master_id?: string;
  name?: string;
  item?: string;
  file?: string;
}

export interface SuggestionItem {
  type?: string;
  title?: string;
  description?: string;
  action_type?: string;
  status?: string;
  item_name?: string;
  item?: string;
  suggestion?: string;
  draft_template?: string;
}

export interface GapAnalysisPayload {
  summary: string;
  missing: GapItem[];
  matched: MatchedItem[];
  suggestions: SuggestionItem[];
}

// 案件操作请求与响应 (F-50)
export interface HoldCaseRequest {
  reason: string;
  note?: string;
  reminder_date?: string;
}

export interface ResubmitCaseRequest {
  reason: string;
  note?: string;
  new_lender: string;
  new_loan_amount?: number;
  inherit_knowledge?: boolean;
}

export interface WithdrawCaseRequest {
  reason: string;
  note?: string;
}

export interface DeclineCaseRequest {
  reason: string;
  note?: string;
}

export interface CaseActionResponse {
  success?: boolean;
  message?: string;
  case_id?: string;
  stage?: string;
}

// GET /api/cases/{id}/checklist
export interface ChecklistItemResponse {
  id: string;
  name?: string;             // 清单项名称（中文）
  name_zh?: string;
  item_name?: string;        // 后端材料名称
  category: string;         // "required" | "ai_suggested" | "optional" 或业务分类
  master_category?: string;
  master_id?: string | null;
  section?: string;         // 首次模板 8 大板块 id（WO-74）
  phase?: string;           // initial / condition（WO-74）
  deadline?: string | null;
  source_ref?: string | null;
  item_kind?: string;       // document / info（WO-74）
  status: string;           // "received" | "missing" | "expired" | "pending_confirm" | "confirmed"
  is_required?: boolean;
  reason?: string;          // AI 建议理由
  ai_suggestion?: string;   // 后端 AI 建议理由
  file_ids?: string[];      // 已关联文件 ID
  received_file_id?: string | null;
  received_file_ids?: string[];
  matched_file_id?: string | null;
  matched_file_name?: string | null;
  bank_specific?: string | null;
  applicable_when?: string | null;
}

export interface ChecklistMatchedFileDetail {
  checklist_id: number | string;
  item_name: string;
  master_id?: string;
  status: string;
  matched_file_id: string;
  matched_file_name: string;
}

export interface ChecklistMatchFilesResponse {
  ok: boolean;
  case_id: string;
  matched_count: number;
  gathering_progress: number;
  matched_details: ChecklistMatchedFileDetail[];
}

export interface AddChecklistItemRequest {
  name_zh: string;
  name_en?: string;
  category: string;
  is_required?: boolean;
  applicable_when?: string;
  bank_specific?: string;
  phase?: 'initial' | 'condition';
  deadline?: string | null;
  source_ref?: string | null;
}

// GET /api/cases/{id}/timeline
export interface TimelineEventItem {
  id?: string;
  event_time: string;
  event_type: string; // submission_lodged / assessor_assigned / mir_requested / valuation_shortfall / reassessment_submitted / approval_issued / note
  title: string;
  summary: string;
  sender?: string;
  assessor?: string;
  lender_ref?: string;
  source_file?: string;
  is_blocker: boolean;
  blocker_reason?: string;
}

export interface CaseTimelineResponse {
  ok: boolean;
  case_id: string;
  assessor_name?: string;
  lender_ref?: string;
  active_blocker?: string;
  events: TimelineEventItem[];
}

export interface TimelineExtractResponse {
  ok: boolean;
  case_id: string;
  extracted_count: number;
  assessor_name?: string;
  lender_ref?: string;
  active_blocker?: string;
}

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
  file_extension?: string;
  file_size?: number;
  created_at?: string;
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
  action_id?: number;
  source_action_id?: number | null;
  case_id?: string;
  client_name?: string;
  to_email?: string | null;
  subject: string;
  body_zh?: string;
  body_en?: string;
  body?: string;
  status: string;         // "draft" | "confirmed" | "sent" | "approved"
  version?: number;
  created_at?: string;     // ISO
  updated_at?: string;     // ISO
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
export interface ToolCard {
  type: 'record_confirm' | 'confirm_required' | 'draft' | 'submission_suggest' | 'attribution_suggest' | 'flow' | 'declaration_check' | 'declaration' | 'flow_followup' | 'flow_chaser' | 'flow_os_reply' | 'flow_folder_lookup' | 'folder_lookup' | 'flow_gap_analysis' | 'gap_analysis' | 'co_create_session' | 'co_create_record' | 'co_create_confirm' | 'fact_find_confirm' | 'fact_find';
  title: string;
  payload: Record<string, unknown>;
}

// WO-27 DraftCardPayload Schema
export interface FlowCardVersion {
  subject?: string;
  body?: string;
  version: string;
  branch_label?: string;
  message_id?: string;
  updated_at?: string;
}

export interface FlowCardState {
  version: string;
  branch_label?: string;
  message_id?: string;
}

export interface FlowCardResult {
  versions: FlowCardVersion[];
}

export interface DraftCardPayload {
  schema_version?: string;
  card_type?: string;
  action?: string;
  presentation?: 'dialog' | 'inline' | string;
  state?: FlowCardState;
  result?: FlowCardResult;
  status?: 'draft' | 'confirmed_draft' | 'confirmed' | string;
  recipient_hint?: string;
  subject?: string;
  body?: string;
}

// WO-28 Skill Center Types
export interface SkillStep {
  tool: 'declaration_check' | 'calculator_assess' | 'policy_check' | 'context_event_write' | 'draft_email' | string;
  params?: Record<string, unknown>;
  output?: string;
}

export interface SkillManifest {
  key: string;
  name: string;
  description?: string;
  version?: string;
  category?: 'agent' | 'tool' | 'flow' | 'knowledge' | string;
  triggers?: string[];
  presentation?: string;
  permission?: string;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  steps?: SkillStep[];
  assets?: string[];
  confirm_required?: boolean;
  status?: string;
  author?: string;
}

export interface SkillVersion {
  version: string;
  content: string;
  updated_at: string;
  updated_by?: string;
  note?: string;
}

export interface SkillItem {
  id?: string;
  db_id?: number | string;
  key: string;
  name: string;
  description: string;
  category: 'agent' | 'tool' | 'flow' | 'knowledge' | 'flow_package' | 'prompt' | 'rule' | string;
  status: 'draft' | 'active' | 'deprecated' | string;
  version: string;
  created_by?: 'vera' | 'ai_propose' | 'system' | string;
  author?: string;
  reason?: string;
  proposal_reason?: string;
  is_builtin?: boolean;
  content?: string;
  triggers?: string[];
  presentation?: string;
  permission?: string;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  steps?: SkillStep[];
  assets?: string[];
  confirm_required?: boolean;
  versions?: SkillVersion[];
  created_at?: string;
  updated_at?: string;
}

export interface CreateSkillRequest {
  key: string;
  name: string;
  description: string;
  category: string;
  content: string;
  triggers?: string[];
}

export interface CardActionRequest {
  flow_key: 'followup' | 'chaser' | 'os_reply' | string;
  case_id?: string;
  action: 'new' | 'version' | 'branch' | 'confirm' | string;
  parent_message_id?: number | string;
  branch_label?: string;
  recipient_hint?: string;
  extra?: Record<string, unknown>;
}

export interface CardActionResponse {
  reply?: string;
  tool_cards?: ToolCard[];
  recorded_facts?: unknown[];
  presentation?: string;
}
export interface DisclosureItem { fact_key: string; text: string; disclosed: boolean; }
export interface DraftPayload {
  subject?: string;
  body: string;
  disclosure: { needs_review: boolean; items: DisclosureItem[] };
}
export interface SubmissionSuggestPayload { message: string; }
export interface AttributionSuggestPayload {
  content: string;
  matched_client: string;
  matched_lender?: string;
  matched_case_id: string;
  track?: 'internal' | 'external' | string;
}

export interface ChatRequest { message: string; case_id?: string; track?: 'internal' | 'external' }
export interface ChatResponse { reply: string; suggested_actions: string[]; tool_cards?: ToolCard[] }
export interface ChatMessageResponse {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggested_actions?: string[];
  tool_cards?: ToolCard[];
  created_at: string;
}

// POST /api/cases/scaffold
export interface CaseScaffoldRequest {
  parent_path: string;
  client_name: string;
  case_name?: string;
  create_subdirs?: boolean;
}

export interface CaseScaffoldResponse {
  ok: boolean;
  client_folder: string;
  case_folder: string;
  created_subdirs: string[];
  message?: string;
}

// POST /api/cases/
export interface CreateCaseRequest {
  client_name: string;
  client_email?: string;
  client_phone?: string;
  lender?: string;
  loan_amount?: number;
  purpose?: string;
  loan_type?: string;
  doc_type?: string;
  property_address?: string;
  property_value?: number;         // 房产总价值
  lvr?: number;
  raw_text?: string;        // 粘贴的客户信息原文，后端 AI 解析
  broker_name?: string;
  income_description?: string;     // 年收入与职业属性描述
  submission_platform?: string;    // 递交平台
  interest_rate?: number;          // 申请利率 %
  finance_clause_date?: string;    // Finance Clause 截止日期 ISO
  client_goal?: string;            // 客户目标（core 已支持）
  special_circumstances?: string;  // 特殊情况（core 已支持）
  employment_type?: string;        // 收入类型 (Full-time / Self-employed 等)
  residency?: string;              // 居住身份 (Citizen/PR 等)
  is_imported?: boolean;           // 是否为存量/历史导入案件
  is_force_new_client?: boolean;   // 同名客户强制新建
  linked_client_id?: string | null; // 关联历史客户
  folder_path?: string;
  folder_mode?: string;
  scaffold_dirs?: boolean;
}
export type CreateCaseResponse = CaseResponse;

// 预填接口响应
export interface CasePrefilledFields {
  client_name?: string | null;
  lender?: string | null;
  loan_amount?: number | null;
  property_value?: number | null;
  purpose?: string | null;
  employment_type?: string | null;
  residency?: string | null;
  interest_rate?: number | null;
  client_goal?: string | null;
  special_circumstances?: string | null;
  income_description?: string | null;
  finance_clause_date?: string | null;
  broker_name?: string | null;
  submission_platform?: string | null;
}

export interface PreFillResponse {
  prefilled: CasePrefilledFields;
  facts?: Array<{ key: string; value: string }>;
}

export interface ParseFileResponse {
  filename: string;
  text_preview?: string;
  prefilled: CasePrefilledFields;
  facts?: Array<{ key: string; value: string }>;
}

export interface ArchivedCase extends CaseResponse {
  closed_at: string | null;
  close_reason: string | null;
  property_address?: string;
  settlement_date?: string;
  interest_rate?: string | number;
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
    property_address?: string | null;
    co_borrowers?: string[] | null;
  };
  checklist: { done: number; total: number; missing: string[] };
  os: { pending_count: number; items: { raw_text: string; status: string }[] };
  deadlines: { finance_due: string | null; days_left: number | null };
  risk: string[];
  timeline: { event_type: string; title: string; description: string | null; created_at: string | null }[];
  memory: string;
  summary?: string;
  folder_path?: string | null;
  folder_mode?: string | null;
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

export interface AnalyticsPeriodMetrics {
  active_cases: number;
  new_cases: number;
  submitted: number;
  approved: number;
  settled: number;
  commission_estimate: number;
  tasks_done: number;
}

export interface AnalyticsOverview {
  granularity: string;
  current: AnalyticsPeriodMetrics;
  previous: AnalyticsPeriodMetrics;
}

export interface PipelineSeriesItem {
  period: string;
  new_cases: number;
  submitted: number;
  approved: number;
  settled: number;
  amount?: number;
  commission: number;
}

export interface AnalyticsPipeline {
  granularity: Granularity | string;
  series: PipelineSeriesItem[];
}

export interface LenderPerformanceItem {
  lender: string;        // 银行显示名（后端返回）
  lender_key?: string;   // 银行规范 key（可选）
  case_count: number;
  avg_approval_days: number;
  os_rate: number;
  approval_rate: number;
}

export interface AnalyticsLenders {
  lenders: LenderPerformanceItem[];
}

export interface AnalyticsEfficiencyMetrics {
  tasks_done: number;
  on_time_rate: number;
  checklist_confirm_rate: number;
  ai_adoption_count: number;
  avg_client_reply_days: number | null;
}

export interface AnalyticsEfficiency {
  granularity: string;
  current: AnalyticsEfficiencyMetrics;
  previous: AnalyticsEfficiencyMetrics;
}

export interface UsagePeriod {
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  prompt_cache_hit_tokens: number;
  prompt_cache_miss_tokens: number;
  cache_hit_rate: number | null;
  cost_usd: number;
  avg_latency_ms: number | null;
  corrected_count: number;
}

export interface AnalyticsUsage {
  current: UsagePeriod;
  previous: UsagePeriod;
}

// 政策提示卡接口类型 (WO-19)
export interface PolicyIssue {
  level: 'red' | 'amber' | 'green' | string;
  title: string;
  detail: string;
  suggestion: string;
}

export interface PolicyCheckResult {
  lender: string;
  overall: 'green' | 'amber' | 'red' | string;
  issues: PolicyIssue[];
  alternative_lenders: string[];
  summary: string;
  disclaimer: string;
}

// 申报一致性检查接口类型 (WO-20)
export interface DeclarationFinding {
  item: string;
  evidence: string;
  level: 'red' | 'warning' | 'info' | string;
  suggestion: string;
}

export interface DeclarationCheckResult {
  status: 'pass' | 'warning' | 'fail' | 'unparseable';
  findings: DeclarationFinding[];
  summary: string;
  draft_explanation?: string;
}

export interface DeclarationCheckPayload {
  files?: string[];
  folder?: string;
}

export interface BankItem {
  key: string; display_name: string; name_zh: string;
  type: string; adi: boolean; tier: string;
  has_calculator: boolean; platforms: string[]; vera_confirmed: boolean;
}
export interface PlatformItem {
  key: string; display_name: string; name_zh: string;
  type: string; vera_confirmed: boolean;
}
export interface BanksResponse { banks: BankItem[] }
export interface PlatformsResponse { platforms: PlatformItem[] }

export interface BankPlatformUpdateRequest {
  platforms: string[];
  vera_confirmed: boolean;
}

// Agent & Tool 注册表类型定义 (WO-25)
export interface AgentItem {
  key: string;
  id?: string;
  name: string;
  description: string;
  category: 'agent' | 'tool' | string;
  status: 'available' | 'pending' | string;
  enabled: boolean;
  triggers?: string[];
  capability?: string;
  permission?: string;
}

export interface AgentsResponse {
  agents: AgentItem[];
}

export interface AgentUpdateRequest {
  enabled: boolean;
}

// 计算器 Agent 类型定义 (WO-21)
export interface CalculatorProfileInfo {
  bank: string;
  name: string;
  version: string;
  effective_date?: string;
  source_file?: string;
  source_hash?: string;
  status?: string;
}

export interface CalculatorDiffItem {
  path: string;
  old: any;
  new: any;
}

export interface CalculatorUploadResult {
  bank: string;
  detected_version: string;
  current_version: string;
  is_new_bank: boolean;
  needs_review: boolean;
  review_note?: string;
  diff: CalculatorDiffItem[];
  changed_count: number;
  source_hash: string;
}

export interface CalculatorApplyResult {
  bank: string;
  applied_version: string;
  smoke_tests?: any;
  history?: any;
}

export interface CalculatorRollbackResult {
  bank: string;
  rolled_back_to: string;
  smoke_tests?: any;
}

export interface CalculatorApplicant {
  base: number;
  overtime?: number;
  bonus_commission?: number;
  casual?: number;
  investment_income?: number;
  dividends?: number;
  foreign_income?: number;
  rental_income?: number;
  government_benefits?: number;
  other_taxable?: number;
  other_nontaxable?: number;
  company_npbt?: number;
  company_addbacks?: number;
}

export interface CalculatorLoanPortion {
  amount: number;
  rate: number;
  term_years: number;
  io_years?: number;
  purpose: 'OO' | 'INV' | string;
  repayment: 'PI' | 'IO' | string;
}

export interface CalculatorLoan {
  portions: CalculatorLoanPortion[];
  security_value?: number;
  postcode?: string;
  state?: string;
  mortgage_insurer?: string;
  product?: string;
  doc_type?: string;
  simple_refinance?: boolean;
  refinance_exception?: boolean;
}

export interface CalculatorCommitment {
  type: string;
  balance?: number;
  limit?: number;
  rate?: number;
  remaining_months?: number;
  declared_monthly?: number;
}

export interface CalculatorHousehold {
  status: 'Single' | 'Couple' | string;
  dependents: number;
  income_for_hem?: number;
}

export interface CalculatorLivingExpenses {
  declared_basic_monthly?: number;
  declared_non_hem?: number;
}

export interface CalculatorAssessRequest {
  bank: string;
  applicants: CalculatorApplicant[];
  loan: CalculatorLoan;
  commitments?: CalculatorCommitment[];
  household?: CalculatorHousehold;
  living_expenses?: CalculatorLivingExpenses;
}

export interface CalculatorStep {
  step_id: string;
  label: string;
  formula?: string;
  inputs?: Record<string, any>;
  output?: any;
  source?: string;
}

export interface CalculatorAssessResponse {
  bank: string;
  result: 'PASS' | 'REFER' | 'FAIL' | 'NO RESULT' | string;
  indicator?: string;
  indicator_value?: number;
  threshold?: number;
  min_surplus?: number;
  surplus?: number;
  max_loan?: number;
  dti?: number;
  lvr?: number;
  steps?: CalculatorStep[];
  profile_version?: string;
}

// F-24 Holidays & Timezone Types
export interface HolidayStateToday {
  date: string;
  state: string;
  is_working_day: boolean;
  holiday_name?: string | null;
  weekday: number;
}

export interface HolidayItem {
  date: string;
  name: string;
  state: string;
  display: string;
}

export interface DlsStatus {
  utc_offset_hours: number;
  dls_active: boolean;
}

export interface HolidaysResponse {
  today: Record<string, HolidayStateToday>;
  upcoming: HolidayItem[];
  next: HolidayItem | null;
  dls: Record<string, DlsStatus>;
  china?: HolidayItem[];
  next_china?: HolidayItem | null;
}

// F-27 Knowledge Entry Interface (WO-61 Extended)
export interface KnowledgeEntry {
  id: string;
  layer: 'case' | 'global' | 'industry';
  case_id?: string | null;
  client_name?: string | null;
  content: string;
  source: string;
  source_type?: 'archive_precedent' | 'manual' | string;
  precedent_id?: string | null;
  background?: string | null;
  strategy?: string | null;
  takeaway?: string | null;
  scheme_type?: string | null;
  tags?: string[];
  vera_confirmed: boolean;
  lender?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

// F-27 Email Analyze Response Interface
export interface EmailAnalyzeResponse {
  id: string;
  is_fallback?: boolean;
  summary?: string;
  action_type?: string;
  stage_signal?: string;
  deadline?: string | null;
  conditions?: string[] | string | null;
  urgency_score?: number | string;
}

// F-34 File Agent (WO-44) Interfaces
export interface FileItem {
  name: string;
  rel_path: string;
  is_dir: boolean;
  size?: number;
  mtime?: string;
  doc_type?: string;
  file_id?: string;
  matched_checklist?: string[];
  matchedChecklist?: string[];
}

export interface FolderFilesResponse {
  current_path: string;
  items: FileItem[];
}

export interface ChecklistLibraryItem {
  id: string;
  name_zh: string;
  name_en?: string | null;
  category: string;
  applicable_when?: Record<string, any> | null;
  bank_specific?: string | null;
  use_count: number;
  is_custom: boolean;
}

export interface ChecklistLibraryResponse {
  items: ChecklistLibraryItem[];
}

export interface FilePreviewResponse {
  rel_path: string;
  size?: number;
  mtime?: string;
  doc_type?: string;
  text_preview?: string | null;
  parse_error?: string | null;
}

export interface RenameFileRequest {
  source: string;
  new_name: string;
}

export interface RenameFileResponse {
  ok: boolean;
  source: string;
  target: string;
  event_id?: number;
}

export interface MoveFileRequest {
  source: string;
  target_dir: string;
}

export interface MoveFileResponse {
  ok: boolean;
  source: string;
  target_dir: string;
}

export interface ImportFileResponse {
  ok: boolean;
  target: string;
}

export interface NamingSuggestResponse {
  doc_type: string;
  suggested: string;
  template_key?: string;
  matched?: boolean;
  reasons: string[];
}

// WO-46b Co-Create Agent Interfaces
export interface FromConditionItem {
  name_zh: string;
  deadline?: string | null;
  source_ref?: string | null;
}

export interface CoCreateChatRequest {
  case_id: string;
  flow_key: 'followup' | 'chaser' | 'os_reply';
  action: 'clarify' | 'generate' | 'version' | 'branch' | 'confirm';
  message?: string;
  session_id?: string | null;
  parent_message_id?: string | null;
  branch_label?: string | null;
  create_todo?: boolean;
  add_checklist_items?: FromConditionItem[] | null;
}

export interface CoCreateDraft {
  subject: string;
  body: string;
  version: string;
  branch_label: string;
  message_id: string;
}

export interface CoCreateResponse {
  reply: string;
  draft: CoCreateDraft | null;
  versions: CoCreateDraft[];
  status: 'clarifying' | 'draft' | 'confirmed' | 'blocked';
  event_id: number | null;
  task_id: number | null;
  reason?: string;
}

// WO-53 / WO-62 客户目录多案卷智能识别与导入 (Folder Topology Scan & Batch Import)
export interface TopologyScanSummary {
  total_clients: number;
  multi_case_clients: number;
  single_case_clients: number;
  lead_clients: number;
  total_cases: number;
  recommended_active_cases: number;
}

export interface ClientTopologyMeta {
  client_name: string;
  client_category: 'multi_case' | 'single_case' | 'lead';
  referrer_name?: string;
  co_borrowers?: string[];
  broker_name?: string;
  cases: CaseSubfolderMeta[];
}

export interface CaseSubfolderMeta {
  dir_name: string;
  folder_path: string;
  sequence?: number;
  is_resub?: boolean;
  loan_type?: string;
  lender?: string;
  property_address?: string;
  doc_type?: string;
  status: 'active' | 'withdrawn' | 'onhold' | 'submitted' | 'settled' | 'closed' | 'lead';
  stage?: string;
  progress_pct?: number;
  onhold_reason?: string;
  is_recommended_active: boolean;
  has_broker_notes?: boolean;
  broker_notes_name?: string;
  file_count: number;
  prefilled?: Record<string, any>;
  submitted_platforms?: string[];
  broker_name?: string;
}

export interface FolderTopologyScanResponse {
  ok: boolean;
  message?: string;
  is_root_multi_client?: boolean;
  summary?: TopologyScanSummary;
  clients?: ClientTopologyMeta[];
  // Single-client backward compatibility
  client_name?: string;
  client_root?: string;
  cases?: CaseSubfolderMeta[];
}

export interface BatchTopologyImportItem {
  folder_path: string;
  client_name: string;
  lender?: string;
  loan_amount?: number;
  property_address?: string;
  stage?: string;
  is_imported?: boolean;
  platform_submissions?: string[];
  // ── 新增字段 ──
  client_phone?: string;
  client_email?: string;
  employment_type?: string;
  residency?: string;
  property_value?: number;
  interest_rate?: number;
  doc_type?: string;
  loan_type?: string;
  onhold_reason?: string;
}

export interface BatchTopologyImportRequest {
  items: BatchTopologyImportItem[];
}

export interface BatchTopologyImportResponse {
  ok: boolean;
  message?: string;
  imported_count: number;
  created_case_ids: string[];
  active_case_id?: string;
  cases?: CaseResponse[];
}

// WO-57 档案中心批量归档历史案卷与放款事实 (Archive Batch Import & Facts)
export interface ArchiveCaseItem {
  dir_name: string;
  folder_path: string;
  client_name: string;
  lender?: string;
  loan_amount?: number;
  property_address?: string;
  settlement_date?: string;
  interest_rate?: string;
  status: string; // 'settled' | 'withdrawn' | string
  eligible: boolean;
  in_workbench: boolean;
  already_archived: boolean;
  filter_reason?: string;
  file_count: number;
}

export interface ArchiveScanResponse {
  ok: boolean;
  message?: string;
  client_name?: string;
  total_found: number;
  eligible_count: number;
  cases: ArchiveCaseItem[];
}

export interface ArchiveBatchImportItem {
  folder_path: string;
  client_name: string;
  lender?: string;
  loan_amount?: number;
  property_address?: string;
  settlement_date?: string;
  interest_rate?: string;
  status: string;
}

export interface ArchiveBatchImportRequest {
  items: ArchiveBatchImportItem[];
}

export interface ArchiveBatchImportResponse {
  ok: boolean;
  message?: string;
  imported_count: number;
  created_cases: Array<{ case_id: string; client_name: string; folder_path: string }>;
}

// WO-58 二次经营商机雷达 (Retention Radar)
export interface RetentionOpportunityItem {
  case_id: string;
  client_name: string;
  property_address?: string;
  lender?: string;
  loan_amount?: number;
  interest_rate?: string;
  settlement_date?: string;
  level: 'red' | 'yellow' | 'green' | 'blue';
  opp_type: 'fixed_rate_expiry' | 'annual_repricing' | 'equity_cashout' | 'settlement_care';
  title: string;
  action_suggest: string;
  days_relevant: number;
  draft_template?: string;
}

export interface RetentionRadarSummary {
  total_opportunities: number;
  red_count: number;
  yellow_count: number;
  green_count: number;
  blue_count: number;
}

export interface RetentionRadarResponse {
  ok: boolean;
  summary: RetentionRadarSummary;
  opportunities: RetentionOpportunityItem[];
}

// WO-59 AI 先例智库与审批官画像 (Precedents & Assessor Insights)
export interface AssessorInsightItem {
  assessor_name: string;
  lender?: string;
  case_count: number;
  latest_case_id?: string;
  latest_case_ref?: string;
  common_blockers: string[];
  communication_tips: string;
}

export interface AssessorListResponse {
  ok: boolean;
  total_assessors: number;
  assessors: AssessorInsightItem[];
}

export interface CasePrecedentItem {
  case_id: string;
  client_name: string;
  property_address?: string;
  lender?: string;
  loan_amount?: number;
  doc_type?: string;
  interest_rate?: string;
  settlement_date?: string;
  summary_highlight?: string;
}

export interface CasePrecedentSearchResponse {
  ok: boolean;
  total_found: number;
  precedents: CasePrecedentItem[];
}

export interface KnowledgeCardData {
  case_id: string;
  client_name: string;
  lender: string;
  loan_amount: number;
  strategy_summary: string;
  key_challenges: string[];
  approved_conditions: string;
  takeaway: string;
}

export interface KnowledgeCardResponse {
  ok: boolean;
  card?: KnowledgeCardData;
  message?: string;
}

// WO-60 档案中心大盘统计与客户资产池 (Archive Hub Stats & Portfolio)
export interface ArchiveHubStats {
  total_archived_clients: number;
  total_cases_count: number;
  total_loan_volume: number;
  total_opportunities_count: number;
  total_precedents_count: number;
}

export interface ArchiveHubStatsResponse {
  ok: boolean;
  stats: ArchiveHubStats;
}

export interface ClientPortfolioCaseSummary {
  case_id: string;
  property_address?: string;
  lender?: string;
  loan_amount?: number;
  interest_rate?: string;
  stage: string;
}

export interface ClientPortfolioItem {
  client_name: string;
  total_properties_count: number;
  total_loan_amount: number;
  primary_lender?: string;
  latest_settlement_date?: string;
  cases_summary: ClientPortfolioCaseSummary[];
  active_opportunities_count: number;
  latest_opportunity_title?: string;
}

export interface ArchivePortfolioResponse {
  ok: boolean;
  stats: ArchiveHubStats;
  clients: ClientPortfolioItem[];
}

// ==========================================
// WO-61 知识中心与档案库打通 & 工作台先例推荐
// ==========================================

export interface KnowledgeSyncResponse {
  ok: boolean;
  synced_count: number;
  total_precedents: number;
  message?: string;
}

export interface RecommendedPrecedentItem {
  precedent_id: string;
  case_id: string;
  title: string;
  lender?: string;
  client_name?: string;
  strategy_summary?: string;
  takeaway?: string;
  relevance_score: number;
  match_reasons: string[];
}

export interface CaseRecommendedPrecedentsResponse {
  ok: boolean;
  case_id: string;
  total_recommended: number;
  precedents: RecommendedPrecedentItem[];
}

export interface CaseBriefResponse {
  ok: boolean;
  case_id: string;
  client_name: string;
  brief_markdown: string;
  external_clean_markdown: string;
}

export interface MailPreviewResponse {
  ok: boolean;
  filename: string;
  subject: string;
  sender: string;
  to: string;
  date: string;
  body_text: string;
  body_html?: string | null;
  attachments: string[];
}







// WO-75 / WO-76 Preliminary Email Draft Response
export interface EmailDraftResponse {
  ok: boolean;
  case_id: string;
  subject: string;
  body_text: string;
  body_html: string;
  recipient_email: string;
  cc_email: string;
  draft_id: string;
}

// WO-77 Fact Find 结构化客户信息采集
export interface EmploymentHistoryItem {
  company: string;
  position: string;
  address?: string;
  phone?: string;
  start_date?: string;
  end_date?: string;
}

export interface LivingHistoryItem {
  address: string;
  start_date?: string;
  end_date?: string;
}

export interface SolicitorInfo {
  company: string;
  contact_name: string;
  email: string;
  phone: string;
}

export interface VehicleAsset {
  make: string;
  model: string;
  value: number;
}

export interface SuperBalance {
  provider: string;
  balance: number;
}

export interface FactFindSectionResponse {
  id: string;
  case_id: string;
  section: string;
  data: any;
  status: 'pending' | 'confirmed';
  updated_at: string | null;
}

export interface FactFindAllResponse {
  ok: boolean;
  case_id: string;
  sections: Record<string, FactFindSectionResponse>;
}

export interface FactFindConfirmResponse {
  ok: boolean;
  section: string;
  status: 'confirmed';
  event_id: number | null;
  checklist_updated: boolean;
}

export interface CaseFileItemResponse {
  id: string;
  case_id: string;
  original_name: string;
  assigned_type?: string | null;
  confidence?: number | null;
  nas_path?: string | null;
  status: string;
  file_extension?: string | null;
  file_size?: number | null;
  created_at?: string | null;
}
