"""SQLAlchemy ORM models for loan-assistant V4.

Defines Case, PIIMap, CaseKnowledge and all related tables.
This is the sole data-access layer (raw sqlite3 layer removed in v1.4.0).

Note on Case model column mappings:
    The existing `cases` table uses column names like `case_id`,
    `loan_purpose`, `residency_status`, `case_folder_name`.
    The V4 Python interface uses `id`, `purpose`, `residency`,
    `folder_path`. Column() first-arg mappings bridge the two,
    preserving backward compatibility with existing routes.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class Case(Base):  # type: ignore[misc]
    """Loan case record.

    Primary key format: case_YYYYMMDD_拼音名
    e.g. case_20260710_zhangsan
    """

    __tablename__ = "cases"

    # Column("db_column_name", ...) maps Python attr → existing DB column
    id = Column("case_id", String, primary_key=True)
    client_name = Column(String, nullable=False)
    loan_amount = Column(Float, nullable=True)
    purpose = Column("loan_purpose", String, nullable=True)
    employment_type = Column(String, nullable=True)
    residency = Column("residency_status", String, nullable=True)
    stage = Column(String, default="gathering")
    folder_path = Column("case_folder_name", String, nullable=True)
    lender = Column(String, nullable=True)
    lender_ref = Column(String, nullable=True, index=True)
    case_type = Column(String, nullable=True)
    is_imported = Column(Boolean, default=False)  # 历史导入的案件（非新建），跳过"新案进件"任务
    context_summary = Column(Text, nullable=True)
    knowledge_summary = Column(Text, nullable=True)
    finance_deadline = Column(DateTime, nullable=True)
    broker_notes = Column(Text, nullable=True)
    client_id = Column(String, nullable=True)
    client_email = Column(String, nullable=True)
    client_phone = Column(String, nullable=True)
    broker_name = Column(String, nullable=True)
    property_value = Column(Float, nullable=True)
    lvr = Column(Float, nullable=True)
    is_urgent = Column(Integer, default=0)
    urgent_reason = Column(Text, nullable=True)
    gathering_progress = Column(Integer, default=0)
    preferred_language = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # ── 案件大脑字段 ──
    client_goal = Column(Text, nullable=True)              # 客户目标（Vera手填/AI预填）
    special_circumstances = Column(Text, nullable=True)     # 特殊情况（Vera + AI 共同维护）

    # ── 策略引擎字段 ──
    strategy_report = Column(Text, nullable=True)       # AI 生成的策略报告 Markdown

    # ── 终态管理字段（需求四：结案锁定与档案库）──
    resub_from = Column(String, nullable=True)           # 从哪个旧案件重递来
    resub_to = Column(String, nullable=True)             # 重递到了哪个新案件
    close_reason = Column(String, nullable=True)         # 终止/撤回/重递原因
    close_note = Column(Text, nullable=True)             # Vera 补充说明
    closed_at = Column(DateTime, nullable=True)          # 终态时间戳
    hold_reminder_date = Column(DateTime, nullable=True) # On Hold 提醒日期
    previous_stage = Column(String, nullable=True)       # 暂停前阶段（恢复用）

    # ── 档案库增强字段 ──
    interest_rate = Column(String, nullable=True)        # 信贷产品利率（如 "6.09"）
    ai_experience = Column(Text, nullable=True)          # AI 经验总结（结案时生成）

    # ── 递交平台 ──
    submission_platform = Column(String, nullable=True)  # 递交平台 (如 "Platform A", "Platform B")
    submission_platform_ref = Column(String, nullable=True)  # 递交平台规范 key（WO-22，如 mqg/infynity）

    # ── 内外双轨（S4-数据层）：内线真实情况 vs 外线递交呈现 ──
    internal_notes = Column(Text, nullable=True)      # 内线：真实情况/风险/策略（仅本地）
    submission_summary = Column(Text, nullable=True)  # 外线：递交呈现摘要


class PIIMap(Base):  # type: ignore[misc]
    """PII token mapping table.

    Maps real PII values to stable placeholders per case.
    This table NEVER leaves the internal network (Red Line #9).
    """

    __tablename__ = "pii_map"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String, nullable=False, index=True)
    token = Column(String, nullable=False)
    real_value = Column(String, nullable=False)
    pii_type = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class CaseKnowledge(Base):  # type: ignore[misc]
    """Raw case knowledge entries (kept locally, never sent externally).

    Stores original plain-text content from various sources.
    """

    __tablename__ = "case_knowledge"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String, nullable=False, index=True)
    content = Column(Text, nullable=False)
    source = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class CaseChecklist(Base):  # type: ignore[misc]
    """Checklist item state for a specific loan case."""

    __tablename__ = "case_checklist"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String, nullable=False, index=True)
    item_name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    is_required = Column(Boolean, default=True)
    status = Column(String, default="pending")  # pending / received / needs_selection / waived
    phase = Column(String, default="initial")  # initial（首次材料）/ condition（银行/OS 追加）
    deadline = Column(DateTime, nullable=True)  # 追加项截止（condition 常用）
    source_ref = Column(String, nullable=True)  # 来源说明（flow:draft_email / CBA OS 条件 #12）
    item_kind = Column(String, default="document")  # document（文档）/ info（结构化信息）
    received_file_id = Column(String, nullable=True)
    candidate_file_ids = Column(Text, nullable=True)  # JSON array: ["file_id1", "file_id2"]
    received_file_ids = Column(JSON, default=list)  # [file_id, ...] 多文件（V5）
    ai_suggestion = Column(Text, nullable=True)
    master_id = Column(String, nullable=True, index=True)  # 全集清单项 id（Phase 3）
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CaseFile(Base):  # type: ignore[misc]
    """Record of an uploaded / discovered file associated with a case."""

    __tablename__ = "processed_files"

    id = Column(String, name="file_id", primary_key=True)  # Format: file_uuid
    case_id = Column(String, nullable=False, index=True)
    original_name = Column(String, name="file_name", nullable=False)
    assigned_type = Column(String, name="document_type", nullable=True)  # final document category (e.g. payslip)
    confidence = Column(Float, nullable=True)
    nas_path = Column(String, name="file_path", nullable=False)
    status = Column(String, default="discovered")
    file_extension = Column(String, nullable=True)
    file_size = Column(Integer, default=0)
    send_to_lender = Column(Boolean, default=False)  # 结案时是否需要归档给贷款机构
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    file_hash = Column(String, nullable=True)         # 文件内容哈希（MD5），用于在案件内排重

    # ── 需求三：文件归档字段 ──
    current_name = Column(String, nullable=True)      # 当前文件名（改名后更新）
    suggested_name = Column(String, nullable=True)    # AI 建议的文件名
    target_dir = Column(String, nullable=True)        # AI 建议归档到哪个目录
    archived = Column(Boolean, default=False)         # 是否已归档（移出 _Inbox）
    archived_at = Column(DateTime, nullable=True)     # 归档时间

    # ── 材料复用字段（需求四：Resub 文件继承）──
    source_case_id = Column(String, nullable=True)   # 引用自哪个旧案件
    source_file_id = Column(String, nullable=True)   # 引用的原始文件 ID
    is_reference = Column(Boolean, default=False)    # 是否为引用（非物理文件）
    reference_valid = Column(Boolean, default=True)  # 引用是否仍然有效

    # ── OCR 结构化字段 ──
    extracted_data = Column(Text, nullable=True)     # AI OCR 抽取的 JSON key-value 字典

    # ── 解析路由（记录在 DB 中供报告展示）──
    parse_route = Column(String, nullable=True)

    # ── 文档处理质量追踪字段 ──
    quality_score = Column(Integer, nullable=True)        # 综合质量评分 0-100
    processing_method = Column(String, nullable=True)     # "ai" | "regex_fallback" | "ai+regex_enriched"
    field_fill_rate = Column(Float, nullable=True)        # 字段填充率 0.0-1.0

    # ── 预览缓存字段 ──
    preview_pdf_path = Column(String, nullable=True)  # LibreOffice 转换后的 PDF 缓存路径


class Action(Base):  # type: ignore[misc]
    """Pending actions and tasks requiring Vera's attention."""

    __tablename__ = "actions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String, nullable=False, index=True)
    type = Column(String, nullable=False)  # e.g. "classify"
    title = Column(String, nullable=False)
    priority = Column(String, default="low")  # low / medium / high
    status = Column(String, default="pending")  # pending / completed
    assignee = Column(String, default="vera")  # vera / brandon
    escalated_at = Column(DateTime, nullable=True)
    vera_note = Column(Text, nullable=True)
    boss_decision = Column(Text, nullable=True)
    ai_suggestion = Column(Text, nullable=True)
    scheduled_at = Column(DateTime, nullable=True)   # 定时触发时间（On Hold 提醒）
    source_msg_id = Column(String, nullable=True)    # 关联触发它的收件箱邮件（联动回写用）
    os_cond_ids = Column(Text, nullable=True)        # OS 攻坚：该动作已标记 replied 的条件 ID（JSON 数组），撤回时还原
    # ── V5 任务引擎字段 ──
    source_channel = Column(String, default="email")  # email/file/wechat/manual
    match_status = Column(String, nullable=False, default="confirmed")  # pending_match | confirmed | ignored（S2 匹配确认/S3 日历去重）
    routing_options = Column(JSON, nullable=True)     # 可执行建议元数据
    delegated_to = Column(String, nullable=True)      # 委派对象
    delegated_at = Column(DateTime, nullable=True)
    delegation_deadline = Column(DateTime, nullable=True)
    delegation_feedback = Column(String, nullable=True)  # 同事反馈
    created_at = Column(DateTime, default=datetime.utcnow)


class CaseBrief(Base):  # type: ignore[misc]
    """Cache table for distilled layered briefs to avoid redundant LLM calls."""

    __tablename__ = "case_briefs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String, nullable=False, index=True)
    level = Column(Integer, nullable=False)
    brief_content = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class OsCondition(Base):  # type: ignore[misc]
    """Bank outstanding conditions parsed from emails."""

    __tablename__ = "os_conditions"

    id = Column(String, primary_key=True)  # Format: os_{uuid}
    case_id = Column(String, nullable=False, index=True)
    raw_text = Column(Text, nullable=False)  # 银行原话
    category = Column(String, nullable=False)  # document / explanation / action
    status = Column(String, default="pending")  # pending / satisfied / replied
    deadline = Column(DateTime, nullable=True)
    ai_suggestion = Column(Text, nullable=True)
    ai_reply_draft = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class CaseMilestone(Base):  # type: ignore[misc]
    """Milestones for tracking loan case progress."""

    __tablename__ = "case_milestones"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String, nullable=False, index=True)
    milestone_name = Column(String, nullable=False)  # e.g., gathering, submitted
    status = Column(String, default="pending")  # pending / completed
    actual_date = Column(DateTime, nullable=True)
    estimated_date = Column(DateTime, nullable=True)


class SystemSetting(Base):  # type: ignore[misc]
    """System-wide configuration settings stored in DB."""

    __tablename__ = "system_settings"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class KnowledgeEntry(Base):  # type: ignore[misc]
    """三层知识体系条目本地元数据表。

    Mem0 存储脱敏后的记忆内容（向量搜索用），
    此表存储对应条目的原始明文内容和结构化元数据。

    layer:
        - "case": 第一层案件记忆（case_id 必填）
        - "global": 第二层全局经验
        - "industry": 第三层行业知识库

    source:
        - "ai_auto": AI 自动提取
        - "vera_manual": Vera 手动添加
        - "settlement_summary": 结案总结
        - "withdraw_reflection": 撤案反思
    """

    __tablename__ = "knowledge_entries"

    id = Column(String, primary_key=True)  # Format: ke_{uuid}
    layer = Column(String, nullable=False)  # "case" | "global" | "industry"
    case_id = Column(String, nullable=True, index=True)  # 第一层必填
    content = Column(Text, nullable=False)  # 原始明文内容
    source = Column(String, nullable=False)  # "ai_auto" | "vera_manual" | ...
    vera_confirmed = Column(Boolean, default=False)
    lender = Column(String, nullable=True)  # 关联银行（可选）
    tags = Column(Text, nullable=True)  # JSON array: ["CBA", "估值"]
    entry_type = Column(String, nullable=True)  # "experience" | "policy" | "platform" | "compliance"
    priority = Column(String, default="normal")  # "normal" | "high"
    mem0_id = Column(String, nullable=True)  # Mem0 中对应的 memory ID（可选）
    source_ref = Column(String, nullable=True)  # 来源出处（如 MQG 文档 / ASIC RG 273 / 公开资料）
    last_verified_at = Column(DateTime, nullable=True)  # 最近核实时间（确认时写入）
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Client(Base):  # type: ignore[misc]
    """Client record — one client can have multiple cases."""

    __tablename__ = "clients"

    id = Column("client_id", String, primary_key=True)
    full_name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class FileEvent(Base):  # type: ignore[misc]
    """不可变文件操作审计日志。

    记录两类事件：
    1. Pipeline 处理事件（原有）：file_id + module + details + error
    2. 归档操作事件（需求三）：case_id + source_path + target_path + original_name + operator

    此表只允许 INSERT，不允许 UPDATE 或 DELETE。
    """

    __tablename__ = "file_events"

    id = Column("event_id", String, primary_key=True)
    file_id = Column(String, nullable=True, index=True)  # Pipeline 事件用
    event_type = Column(String, nullable=False)
    module = Column(String, nullable=True)  # Pipeline 事件用
    details = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    timestamp = Column(String, nullable=False)  # ISO-8601 string
    # ── 需求三：归档操作字段 ──
    case_id = Column(String, nullable=True, index=True)
    source_path = Column(String, nullable=True)
    target_path = Column(String, nullable=True)
    original_name = Column(String, nullable=True)
    operator = Column(String, nullable=True)  # vera / judy / system


class InboxMessage(Base):  # type: ignore[misc]
    """全局收件箱消息记录。

    邮件元数据由 Outlook VBA 宏导出为 .email_meta.json，
    watcher 发现后解析并存入此表。

    status:
        - "pending": 待分拣
        - "assigned": 已关联案件（给自己）
        - "assigned_colleague": 已委派（给同事）
        - "archived": 已归档
        - "ignored": 已忽略

    level（邮件优先级）:
        - "urgent": 紧急（规则引擎检测到关键词）
        - "business": 普通业务
        - "low_priority": 低优先级
        - "muted": 已静音
    """

    __tablename__ = "inbox_messages"

    id = Column(String, primary_key=True)  # Format: INBOX-{UUID8}
    subject = Column(String, nullable=False)
    sender_email = Column(String, nullable=False)
    sender_name = Column(String, nullable=True)
    received_at = Column(DateTime, nullable=False)
    body_preview = Column(Text, nullable=True)  # 正文前500字
    has_attachments = Column(Boolean, default=False)
    attachment_count = Column(Integer, default=0)
    attachment_names = Column(Text, nullable=True)  # JSON array of filenames
    matched_case_id = Column(String, nullable=True, index=True)
    match_method = Column(String, nullable=True)  # email/subject/manual/none
    match_confidence = Column(Float, nullable=True)
    status = Column(String, default="pending")  # pending/assigned/assigned_colleague/archived/ignored
    assigned_by = Column(String, nullable=True)  # vera/ai
    source_path = Column(String, nullable=True)  # .email_meta.json 来源路径
    message_id = Column(String, nullable=True, unique=True, index=True)  # Outlook EntryID 去重
    # 需求二：匹配场景详情
    match_scenario = Column(String, nullable=True)  # A/B/C/D/E/F 场景标识
    ai_extracted = Column(Text, nullable=True)      # 第四招 AI 提取的 JSON
    created_at = Column(DateTime, default=datetime.utcnow)

    # ── 需求一补齐：优先级分类与分拨字段 ──
    level = Column(String, default="business")  # urgent / business / low_priority / muted
    ai_category = Column(String, nullable=True)  # bank_os / client_doc / marketing / ...
    ai_summary = Column(String, nullable=True)  # 低优先级邮件的一句话 AI 摘要
    account = Column(String, nullable=True)  # 来源账户邮箱（区分两个 Outlook 账户）
    assigned_to = Column(String, nullable=True)  # 委派给谁 (Judy/Brandon/其他)
    vera_note = Column(Text, nullable=True)  # Vera 的批注（委派时使用）
    urgent_pattern = Column(String, nullable=True)  # 命中的紧急规则模式（追溯用）
    promoted_at = Column(DateTime, nullable=True)   # 被翻盘（提升优先级）的时间，供撤回翻盘判断

    # ── Phase 2A：统一信息提取字段 ──
    action_type = Column(String, nullable=True)  # 动作类型枚举
    stage_signal = Column(String, nullable=True)  # 阶段信号标识
    deadline = Column(DateTime, nullable=True)  # AI 识别的截止日期
    conditions_json = Column(Text, nullable=True)  # JSON array
    urgency_score = Column(Integer, nullable=True)  # 1-10 紧急度
    detected_client_name = Column(String, nullable=True)  # AI 识别客户名
    lender_name = Column(String, nullable=True)  # 银行/贷款机构
    application_ref = Column(String, nullable=True)  # 申请编号
    suggested_level = Column(String, nullable=True)  # AI 建议优先级



class InboxSenderScore(Base):  # type: ignore[misc]
    """发件人积分学习表。

    Vera 的日常操作自动更新积分：
    - 低优先级→标记为业务: +2
    - 低优先级→给自己: +2
    - 待处理→给自己: +1
    - 待处理→忽略: -1
    - 静音该类别: -2
    - 静音该发件人: -3

    积分使用规则：
    - net_score >= 3: 跳过 AI，直接标为"业务"
    - net_score <= -4: 跳过 AI，直接标为"低优先级"
    - 其他: 需要 AI 判断
    """

    __tablename__ = "inbox_sender_scores"

    sender_email = Column(String, primary_key=True)
    business_count = Column(Integer, default=0)  # 被标为业务的累计次数
    ignore_count = Column(Integer, default=0)  # 被忽略/静音的累计次数
    net_score = Column(Integer, default=0)  # = business_count - ignore_count
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class InboxFilter(Base):  # type: ignore[misc]
    """收件箱静音规则表。

    filter_type:
        - "sender": 发件人邮箱匹配（包含即命中）
        - "subject_pattern": 主题模式匹配（fnmatch 通配符）
        - "ai_category": AI 分类标签精确匹配

    created_by:
        - "vera_manual": Vera 手动创建
        - "system_suggest": 系统建议（Vera 确认后生效）
    """

    __tablename__ = "inbox_filters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    filter_type = Column(String, nullable=False)  # sender / subject_pattern / ai_category
    filter_value = Column(String, nullable=False)  # 匹配值
    action = Column(String, default="mute")  # 目前只有 mute，以后可扩展
    created_by = Column(String, default="vera_manual")  # vera_manual / system_suggest
    created_at = Column(DateTime, default=datetime.utcnow)


class SystemEvent(Base):  # type: ignore[misc]
    """系统事件表 — 后端各模块写入，前端通知中心轮询读取。

    事件类型:
        - new_email: 新邮件到达
        - file_classified: 文件分类完成
        - os_received: 银行 OS 补件到达
        - action_created: 新 Action 生成
        - deadline_alert: 截止日期预警
    """

    __tablename__ = "system_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_type = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    level = Column(String, default="info")  # urgent / success / info
    case_id = Column(String, nullable=True, index=True)
    link = Column(String, nullable=True)
    read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class CaseTimelineEvent(Base):  # type: ignore[misc]
    """Structured timeline events for loan case lifecycle tracking.

    Event types:
    - email_received: 邮件分配到案件
    - stage_advanced: 阶段推进确认
    - document_received: 检测到客户发来附件
    - action_completed: Vera 完成待办
    - deadline_set: AI 识别到截止日
    - note_added: 手动备注
    """

    __tablename__ = "case_timeline_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String, nullable=False, index=True)
    event_type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)  # 扩展数据 JSON
    source_ref = Column(String, nullable=True)  # 触发源 ID
    created_at = Column(DateTime, default=datetime.utcnow)


class EmailDraft(Base):  # type: ignore[misc]
    """邮件草稿记录 — AI 只出草稿，Vera 确认后才标记"已发送"。

    状态机:
        draft → approved (Vera 手动确认)
        draft → discarded (Vera 放弃)
        approved → sent (标记为已发送，系统不自动发邮件 — Red Line #3)

    draft_type:
        - reply: 回复邮件
        - broker_notes: Broker Notes（银行递交格式，强制英文）
        - follow_up: 催件/跟进银行
        - progress_update: 进度通知客户
        - settlement: 结算通知
    """

    __tablename__ = "email_drafts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String, nullable=False, index=True)
    draft_type = Column(String, nullable=False)  # reply / broker_notes / follow_up / progress_update / settlement
    subject = Column(String, nullable=True)
    to_email = Column(String, nullable=True)
    body = Column(Text, nullable=False)
    language = Column(String, default="en")  # en / zh
    source_action_id = Column(Integer, nullable=True)  # 关联 Advisor Action
    source_msg_id = Column(String, nullable=True)  # 关联触发邮件
    status = Column(String, default="draft")  # draft / approved / sent / discarded
    approved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class EmailDraftReply(Base):  # type: ignore[misc]
    """客户回复与邮件草稿的自动关联（按 Re: 主题匹配）。

    系统不读取客户回复内容，只做"这条邮件是对哪个草稿的回复"的挂接，
    供 Vera 在草稿箱看到 💬已回复 标记并追溯往返。
    """

    __tablename__ = "email_draft_replies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    draft_id = Column(Integer, nullable=False, index=True)
    inbox_message_id = Column(String, nullable=True, index=True)
    subject = Column(String, nullable=True)      # 客户回复的主题（快照）
    sender = Column(String, nullable=True)       # 客户发件人（快照）
    received_at = Column(DateTime, nullable=True)  # 客户回复时间
    matched_at = Column(DateTime, default=datetime.utcnow)


class CaseContextEvent(Base):  # type: ignore[misc]
    """案件上下文事件 — 每次上下文增量追加的不可变记录。

    source_type 枚举:
        - file_deep_scan: OCR 深度扫描后的结构化数据汇总
        - email_classified: 邮件分类后提取的关键信息
        - manual_note: Vera 手动补充的上下文
        - checklist_updated: 清单状态变更
        - stage_advanced: 阶段推进
        - strategy_generated: 策略报告生成
    """

    __tablename__ = "case_context_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String, nullable=False, index=True)
    source_type = Column(String, nullable=False)  # 上面枚举值之一
    content = Column(Text, nullable=False)  # 本次追加的内容片段
    track = Column(String, nullable=False, default="internal")  # internal | external
    source_ref = Column(String, nullable=True)  # 去重键（S2/S3 用：message-id/主题+日期哈希）
    status = Column(String(20), nullable=False, default="confirmed", server_default="confirmed")  # pending | confirmed | superseded
    superseded_by = Column(Integer, nullable=True)   # 撤销/纠正时指向替代事件 id（审计链）
    supersede_reason = Column(Text, nullable=True)   # 撤销原因（审计）
    created_at = Column(DateTime, default=datetime.utcnow)
    occurred_at = Column(DateTime, nullable=True)  # 事件真实发生时间（邮件发送时间等外部时间源）


class BrainFact(Base):  # type: ignore[misc]
    """结构化事实（从 confirmed 事件派生，可查询 KV；#5/#7）。

    派生规则：
    - 只从 status='confirmed' 的 CaseContextEvent 提取；
    - 同 (case_id, key, track, event_id) 幂等不重复写；
    - 同 (case_id, key, track) 新值替换旧值 → 旧行 superseded_by=新 id + conflict=True；
    - 来源事件被撤销（superseded）→ 其派生事实 valid_to=now（不再参与全景，不物理删除）。
    """

    __tablename__ = "brain_facts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String, nullable=False, index=True)
    key = Column(String, nullable=False)        # category.key，词表内
    value = Column(Text, nullable=False)
    category = Column(String, nullable=False)
    track = Column(String, nullable=False, default="internal")  # internal | external
    locked_by_user = Column(Boolean, default=False)   # 人工锁定：AI 蒸馏不得覆盖（WO-42）
    disclosure = Column(String, nullable=True)        # null 未标记 / 'disclosed' / 'internal_only'（WO-42）
    event_id = Column(Integer, nullable=False)  # 来源事件 id（confirmed）
    superseded_by = Column(Integer, nullable=True)
    conflict = Column(Boolean, default=False)
    valid_from = Column(DateTime, default=datetime.utcnow)
    valid_to = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class CaseChatMessage(Base):  # type: ignore[misc]
    """AI conversation message persistence per case."""

    __tablename__ = "case_chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String, nullable=False, index=True)
    session_id = Column(String, nullable=False, index=True)
    role = Column(String, nullable=False)  # user / assistant / system
    content = Column(Text, nullable=False)
    tool_results = Column(Text, nullable=True)  # JSON string of tool execution results
    parent_message_id = Column(Integer, nullable=True, index=True)  # WO-27 版本链
    branch_label = Column(String, nullable=True, index=True)        # WO-27 分支（A/B）
    created_at = Column(DateTime, default=datetime.utcnow)


class PendingAction(Base):  # type: ignore[misc]
    """AI 发起的待确认操作 -- Vera 拍板后才真正执行。

    status 状态机:
        pending -> confirmed (Vera 点确认)
        pending -> rejected (Vera 点取消)
        pending -> expired (超过 24 小时未处理)
    """

    __tablename__ = "pending_actions"

    id = Column(String, primary_key=True)  # Format: PA-{UUID8}
    case_id = Column(String, nullable=True, index=True)  # None = 全局操作
    tool_name = Column(String, nullable=False)  # rename_file / move_file / advance_stage / batch_mark_checklist
    params = Column(Text, nullable=False)  # JSON 序列化的工具参数
    ai_explanation = Column(Text, nullable=False)  # AI 给出的操作理由（展示给 Vera）
    status = Column(String, default="pending")  # pending / confirmed / rejected / expired
    scope = Column(String, default="case")  # "case" | "global"
    result = Column(Text, nullable=True)  # 执行结果 JSON（确认后填入）
    chat_session_id = Column(String, nullable=True)  # 关联的聊天会话 ID
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)


class GlobalChatMessage(Base):  # type: ignore[misc]
    """全局 Agent 对话消息持久化。"""

    __tablename__ = "global_chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, nullable=False, index=True)
    role = Column(String, nullable=False)  # user / assistant
    content = Column(Text, nullable=False)
    tool_results = Column(Text, nullable=True)  # JSON string
    created_at = Column(DateTime, default=datetime.utcnow)


class ImportJob(Base):  # type: ignore[misc]
    """历史案件导入任务（两段式导入的第二段：AI 深度扫描）。

    状态机：pending → running → done / failed（failed 可重试回 pending）。
    """

    __tablename__ = "import_jobs"

    job_id = Column(String, primary_key=True)
    case_id = Column(String, nullable=False, index=True)
    status = Column(String, nullable=False, default="pending")  # pending/running/done/failed
    file_total = Column(Integer, default=0)
    file_processed = Column(Integer, default=0)
    error = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class ImportRecord(Base):  # type: ignore[misc]
    """导入历史记录（VBA / libratom / 手动 / onboarding）。"""

    __tablename__ = "import_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    source = Column(String, nullable=False, default="manual")  # vba | libratom | manual | onboarding
    status = Column(String, nullable=False, default="running")  # running | done | failed
    file_count = Column(Integer, default=0)
    message_count = Column(Integer, default=0)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    note = Column(Text, nullable=True)


class AiUsageLog(Base):  # type: ignore[misc]
    """AI 调用用量日志（#8 测量工具：token/费用/延迟/缓存命中率）。"""

    __tablename__ = "ai_usage_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String, nullable=True, index=True)   # 全局对话为 NULL
    scope = Column(String, nullable=False, default="case")  # case | global
    track = Column(String, nullable=False, default="internal")  # internal | external
    provider = Column(String, nullable=False)               # deepseek | gemini | ...
    model = Column(String, nullable=True)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    prompt_cache_hit_tokens = Column(Integer, default=0)    # DeepSeek usage.prompt_cache_hit_tokens
    prompt_cache_miss_tokens = Column(Integer, default=0)
    cost_usd = Column(Float, default=0.0)
    latency_ms = Column(Integer, default=0)
    layer_names = Column(Text, nullable=True)               # JSON 数组，如 ["role","case_brain","team","live","dialogue"]
    created_at = Column(DateTime, default=datetime.utcnow)


class AgentState(Base):  # type: ignore[misc]
    """Agent / Tool 运行时状态表（WO-25）。"""

    __tablename__ = "agent_states"

    agent_key = Column(String, primary_key=True)
    enabled = Column(Boolean, nullable=False, default=True)
    config = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BankPlatformState(Base):  # type: ignore[misc]
    """银行×平台运行时覆盖表（WO-25）。"""

    __tablename__ = "bank_platform_states"

    bank_key = Column(String, primary_key=True)
    platforms = Column(Text, nullable=False)  # JSON 数组字符串，如 '["mqg"]'
    vera_confirmed = Column(Boolean, nullable=False, default=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SkillVersion(Base):  # type: ignore[misc]
    """技能包版本持久化表（WO-28）。"""

    __tablename__ = "skill_versions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String, nullable=False, index=True)
    version = Column(String, nullable=False)
    manifest_json = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="draft")  # draft / active / deprecated
    created_by = Column(String, nullable=False)
    reason = Column(Text, nullable=True)
    superseded_by = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ChecklistLibraryCustom(Base):  # type: ignore[misc]
    """自定义清单总项库（WO-43）：Vera 新增项沉淀，参与后续预选。

    经验埋点：use_count 随案件采用递增（V1 只埋点不统计）。
    """

    __tablename__ = "checklist_library_custom"

    id = Column(String, primary_key=True)          # 格式 custom_{uuid8}
    name_zh = Column(String, nullable=False)
    name_en = Column(String, nullable=True)
    category = Column(String, nullable=False)      # 枚举同 checklist_master
    applicable_when = Column(JSON, nullable=True)  # 可选不强制；null = 全适用
    bank_specific = Column(String, nullable=True)  # 可选不强制；null = 所有银行
    source_case_id = Column(String, nullable=True)
    use_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

class CaseFactFind(Base):  # type: ignore[misc]
    """结构化客户信息采集（Fact Find 双轨，WO-77）。"""

    __tablename__ = "case_fact_find"

    id = Column(String, primary_key=True)  # Format: ff_{uuid8}
    case_id = Column(String, nullable=False, index=True)
    section = Column(String, nullable=False)  # employment_history / living_history / solicitor_info / vehicle_asset / super_balance
    data = Column(JSON, nullable=False, default=dict)
    status = Column(String, nullable=False, default="pending")  # pending / confirmed
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
