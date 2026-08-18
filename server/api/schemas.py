"""Pydantic 响应/请求模型。"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

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
    escalated_to_boss: bool = False   # 已升级给老板、待拍板（escalated_at 非空）
    boss_decision: str | None = None  # 升级时的卡点问题摘要（vera_note JSON problem）


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
    has_boss_pending: bool = False            # 该案件存在升级未决事项（待老板拍板）


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
    submission_platform_ref: str | None = None
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


class PolicyIssueOut(BaseModel):
    level: str      # green | amber | red
    title: str
    detail: str
    suggestion: str


class PolicyCheckResponse(BaseModel):
    lender: str
    overall: str                       # green | amber | red
    issues: list[PolicyIssueOut] = Field(default_factory=list)
    alternative_lenders: list[str] = Field(default_factory=list)
    summary: str = ""                  # LLM 润色或模板文案（中文一段话）
    disclaimer: str = "政策会变，以银行官方为准；本提示仅供辅助参考。"


class DeclarationFinding(BaseModel):
    item: str                       # 申报维度（dependents/income/living_expense/liability/occupation/visa/文件）
    evidence: str                   # 证据片段（本地展示真实值；仅 LLM 出站时脱敏）
    level: str                      # warning | fail | unparseable
    suggestion: str                 # 建议


class DeclarationCheckRequest(BaseModel):
    files: list[str] = []           # Vera 指定文件路径（至少一个，或 folder）
    folder: str | None = None       # Vera 指定文件夹（可选；仅一层，不递归）


class DeclarationCheckResponse(BaseModel):
    status: str                     # pass | warning | fail | unparseable
    findings: list[DeclarationFinding] = Field(default_factory=list)
    summary: str
    draft_explanation: str | None = None


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
    locked_by_user: bool = False
    disclosure: str | None = None
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
    # ── WO-41 追加 ──
    deadline: str | None = None          # ISO 8601，可选；端点解析为 datetime 写 scheduled_at
    priority: str = "normal"             # urgent | high | normal | low
    assignee: str | None = None          # 空 → 默认 "vera"；老板用 "brandon"


class DelegateRequest(BaseModel):
    delegate_to: str
    deadline: str | None = None
    message: str = ""


class BossReplyRequest(BaseModel):
    decision: str  # approve|reject|defer
    note: str = ""


class ToolCard(BaseModel):
    """结构化工具卡（前端只渲染，不执行）。"""
    type: str
    title: str
    payload: dict = {}
    presentation: str = "result_card"   # result_card | dialog
class DraftCardVersion(BaseModel):
    """邮件草稿版本（V1/V2/V3 + 分支，WO-27）。"""
    version: str
    branch_label: str
    message_id: int
    subject: str
    body: str


class CardActionRequest(BaseModel):
    """共创卡动作请求（F-15）：new / version / branch / confirm。"""
    flow_key: str
    case_id: str | None = None
    action: str = "new"
    parent_message_id: int | None = None
    branch_label: str | None = None
    recipient_hint: str = ""
    extra: dict = Field(default_factory=dict)


class CoCreateDraft(BaseModel):
    """共创弹窗深谈版本（WO-46b）。"""
    subject: str
    body: str
    version: str
    branch_label: str
    message_id: int


class CoCreateRequest(BaseModel):
    """共创弹窗深谈请求（WO-46b）：clarify/generate/version/branch/confirm。"""
    case_id: str
    flow_key: Literal["followup", "chaser", "os_reply"]  # 非法 → 422
    action: Literal["clarify", "generate", "version", "branch", "confirm"]
    message: str = ""                       # 用户本轮输入（clarify/generate/version 用；confirm 可空）
    session_id: str = ""                    # 恢复会话（默认 draft:{case_id}）
    parent_message_id: int | None = None    # version/branch/confirm 指定父版本
    branch_label: str = "main"
    create_todo: bool = False               # confirm 时可选建待办（红线：必须显式传入）


class CoCreateResponse(BaseModel):
    """共创弹窗深谈响应（WO-46b）。"""
    reply: str
    draft: CoCreateDraft | None = None
    versions: list[CoCreateDraft] = Field(default_factory=list)
    status: Literal["clarifying", "draft", "confirmed", "blocked"]
    event_id: int | None = None             # confirm 后事件
    task_id: int | None = None              # confirm + create_todo=true 后任务
    reason: str | None = None               # blocked 原因


class SkillUpdateRequest(BaseModel):
    """技能草稿更新（仅 draft，F-15 对接）。"""
    manifest: dict
    reason: str | None = None


class SkillRejectRequest(BaseModel):
    """拒绝 AI 技能提议（F-15 对接）。"""
    reason: str | None = None


class DraftCardPayload(BaseModel):
    """状态卡片契约（WO-27）：payload_version + state（表单）+ result（最新结论）。"""
    schema_version: int = 1
    card_type: str
    action: str
    state: dict = {}
    result: dict = {}
    status: str = "draft"


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


class ChecklistAddRequest(BaseModel):
    name_zh: str
    name_en: str | None = None
    category: str                      # 枚举同 checklist_master
    is_required: bool = True
    applicable_when: dict | None = None
    bank_specific: str | None = None


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


class DraftCreateRequest(BaseModel):
    """手动建草稿请求（WO-46）：subject/body 必填，track 缺省 internal。"""

    case_id: str
    subject: str
    body: str
    track: Literal["internal", "external"] = "internal"  # 仅校验不落库（EmailDraft 无 track 列）


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
    lender_key: str
    cases: int
    avg_approval_days: float | None = None
    os_rate: float
    approval_rate: float


class AnalyticsLendersResponse(BaseModel):
    granularity: Literal["day", "week", "month"]
    lenders: list[AnalyticsLenderStats] = Field(default_factory=list)


class BankItem(BaseModel):
    key: str
    display_name: str
    name_zh: str
    type: str            # major | bank | non_bank
    adi: bool
    tier: str            # full | basic
    has_calculator: bool
    platforms: list[str]
    vera_confirmed: bool


class PlatformItem(BaseModel):
    key: str
    display_name: str
    name_zh: str
    type: str            # aggregator | lodgement | manual
    vera_confirmed: bool


class BanksResponse(BaseModel):
    banks: list[BankItem] = Field(default_factory=list)


class PlatformsResponse(BaseModel):
    platforms: list[PlatformItem] = Field(default_factory=list)


class AgentItem(BaseModel):
    key: str
    name: str
    description: str
    category: str            # agent | tool
    status: str              # available | pending
    enabled: bool
    triggers: list[str] = Field(default_factory=list)
    capability: str | None = None
    permission: str | None = None


class AgentsResponse(BaseModel):
    agents: list[AgentItem] = Field(default_factory=list)


class AgentUpdateRequest(BaseModel):
    enabled: bool


class BankPlatformUpdateRequest(BaseModel):
    platforms: list[str] = Field(default_factory=list)
    vera_confirmed: bool = True



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


# ── WO-21 计算器 ──────────────────────────────────────────


class CalculatorApplicant(BaseModel):
    """与 core/calculator/models.ApplicantIn 字段对齐（年度值）。"""

    base: float = 0.0
    overtime: float = 0.0
    bonus_commission: float = 0.0
    casual: float = 0.0
    investment_income: float = 0.0
    dividends: float = 0.0
    foreign_income: float = 0.0
    rental_income: float = 0.0
    government_benefits: float = 0.0
    other_taxable: float = 0.0
    other_nontaxable: float = 0.0
    company_npbt: float = 0.0
    company_addbacks: float = 0.0


class CalculatorLoanPortion(BaseModel):
    amount: float
    rate: float
    term_years: int = 30
    io_years: int = 0
    purpose: Literal["OO", "INV"] = "OO"
    repayment: Literal["PI", "IO"] = "PI"


class CalculatorLoan(BaseModel):
    portions: list[CalculatorLoanPortion] = Field(default_factory=list)
    security_value: float = 0.0
    postcode: str = ""
    state: str = ""
    mortgage_insurer: str = ""
    product: str = "standard"
    doc_type: str = "full_doc"
    simple_refinance: bool = False
    refinance_exception: bool = False


class CalculatorCommitment(BaseModel):
    type: str
    balance: float = 0.0
    limit: float = 0.0
    rate: float = 0.0
    remaining_months: int = 0
    declared_monthly: float = 0.0


class CalculatorHousehold(BaseModel):
    status: Literal["Single", "Couple"] = "Single"
    dependents: int = 0
    income_for_hem: float | None = None


class CalculatorLivingExpenses(BaseModel):
    declared_basic_monthly: float = 0.0
    declared_non_hem: float = 0.0


class CalculatorAssessRequest(BaseModel):
    bank: str
    applicants: list[CalculatorApplicant] = Field(default_factory=list)
    loan: CalculatorLoan = Field(default_factory=CalculatorLoan)
    commitments: list[CalculatorCommitment] = Field(default_factory=list)
    household: CalculatorHousehold = Field(default_factory=CalculatorHousehold)
    living_expenses: CalculatorLivingExpenses = Field(default_factory=CalculatorLivingExpenses)


class CalcStepSchema(BaseModel):
    step_id: str
    label: str
    formula: str
    inputs: dict[str, Any] = Field(default_factory=dict)
    output: Any = None
    source: str = ""


class CalculatorAssessResponse(BaseModel):
    bank: str
    result: str                      # PASS | FAIL | REFER | NO RESULT
    indicator: str
    indicator_value: float | None = None
    threshold: float | None = None
    min_surplus: float | None = None
    surplus: float | None = None
    max_loan: float | None = None
    dti: float | None = None
    lvr: float | None = None
    steps: list[CalcStepSchema] = Field(default_factory=list)
    profile_version: str = ""


class ProfileInfo(BaseModel):
    bank: str
    name: str
    version: str
    effective_date: str
    source_file: str
    source_hash: str
    status: str = "default"          # default | overridden
    pending: bool = False
    last_checked: str | None = None


class ProfileDiffItem(BaseModel):
    path: str
    old: Any = None
    new: Any = None


class ProfileUploadResponse(BaseModel):
    bank: str | None = None
    detected_version: str | None = None
    current_version: str | None = None
    is_new_bank: bool = False
    needs_review: bool = False
    review_note: str | None = None
    diff: list[ProfileDiffItem] = Field(default_factory=list)
    changed_count: int = 0
    source_hash: str = ""


class ProfileApplyRequest(BaseModel):
    source_hash: str


class SmokeTestResult(BaseModel):
    name: str
    passed: bool
    detail: str = ""


class ProfileApplyResponse(BaseModel):
    bank: str
    applied_version: str
    smoke_tests: list[SmokeTestResult] = Field(default_factory=list)
    history: list[str] = Field(default_factory=list)


class ProfileRollbackRequest(BaseModel):
    version: str


class ProfileRollbackResponse(BaseModel):
    bank: str
    rolled_back_to: str
    smoke_tests: list[SmokeTestResult] = Field(default_factory=list)


# ── WO-28 技能包系统 Schemas ─────────────────────────────────────────

class SkillVersionResponse(BaseModel):
    id: int
    key: str
    version: str
    status: str
    created_by: str
    reason: str | None = None
    superseded_by: int | None = None
    created_at: datetime | None = None


class SkillResponse(BaseModel):
    key: str
    name: str
    description: str = ""
    version: str = "1.0.0"
    category: str = "flow"
    triggers: list[str] = Field(default_factory=list)
    presentation: str = "result_card"
    permission: str = "draft"
    inputs: dict[str, Any] = Field(default_factory=dict)
    outputs: dict[str, Any] = Field(default_factory=dict)
    steps: list[dict[str, Any]] = Field(default_factory=list)
    assets: list[dict[str, Any]] = Field(default_factory=list)
    confirm_required: bool = True
    status: str = "draft"
    author: str = "vera"
    db_id: int | None = None
    created_by: str | None = None
    reason: str | None = None


class SkillCreateRequest(BaseModel):
    manifest: dict[str, Any]
    reason: str | None = None


class SkillProposeRequest(BaseModel):
    manifest: dict[str, Any]
    reason: str = Field(..., min_length=1)
    scope: str | None = None


class SkillActivateRequest(BaseModel):
    version: str
    operator: str = "vera"


class SkillRollbackRequest(BaseModel):
    target_version: str


# ── WO-29 案件文件夹关联 Schemas ─────────────────────────────────────────

class CaseFolderRequest(BaseModel):
    """案件文件夹关联（2026-08-17 无总根模式）。

    mode=existing: path = 已存在的案件文件夹（任意绝对路径，Vera 手动选）。
    mode=create:   path = Vera 选定的父目录；folder_name 可选（缺省"客户名_case_id"），
                   系统在父目录下创建案件文件夹 + 标准子目录。
    """

    mode: Literal["existing", "create"]
    path: str
    folder_name: str | None = None


class CaseFolderResponse(BaseModel):
    case_id: str
    folder_path: str
    mode: str


# ── 案件生命周期闭环（撤回/终止/暂停/换行重递）─────────────────────────

class CaseCloseRequest(BaseModel):
    """撤回/终止通用：原因（老项目原因列表之一）+ 补充说明。"""

    reason: str
    note: str | None = None


class CaseHoldRequest(BaseModel):
    """暂停案件：原因 + 补充说明 + 提醒日期。"""

    reason: str
    note: str | None = None
    reminder_date: str | None = None


class CaseResubmitRequest(BaseModel):
    """换行重递：原因 + 新银行 + 新金额 + 继承选项。"""

    reason: str
    note: str | None = None
    new_lender: str
    new_loan_amount: float | None = None
    new_case_type: str | None = None
    inherit_files: bool = True
    inherit_knowledge: bool = True


class FolderParseResponse(BaseModel):
    """文件夹命名解析结果（WO-34，Electron/Web 共用预填）。"""
    client_name: str | None = None
    broker_name: str | None = None
    case_id: str | None = None

class FolderBrowseItem(BaseModel):
    """文件夹浏览项（WO-34；前端契约 FolderBrowseItem）。"""
    path: str
    name: str
    is_dir: bool = True
    size: int | None = None
    mtime: str | None = None


class FolderBrowseResponse(BaseModel):
    """文件夹浏览响应（WO-34；前端契约 FolderBrowseResponse）。"""
    current_path: str
    items: list[FolderBrowseItem] = Field(default_factory=list)


# ── WO-38 时间点回溯快照 Schemas ─────────────────────────────────────────

class SnapshotFact(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    value: str
    category: str
    conflict: bool = False
    valid_from: datetime | None = None
    valid_to: datetime | None = None


class SnapshotEvent(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    source_type: str
    content: str
    status: str
    created_at: datetime | None = None


class SnapshotTimelineItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_type: str
    title: str
    description: str | None = None
    created_at: datetime | None = None


class CaseSnapshotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    snapshot_at: str
    stage: str
    facts: list[SnapshotFact]
    events: list[SnapshotEvent]
    timeline: list[SnapshotTimelineItem]


# ── WO-39 澳洲时区/假期/银行工作日 Schemas ───────────────────────────────

class HolidayStateToday(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: str
    state: str
    is_working_day: bool
    holiday_name: str | None = None
    weekday: int


class HolidayItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: str
    name: str
    state: str
    display: str


class DlsStatus(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    utc_offset_hours: int
    dls_active: bool


class HolidaysResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    today: dict[str, HolidayStateToday]   # key = act/nsw/qld
    upcoming: list[HolidayItem]
    next: HolidayItem | None
    dls: dict[str, DlsStatus]             # key = sydney/brisbane/beijing
    china: list[HolidayItem] = []         # 中国主要长假首日（state="CN"）
    next_china: HolidayItem | None = None # 下一个中国长假首日


# ── B 收尾：知识中心 CRUD ─────────────────────────────────────────


class KnowledgeEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    layer: str                 # case | global | industry
    case_id: str | None = None
    content: str
    source: str
    vera_confirmed: bool = False
    lender: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class KnowledgeCreateRequest(BaseModel):
    layer: Literal["case", "global", "industry"]
    content: str = Field(min_length=1)
    case_id: str | None = None
    lender: str | None = None
    source: str = "vera_manual"


class KnowledgeUpdateRequest(BaseModel):
    content: str | None = Field(default=None, min_length=1)
    lender: str | None = None
    vera_confirmed: bool | None = None


# ── AI 助手设置（人格/名字/称呼，2026-08-14） ────────────────────────


class PersonaItem(BaseModel):
    """内置人格条目（来自 config/persona.yaml）。"""

    model_config = ConfigDict(from_attributes=True)

    key: str
    name: str
    role: str
    style: str


class AssistantSettingsResponse(BaseModel):
    """AI 助手设置当前值 + 内置人格列表 + 是否待引导。"""

    model_config = ConfigDict(from_attributes=True)

    ai_name: str | None = None
    user_address: str | None = None
    persona_key: str | None = None
    default_persona: str
    personas: list[PersonaItem]
    onboarding_needed: bool


class AssistantSettingsUpdate(BaseModel):
    """更新 AI 助手设置；字段省略表示不修改，空字符串表示清除。"""

    ai_name: str | None = Field(default=None, max_length=40)
    user_address: str | None = Field(default=None, max_length=20)
    persona_key: str | None = Field(default=None, max_length=20)


# ── AI 模型 API 配置（设置页，2026-08-18） ────────────────────────────────

class AiProviderStatus(BaseModel):
    """单个 provider 的 key/base_url 状态（key 只回显是否配置，不返回原文）。"""

    key_configured: bool
    base_url: str | None = None


class AiSettingsResponse(BaseModel):
    deepseek: AiProviderStatus
    gemini: AiProviderStatus


class AiSettingsUpdate(BaseModel):
    deepseek_api_key: str | None = None
    deepseek_base_url: str | None = None
    gemini_api_key: str | None = None
    gemini_base_url: str | None = None


class AiTestRequest(BaseModel):
    provider: Literal["deepseek", "gemini"]
    api_key: str | None = None
    base_url: str | None = None


class AiTestResponse(BaseModel):
    ok: bool
    message: str


class FactAmendRequest(BaseModel):
    """人工修正事实请求（WO-42）。"""

    value: str                          # 修正后的值（非空，空白 → 422）
    reason: str | None = None           # 修正原因（写入事件 content）


class FactDisclosureRequest(BaseModel):
    """设置事实披露标记请求（WO-42）。"""

    disclosure: str | None = None       # 'disclosed' | 'internal_only' | None（None=清除标记）


# ── 文件操作（WO-44） ──────────────────────────────────────────────


class FileOpsItem(BaseModel):
    """案件文件夹条目（目录或文件）。"""

    model_config = ConfigDict(from_attributes=True)

    name: str
    rel_path: str
    is_dir: bool
    size: int | None = None
    mtime: str | None = None
    doc_type: str | None = None
    file_id: str | None = None  # WO-48: 已落库文件的 processed_files id（供 Office 原样预览）


class FileOpsListResponse(BaseModel):
    """案件文件夹一层列表（子目录在前）。"""

    model_config = ConfigDict(from_attributes=True)

    current_path: str
    items: list[FileOpsItem]


class FilePreviewResponse(BaseModel):
    """文件预览（文本摘要 ≤2000 字符；解析失败返回 parse_error）。"""

    model_config = ConfigDict(from_attributes=True)

    rel_path: str
    size: int
    mtime: str
    doc_type: str | None = None
    text_preview: str = ""
    parse_error: str | None = None


class FileOpsResult(BaseModel):
    """改名/移动/放入操作结果。"""

    model_config = ConfigDict(from_attributes=True)

    ok: bool
    source: str
    target: str
    event_id: str | None = None


class RenameRequest(BaseModel):
    """改名请求（Vera 确认后调用）。"""

    source: str
    new_name: str


class MoveRequest(BaseModel):
    """移动请求（Vera 确认后调用）。"""

    source: str
    target_dir: str


class NamingSuggestResponse(BaseModel):
    """规范命名建议（纯确定性规则，不调 LLM）。"""

    model_config = ConfigDict(from_attributes=True)

    doc_type: str | None = None
    suggested: str
    template_key: str | None = None
    matched: bool
    reasons: list[str]
