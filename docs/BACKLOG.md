# Vera Workbench — 待办与决策清单（Backlog）

> 用途：汇总历次讨论中明确"以后做 / 待办 / 技术债 / 需授权"的事项，防止上下文丢失。
> 维护：每次会议后更新；状态图例：✅ 完成 ｜ ⏳ 进行中 ｜ ❌ 待办 ｜ 🐍 依赖后端
> 最后更新：2026-08-11

## V1 范围重切（2026-08-12 定稿，产品主线）

> 原则：**不改 Vera 团队工作习惯**；系统做"记忆外部化"，从新 CASE 开始。

### V1 再简化（2026-08-12 二稿）：案件记录本最小版

> **V1 = 案件记录本**：Vera 手动写，系统自动累积成上下文（全景/AI）。自动化全部延后。

| 做 | 说明 |
|----|------|
| ✅ 建案 | NewCaseModal（已有） |
| ✅ 记录本 | 记一笔（内部/递交，已有）+ **记录流视图（补：后端 GET /api/cases/{id}/notes + 前端记录本列表/删除）** |
| ✅ 客户全景 + AI 带上下文 | 已有（记录→蒸馏→全景→AI 注入） |
| ✅ 统计 | 已做（S1.5），激励录入 |
| ⏸️ 延后 | 邮件进度自动化 / 日历读取 / 文件 / 历史导入 / 委派闭环 / 双视角 UI（S4） |

### 自动化路线图（V1 之后逐步上）
| 阶段 | 自动化 |
|------|--------|
| Step 2 | 邮件进度情报（银行阶段邮件自动进上下文，零信任成本） |
| Step 3 | 共享日历 .ics 读取（团队共享，信任成本低；先手动导出后自动） |
| Step 4 | 文件佐证（登记/预览） |
| Step 5 | 委派/微信反馈自动入系统 |

| 决策 | 说明 |
|------|------|
| ✅ 任务来源 | **手动建任务 + Outlook 日历**（认领习惯：邮件→自己认领→贴日历写要点→系统读日历生成任务卡）；不自动归案 |
| ✅ 邮件 | **保留自动获取 = 进度情报**：银行阶段邮件 → 进度信号 + 阶段建议 + 上下文事件（不自动认领，Vera 在建议卡上「我来做」认领）；附件仅登记存在（预览可留，不强依赖） |
| ✅ 清单 | **手动勾选完成**：Vera 点清单项 = 完成；**不关联文件**（reverse_match V1 不启用） |
| ❌ 文件 | **V1 完全不碰**：解析/分类/OCR/字段/清单关联全部延后；代码保留、默认关闭 |
| ❌ 历史 | 历史案件导入（libratom / 旧库迁移）V1 不做 |
| 🆕 内外双线 | 内线=客户真实情况/风险/策略（仅本地）；外线=递交呈现/证据（可出网生成银行文本）；双轨蒸馏 + 全景双视角 + AI 按视角注入；**外线生成禁止引用内线** |
| 🎯 核心价值 | 上下文外部化记忆：记录（日历/手动/邮件进度）→ CaseContextEvent → 蒸馏 → 客户全景 → AI 自动带上下文 |

### V1 冲刺
- S0 内外双线数据模型（**轻量，仅数据层**：Case.internal_notes + CaseContextEvent.track + 双轨蒸馏 + context ?track= + external 无泄漏红线断言；UI 双视角放 S4）
- S1 任务来源（手动建任务 + source_channel 扩展）+「记一笔」记录入口 + **客户匹配确认**（建议+确认，未确认不进蒸馏）+ **事件去重键**（message-id/主题+日期哈希，日历导入跳过已记录进度）
- S1.5 统计分析（**维度：天 / 周 / 月**）：overview / pipeline / lenders / efficiency 4 端点 + 前端统计视图（天周月切换）
- S2 邮件进度情报（inbox 链路改为进度事件/阶段建议/任务建议，不自动认领）
- S3 Outlook 日历导入 → **降级为可选增强（V1 不依赖）**：先 V1 试跑看 Vera 是否主动要求；若需要，用 **.ics 手动导出**（信任成本最低，不碰宏/COM/不自动读 Outlook），宏/COM 全自动留 V2
- S4 全景双视角 + AI 双轨注入（生成银行文档只读外线）
- S5 建案打磨 + Vera 真机试用（新 CASE 跑 1 周，按验收指标评估）

### V1 决策备忘（盲点定案 2026-08-12）
- **事件去重**：同一邮件走邮件通道+日历粘贴会记两次 → 分工（邮件只记银行进度类；日历/手动记认领与笔记）+ 去重键
- **客户匹配确认**：日历/邮件→案件匹配必须"建议+确认"，未确认不进蒸馏（防串案）
- **上下文治理**：只有部分 source_type 进蒸馏（银行进度/手动笔记/决定），系统日志类不进；蒸馏节流（dirty + 打开时刷新）
- **旧案件轻量建档**：存量客户可建壳（客户名/银行/金额/一句话），不迁移历史，从今天积累
- **日历导入先手动按钮**：不自动监听（降低单点依赖风险）；手动建任务永远可用兜底
- **AI 明说不知道**：上下文是尽力而为，答不上来说"这条我不知道"，绝不编造
- **统计维度 天/周/月**（S1.5）：overview/efficiency 给"当前 vs 上期"对比，pipeline/lenders 给趋势序列；不做报表导出/复杂钻取
- **V1 验收指标**：① 一周内日均新增记录 ≥5 条 ② 问 AI 上下文命中（她认可"知道这个客户"）③ 试用 1 周后愿继续用
- **V1 验收指标补充**：④ Vera 每周主动打开统计 ≥2 次（她在看结果 = 录入有动力）

---

## 0. 当前状态速览

- 后端：WO-01/02（core）✅ → WO-03（API）✅ → WO-07（测试）✅ → WO-08（任务引擎）✅ → 收尾四项 ✅
- 后端：统一案件上下文端点 `GET /api/cases/{id}/context` ✅（AI 注入与客户全景同源）
- 后端：WO-09（清单全集 64 项 + 预选/反向匹配 + 一句话摘要）✅（pytest 378/1）
- 后端：milestone_processor 迁移 ✅（confirm_stage_advance 闭环，pytest 391/0）
- 后端：onboarding 三处降级补齐 + alembic 基线迁移 ✅（pytest 410/0/0）
- 后端：alembic 单一路径收口（create_all 兜底移除，遗留库 stamp+upgrade）✅（pytest 413/0）
- 后端：S0 内外双线数据模型 ✅（internal_notes/submission_summary/track + 双轨蒸馏 + ?track= + external 无泄漏红线，pytest 432/0）
- 后端：S1 手动任务 + 「记一笔」端点 + match_status/source_ref 预埋 ✅（pytest 442/0，实测记一笔→内线蒸馏闭环）
- 后端：S1.5 统计分析（天/周/月，overview/pipeline/lenders/efficiency）✅（pytest 450/0）
- 前端：批 1-12 + 批 A/B/C/C-2/C-3/D-1/D-2/E-1 全部完成（AI Studio 线维护）
- 联调：后端 + 前端已在本地跑通（8000/3000）；已修复：id/case_id、datetime naive、SSE payload、草稿 404、设置页离线误报、案件下拉遮挡、邮件附件预览、客户全景同源

---

## 1. 前端待办（AI Studio 提示词批次）

### 批 C / C-2 / C-3：客户全景 + 案件看板升级（✅ 已完成）
- 设计意图：客户总体情况、**实时更新**、随时可作为 AI 上下文、记录"做的决定/进行的操作"
- 内容：案件事实卡（金额/LVR/阶段/清单）+ 最近时间线（决定与操作，来自 /api/cases/{id}/timeline）+ 风险提示 + "可作为 AI 上下文"说明 + 刷新按钮
- 改名："大脑" → "客户全景"（CaseDetail 导航 + BrainPanel 标题；文件可保留 BrainPanel.tsx 名称）
- 看板：卡片 倒计时/OS 角标/关联标记 + 紧急置顶 + 点击直达客户全景

### 批 D-1 / D-2：四个空壳页实化（✅ 已完成，🐍 后端端点已就绪）
| 页面 | 需要后端端点 | 现状 |
|------|-------------|------|
| 草稿箱 DraftsBox | GET /api/drafts（列表，目前只有按 action 的单条） | 30 行占位 |
| 档案库 Archive | 已归档案件列表（终态 stage 或 status=archived） | 30 行占位 |
| 导入历史 ImportHistory | 导入记录表 + 端点（VBA/libratom/手动） | 30 行占位 |
| 数据迁移 Migration | WO-12 迁移工具入口 | 30 行占位 |

### E-1：客户全景改接统一 context 端点（✅ 已完成）
- 全景页一次拉取 `/api/cases/{id}/context`，与 AI 对话注入同源，不再各拉各的

### 其余前端 backlog
- 文件预览真实化：FilePreviewPanel 现在是占位，接 `GET /api/files/{id}/preview`（🐍）
- 邮件/文件详情 AI 分析字段真实化：现在 mock（置信度/分类/OCR 字段），接后端 inbox 分析 + 文件字段结果（🐍）
- 新建案件"AI 解析预填"真实化：现在前端 mock 预填，真实解析由后端 createCase(raw_text) 返回（🐍）
- 知识中心 CRUD 真实化：案件记忆列表 / 经验增删改 / 银行政策库数据（config/lender_policies.yaml 种子）（🐍）
- 设置页 VBA 安装引导 + API Key 配置（老项目 Settings 有，低频）
- 键盘快捷键（Ctrl+N 新建、Ctrl+/ AI，设计 §13.4 Phase C）
- i18n 多语言预留（设计 §13.4 Phase C，延后）
- 深度工作模式通用版：OS 三栏已做，其他任务类型"展开完整工作台"入口（可延后）
- a11y 完整化（aria 已部分，可再补）

---

## 2. 后端待办（按 WO 编号 + 专项）

### WO-09：清单驱动 + 一句话摘要（✅ 已完成）
- `config/checklist_master.yaml`（50-80 项全集）+ AI 预选 + 文件反向匹配 + `case_brain_summary` 一句话摘要（dirty 5 写路径）
- 前端 checklist 抽屉/面板已就绪（批 5），等后端 master 数据
- 遗留 TODO：① 摘要接入 Mem0 软记忆（refresh_case_summary 目前只喂硬数据）② CaseChecklist 无 master id 列（reverse_match 需调用方传 id；后续加列或经 ai_suggestion 携带）③ generator 预选可升级 use_ai=True（现为规则预选避免双 LLM）

### WO-10：基础设施 + 调度（❌）
- APScheduler 定时任务（SQLite 每日备份保留 7 天、委派超期检查、摘要刷新）
- `core/scheduler/`（jobs.py / backup.py）、`core/pipeline/ingest.py` 统一入口
- OCR 阈值 50→100、HEIC 支持、两阶段分类、`expected_fields.yaml` 外置
- 注：金额不脱敏已在 gateway 修复中完成 ✅

### WO-05：Electron 桌面壳（❌，功能稳定后做）
- 窗口/托盘/Python 内嵌/自动更新/端口冲突检测/首次安装引导

### WO-06：云同步（❌，模型稳定后做）
- Supabase 脱敏镜像 + NAS 内网 + leak_guard + checkpoint + DDL

### WO-11：微信通道（❌）
- iLink Bot 复制 + 案件查询 + 早报 + 紧急推送 + 草稿版本管理

### WO-12：迁移与发布（❌）
- migrate_from_v1 / merge_env / version_bump / GitHub Actions / README / CHANGELOG / 新项目 AGENTS.md
- vera-workbench 目前**没有 git 仓库**，需要初始化

### 专项修复 / 技术债
- **milestone_processor**：✅ 已迁移（core/case_engine/milestones.py），confirm_stage_advance 闭环，原 skip 已消除
- **onboarding 三处降级**：✅ 已补齐（core/context/accumulator.py + core/ai/knowledge_base.py + core/strategy/strategy.py）
- **alembic 迁移链**：✅ 基线迁移已建（core/migrations/versions/21c956b3c777）；create_all 作为空库/异常兜底保留
- **alembic 双保险清理**：✅ 已收口（create_all 兜底移除，alembic 唯一建表路径；遗留库 stamp head；_sync_missing_columns 保留为兼容层）
- **POST /api/tasks/ 是联调临时端点**：正式任务创建应由业务流触发（WO-09 建案→首批任务卡），届时评估保留/移除
- **知识中心/草稿箱/档案/导入后端端点**：GET /api/drafts 列表、已归档案件端点、导入记录表 + 端点、knowledge CRUD 端点
- **版本号三处同步**：pyproject / 前端 package.json / server main.py 的 /version（当前 2.0.0，需保持）

---

## 3. 联调与发布

- 联调状态：后端 8000 + 前端 3000 本地已跑通；剩余按场景走（建案/任务/SSE/草稿/通知）
- 联调临时手段：POST /api/tasks/ 造任务触发 SSE（测试用）
- 发布前：Electron（WO-05）→ 迁移（WO-12）→ 云同步（WO-06）

---

## 4. 治理规范（流程约定）

- **前端代码以 Google AI Studio 为准**：Codex 不再直接改前端，只出提示词（批 A/B/C/D…）
- **opencode 执行后端施工单**：发现 core bug 先报告、不擅改；前端目录只读
- 施工单纪律：契约先行、单元闭环、强制测试、失败标准
- 红线：不写客户文件夹、PII 不外传、不自动发邮件/递交、pii_map 不出内网、金额/银行名不脱敏
- data/、.env 不提交 git；路径用 pathlib

---

## 5. 本地 (17) 已直接修改、需批 A 在 AI Studio 源同步的清单

| 文件 | 改动 | 状态 |
|------|------|------|
| src/pages/Settings.tsx | 健康检查改 getVersion()（离线误报） | 批 A 已含 |
| src/stores/draftStore.ts | fetchDraft 404 按空态 | 批 A 已含 |
| src/components/panel/ContextBar.tsx | 案件操作下拉 Portal（遮挡） | 批 A 已含 |
| src/components/panel/details/EmailDispatchDetail.tsx | 附件点击 → FilePreviewPanel | 批 A 已含 |
| src/components/panel/details/GeneralEmailDetail.tsx | 同上 | 批 A 已含 |
| .env.local | VITE_API_URL / VITE_USE_MOCK=false（本地运行配置，不进 AI Studio） | 本地保留 |

---

## 6. 已完成里程碑（备忘）

- 后端：WO-01/02/03/07/08 + 收尾（SSE 事件名、5 测试、CreateCaseRequest 9 字段、/api/commission）
- 前端：批 1-12（主题/布局/任务队列/详情/抽屉/草稿/聊天/通知/OS 三栏/看板拖拽/新建案件全字段）+ 修复（SSE、datetime、id/case_id、草稿 404、设置离线、下拉遮挡、附件预览）
- 测试：pytest 336 passed, 1 skipped（skip = milestone_processor 待办）
