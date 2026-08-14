# CASE大脑 客户上下文维护与任务视图 — 需求定稿

> 状态：方案定稿；**WO-41 / WO-43 / WO-42 已完成并提交**（2026-08-14，39347e3 / 6bd2538 / 14110e2），
> F-29 已交付 (52)、**F-30 提示词已出待前端**；F-31 待 F-29/F-30 落地后执行。
> 日期：2026-08-14
> 本文只记录已拍板的决定与施工单顺序，不包含可执行施工单细节。

---

## 一、背景与目标

AI First 定位下，界面职责需要重排，解决三个问题：

1. **上下文可信度**：AI 对话依赖注入的 CaseContext，事实错了 AI 越聪明错得越离谱，需要一个"改"的地方（右栏只读，无处维护）。
2. **按客户看任务**：待办工作台是所有客户混在一起的汇总，无法一眼看到"这个客户到底有多少事、谁在做、什么时候截止"。
3. **避免重复**：右栏指挥中心 / 中栏 / 客户全景页内容重叠，需要划清"看 / 管 / 维护"边界。

---

## 二、界面职责边界（定稿）

| 界面 | 职责 | 放什么 | 不放什么 |
|------|------|--------|----------|
| 右栏 案件指挥中心（CasePanorama） | **看**态势 | 关键截止 + 下一步待办 Top5 + 风险 + 时间线/事实（折叠） | 任何任务操作按钮 |
| 中栏 BrainChat + 悬浮"客户任务" | **对话 + 管**单客户任务 | 聊天 + 按需弹出的单客户任务操作台（全量/分类/操作） | 常驻面板、重复全景 |
| 待办工作台（TaskWorkbench） | **管**跨客户任务 | 全量任务汇总与分类（保留现有） | — |
| 客户全景页（CaseDetail 客户全景 tab） | **维护**上下文 + **看**证据 | AI 注入上下文完整摊开 + 维护操作 + 时间线证据链 | 任务汇总 |
| 清单 tab | 材料清单 | 保留现有 | — |

一句话：**右栏看态势，中栏对话+管任务，工作台管全部，全景页管"AI 知道什么"。**

---

## 三、分项决定

### 3.1 右栏重组（增量，不是重做）

右栏在 F-3b 后已是"摘要 → 下一步待办 → 风险 → 时间线 → 事实"骨架，本次只做三处增量：

1. **顶部"关键截止"块**：1–3 条（Finance Clause / 任务截止等），红黄绿紧迫度。
2. **"下一步待办"≤5 条**：按紧迫度排序（逾期 > 今天到期 > 7 天内 > 其他），红黄绿 + 分类徽标（👑老板 / 📧邮件 / 📁文件 / 🏦OS）。
3. **下部折叠**：风险/政策/时间线/事实收成折叠（默认风险展开，时间线/事实收起）。

**硬规则：右栏永不出现任务操作按钮，只读 + 点击跳转。**

### 3.2 中栏悬浮"客户任务"

- 仅选中案件时显示入口（悬浮按钮），点击弹出，**默认不常驻**。
- 内容：该客户全量任务台账 + 分类 tab（全部 / 进行中 / 待老板 / 已委派 / 已完成）。
- 就地操作：标记完成、委派（deadline + message）、改截止、新建任务、进入任务详情。
- 形态：紧凑列表（非卡片），红黄绿紧迫度 + 分类徽标；数据同源，一边改一边即时刷新。
- 解决的问题：待办工作台无按客户筛选（现仅 email/file/os/brandon/overdue 分类），"看单个客户任务"无出口。

### 3.3 客户全景页重构（上下文维护中心 + 时间线）

上半区 **客户上下文**：把 AI 对话实际注入的 CaseContext 完整摊开——身份/交易结构/清单进度/OS/风险/记忆摘要/内外线笔记，每项可维护：

- 修正事实（新值替换旧值，旧值走 supersede 审计链）；
- 撤销过时记录（supersede + 原因）；
- 手动补充（结构化事实 或 笔记）；
- 锁定/解锁（见 3.4）；
- 披露标记（标记"这条不能给银行看"）。

下半区（或独立 tab）**时间线**：事件流倒序，每条可追溯来源（哪封邮件/哪次对话/哪条记录）——时间线是上下文的证据链。

现有 BrainPanel 的"打包为 AI 上下文 + 复制"升级为上下文面板的"预览 / 导出"。

**客户全景页不放任务汇总。**

### 3.4 人工锁定（已拍板）

- 人工确认 / 修正过的事实打"人工锁定"标记；
- **AI 只能新增，不能覆盖锁定项**；要改必须先解锁；
- 与 WO-14 确认闸门同一套逻辑，不发明新机制。

### 3.5 内外线呈现（已拍板，红线）

- 维护页清楚标注 internal / external 两条轨（内线黄底 / 递交蓝底）；
- "记入递交"外线操作不能带出内线内容；外线视图不出内线事实——沿用既有红线，维护页只是多一个入口，不破例。

### 3.6 待办处理（已拍板）

- 客户全景页**不放**任务汇总（"汇总意义不大"）；
- 任务管理职责归中栏悬浮（单客户）+ 待办工作台（跨客户）；
- 右栏 Top5"下一步"保留作态势感知。

---

## 四、后端现状核查（施工单契约锚点）

| 能力 | 现状 | 缺口 |
|------|------|------|
| 任务创建 | `create_task()` 仅 case_id/task_type/source_channel/title/context；priority 从 context 读默认 low | **无 deadline / priority / assignee 参数**；Action 表已有 priority/assignee/scheduled_at/delegated_to 字段可用 |
| 聊天工具 | `escalate_to_boss` 已就绪（core/chat/tools.py），可仿照扩展 | 无 create_task 工具 |
| 事实层 | BrainFact 有 superseded_by/conflict/valid_from/valid_to；facts/sync 从 confirmed 事件派生 | **无人工锁定字段、无人工修正端点、无逐条披露标记** |
| 事件层 | ContextEvent confirm/supersede 已就绪（WO-14） | — |
| 案件上下文 | GET /api/cases/{id}/context 已就绪 | — |

---

## 五、施工单顺序规划（历史版本，已被 §十一 取代，勿再引用）

> ⚠️ 本节为 2026-08-14 上午的初版规划（4 单），当日下午已扩展为 6 单（新增 WO-43 清单 Agent + F-31 待办工作台退役），
> 以 §十一 更新版为准。保留仅作演进记录。

---

## 六、留待 V2 / 后续（不进入本次施工单）

- summary / memory 的人工覆盖（AI 蒸馏 vs 人工版本的冲突管理，需单独设计版本/来源标记）；
- 邮件、文件、日历批量建任务（第一批只做聊天建任务）；
- 委派闭环（委派反馈自动入系统，BACKLOG 已列为 V2）；
- 客户上下文的历史版本对比（可复用 WO-38 时间点回溯）。

---

## 七、待 Vera 确认项（历史版本，已被 §十二 取代，勿再引用）

> ⚠️ 本节 3 项已被 §十二 扩展为 7 项，Vera 已确认核心方向（"好的，都理顺了，开干"）。

---

## 八、同类产品借鉴（2026-08-14 补充）

> 说明：此前调研记录均为技术底座类（DeepSeek Harness / Semantica / Pi / PrimeAgent / 记忆框架），
> **缺少"客户/任务管理类产品"的对照**。本节基于既有产品认知补充（未做实时网络调研），
> 价值点已按本项目红线与定位过滤。

| 产品 | 值得借鉴的点 | 落到本项目哪里 |
|------|-------------|---------------|
| Salesforce / HubSpot（CRM） | 客户 360° 视图：事实 + 活动流 + 下一步统一在一个页面 | 客户全景页 = 上下文维护 + 时间线证据链（已定稿 §3.3） |
| Pipedrive（销售管道） | **Next Action 单一化**：每个客户只突出一个"下一步动作" | 右栏"下一步待办"Top1 强化 + 关键截止块（§3.1） |
| Todoist / Things（个人待办） | **自然语言建任务**："周五前催 NOA，高优先"→ 自动解析 deadline/priority | WO-41 聊天建任意任务（create_task 扩展） |
| Linear（工程任务） | 三键快速处理（approve/reject/defer）+ 状态流清晰 | 派单三键 / 老板决策三键已实现，待办工作台详情层沿用 |
| ClickUp / Asana（任务管理） | 任务模板、@委派、多视图切换 | 任务 Agent 化 + 委派（delegate 已实现） |
| 通用提醒策略 | 逾期红黄绿、今日 / 近 7 天分组 | 右栏待办紧迫度排序（§3.1） |

**结论**：本项目"客户全景 = 上下文 + 时间线 + 下一步"的方向与主流 CRM 一致；
"聊天自然语言建任务"和"每客户一个下一步"是两个最值得吸收的点，均已纳入施工单规划。

---

### 8.1 清单 / 材料管理类产品调研（2026-08-14 补充，驱动清单 Agent）

| 产品 / 平台 | 值得借鉴的点 | 落到本项目哪里 |
|------------|-------------|---------------|
| ApplyOnline（银行聚合门户） | 银行侧 digital checklist：直接告诉 broker"这个产品要哪些文件" | master_picker 银行×产品预选（已有），清单 Agent 触发"预选清单" |
| Loan Processor（澳洲 broker 后台） | **conditions tracker：每项有 owner + due date + next action**；结算前 72h 自动读清单 | 清单项补"谁负责/何时要/下一步"（V2）；递交前全绿检查复用 WO-20 |
| Rationalgo（澳洲 AI broker 工具） | 文件到达**自动勾选**已收，减少 ~70% 不完整递交 | 方向已有：WO-32 文件夹查找 + WO-33 gap_analysis，清单 Agent 串起来 |
| BrokerEngine | 按贷款类型定制清单 | master_picker（已有） |
| Nerova（AI 文档收集） | 定制清单 + 监控上传 + 提醒 + **异常材料早升级人工**（自雇/大额存款） | declaration_check 披露红线（已有），清单 Agent 可在确认卡提示升级 |
| Pepper App Tracker（银行门户） | 递交到结算的实时状态跟踪 | 右栏关键截止块（§3.1） |

**结论**：清单的核心不是"罗列材料"，而是"每项谁负责、何时要、下一步动作" +
"自动勾选已收" + "递交前全绿检查"。这正好是清单 Agent（§10.2）的职责边界，
日常入口放到中栏悬浮，与任务对称。

---

## 九、旧页面定位分析：清单 tab 与待办工作台（2026-08-14 已拍板）

### 9.1 清单 tab（CaseDetail 内 ChecklistDrawerContent）

- **"看"的价值已被覆盖**：右栏有补全进度（缺失类别提示），对话可直接问"还缺什么"。
- **"维护"的价值是独家的**：标记已收 / 撤销文件匹配 / 添加自定义项 / 换文件——右栏和对话都不能做。
- **建议（推荐，2026-08-14 更新）**：清单 tab 退役，**组件（ChecklistPanel）复用进中栏"清单"悬浮抽屉**，
  与任务抽屉并列（见 §10.2）；日常操作一步到位，不再需要独立 tab。全景页 F-30 聚焦"上下文 + 时间线"。

### 9.2 待办工作台（TaskWorkbench = TaskList + DetailPanel）

- **列表层价值已被覆盖**：首页今日待办（今日/逾期）+ 中栏悬浮客户任务（F-29，单客户全量）+
  右栏 Top5（态势）+ 全局咨询（跨客户）。"所有客户混在一起的列表"正是用户已确认的痛点。
- **详情层价值是独家的**：8 类任务详情处理（邮件草稿 / OS 回复 / 老板决策三键 / 文件匹配 /
  委派）在对话卡片里只有摘要，完整操作在 DetailPanel。
- **实现与主文档定稿有偏差**：主文档 §十一 定稿"任务=待办，点一项跳到对应案件对话继续处理"，
  但实际实现是独立工作台页面。
- **建议（推荐）**：待办工作台页面退役——"左列表"入口并入首页今日待办 + 中栏客户任务；
  "右详情车间"（8 类任务详情组件）不删，抽成**通用任务详情覆盖层 TaskDetailOverlay**
  （按 task.type 渲染对应详情），OsWorkbench 保留为 OS 专用；
  从任何出现任务的地方打开（中栏任务抽屉 / 右栏待办卡 / 首页今日待办 / 对话任务卡"打开详情"）。
  另立 F-31 处理（待 F-29/F-30 落地后再做，避免一次改太多）。

---

## 十、任务与清单双 Agent 化（2026-08-14 已拍板）

### 10.1 任务 Agent（agent-task）

把"任务"注册为能力中心的 Agent（与建档/计算器/申报检查一致），理由：

- 架构零新发明：agents.yaml（WO-25）+ 流程包（WO-26）+ 意图路由（WO-30）全部现成；
- 任务操作天然是自然语言、多轮、高频：建任务 / 查任务 / 委派 / 改截止 / 升级老板；
- 呈现分类已有定稿：任务查询=结果卡；建任务/委派=确认卡（参数确认后落库），非共创类不需要弹窗。

建议新增：

```yaml
- key: agent-task
  name: "任务 Agent (Task Ops)"
  description: "自然语言建任务/查任务/委派/改截止/升级老板"
  category: agent
  status: available
  triggers: ["帮我建个任务", "周五前提醒我", "这个客户有什么任务", "分派给", "升级给老板"]
  flow_key: task_ops
  capability: "任务 CRUD + 委派 + 升级"
  permission: "仅本系统任务，不触外部"
  enabled_default: true
```

流程包 `task_ops.yaml` 三个步骤：

1. `task_create`：解析 deadline / priority / assignee → 确认卡 → 落库（依赖 WO-41 端点扩展）；
2. `task_query`：按案件 / 状态 / 截止查询 → 结果卡；
3. `task_update`：完成 / 改截止 / 委派 / 升级 → 确认卡。

> **V1 落地分配（2026-08-14）**：WO-41 只实现 `task_create`；`task_query` / `task_update` 由 F-29 前端任务抽屉调既有端点承担（chat 工具版本 V2），升级老板已由 WO-40 独立承担。

**施工单影响**：WO-41 范围由"端点扩展"扩大为"任务 Agent 化"（端点 + chat 工具 + agents.yaml 注册 +
task_ops 流程包 + 测试）。仍是一单一件事（任务域闭环），不触碰其他模块。

### 10.2 清单 Agent（agent-checklist，2026-08-14 新增）

与任务对称：**清单同样放一个小图标在中栏，点击悬浮**，并注册能力中心 Agent，一步做到位。

调研佐证（详见 §8.1）：银行侧权威清单（ApplyOnline digital checklist）、
澳洲 broker 后台的 conditions tracker（每项有 owner / due date / next action）、
文件到达自动勾选（可减少 70% 不完整递交）、递交/结算前自动读清单。

```yaml
- key: agent-checklist
  name: "清单 Agent (Checklist Ops)"
  description: "查材料缺口 / 标记已收 / 撤销匹配 / 按银行产品预选 / 递交前全绿检查"
  category: agent
  status: available
  triggers: ["这个案件还缺什么", "材料收齐了吗", "清单全绿了吗", "把 XX 标记已收", "预选清单"]
  flow_key: checklist_ops
  capability: "清单查询/更新/预选/递交检查"
  permission: "仅本系统清单；文件匹配不写客户文件夹"
  enabled_default: true
```

流程包 `checklist_ops.yaml` 四个步骤：

1. `checklist_query`：查缺口 / 进度 → 结果卡；
2. `checklist_update`：标记已收 / 撤销匹配 / 添加自定义项 → 确认卡（复用 ChecklistPanel 能力）；
3. `checklist_preview`：按银行×产品预选清单 → 确认卡（复用 master_picker）；
4. `checklist_audit`：递交前全绿 / 申报一致性 → 结果卡（复用 WO-20 / WO-33，不新造轮子）。

> **V1 落地分配（2026-08-14）**：WO-43 实现 `checklist_query` + `checklist_preview`；`checklist_update` 由 F-29 抽屉调既有 confirm/revoke + 新增端点承担；`checklist_audit` 复用 WO-20 declaration_check / WO-33 gap_analysis 流程包。

中栏悬浮：聊天头部右侧并列两个小图标（任务 + 清单），各自点开抽屉；
清单抽屉复用 ChecklistPanel（标记/撤销/添加/预选/检查一步到位）。

**施工单影响**：新增 WO-43（后端清单 Agent：chat 工具 + agents.yaml 注册 + checklist_ops 流程包 +
复用 master_picker / WO-20 / WO-33），与 WO-41 并行；F-29 前端批次扩为"中栏双悬浮 + 右栏重组"。

---

## 十一、施工单顺序规划（更新版）

| 顺序 | 单号 | 端 | 一句话范围 | 依赖 |
|------|------|-----|-----------|------|
| 1 | WO-41 | 后端 | **任务 Agent**：create_task 扩展 deadline/priority/assignee + chat 工具 + agents.yaml 注册 agent-task + task_ops 流程包 | 无（WO-40 已就绪） |
| 1 | WO-43 | 后端 | **清单 Agent**：chat 工具 + agents.yaml 注册 agent-checklist + checklist_ops 流程包 + 复用 master_picker/WO-20/33 | 无 |
| 1 | F-29 | 前端 | 中栏双悬浮（任务抽屉 + 清单抽屉）+ 右栏重组（关键截止/排序红黄绿/下部折叠） | WO-41 / WO-43 |
| 2 | WO-42 | 后端 | 上下文维护 API：BrainFact 人工锁定/修正/披露标记 + 维护端点 | 无 |
| 2 | F-30 | 前端 | 客户全景页重构：上下文维护中心 + 时间线（清单 tab 退役，组件已复用进中栏抽屉） | WO-42 |
| 3 | F-31 | 前端 | 待办工作台退役：列表并入首页/中栏；详情组件抽 TaskDetailOverlay，从所有任务入口打开 | F-29/F-30 落地后 |

顺序说明：

- WO-41 / WO-43 / WO-42 后端可并行；F-29 与 F-30 可并行；F-31 最后做（依赖前两批，避免一次改太多）。
- 若 Vera 不同意 Agent 化，WO-41 / WO-43 退回"仅端点扩展 + chat 工具"的窄版本。
- 每张施工单执行 flash-executor-spec 五维格式 + 门禁（pytest / ruff / tsc）。

---

## 十二、待 Vera 确认项（更新）

1. 施工单顺序（WO-41+F-29 → WO-42+F-30 → F-31）是否认可；
2. 任务 + 清单**双 Agent 化**（agent-task + agent-checklist）是否认可；
3. 清单 tab 退役、组件复用进中栏清单抽屉（推荐）还是保留独立 tab；
4. 待办工作台退役、详情抽 TaskDetailOverlay 从所有任务入口打开（推荐）还是保留现状；
5. 中栏两个小图标并列（推荐）还是合并一个"案件工具"图标再展开；
6. 时间线形态：同页下半区（推荐）还是独立 tab；
7. 悬浮入口位置：聊天头部右侧（推荐）还是输入框上方。

---

## 十三、清单预选与沉淀流程（2026-08-14 补充，Vera 定稿方向）

### 13.1 业务流程（八步）

1. **建档**：拿到基本信息（银行 / 收入类型 / 身份 / 目的 / 金额）；
2. **系统预选**：按案件画像从"清单总项库"规则预选 15–25 项（**后端已有**，建档即自动写入）；
3. **建档联动**：建档完成后 AI 在对话跟进——"已按 XX 银行 + 收入类型预选 N 项清单，需要查看/调整吗？"（清单 Agent 入口，不强制）；
4. **查看**：VERA 打开中栏清单抽屉，**按业务分类展示**（身份 / 收入 / 银行特定 / 特殊情况 / 房产 / 结算）；
5. **补勾 / 去勾**：直接点选（后端已有 confirm / revoke）；
6. **新增**：库里没有的特殊项 → 填名称 + 选分类 → 同时写入**当前案件清单**与**清单总项库**；
7. **沉淀复用**：下次同类案件预选时，新增项自动出现在候选里（master_picker 合并配置文件 + 库中自定义项）；
8. **递交检查**：递交前全绿 / 申报一致性检查复用 WO-20 / WO-33（清单 Agent 第四步）。

### 13.2 现状核查（后端实测）

| 需求点 | 现状 | 缺口 |
|--------|------|------|
| 建档即预选 | ✅ `core/case_creation.py` L310：pick_checklist 规则预选 → 写入案件清单 | 无 |
| 按画像规则过滤 | ✅ master_picker：lender / employment_type / residency / purpose / deposit / income | 无 |
| 历史经验参与预选 | ⚠️ 仅 LLM 生成草稿时用（generator recall），建档预选未用 | **已拍板：建档纯规则；VERA 中栏询问时按需执行一次 AI 选（use_ai=True）** |
| 分类展示 | ⚠️ 前端按 必选/AI建议/可选 分组（is_required 维度），**非业务分类** | F-29：按 master category 分组 |
| 补勾 / 撤销 | ✅ POST .../checklist/{item_id}/confirm、/revoke | 无 |
| 新增清单项 | ❌ 前端仅内存 setState，**不落库** | WO-43：新增端点 |
| 新增项沉淀复用 | ❌ checklist_master.yaml 只读配置，无"清单总项库" | WO-43：沉淀表 + 合并加载 |

### 13.3 数据模型契约（WO-43）

新表 `checklist_library_custom`（自定义清单总项库）：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | str PK（格式 `custom_{uuid8}`） | master_id 复用 |
| name_zh | str NOT NULL | 中文名称 |
| name_en | str NULL | 英文名称 |
| category | str NOT NULL | 枚举同 checklist_master（identity/income_payg/income_self_employed/bank_specific/special/property/settlement） |
| applicable_when | JSON NULL | 适用条件，**可填可不填（不强制）**；默认 null = 全适用 |
| bank_specific | str NULL | 指定银行，**可填可不填（不强制）**；空 = 所有银行 |
| source_case_id | str NULL | 来源案件（审计可追溯） |
| use_count | int default 0 | **经验埋点**：被案件采用次数，随使用递增；为"经验越多规则越准"打基础（V1 只埋点不统计） |
| created_at | datetime | 创建时间 |

新端点：

- `POST /api/cases/{case_id}/checklist`
  body：`{name_zh, name_en?, category, is_required=true}`
  行为：写 CaseChecklist（master_id=custom id）+ upsert checklist_library_custom（同名 + 同分类幂等）；
  响应：ChecklistItemResponse。

master_picker 变更：

- `_load_master()` → 支持合并 `checklist_library_custom`（无 db 参数时仅加载 config，保持现有调用兼容）；
- `pick_checklist()` 预选候选 = config 全集 + 自定义总项。

### 13.4 施工单影响

- **WO-43 范围**：chat 工具（checklist_query + checklist_preview）+ agents.yaml 注册 agent-checklist +
  checklist_ops 流程包 + 新增端点与沉淀表 + master_picker 合并加载；
  checklist_audit（递交检查）复用 WO-20 declaration_check 流程包，不在本单重复实现；
- **F-29 清单抽屉**：按业务分类分组展示 + 新增项表单（名称 + 分类 + 可选"指定银行/适用条件"）+ 补勾/撤销复用 + 预选确认入口；
  **建档联动提示由 F-29 前端承担**（建档成功回调显示"已预选 N 项，查看/调整"），WO-43 不涉及前端。

### 13.5 已拍板小点（2026-08-14）

1. **新增项字段**：名称 + 分类 必填；"指定银行 / 适用条件"可选不强制（applicable_when / bank_specific 可空）；
2. **建档预选纯规则**：不主动调 AI；当 VERA 在中栏询问（如"这个案件还缺什么 / 优化一下清单"）时，才执行一次 AI 选（master_picker use_ai=True，含 LLM 排序/补理由 + 历史经验 recall）；
3. **经验埋点**：新增项沉淀进清单总项库时记录来源案件 + use_count 采用计数；V1 只埋点不做统计，为后续"经验越多、规则越准"积累数据。

---

## 十四、批次修正（2026-08-14 晚）：右栏回归"看态势" + 全景页承接维护中心

> 背景：F-30 实际落地把"上下文维护中心 + 时间线"做进了**右栏**（CasePanorama），与 §二/§3.1/§3.3 定稿
> （右栏看态势、客户全景页管"AI 知道什么"）**颠倒**；CaseDetail 客户全景 tab 仍是旧 BrainPanel
> （只读卡片 + 5 条 timeline + mock 数据）。Vera 确认：客户全景页（CaseDetail 客户全景 tab）价值保留，
> 按定稿对齐。

### 修正目标

- **右栏**：瘦身回归**只读态势**——关键截止 + 下一步 ≤5 + 风险（默认展开）+ 折叠的事实/时间线快照；
  硬规则：无操作按钮、只读、点击跳转；
- **CaseDetail 客户全景 tab**：升级为**上下文维护中心 + 时间线证据链**（承接 F-30 那套能力）；
- **中栏**：清单/任务/文件三件套保持（F-35 居中面板不变）；
- 后端**零改动**（facts/events 端点已齐）；组件共享复用。

### 批次拆分（确认后写提示词）

| 批次 | 内容 | 依赖 |
|---|---|---|
| F-35 | 中栏三件套（清单/任务/文件）改居中悬浮面板（提示词已出） | 无 |
| F-36 | 右栏回归"看态势"：头部只留标题 + 折叠（移除预览/记一笔/刷新/分轨筛选）；摘要一行；关键截止 1–3 条（红黄绿）；下一步待办 ≤5（红黄绿 + 分类徽标，只读 + 点击跳转）；风险默认展开、政策并入折叠；事实/时间线折叠快照（≤5，点击"去维护"跳 CaseDetail 客户全景 tab）；导航接线（AppShell case-detail 已有支持） | 无 |
| F-37 | CaseDetail 客户全景 tab 升级 = 上下文维护中心 + 时间线：迁移 F-30 那套（事实分组/锁定/修正/披露/记一笔/分轨/预览导出）；时间线用 context-events 证据链（确认/撤销）；清 BrainPanel/TimelinePanel 的 mock 与旧卡片；CaseDetail 时间线 tab 保留里程碑（/timeline） | F-36 后（组件共享） |

### 组件共享

- `FactCard` / `FactAmendModal` / `ManualNoteModal` / `ContextPreviewModal` / `OverviewTimeline`
  从右栏迁到全景页使用（右栏快照若需要可复用只读模式，不做维护操作）；
- 右栏快照"去维护"→ 切 `case-detail` view（AppShell 已支持 `view === "case-detail"`）。

### 文档同步

- F-30 验收记录标注"实现与定稿颠倒，待 F-36/F-37 对齐修正"；BACKLOG / 能力矩阵同步更新。
