# Vera Workbench — 待办与决策清单（Backlog）

> 用途：汇总历次讨论中明确"以后做 / 待办 / 技术债 / 需授权"的事项，防止上下文丢失。
> 维护：每次会议后更新；状态图例：✅ 完成 ｜ ⏳ 进行中 ｜ ❌ 待办 ｜ 🐍 依赖后端
> 最后更新：2026-08-12（22 项缺口 + 微信通道收口）

## V1 范围重切（2026-08-12 定稿；三稿更新为 AI First 大脑）

> 原则：**不改 Vera 团队工作习惯**；**CASE 大脑 = 对话为主**（她说，它记、它答、它建议、她拍板）；客户信息 100% 靠聊天 + 内置流程主动询问 + 按需文件提取获得；文件/邮件/日历等外部数据源一律做成工具、按需接入（零数据源接入 = 零信任成本）。

### V1 = CASE 大脑（2026-08-12 三稿，22 项缺口 + 微信通道已全部收口）

| 做 | 说明 |
|----|------|
| ✅ 三栏工作台 | 左栏案件列表（含**全局咨询**入口）+ 中栏 BrainChat（对话主入口）+ 右栏客户全景（F-1 批次起） |
| ✅ 统一建案页 | 新客户（必填 7 项）/ 存量壳（三级）/ 历史导入共用：顶部文件导入口 + 字段预填 + 一句话解析；建案成功自动进案件对话 |
| ✅ 确认闸门 | 事件状态机 pending→confirmed→superseded；高置信直接记 + 可撤销，低置信轻确认 |
| ✅ 双线披露 | 递交模式手动切换 + 披露清单（一次确认、永久标记、可撤销）；外线硬阻断未披露 internal |
| ✅ 客户全景 + AI 带上下文 | 记录→蒸馏→全景→AI 注入（五层缓存友好协议） |
| ✅ 统计 | 天/周/月（时区改 Australia/Sydney），激励录入 |
| ✅ 提醒 | 软件内三处（汇总横幅/对话自然提醒/全景待办卡）+ 系统通知（Electron） |
| 🆕 微信 Bot | Vera 私人助手（纯自用）：查信息/草稿/提醒，不进客户会话、不自动发送 |
| ✅ 备份/导出 | 每天自动备份 7 份轮转，路径可配置（NAS，不可达回落本地），换路径自动迁移；一键导出 JSON |
| ⏸️ 延后 | 邮件进度自动化 / 日历读取 / 文件主动扫描 / 历史数据迁移 / 委派闭环 / 团队共享（V2） |

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
| ✅ 上下文注入 | 五层缓存友好排序（角色→案件大脑→经验/政策→实时数据→对话追加区）+ 追加式/折叠式（#8）；DeepSeek 日常 + Gemini 英文（#10） |
| ✅ 存量客户 | 三级建壳（极简/标准/完整），动作驱动补全（越用越完整），按需建壳不批量 |
| ✅ 单用户 | V1 Vera 专属，Vera = 全生命周期统筹者（同事执行的任务由她反馈进度）；团队共享 V2 |
| ✅ 政策库 | lender_policies.yaml 规则引擎（CBA/ANZ/NAB 先行），Codex 起草 → Vera 审校 |
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
- 收口：22 项缺口 + 微信通道（#23）全部定稿（2026-08-12，见 docs/CASE大脑_V1缺口与待讨论清单.md）
- git：D:\vera-workbench 已初始化 + 基线提交 `1e2b10a`（435 文件）✅；前端交付流程 = commit + diff 对比
- 双 data 目录：`core/data/assistant.db` 唯一真源 ✅（测试库已快照归档 `core/data/backups/legacy/`；根库原文件待后端重启后归档）
- 后端：**WO-13 收口施工单 ✅**（统计时区 Australia/Sydney + alembic URL `%(here)s` 加固 + 双库启动自检；env.py 日志器隐患修复；pytest 455/0）
- 后端：**WO-14 确认闸门 ✅**（事件状态机 pending→confirmed→superseded；蒸馏只吃 confirmed；3 端点；pytest 464/0）
- 后端：**WO-15 BrainFact ✅**（fact_schema 42 key + brain_facts 表 + 规则/LLM 提取 + 幂等同步；pytest 479/0）
- 后端：**WO-16 对话协议 ✅**（非流式 + 服务端工具循环 + 结构化卡片 + record_fact/suggest_submission；pytest 487/0）
- 后端：**WO-17 上下文注入 ✅**（五层缓存友好协议 + 对话窗口 + ai_usage_log/缓存命中率 + DeepSeek/Gemini 路由；pytest 497/0）
- 后端：**WO-18 统一建案后端 ✅**（LVR 自动算 + 建档即预选清单 + 存量壳 is_imported + parse-text/parse-file 预填提取；pytest 505/0）
- 后端：**WO-19 政策库规则引擎 ✅**（自雇/签证/LVR 规则 + 建档政策提示事件 + policy-check 端点；pytest 514/0）
- 前端：批 1-12 + 批 A/B/C/C-2/C-3/D-1/D-2/E-1 全部完成 + **F-1~F-6f 全部交付（当前主线 ui/vera-工作台 (33)：三栏/确认闸门/全景/递交横幅/全局统计/指挥中心/视觉打磨/今日工作台首页/主导航上顶栏/快捷发问 chips）**（AI Studio 线维护）
- 联调：后端 + 前端已在本地跑通（8000/3000）；已修复：id/case_id、datetime naive、SSE payload、草稿 404、设置页离线误报、案件下拉遮挡、邮件附件预览、客户全景同源
- 📋 **实施计划（2026-08-13 定稿）**：见 [docs/实施计划_2026-08-13.md](./实施计划_2026-08-13.md)（分前后端盘点 + Phase 0-5 路线，需要时翻看）

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

### WO-19：政策库规则引擎（✅ 已完成 2026-08-13）
- `core/policy/engine.py` 只读 lender_policies.yaml 规则匹配（自雇 ABN 年限/临时签证/LVR cap/替代银行排序，不依赖 LLM）
- `GET /api/cases/{id}/policy-check` + 建档自动触发；LLM 话术润色失败回退模板；全量 pytest **514 passed**

### WO-20：申报一致性检查 Agent（✅ 已完成 2026-08-13，5c58018）
- `core/agents/declaration_check.py` + `evidence.py`：外线画像 vs 指定文件 → 规则比对 + LLM 补强 → 结论分层 + 解释信草稿 + internal 事件
- `POST /api/cases/{id}/declaration-check`；只查指定路径、不递归不主动扫（红线）；证据本地真实值展示
- 16 测试；全量 pytest **529 passed**

### WO-21：计算器 Agent（✅ 已完成 2026-08-13，edf96f1）
- `config/calculator/`：6 家档案（BOC/CBA/Macquarie/MA Money/Latrobe/Resimac）+ stamp_duty/LMI 兜底；构建工具从源 xlsm 机械提取（mtime 幂等）
- `core/calculator/`：确定性引擎（steps 可见）+ parsers + updates（diff/apply/rollback）；`server/api/calculator.py` 5 端点 + 上传闭环（profile_envelope 共用）
- 110+6 测试；全量 pytest **646 passed**；`indicative: false` 语义修正
- 遗留：prudent offset 未建模（补丁候选）；BOC 2 参数取契约表 + HEM 仅 Australia 块（notes 标注）

### WO-22：银行主数据 + 聚合平台（✅ 已完成 2026-08-13，c25acf0 + d69ca5e）
- `config/bank_registry.yaml` 22 家分层 + 5 平台 key；`core/bank_registry.py` 别名解析
- `Case.lender_ref` / `submission_platform_ref` + 幂等回填工具；4 消费点切 key；`GET /api/banks/` + `/api/platforms/`
- 施工单：docs/flash_specs/wo-22-bank-registry.md

### WO-26（✅ 已完成 2026-08-13，492e193）：Agent 编排层 + 流程包框架
- V1 轻量编排（match_flow 规则路由 + run_flow 执行器 + config/agent_flows 3 流程包 + 呈现分类 result_card/dialog）；pytest 783；Pydantic AI 不引

### WO-26b（✅ 已完成 2026-08-13，a2ff911）：Pydantic AI 编排内核
- pydantic-ai 2.29.0 接入替换执行内核（接口契约不变）；模型路由（DeepSeek 默认/Gemini 英文，短超时+健康探测）；参数校验/确认钩子；缓存纪律 + flow 路径 AiUsageLog；全量 804 → 843
- Pydantic AI 接入 + `agents/*.yaml` 流程包（triggers/steps/tools/confirm_required/acceptance）
- 先把申报一致性/建档/计算器包装成流程包；对话路由 → 执行

### WO-26c（✅ 已完成 2026-08-13，05de0a1）：StepContext 显式契约
- runner 解析 $arg/$case_id/$step.output + required 校验 + 多步 output 累积；全量 814

### WO-27（✅ 已完成 2026-08-13，fc9c532）：跟进 / 催件 / OS 回复 三个共创流程
- followup/chaser/os_reply 流程包（dialog）+ draft_email 工具（V1-V3 版本链/branch/confirm→DraftCard）+ CaseChatMessage.parent_message_id/branch_label 迁移 + CardSchema；只出草稿、未确认不蒸馏；全量 825

### WO-28（✅ 已完成 2026-08-13，40af981）：技能包系统
- SkillManifest schema（白名单强制/assets 禁可执行）+ 注册表 CRUD/版本回滚 + AI 提议→Vera 确认人闸；7 端点；全量 843

### 前端 F-15（📋 提示词已出 2026-08-13）：共创 Dialog 卡片 + 技能中心
- flow_followup/chaser/os_reply dialog 卡 + DraftCard 出口；/api/skills 七端点 UI + 人闸/版本回滚

### V2 定稿（2026-08-13，主文档 §十三）：案件文件夹机制 + 文件操作
- 案件文件夹关联（选已有/自动建）+ 三档渐进（新文件自动发现 → 按需自主取 → 主动预判）
- 文件操作：Vera 主动要求才执行（放入/改名/移动），PathGuard 校验，绝不自主
### WO-23：PST 接线 + pyproject 对齐（✅ 已完成 2026-08-13，a30a4ef）
- import_pst.py remember 接线（F821 真缺陷）；pyproject 声明 openpyxl/oletools/python-multipart；uv.lock 重新生成入库
- 施工单：docs/flash_specs/wo-23-pst-pyproject.md
### WO-10：基础设施 + 调度（✅ 精简版 2026-08-13）
- `core/scheduler/`（jobs.py / backup.py）APScheduler 三任务：每日备份（03:00 Sydney，保留 7 天）/ 委派超期提醒（30 分钟，OVERDUE_REMINDER 去重）/ 摘要刷新（每小时，dirty 批量）
- `config/settings.yaml` scheduler 节（enabled/backup_time/keep_days/interval/batch）；server/main.py lifespan 启停
- 测试：tests/test_scheduler.py 7 用例；全量 **734 passed**
- ⏳ 剥离 V2：`core/pipeline/ingest.py` 统一入口、OCR 阈值 100、HEIC、两阶段分类、`expected_fields.yaml` 外置（与"第一版不碰文件解析"对齐）
- 注：金额不脱敏已在 gateway 修复中完成 ✅

### WO-05：Electron 桌面壳（❌，功能稳定后做）
- 窗口/托盘/Python 内嵌/自动更新/端口冲突检测/首次安装引导
- **系统通知（#11 定稿）**：到期/逾期提醒升级为系统通知中心（托盘 + 通知横幅），提醒可在后台运行

### WO-06：云同步（❌，模型稳定后做）
- Supabase 脱敏镜像 + NAS 内网 + leak_guard + checkpoint + DDL

### WO-11：微信通道（❌）
- **范围（#23 定稿）**：Vera 私人助手（纯自用）——查信息（案件进度/全景/统计/待办/政策）+ 草稿回复 + 提醒推送；**不进客户会话、不自动发送**
- 现状核实：server/api/wechat.py 仅 2 个 stub（message/morning-report，NotImplementedError）；core/wechat/ 空——真实新开发
- 技术形态：✅ **个人微信 hook**（2026-08-12 拍板；PoC 观察 1 周，工具准入三关，封号风险提示）
- 复用：同一后端、同一脱敏闸门、同一确认闸门、同一防串案协议

### WO-12：迁移与发布（❌）
- migrate_from_v1 / merge_env / version_bump / GitHub Actions / README / CHANGELOG / 新项目 AGENTS.md
- git：✅ 已初始化 + 基线提交（`1e2b10a`）；后续发布走 version_bump + tag

### 专项修复 / 技术债
- **milestone_processor**：✅ 已迁移（core/case_engine/milestones.py），confirm_stage_advance 闭环，原 skip 已消除
- **onboarding 三处降级**：✅ 已补齐（core/context/accumulator.py + core/ai/knowledge_base.py + core/strategy/strategy.py）
- **alembic 迁移链**：✅ 基线迁移已建（core/migrations/versions/21c956b3c777）；create_all 作为空库/异常兜底保留
- **alembic 双保险清理**：✅ 已收口（create_all 兜底移除，alembic 唯一建表路径；遗留库 stamp head；_sync_missing_columns 保留为兼容层）
- **统计时区（#17）**：✅ WO-13 完成——UTC → Australia/Sydney（ANALYTICS_TZ 可覆盖 + 跨日边界测试）
- **根 alembic.ini / core/alembic.ini（#20）**：✅ WO-13 完成——`%(here)s` 加固，URL 不依赖 CWD，均指向 core 库
- **启动自检（#20）**：✅ WO-13 完成——init_sa_tables 检测双库并存/路径漂移 → 警告；附修复 env.py `disable_existing_loggers` 生产隐患
- **根库归档（#20）**：✅ 已收口（2026-08-13）：唯一真源 core/data/assistant.db；根库不存在无需归档
- **附录 A（#5）**：✅ 已确认（42 key 按草案 v1，2026-08-12 实测修正；配置驱动可迭代）
- **POST /api/tasks/ 是联调临时端点**：正式任务创建应由业务流触发（WO-09 建案→首批任务卡），届时评估保留/移除
- **知识中心/草稿箱/档案/导入后端端点**：GET /api/drafts 列表、已归档案件端点、导入记录表 + 端点、knowledge CRUD 端点
- **版本号三处同步**：pyproject / 前端 package.json / server main.py 的 /version（当前 2.0.0，需保持）
- **遗留 ruff 13 条（HEAD 既有，另行报告）**：backfill_client_id.py（RUF100×3+PERF102）、import_pst.py（UP009/I001/F401/BLE001×3/TRY201/**F821 remember 真缺陷 → WO-23**）、tasks.py（I001）
- **uv.lock 未跟踪**：待 pyproject 对齐后重新生成入库（WO-23）

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
- 2026-08-13：WO-19 政策引擎 / WO-20 申报一致性检查 / WO-21 计算器 Agent 交付（5c58018 + edf96f1）；WO-22 银行主数据+平台、WO-23 PST+依赖 施工单已出；pytest **646 passed**，0 failed / 0 skipped

### WO-29（✅ 已完成 2026-08-13，d715669，Gemini）：案件文件夹关联
- core/case_engine/folder.py（link_existing/auto_create + 越界/冲突/幂等校验）+ POST /api/cases/{id}/folder + CaseFolderRequest/Response；全量 867

### WO-30（✅ 已完成 2026-08-13，f479ddc）：意图路由升级
- core/agents/router.py：规则唯一命中直接走（零 LLM）；撞车（≥2 命中）→ LLM 选流程包 + 规则保底；零命中不调 LLM（成本闸门）；出站脱敏/AiUsageLog(layer=router)；ai.routing.intent_routing_enabled 开关；全量 876
### WO-31/32/33（✅ 全部完成 2026-08-13，f356fc7 / 72f5dc1 / 45e1a42）：案件文件夹三档渐进
- WO-31 新文件自动发现：扫描已关联案件文件夹 → 识别类型 → 高置信自动匹配清单"已收"（可撤销）+ SSE 提醒；开关 case_folder.auto_discover
- WO-32 按需自主取：Vera 指定 → folder_lookup 流程包只读检索/解析案件文件夹内文件
- WO-33 主动预判：清单/文件夹缺口分析 → 建议草稿（Vera 拍板，不自动改状态）；开关 case_folder.auto_gap
- 每档独立开关、默认关闭；执行方待定
### WO-34（✅ 已完成 2026-08-14）：文件夹命名解析端点 GET /api/folders/parse
- parse_folder_naming（broker/client/case-id 三段 + 末段清理兜底）+ GET /api/folders/parse（越界/穿越 422）；Electron/Web 共用预填
- **browse 延后 WO-05**（Electron 原生目录选择器，避免过渡代码重做）；F-16 v3 前端 provider 抽象已入档
- 全量 909