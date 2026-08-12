"""Pydantic 响应/请求模型。"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class TaskResponse(BaseModel):
    id: int
    type: str
    title: str
    case_name: str
    case_id: str
    case_bank: str
    loan_amount: float
    priority: str  # urgent|high|normal|low
    suggested_action: str
    source_channel: str
    match_status: str = "confirmed"  # pending_match | confirmed | ignored
    created_at: datetime
    deadline: datetime | None = None
    delegated_to: str | None = None
    source_msg_id: str | None = None  # 复用 Action.source_msg_id，前端静音/分析用


class CaseResponse(BaseModel):
    case_id: str
    client_name: str
    lender: str
    loan_amount: float
    stage: str
    stage_days: int
    checklist_done: int
    checklist_total: int
    progress_pct: float
    last_activity: datetime | None = None
    finance_deadline: datetime | None = None  # Finance Clause / 关键截止日
    os_pending_count: int = 0                 # 待处理 OS 条件数


class CaseDetailResponse(BaseModel):
    id: str
    case_id: str  # 兼容前端 CaseResponse 契约（前端用 case_id）
    client_id: str | None = None
    client_name: str
    client_email: str | None = None
    client_phone: str | None = None
    broker_name: str | None = None
    lender: str | None = None
    loan_amount: float | None = None
    purpose: str | None = None
    stage: str
    folder_path: str | None = None
    client_goal: str | None = None
    special_circumstances: str | None = None
    interest_rate: str | None = None
    lender_ref: str | None = None
    submission_platform: str | None = None
    finance_deadline: datetime | None = None  # Finance Clause / 关键截止日
    created_at: datetime | None = None


class CaseContextResponse(BaseModel):
    case_id: str
    track: str
    facts: dict
    checklist: dict
    os: dict
    deadlines: dict
    risk: list[str]
    timeline: list[dict]
    memory: str
    summary: str | None = None
    internal_notes: str | None = None      # 仅 track=internal 返回
    submission_summary: str | None = None  # 仅 track=external 返回


class ContextEventRequest(BaseModel):
    source_type: str = "manual_note"  # manual_note | bank_progress | calendar_entry | ...
    content: str = Field(..., min_length=1)  # 必填非空
    track: Literal["internal", "external"] = "internal"  # 非法 → 422
    source_ref: str | None = None  # 可选，S2/S3 去重用


class ContextEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    case_id: str
    source_type: str
    content: str
    track: str
    status: str = "confirmed"   # pending | confirmed | superseded
    superseded_by: int | None = None
    supersede_reason: str | None = None
    created_at: datetime | None = None


class SupersedeEventRequest(BaseModel):
    reason: str = Field(..., min_length=1)          # 撤销原因（必填）
    replacement_event_id: int | None = None          # 可选：纠正时指向替代事件


class BrainFactResponse(BaseModel):
    id: int
    case_id: str
    key: str
    value: str
    category: str
    track: str
    event_id: int
    superseded_by: int | None = None
    conflict: bool = False
    valid_to: datetime | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class CaseCreateRequest(BaseModel):
    client_name: str = Field(..., min_length=1)
    source: str = "manual"
    broker_name: str = "Brandon"
    loan_amount: float | None = None
    purpose: str | None = None
    lender: str | None = None
    client_email: str = ""
    client_phone: str = ""
    raw_text: str = ""
    # ── V5 新增字段（前端 12-4 已扩展） ──
    property_value: float | None = None          # 已有（V5），确认保留
    income_description: str | None = None        # 年收入与职业属性描述
    submission_platform: str | None = None       # 递交平台
    interest_rate: float | None = None           # 已有，确认透传
    finance_clause_date: str | None = None       # Finance Clause 截止日期（ISO 字符串）
    client_goal: str | None = None               # 客户目标（core 已支持）
    special_circumstances: str | None = None     # 特殊情况（core 已支持）
    is_force_new_client: bool = False            # 同名客户强制新建
    linked_client_id: str | None = None          # 关联历史客户 ID
    employment_type: str | None = None           # 新增：PAYG | 自雇 | 公司 | 董事
    residency: str | None = None                 # 新增：citizen | PR | temp_visa | other
    is_imported: bool = False                    # 新增：存量壳标记（#15）


class ParseTextRequest(BaseModel):
    raw_text: str = Field(..., min_length=1)


class PreFillResponse(BaseModel):
    prefilled: dict = {}   # CaseCreateRequest 字段名 → 值（前端预填表单）
    facts: list[dict] = [] # 规则锚定事实（bank.lender / stage.current）


class ParseFileResponse(BaseModel):
    filename: str
    text_preview: str      # 解析文本前 200 字（仅预览，含脱敏后内容）
    prefilled: dict = {}
    facts: list[dict] = []


class StageAdvanceRequest(BaseModel):
    signal: str  # stage_signals.yaml 中的信号名（如 approved / bank_mir）
    inbox_msg_id: str | None = None


class DispatchRequest(BaseModel):
    action: str  # approve|reject|defer|delegate


class CreateTaskRequest(BaseModel):
    case_id: str | None = None  # 手动建任务必填（端点层校验 → 422）
    task_type: str = "general"
    source_channel: str = "manual"
    title: str
    context: dict = {}


class DelegateRequest(BaseModel):
    delegate_to: str
    deadline: str | None = None
    message: str = ""


class BossReplyRequest(BaseModel):
    decision: str  # approve|reject|defer
    note: str = ""


class ToolCard(BaseModel):
    """结构化工具卡（前端只渲染，不执行）。"""
    type: Literal["record_confirm", "draft", "submission_suggest", "flow"]
    title: str
    payload: dict  # 结构见契约说明


class ChatRequest(BaseModel):
    message: str
    case_id: str | None = None
    track: Literal["internal", "external"] = "internal"  # 对话轨道（递交模式=external）


class ChatResponse(BaseModel):
    reply: str
    tool_cards: list[ToolCard] = []
    recorded_facts: list[dict] = []        # [{event_id, content, status:"confirmed"}]
    suggested_actions: list[str] = []


class ChatMessageResponse(BaseModel):
    id: int
    case_id: str
    role: str
    content: str
    created_at: datetime


class TimelineEventResponse(BaseModel):
    id: int
    case_id: str
    event_type: str
    title: str
    description: str | None = None
    source_ref: str | None = None
    created_at: datetime


class ChecklistItemResponse(BaseModel):
    id: int
    case_id: str
    item_name: str
    category: str
    is_required: bool
    status: str
    ai_suggestion: str | None = None
    updated_at: datetime | None = None


class ChecklistConfirmRequest(BaseModel):
    received_file_id: str | None = None


class FileItemResponse(BaseModel):
    id: str
    case_id: str
    original_name: str
    assigned_type: str | None = None
    confidence: float | None = None
    nas_path: str
    status: str
    file_extension: str | None = None
    file_size: int | None = None
    created_at: datetime | None = None


class InboxMessageResponse(BaseModel):
    id: str
    subject: str
    sender_email: str
    sender_name: str | None = None
    received_at: datetime
    body_preview: str | None = None
    has_attachments: bool
    attachment_count: int | None = None
    status: str
    level: str | None = None
    matched_case_id: str | None = None
    ai_category: str | None = None
    ai_summary: str | None = None


class DraftResponse(BaseModel):
    id: int
    case_id: str
    draft_type: str
    subject: str | None = None
    to_email: str | None = None
    body: str
    language: str
    source_action_id: int | None = None
    source_msg_id: str | None = None
    status: str
    created_at: datetime | None = None
    updated_at: datetime | None = None


class DraftRefineRequest(BaseModel):
    instruction: str  # "改成更客气的语气"


class SubmissionCheckResponse(BaseModel):
    case_id: str
    ok: bool
    pending_items: list[str] = Field(default_factory=list)
    missing_required: list[str] = Field(default_factory=list)
    os_pending: int = 0
    message: str = ""


class CommissionResponse(BaseModel):
    month_settled: float  # 本月已结佣（首期）
    pipeline_estimate: float  # 预估在途佣金（已批准 + 潜在首期）
    active_cases: int  # 活跃案件数
    generated_at: datetime


class DraftListItemResponse(BaseModel):
    id: int
    action_id: int | None = None
    case_id: str | None = None
    client_name: str | None = None     # 联查 Case.client_name，无则 None
    subject: str
    status: str                        # draft | confirmed | sent
    version: int
    updated_at: datetime | None = None


class ArchivedCaseResponse(CaseResponse):
    closed_at: datetime | None = None
    close_reason: str | None = None


class ImportRecordResponse(BaseModel):
    id: int
    source: str
    status: str
    file_count: int = 0
    message_count: int = 0
    started_at: datetime | None = None
    finished_at: datetime | None = None
    note: str | None = None


class VersionInfo(BaseModel):
    version: str
    name: str


# ── Analytics（core/analytics 统计端点） ────────────────────────────

class AnalyticsPeriodMetrics(BaseModel):
    active_cases: int
    new_cases: int
    submitted: int
    approved: int
    settled: int
    commission_estimate: float
    tasks_done: int


class AnalyticsOverviewResponse(BaseModel):
    granularity: Literal["day", "week", "month"]
    current: AnalyticsPeriodMetrics
    previous: AnalyticsPeriodMetrics


class AnalyticsPipelinePoint(BaseModel):
    period: str
    new_cases: int
    submitted: int
    approved: int
    settled: int
    amount: float
    commission: float


class AnalyticsPipelineResponse(BaseModel):
    granularity: Literal["day", "week", "month"]
    series: list[AnalyticsPipelinePoint] = Field(default_factory=list)


class AnalyticsLenderStats(BaseModel):
    lender: str
    cases: int
    avg_approval_days: float | None = None
    os_rate: float
    approval_rate: float


class AnalyticsLendersResponse(BaseModel):
    granularity: Literal["day", "week", "month"]
    lenders: list[AnalyticsLenderStats] = Field(default_factory=list)


class AnalyticsEfficiencyMetrics(BaseModel):
    tasks_done: int
    on_time_rate: float
    checklist_confirm_rate: float
    ai_adoption_count: int
    avg_client_reply_days: float | None = None


class AnalyticsEfficiencyResponse(BaseModel):
    granularity: Literal["day", "week", "month"]
    current: AnalyticsEfficiencyMetrics
    previous: AnalyticsEfficiencyMetrics


class UsagePeriod(BaseModel):
    calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    prompt_cache_hit_tokens: int = 0
    prompt_cache_miss_tokens: int = 0
    cache_hit_rate: float | None = None
    cost_usd: float = 0.0
    avg_latency_ms: float | None = None
    corrected_count: int = 0


class AnalyticsUsageResponse(BaseModel):
    current: UsagePeriod
    previous: UsagePeriod
