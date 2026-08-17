# CASE 大脑 — 前端改造批次提示词（AI Studio 执行）

> 状态：**F-1 已交付**（ui/vera-工作台 (24)，2026-08-12）；F-2~F-4 待 F-1 真机运行验收后按实际代码结构撰写。
> 工作流：Codex 出提示词 → Vera 粘贴到 Google AI Studio → AI Studio 改前端 → 文件夹放回 `D:\vera-workbench\ui\` → Codex 核对。
> 约定：前端代码以 Google AI Studio 为准；Codex 不直接改前端，只出提示词与验收。

---


## 批次计划

| 批次 | 内容 | 状态 |
|------|------|------|
| F-1 | 三栏骨架：左栏案件列表 + 中栏 BrainChat + 右栏客户全景，AI 从悬浮球变主角 | ✅ 已交付（vera-工作台 (24)），待真机运行验收 |
| F-2 | 中栏实化：确认记录交互（低置信确认卡 + "已记录 N 条 [查看]" + 逐条撤销） | ✅ 已交付（vera-工作台 (25)），待真机运行验收 |
| F-2b | 中栏：递交模式横幅 + 建议卡 + 草稿卡骨架（依赖 WO-16 ✅；draft 真实数据等 WO-18） | ✅ 已交付（vera-工作台 (27)），待真机运行验收 |
| F-3 | 右栏实化：事实卡（BrainFact）/补全进度灰提示（依赖 WO-15 ✅） | ✅ 已交付（vera-工作台 (26)），待真机运行验收 |
| F-3b | 右栏重构：案件指挥中心（待办卡/风险/时间线/事实折叠，移除记一笔）+ 老看板入口收进"更多" | ✅ 已交付（vera-工作台 (27)），待真机运行验收 |
| F-5 | 全局咨询右栏：统计分析面板（概览 + 趋势 + AI 用量） | ✅ 已交付（vera-工作台 (27)），待真机运行验收 |
| F-4 | Apple 风格打磨——玻璃材质/排版层级/动效/微交互/空态/旧页面视觉统一（已读 apple-design 规范） | 已出（下文） |
| F-6 | 首页（今日工作台）界面设计——应用框架感 + 今日概览/待办/提醒/快捷操作/对话入口（自由发挥，功能要求到位） | 已出（下文） |
| F-6c | 首页融合 + 侧栏布局修整——原型设计模式 × 主前端真实数据（固定顶栏/Bento 小组件/待办 tabs/侧栏分区） | 已出（下文） |
| F-6d（最终版） | 侧栏内容上导航下 + 图标统一 + 搜索图标化 + 顶栏下拉优化 + 阶段节点 + 头部精简 + 动效统一 | ✅ 已交付（(32) 大部分落地） |
| F-6e | 主导航上移顶栏：今日工作台/全局咨询 → TopNavBar（搜索栏旁）；侧栏底部只留 4 入口 + 更多；搜索保留图标式 | ✅ 已交付（(33)），待真机验收 |
| F-6f | 全局咨询快捷发问 chips（空态引导：到期查询/建案/统计/政策/写邮件） | ✅ 已交付（(33)），待真机验收 |
| F-7 | 统一建案表单 sheet（新客户/存量壳/历史导入；文件导入口 + 一段话识别 + 中断恢复）+ 今日待办间距修复 | ✅ 已交付（(34)，底部空白修复 (35) 进行中） |
| F-8 | 能力中心 V1（设置里 Agent/工具列表 + 启用开关 + 能力提示） | 已出（下文） |
| F-9 | 政策提示卡 + 申报一致性检查功能卡（建档后/全景/对话触发，接 WO-19/20） | 已出（下文） |
| F-10 | 提醒展示（对话内自然提醒 + 首页/全景联动，接 WO-21） | 已出（下文） |
| F-11 | 首页 B 方案布局：AI 输入框移入右栏（今日待办最大化 + 整列对齐）+ 文案修正 | 已出（下文） |

> ✅ **已定稿（2026-08-12）**：在现有 `ui/vera-工作台 (23)` 基础上**增量改造**（换壳不换内脏）——
> 保留 services/types/stores/themes/已验证组件，换 AppShell 外壳 + 新增 `src/components/brain/` 目录；
> 旧页面降级为次级入口，不重写、不删除、不新建项目。

---

## 批 F-1：三栏"案件上下文工作台"骨架

### 前置决策（待拍板）

- [x] ✅ 改造基准（2026-08-12 拍板）：**在现有 `ui/vera-工作台 (23)` 基础上增量改造**
  - 保留 store/services/types/themes/mock 与已验收页面（统计/全景/记一笔/任务），换 AppShell 外壳 + 新增 `src/components/brain/` 目录；旧页面降级为次级入口，不重写、不新建项目。
- [x] ✅ 全局咨询入口（2026-08-12 拍板）：左栏案件列表**顶部**加"全局咨询"（不绑定案件）——承载建案/导入/通用咨询；建案成功自动切到新案件对话。并入 F-1 骨架。

### 提示词正文（复制给 AI Studio）

```
---


---


# 任务：Vera Workbench — 三栏"案件上下文工作台"骨架改造（AI First 布局）

## 背景
产品从"任务工作台"转型为"CASE 大脑"：对话是主入口。本次只搭三栏骨架，
默认打开"案件对话"（不再是任务工作台），AI 从右下角悬浮球（FloatingAI）变为主界面。

## 技术约束
- 前端：TypeScript strict / React 18 / Vite / Tailwind CSS / motion/react（现有版本）
- 图标：lucide-react（现有）；状态：zustand（现有）
- 禁止：引入任何新的 npm 依赖；禁止修改后端或 API 层；禁止改动现有页面逻辑（TaskWorkbench/CaseBoard/Analytics/Settings 等只保留入口，不重构）
- 样式：一律使用项目现有 CSS 变量（var(--bg-app)/var(--bg-panel)/var(--bg-card)/var(--border)/var(--text-primary)/var(--text-muted)/var(--accent) 等），不新增配色
- 动画：使用 motion/react spring，默认 damping 1.0 / response 0.3-0.4；折叠/展开必须可中断；遵守 prefers-reduced-motion（用 useReducedMotion，reduce 时退化为 opacity 淡变）

## 改动范围（严禁超出）

| 文件 | 操作 |
|------|------|
| src/types/navigation.ts | 修改：ViewId 增加 "brain" |
| src/components/layout/AppShell.tsx | 修改：默认视图改为 "brain"；渲染三栏 BrainWorkspace |
| src/components/brain/CaseListSidebar.tsx | 新建：左栏案件列表（240px，可折叠 60px） |
| src/components/brain/BrainChat.tsx | 新建：中栏对话（复用现有 ChatPanel 的对话逻辑） |
| src/components/brain/CasePanorama.tsx | 新建：右栏客户全景（复用现有 BrainPanel/OverviewFacts/OverviewTimeline） |
| src/App.tsx | 修改：移除 <FloatingAI /> 渲染（组件文件保留不删） |

⚠️ 严禁修改上表以外的文件。严禁删除/重命名现有文件。严禁改动后端。

## 接口契约

1. ViewId = "tasks" | "cases" | "knowledge" | "settings" | "case-detail" | "drafts" | "archive" | "imports" | "migration" | "analytics" | "brain"
2. 左栏 CaseListSidebar：
   - props: { activeView: ViewId; onNavigate: (v: ViewId) => void }
   - 读取 useCaseStore().cases / currentCase / setCurrentCase / fetchCases
   - 展开态（240px）：**最顶部"全局咨询"入口**（图标 + 文案，点击 → setCurrentCase(null) 清空选中案件，中栏切全局对话）→ 下方"案件"标题 + 搜索框（本地过滤 clientName/lender）+ "＋新案件"按钮（触发 useUiStore 的 newCaseOpen）；中部案件列表（clientName + lender 徽章 + stage 简写 + 清单进度条）；底部次级入口（任务工作台/案件看板/统计/设置/更多，沿用现有 Sidebar 的 MAIN_TABS/MORE_ITEMS 图标与文案）
   - 折叠态（60px）：只显示图标（案件列表收起为按钮，点击展开；底部入口只留图标 + title 提示）
   - 点击案件：setCurrentCase(case) → 中栏/右栏联动
   - 折叠/展开：横向 spring（damping 1.0, response 0.35），可中断；折叠时文字淡出
3. 中栏 BrainChat：
   - props: { caseId: string | null }
   - 顶部：当前客户名 + lender 徽章 + stage 徽章 + 右侧"已注入案件上下文"指示（现有 ChatPanel 顶部文案复用）+ 折叠右栏按钮
   - 主体：完整复用现有 ChatPanel 的消息流/发送/建议动作逻辑（VITE_USE_MOCK 分支保留）
   - **无案件时（caseId=null）= 全局对话**：顶部显示"全局咨询"（无客户名、无"已注入案件上下文"指示）；主体空态引导"选择左侧案件开始对话" + "＋ 新建案件"按钮（触发 useUiStore 的 newCaseOpen）——建案/导入弹窗实化在 F-3，本批只放按钮与占位
4. 右栏 CasePanorama：
   - props: { caseId: string | null; collapsed: boolean; onToggle: () => void }
   - 展开态（360px）：复用 BrainPanel 的 context 加载（getCaseContext）+ OverviewFacts + OverviewTimeline + 记一笔输入（internal/external）+ 刷新
   - 折叠态：收成 24px 竖条（旋转标题"客户全景"+ 展开按钮），进入/退出同路径
   - 无案件时：空态提示
5. AppShell：
   - useState 初始值 "brain"；view === "brain" 时渲染三栏（CaseListSidebar + BrainChat + CasePanorama），不渲染 KpiBar/FilterBar
   - 其余 view 维持现有渲染（旧页面仍可经左栏底部入口进入）；旧页面顶部加一个"返回对话"按钮（onBack={() => setView("brain")}）——仅 brain 以外的 view 显示
   - CasePanorama 的 collapsed 状态存 useState，不持久化

## 实施步骤

### Step 1：类型
- [ ] src/types/navigation.ts：ViewId 联合类型末尾追加 "brain"

### Step 2：左栏
- [ ] 新建 src/components/brain/CaseListSidebar.tsx（按上面契约；案件列表为空时显示空态文案）
- [ ] 搜索框：useState 本地过滤，不调后端
- [ ] 顶部"全局咨询"入口：点击清空 currentCase（setCurrentCase(null)），中栏切全局对话

### Step 3：中栏
- [ ] 新建 src/components/brain/BrainChat.tsx（从 src/components/chat/ChatPanel.tsx 复制对话逻辑并改 props 来源；保留 mock/真实双分支）
- [ ] caseId=null 时渲染"全局咨询"标题 + 空态引导 + 新建案件按钮（不显示客户名/上下文指示）

### Step 4：右栏
- [ ] 新建 src/components/brain/CasePanorama.tsx（复用 BrainPanel 的加载/记一笔逻辑 + OverviewFacts/OverviewTimeline；折叠状态由 props 控制）

### Step 5：组装
- [ ] src/components/layout/AppShell.tsx：默认 view="brain"；新增三栏渲染分支；旧页面顶部"返回对话"按钮（仅非 brain 视图）；KpiBar/FilterBar 仅在原条件渲染
- [ ] src/App.tsx：删除 <FloatingAI /> 一行（import 一并删除）

### Step 6：验证
- [ ] npx tsc --noEmit → 零错误
- [ ] npm run build → 成功

## 验收标准（手动）
1. 打开 http://localhost:3000 → 默认进入三栏：左栏案件列表、中栏对话（最近案件）、右栏客户全景
2. 右下角不再有悬浮 AI 球
3. 点击左栏另一个案件 → 中栏标题/对话、右栏全景同步切换为该案件
4. 左栏折叠按钮 → 缩成 60px 图标栏，动画顺滑可中断；再点展开恢复
5. 右栏折叠按钮 → 收成竖条；再点展开恢复
6. 左栏底部"任务工作台" → 进入旧页面，顶部有"返回对话"按钮 → 点击回到三栏
7. 无案件数据时左栏/中栏/右栏均显示空态，不报错
8. 点击左栏顶部"全局咨询" → 中栏显示"全局咨询"（无客户名、无上下文指示）；再点某案件恢复案件对话

⚠️ 执行纪律：
1. 只修改改动范围表中的文件，绝不碰其他文件
2. 组件名/props 严格按接口契约，一个字符不改
3. 不要引入新依赖；不要改动现有页面内部逻辑
4. 每完成一步运行对应验证；失败先报告，不自作主张修计划外代码
5. 动画一律用 spring（damping 1.0 / response 0.3-0.4），折叠展开可中断，遵守 prefers-reduced-motion
```

### 上传给 AI Studio 的参考文件（最小集）

```
src/App.tsx
src/components/layout/AppShell.tsx
src/components/layout/Sidebar.tsx
src/components/chat/ChatPanel.tsx
src/components/panel/details/BrainPanel.tsx
src/components/cases/overview/OverviewFacts.tsx
src/components/cases/overview/OverviewTimeline.tsx
src/stores/caseStore.ts
src/stores/uiStore.ts
src/types/navigation.ts
```

> 建议直接上传整个项目文件夹，便于 AI Studio 看清 CSS 变量与现有结构。

---

## 批 F-2：确认记录交互（中栏）

> 配对后端 **WO-14 确认闸门**（pending→confirmed→superseded 状态机）。BrainChat 实化：低置信确认卡 + 对话尾部"📌 已记录 N 条 [查看]" + 逐条撤销。草稿卡/递交模式横幅归 F-2b（等后端对话协议）。

### 提示词正文（复制给 AI Studio）

```
# 任务：Vera Workbench — F-2 确认记录交互（中栏 BrainChat 实化）

## 背景
在 F-1 三栏骨架（ui/vera-工作台 (24)）基础上，实化中栏的"确认闸门"交互：
① 低置信事实以确认卡出现在对话流；② 对话尾部常驻"📌 已记录 N 条 [查看]"；
③ 点击 [查看] 打开抽屉，列出已确认事件，可逐条撤销（supersede，不物理删除）。

## 技术约束
- 前端：TypeScript strict / React 18 / Vite / Tailwind CSS / motion/react（现有版本）
- 图标：lucide-react（现有）；状态：zustand（现有）；Toast：useToastStore（现有）
- 禁止：引入任何新的 npm 依赖；禁止修改后端；禁止改动现有页面逻辑（TaskWorkbench 等只读）
- 样式：一律使用项目现有 CSS 变量（var(--bg-app)/var(--bg-panel)/var(--bg-card)/var(--border)/var(--text-primary)/var(--text-muted)/var(--accent) 等），不新增配色
- 动画：motion/react spring（damping 1.0 / response 0.3-0.4）；展开/收起可中断；遵守 prefers-reduced-motion

## 改动范围（严禁超出）

| 文件 | 操作 |
|------|------|
| src/types/api.ts | 修改：ContextEvent 类型加 status/superseded_by/supersede_reason |
| src/services/api/cases.ts | 修改：新增 listContextEvents / confirmContextEvent / supersedeContextEvent |
| src/components/brain/ConfirmCard.tsx | 新建：低置信确认卡 |
| src/components/brain/RecordedEventsDrawer.tsx | 新建："已记录 N 条 [查看]" 抽屉 |
| src/components/brain/BrainChat.tsx | 修改：挂载确认卡 + 已记录指示 + 抽屉 |

⚠️ 严禁修改上表以外的文件。严禁删除/重命名现有文件。严禁改动后端。

## 接口契约

1. ContextEvent 类型（types/api.ts，对齐后端 ContextEventResponse）：
   ```typescript
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
   ```
2. services/api/cases.ts 新增 3 个方法（沿用现有 http 封装，VITE_USE_MOCK 分支由调用方处理）：
   ```typescript
   export function listContextEvents(
     caseId: string,
     params?: { status?: 'pending' | 'confirmed' | 'superseded'; track?: 'internal' | 'external'; limit?: number },
   ): Promise<ContextEvent[]>;

   export function confirmContextEvent(caseId: string, eventId: number): Promise<ContextEvent>;

   export function supersedeContextEvent(caseId: string, eventId: number, reason: string): Promise<ContextEvent>;
   ```
3. ConfirmCard.tsx：
   - props: `{ event: ContextEvent; onConfirm: (id: number) => void; onDismiss: (id: number) => void }`
   - 渲染：卡片边框（var(--border)）+ 标题"待确认记录" + event.content（截断 3 行可展开）+ 来源徽章（source_type）+ 两个按钮：[确认]（primary，调 onConfirm）/ [稍后]（次级，onDismiss，仅本地关闭不调后端）
   - 入场动画：spring 上滑淡入（可中断）
4. RecordedEventsDrawer.tsx：
   - props: `{ open: boolean; onClose: () => void; events: ContextEvent[]; onRevoke: (id: number) => void }`
   - 右侧滑出抽屉（宽 360px，spring，可中断）；标题"已记录 N 条"（N=events.length）
   - 列表：每行 content + 时间 + 撤销按钮（垃圾桶图标，点击 onRevoke 前弹确认："撤销后该记录不再参与摘要，可审计恢复。撤销？[撤销][取消]"）
   - 空态："暂无已确认记录"
5. BrainChat.tsx 修改（只加不改逻辑）：
   - 对话流内：当 VITE_USE_MOCK !== 'false' 或真实返回含 pending 事件时，在消息流尾部渲染 ConfirmCard 列表（每事件一张，[确认] 调 confirmContextEvent 后刷新）
   - 对话尾部常驻指示：confirmed 事件数 > 0 时显示 "📌 已记录 N 条 [查看]"，点击打开 RecordedEventsDrawer
   - 数据加载：caseId 存在时调 listContextEvents(caseId, {status:'pending'}) + listContextEvents(caseId, {status:'confirmed'})；mock 分支用 MOCK_EVENTS（2 条 pending + 3 条 confirmed）
   - 撤销成功后：Toast 提示"已撤销"，刷新列表；被撤销事件移出 confirmed 列表
   - 无案件（全局咨询）时不加载、不显示这两块

## 实施步骤

### Step 1：类型 + API
- [ ] src/types/api.ts：新增 ContextEvent 接口（契约第 1 条）
- [ ] src/services/api/cases.ts：新增 3 个方法（契约第 2 条），严格按 GET/POST 路径拼接，不引入新依赖

### Step 2：ConfirmCard
- [ ] 新建 src/components/brain/ConfirmCard.tsx（契约第 3 条）

### Step 3：RecordedEventsDrawer
- [ ] 新建 src/components/brain/RecordedEventsDrawer.tsx（契约第 4 条）

### Step 4：BrainChat 挂载
- [ ] src/components/brain/BrainChat.tsx：按契约第 5 条挂载（mock/真实双分支保留）

### Step 5：验证
- [ ] npx tsc --noEmit → 零错误
- [ ] npm run build → 成功

## 验收标准（手动）
1. 打开某案件对话 → 对话尾部出现"📌 已记录 N 条 [查看]"（有 confirmed 事件时）
2. 点击 [查看] → 抽屉列出已确认记录，每行有撤销按钮
3. 撤销 → 弹确认 → 确认后 Toast"已撤销"、该条移出列表
4. mock 分支：对话流尾部出现 2 张"待确认记录"卡片；点 [确认] → 卡片消失、已记录数 +1；点 [稍后] → 卡片本地关闭
5. 全局咨询（无案件）→ 不显示确认卡与已记录指示
6. 动画：卡片/抽屉展开收起顺滑可中断；prefers-reduced-motion 时退化为淡变
7. 切换案件 → 数据随案件刷新，不串案
8. 后端未启动（真实分支报错）→ Toast 提示，页面不崩溃

⚠️ 执行纪律：
1. 只修改改动范围表中的文件，绝不碰其他文件
2. 接口名/props/字段名严格按契约，一个字符不改
3. 不引入新依赖；不改动现有页面内部逻辑
4. 每完成一步运行验证；失败先报告，不自作主张修计划外代码
5. 动画一律 spring（damping 1.0 / response 0.3-0.4），可中断，遵守 prefers-reduced-motion
```

### 上传给 AI Studio 的参考文件（最小集）

```
src/types/api.ts
src/services/api/cases.ts
src/services/http.ts
src/components/brain/BrainChat.tsx
src/components/brain/CaseListSidebar.tsx
src/components/layout/AppShell.tsx
src/stores/caseStore.ts
src/stores/toastStore.ts
src/stores/uiStore.ts
```

---

## 后续批次（待出）

- **F-2b**：草稿卡 + 递交模式横幅（依赖后端对话协议 WO-16）
- **F-3**：右栏全景实化——事实卡（BrainFact）/补全进度灰提示/待办与承诺（依赖 WO-15）
- **F-4**：Apple 风格打磨——毛玻璃材质/弹簧动画细节/空态插画/reduced-motion 复查；旧页面入口收尾

> 注：F-2b~F-4 的具体提示词待对应批次验收后按实际代码结构撰写。

---

## 批 F-11：首页 B 方案布局（AI 输入框进右栏 + 整列对齐 + 文案修正）

> 用户定稿（2026-08-13）：① 今日待办要更多竖向空间——页面底部通栏 AI 对话区移入右栏；② 两栏等底、右栏底部与左卡底部齐平；③ 对话区标题"直接与 Vera 说话"表述错误（Vera 是人，AI 是助手），需改文案。

### 提示词正文（复制给 AI Studio）

```
# 任务：Vera Workbench — 首页 B 方案布局（AI 输入框进右栏 + 对齐 + 文案）

## 背景
在 ui/vera-工作台 (36) 基础上重构首页主内容区：
① 页面底部通栏"对话入口"整体移入右栏（今日待办获得整页剩余高度）；
② 两栏等底：左卡（今日待办）底部与右栏底部（AI 输入框）齐平；
③ 修正对话区文案："直接与 Vera 说话"错误（Vera 是使用者，AI 才是助手）。
只改 HomePage 布局/文案，不动业务逻辑/接口/路由。

## 技术约束
- TypeScript strict / React / Vite / Tailwind / motion/react / zustand（现有）
- 不引入新依赖；颜色从现有 CSS 变量派生；动效 spring（damping 1.0 / response 0.3-0.4）；遵守 prefers-reduced-motion
- 对话逻辑（handleStartChat / chatPrompt / Enter 发送 / 快捷 chips）原样保留，只改位置与文案

## 改动范围（严禁超出）

| 文件 | 操作 |
|------|------|
| src/components/brain/HomePage.tsx | 修改：主 grid 对齐、右栏 flex 化、对话区移入右栏、删底部通栏、文案修正 |

⚠️ 严禁修改其他文件；严禁改动业务逻辑/接口/路由。

## 具体改动

### 1. 主内容区对齐
- 主 grid（现 L361）：`grid grid-cols-1 lg:grid-cols-3 gap-5 items-start` → 去掉 `items-start`（默认 items-stretch，两栏等底）

### 2. 右栏 flex 化 + 对话区移入
- 右栏（现 L504）：`space-y-5` → `flex flex-col gap-5 h-full`
- **快捷看板 widget 加 `flex-1`**（伸缩吃掉弹性空间）
- **专家贴士 widget 保持**
- **对话区（现页面底部第 6 节，含标题/输入框/发送按钮/快捷 chips）整体移入右栏底部**（专家贴士下方）：
  - 输入框保留 handleStartChat + Enter 发送 + disabled 逻辑；样式适配右栏宽度（360px）
  - 快捷 chips（现有 4 个）放在输入框上方（横向 wrap）
  - 对话区整体 `flex-shrink-0`（不随列伸缩）
- 页面底部原通栏对话区**整段删除**

### 3. 文案修正
- 标题："直接与 Vera 说话 (AI First Chat Entry)" → **"向 AI 提问"**（副标可留"AI First Chat Entry"或改为"随时开始"）
- placeholder："例如：帮 Chen Wei 检查补件状态、计算 85% LVR 豁免 LMI 条件、或拟写退筹码邮件..." → **"例如：检查补件状态、算 LVR、拟写退筹码邮件…"**（简洁；不出现"与 Vera 说话"类表述）
- 文案原则：Vera 是使用者，AI 是助手——所有提示语面向"她向 AI 提问"，不说"与 Vera 说话"

## 验证
- npx tsc --noEmit → 零错误；npm run build → 成功

## 验收参考（手动）
1. 今日待办卡获得整页剩余高度（底部无通栏对话条）；列表内部滚动
2. 右栏自上而下：快捷看板（flex-1 伸缩）→ 专家贴士 → AI 输入框 + 快捷 chips；右栏底部与左卡底部齐平
3. 输入框输入 + Enter → 正常预填跳全局咨询；快捷 chips 可点
4. 标题显示"向 AI 提问"，无"与 Vera 说话"表述
5. 动效顺滑；reduced-motion 生效

⚠️ 执行纪律：只改 HomePage.tsx 一个文件；对话逻辑原样迁移（不重写）；不引入新依赖；失败先报告。
```

---

## 批 F-8：能力中心 V1（设置里 Agent/工具管理）

> 主文档"能力中心"定稿：前台用能力（BrainChat），后台管能力（能力中心）。V1 先做查看 + 启用/关闭 + 能力提示区；Agent 执行数据等后端 WO-20 后接真实（V1 mock/本地状态）。

### 提示词正文（复制给 AI Studio）

```
# 任务：Vera Workbench — 能力中心 V1（设置页）

## 背景
产品要有"看得见的能力"：Vera 在设置里能看到系统有哪些业务 Agent 和工具、哪些启用、能说什么话触发。
在 ui/vera-工作台 (34) 基础上，Settings 页新增"能力中心"分区。V1 用本地 mock 列表 + 本地开关状态（不接后端；标注"执行数据待后端接入"）。

## 技术约束
- TypeScript strict / React / Vite / Tailwind / motion/react / zustand（现有）
- 不引入新依赖；颜色从现有 CSS 变量派生；动效 spring（damping 1.0 / response 0.3-0.4）；遵守 prefers-reduced-motion
- 不接后端（V1 本地状态）；组件内 mock 数据即可

## 改动范围（严禁超出）

| 文件 | 操作 |
|------|------|
| src/pages/Settings.tsx | 修改：新增"能力中心"分区/入口 |
| src/components/settings/AbilityCenter.tsx | 新建：能力中心面板（Agent 列表 + 工具列表 + 能力提示区） |

⚠️ 严禁修改其他文件；严禁改动业务逻辑/接口/路由。

## 接口契约（AbilityCenter.tsx）

1. **业务 Agent 列表**（mock，含 5 个：建档 / 跟进 / 申报一致性检查 / 催件 / OS 回复）：
   - 每项：名称 + 描述（一句话）+ 触发词（如"帮我建个案件"、"检查一下申报一致性"）+ 启用开关（本地 toggle）+ 状态徽章（V1：🟢 可用 / ⚪ 待接入）
   - 建档 = 🟢（WO-18 已落地）；其余 = ⚪（"执行数据待后端接入"）
2. **工具 BrainTool 列表**（mock）：记忆工具（记录/确认/撤销，🟢）、文件识别提取（🟢，权限说明"仅 Vera 主动上传/指定路径"）、政策库（🟢，WO-19 后）、邮件进度/日历/微信（⚪ 未接入，按需评估）
3. **能力提示区**：示例触发语 chips（"帮我建个案件"、"检查申报一致性"、"今天有哪些到期？"、"写一封补件邮件"）——点击 Toast"可在全局咨询或案件对话中直接说出"
4. 开关状态存组件 useState（不持久化，V1）；切换有 Toast
5. 布局：Settings 页顶部导航或侧栏加入口；面板为卡片列表，开关用现有 accent 样式

## 验证
- npx tsc --noEmit → 零错误；npm run build → 成功

## 验收参考（手动）
1. 设置页能进入"能力中心"；Agent 列表 5 项（名称/描述/触发词/开关/状态徽章）
2. 建档 Agent 显示 🟢；其余显示 ⚪ 待接入；工具列表含 5+ 项
3. 开关可切换 + Toast；能力提示 chips 可点
4. 动效顺滑；reduced-motion 生效

⚠️ 执行纪律：只改 Settings.tsx + AbilityCenter.tsx；不接后端；不引入新依赖；失败先报告。
```

---

## 批 F-9：政策提示卡 + 申报一致性检查功能卡（接 WO-19/20）

> 数据源：`GET /api/cases/{id}/policy-check`（WO-19）、`POST /api/cases/{id}/declaration-check`（WO-20，输入文件/路径）。后端交付前 mock 分支兜底。

### 提示词正文（复制给 AI Studio）

```
# 任务：Vera Workbench — 政策提示卡 + 申报一致性检查功能卡

## 背景
① 建档后显示政策提示卡（🟢🟡🔴 + 风险项 + 替代银行 + 免责）；② 阶段感知的"申报一致性检查"功能卡（清单将全绿/准备递交时主动推；点击选文件/贴路径 → 检查 → 结论卡）。V1 接 WO-19/20 端点，后端未交付时 mock 兜底。

## 技术约束
- TypeScript strict / React / Vite / Tailwind / motion/react / zustand（现有）
- 不引入新依赖；颜色变量派生；动效 spring；reduced-motion
- 接口契约（后端 WO-19/20 已定义，前端照此对接；未交付时 mock 分支）：
  - `GET /api/cases/{id}/policy-check` → `{ lender, overall, issues: [{level,title,detail,suggestion}], alternative_lenders, summary, disclaimer }`
  - `POST /api/cases/{id}/declaration-check` body `{ files?: string[], folder?: string }` → `{ status: "pass"|"warning"|"fail"|"unparseable", findings: [{item, evidence, level, suggestion}], summary }`

## 改动范围（严禁超出）

| 文件 | 操作 |
|------|------|
| src/types/api.ts | 修改：PolicyCheckResult / DeclarationCheckResult 类型 |
| src/services/api/cases.ts | 修改：getPolicyCheck / runDeclarationCheck |
| src/components/brain/PolicyHintCard.tsx | 新建：政策提示卡（🟢🟡🔴 + 风险项 + 替代银行 + 免责） |
| src/components/brain/DeclarationCheckCard.tsx | 新建：申报一致性检查功能卡（触发/材料选择/结论分层） |
| src/components/brain/CasePanorama.tsx | 修改：全景挂载 PolicyHintCard（建档后/事实变更时） |
| src/components/brain/BrainChat.tsx | 修改：对话流可渲染 DeclarationCheckCard（后端 tool 卡或 mock） |
| src/components/brain/HomePage.tsx | 修改：建案成功后 Toast 提示可查看政策提示（或卡片入口） |

⚠️ 严禁修改其他文件；严禁改动后端/接口。

## 一、PolicyHintCard
- props: `{ result: PolicyCheckResult }`
- 🟢 绿卡（无 issues）："政策画像良好" + summary
- 🟡/🔴：标题（overall 中文映射：green=建议可行 / amber=注意 / red=高风险）+ issues 列表（level 色点 + title + detail + suggestion）+ 替代银行（alternative_lenders chips）+ 免责声明小字
- 可关闭（本地 state）；卡片 hover 抬升；spring 入场

## 二、DeclarationCheckCard
- 触发：全景或对话中"开始申报一致性检查"按钮/建议卡；点击展开材料选择：
  - 多选文件（本地 mock 文件列表 V1）或"贴文件夹路径"输入框 → [开始检查]（调 runDeclarationCheck）
- 结论分层：✅ 通过（绿色）/ ⚠️ 预警（逐项 findings：item + evidence + level + suggestion，可展开）/ 🔴 无法解析（需人工）
- 底部操作：预警时 [生成解释信草稿]（Toast"WO-20 交付后可用"）
- 检查完成写一条上下文事件（V1 前端本地状态，标注待后端闭环）
- mock 分支：MOCK_DECLARATION（含 1 条 warning：dependents 与银行流水不符）

## 三、挂载
- CasePanorama：policy 卡放"风险与注意事项"区上方（仅当有结果时）
- BrainChat：declaration 卡可由工具卡/mock 渲染；无案件不显示

## 验证
- npx tsc --noEmit → 零错误；npm run build → 成功

## 验收参考（手动）
1. 打开案件全景 → 政策提示卡（mock 或真实）显示风险/替代银行/免责；可关闭
2. 触发一致性检查 → 选材料/贴路径 → 结论卡（✅/⚠️/🔴）；预警逐项可展开；解释信按钮 Toast 占位
3. 后端未启动 → Toast + mock 兜底不崩溃

⚠️ 执行纪律：只改改动范围表中的文件；接口字段名照契约；不引入新依赖；失败先报告。
```

---

## 批 F-10：提醒展示（对话内自然提醒 + 首页/全景联动）

> 数据源：任务 deadline（现有 tasks）+ WO-21 reminders 端点（交付前 mock）。#11 三处落点补齐"对话内自然提醒"。

### 提示词正文（复制给 AI Studio）

```
# 任务：Vera Workbench — 提醒展示（对话内自然提醒 + 首页/全景联动）

## 背景
#11 定稿：提醒三处落点——打开软件汇总横幅（首页已有 overdue banner）、全景待办卡（F-3b 已有）、**案件对话内自然提醒（缺）**。
本批：案件对话打开时，若有到期/逾期待办或承诺 → 对话顶部显示提醒条 + AI 首句自然带出；与首页/全景数据同源。

## 技术约束
- TypeScript strict / React / Vite / Tailwind / motion/react / zustand（现有）
- 不引入新依赖；颜色变量派生；动效 spring；reduced-motion
- 数据：现有 useTaskStore（deadline/priority）；WO-21 reminders 端点交付后扩展（V1 用任务推导）

## 改动范围（严禁超出）

| 文件 | 操作 |
|------|------|
| src/components/brain/CaseReminderBanner.tsx | 新建：案件对话顶部到期/逾期提醒条 |
| src/components/brain/BrainChat.tsx | 修改：案件打开时计算到期待办 → 挂提醒条 + 首条消息前自然提示（mock 分支可演示） |
| src/types/api.ts · src/services/api/tasks.ts | 修改：如需 reminder 类型/端点（V1 可不改，用任务推导） |

⚠️ 严禁修改其他文件；严禁改动后端/接口。

## 接口契约

1. CaseReminderBanner：
   - props: `{ caseId: string; overdue: number; dueToday: number }`
   - overdue > 0 → 红条"该案件有 N 个待办已逾期，建议优先处理"；dueToday > 0 → 琥珀条"N 个待办今日到期"
   - 可关闭（本地 state）；点击条 → 跳到待办/对话相关（V1 Toast）
2. BrainChat 集成：
   - caseId 非空时：从 useTaskStore 过滤该案件待办 → 计算 overdue/dueToday → 挂 CaseReminderBanner（消息流上方）
   - AI 首条自然提示（V1 mock：当 overdue>0 时，mock 首条 assistant 消息前插一条提醒气泡"记得先处理 XX 的逾期补件"；真实接入等 WO-21）
   - 全局咨询（无案件）不显示
3. 首页/全景联动：数据同源（同一 taskStore），首页 banner 与全景待办卡已存在，本批不改

## 验证
- npx tsc --noEmit → 零错误；npm run build → 成功

## 验收参考（手动）
1. 打开有逾期待办的案件对话 → 顶部红色提醒条；今日到期 → 琥珀条
2. 提醒条可关闭；无到期 → 不显示
3. mock 分支：首条消息前有自然提醒气泡
4. 全局咨询不显示提醒条；动效顺滑；reduced-motion 生效

⚠️ 执行纪律：只改改动范围表中的文件；数据与首页/全景同源（不新造）；失败先报告。
```

---

## 批 F-7：统一建案表单 sheet（配对后端 WO-18）+ 今日待办间距修复

> 后端 WO-18 已就绪：`POST /api/cases/parse-text`（一段话识别预填）、`POST /api/cases/parse-file`（文件提取预填）、`POST /api/cases`（支持 employment_type/residency/is_imported/property_value/interest_rate + LVR 自动算 + 建档即预选清单）。本批实现前端统一建案页（#13/#15/#16）。

### 提示词正文（复制给 AI Studio）

```
# 任务：Vera Workbench — 统一建案表单 sheet + 今日待办间距修复（F-7）

## 背景
在 ui/vera-工作台 (33) 基础上：
① 新建"统一建案表单"（Apple 风格底部 sheet）：新客户建档 / 存量壳（三级）/ 历史导入 三种模式共用；
   支持顶部文件导入口（扔文件 → parse-file 预填）、一段话识别（parse-text 预填）、字段确认、中断恢复（localStorage）。
② 小修复：今日工作台"今日待办"标题栏与待办项间距过大（外层 justify-between 导致）。
不动后端（WO-18 已交付），只接现有接口。

## 技术约束
- TypeScript strict / React / Vite / Tailwind / motion/react / zustand（现有）
- 不引入新依赖（文件上传用现有 input[type=file]；识别/解析走现有后端接口）
- 颜色从现有 CSS 变量派生；动效统一 spring（damping 1.0 / response 0.3-0.4；sheet 用 0.8 / 0.3）；遵守 prefers-reduced-motion
- 接口契约（后端已就绪，前端照此对接）：
  - `POST /api/cases/parse-text` body `{ raw_text }` → `{ prefilled: {client_name, lender, loan_amount, property_value, purpose, employment_type, residency, interest_rate, client_goal, special_circumstances}, facts: [...] }`
  - `POST /api/cases/parse-file`（multipart `file`）→ `{ filename, text_preview, prefilled, facts }`
  - `POST /api/cases` body 支持 `employment_type / residency / is_imported / property_value / interest_rate / finance_clause_date / client_goal / special_circumstances / raw_text`（LVR 后端自动算，建档自动预选清单）

## 改动范围（严禁超出）

| 文件 | 操作 |
|------|------|
| src/types/api.ts | 修改：新增 PreFillResponse / ParseFileResponse 类型 |
| src/services/api/cases.ts | 修改：新增 parseCaseText / parseCaseFile |
| src/components/cases/NewCaseSheet.tsx | 新建：统一建案表单 sheet（三种模式 + 文件/识别预填 + 中断恢复） |
| src/components/cases/NewCaseModal.tsx | 修改：移除或降级（入口改指向 NewCaseSheet；若删除需一并清理引用） |
| src/components/layout/AppShell.tsx · src/components/brain/HomePage.tsx · src/components/brain/BrainChat.tsx | 修改：建案触发入口（＋新案件按钮 / 首页快捷 / 全局咨询 new_case chip）统一指向 NewCaseSheet |
| src/components/brain/HomePage.tsx | 修改：今日待办卡片外层去掉 `justify-between`（间距修复） |

⚠️ 严禁修改其他文件；严禁改动后端/接口。

## 一、统一建案表单 sheet（NewCaseSheet.tsx）

### 形态
- Apple 风格底部 sheet：从下往上滑出（spring damping 0.8 / response 0.3，可中断；reduced-motion 退化淡变），遮罩渐变；宽度 max-w-lg 居中于中栏，高度自适应（max-h-[85vh] 内滚动）
- 标题："新建案件" + 模式切换（三个 pill：新客户 / 存量壳 / 历史导入）

### 三种模式
1. **新客户**：必填 7 项（客户姓名/银行/贷款额/房价/用途/收入类型/居住），LVR 随贷款额+房价实时显示（前端算，仅展示）；可选折叠区（利率/Finance 截止日/客户目标/特殊情况/收入描述/是否加急）
2. **存量壳**：三级 tabs——极简（客户名 + 一句话）/ 标准（+ 银行 + 当前阶段 + 一句话）/ 完整（+ 贷款额/收入类型/签证/注意事项）；提交时 `is_imported: true`
3. **历史导入**：同"存量壳-完整"，额外显示"历史导入"标识（is_imported: true）

### 预填入口（sheet 顶部）
- **文件导入口**：拖放/点击上传 1 个文件 → `parseCaseFile(file)` → 成功后把 `prefilled` 填进表单 + 显示 `text_preview` 前 120 字（可展开）+ 提示"解析完成，请核对"；失败 Toast"文件解析失败"
- **一段话识别**：textarea"贴一段客户描述，自动识别填充" + [识别] 按钮 → `parseCaseText(raw_text)` → prefilled 填表 + Toast"识别完成，请核对低置信字段"
- 两种预填后：已填字段标记"AI 填充"（紫色小标），Vera 可修改；必填项校验在提交时

### 提交
- `createCase({ ...表单值, is_imported, raw_text? })` → 成功后：清空 localStorage 草稿 + 自动 setCurrentCase(新案件) + 进入案件对话（onCreated 回调，沿用现有 AppShell 逻辑）
- 必填校验：新客户 7 项必填；存量壳按模式要求；缺项标红提示

### 中断恢复（localStorage）
- 表单值实时写入 `localStorage['caseDraft_v1']`（防抖）；sheet 关闭不清
- 再次打开同一模式 → 检测到草稿 → 顶部提示"检测到未完成草稿，继续？[继续][重新开始]"
- 提交成功清空草稿；V1 不做后端草稿表

## 二、入口统一
- AppShell/首页"新建案件"按钮 → 打开 NewCaseSheet（替代 NewCaseModal）
- 全局咨询 new_case chip（F-6f 已建）→ 打开 NewCaseSheet
- 对话内 AI 检测建档意图（V1：后端 tool 卡或前端关键词，若暂无则暂只靠按钮入口）

## 三、小修复：今日待办间距
- HomePage 今日待办卡片外层：`flex flex-col justify-between h-full min-h-[380px]` → 去掉 `justify-between`（保留 flex-col h-full min-h）；待办列表 `flex-1 max-h-[285px]` 保持——标题栏与列表紧贴，列表占满剩余高度

## 验证
- npx tsc --noEmit → 零错误；npm run build → 成功

## 验收参考（手动）
1. 点"新建案件"（首页/侧栏/全局 chip）→ 底部滑出统一建案 sheet，三模式可切换
2. 新客户模式：必填 7 项 + LVR 实时显示；贴一段话 [识别] → 字段自动填充（AI 填充标记可改）
3. 扔一个 payslip PDF → 解析预填 + text_preview；后端未启动 → Toast 失败不崩溃
4. 存量壳模式：三级切换；提交 is_imported 生效（案件列表可见、全景正常）
5. 中途关闭 sheet → 再开提示"继续？"；提交成功 → 清草稿 + 自动进入新案件对话
6. 今日待办标题与列表间距明显收窄（不再上下拉开）
7. sheet 动画顺滑可中断；reduced-motion 生效

⚠️ 执行纪律：
1. 只修改改动范围表中的文件；不碰后端/接口
2. 不引入新依赖；接口字段名与 WO-18 契约一字不差
3. 动效统一 spring；每步完成运行验证；失败先报告
```

### 上传给 AI Studio 的参考文件（最小集）

```
src/components/cases/NewCaseModal.tsx
src/components/cases/NewCaseFields.tsx
src/components/brain/HomePage.tsx
src/components/brain/BrainChat.tsx
src/components/layout/AppShell.tsx
src/services/api/cases.ts
src/services/http.ts
src/types/api.ts
src/stores/caseStore.ts
src/stores/uiStore.ts
src/stores/toastStore.ts
```

---

## 批 F-6f：全局咨询快捷发问 chips

> 用户确认过但漏实现的点（2026-08-13）：全局咨询空态加快捷发问引导，降低"不知道问什么"的启动成本。V1 空态引导 = 到期查询 / 建案 / 业务统计 / 政策查询 / 写邮件（动作类特殊处理）。

### 提示词正文（复制给 AI Studio）

```
# 任务：Vera Workbench — 全局咨询快捷发问 chips

## 背景
在 ui/vera-工作台 (32) 基础上：全局咨询（无案件）空态目前只有标题 + 引导文字 + 新建案件按钮。
新增一排"快捷发问"chips，让 Vera 一点就能问高频问题；动作类 chip（建案/写邮件）做特殊处理。
只改 BrainChat 空态渲染与少量逻辑，不动后端/接口/路由。

## 技术约束
- TypeScript strict / React / Vite / Tailwind / motion/react / zustand（现有）
- 不引入新依赖；颜色从现有 CSS 变量派生；动效统一 spring（damping 1.0 / response 0.3-0.4）；遵守 prefers-reduced-motion
- 快捷提问走现有 sendChat（case_id 不传 = 全局对话）；不新增接口

## 改动范围（严禁超出）

| 文件 | 操作 |
|------|------|
| src/components/brain/BrainChat.tsx | 修改：全局咨询空态新增快捷发问 chips |

⚠️ 严禁修改其他文件；严禁改动业务逻辑/接口/路由。

## 接口契约

在全局咨询空态（!activeCaseInfo && messages.length === 0）中，"全局咨询模式"标题与引导文字下方、新建案件按钮上方（或下方，以视觉平衡为准），新增 chips 区：

```typescript
type QuickAsk = { label: string; action: 'ask' | 'new_case' | 'compose_email' };

const QUICK_ASKS: QuickAsk[] = [
  { label: '今天有哪些到期/逾期？', action: 'ask' },
  { label: '帮我建一个案件', action: 'new_case' },
  { label: '最近业务怎么样？', action: 'ask' },
  { label: '查一下 CBA 的政策', action: 'ask' },
  { label: '写一封补件邮件', action: 'compose_email' },
];
```

交互：
- `ask`：点击 → 调现有 handleSend（把 label 作为消息发出，case_id 不传 = 全局对话）
- `new_case`：点击 → setNewCaseOpen(true)（弹现有建案表单）
- `compose_email`：点击 → Toast 提示"请先选择左侧案件，进入案件对话后再写邮件"（全局对话禁止外线草稿，#2 红线）

样式：
- chips：`px-3 py-1.5 rounded-full border text-xs font-medium`，背景 var(--bg-card)、边框 var(--border)、文字 text-secondary
- hover：背景 var(--bg-card-hover) + 边框/文字 accent；点击 `whileTap={{ scale: 0.95 }}`；入场 spring 依次淡入（可中断）
- 标题上方小标："💡 快捷提问"（lucide Lightbulb 图标 + text-muted 小字）
- reduced-motion：淡入退化为 opacity

## 验证
- npx tsc --noEmit → 零错误；npm run build → 成功

## 验收参考（手动）
1. 全局咨询（无案件）空态出现 5 个快捷 chips：到期查询/建案/统计/政策/写邮件
2. 点"今天有哪些到期/逾期？" → 消息发出并收到 AI 回复（全局对话，无客户名上下文）
3. 点"帮我建一个案件" → 弹出建案表单
4. 点"写一封补件邮件" → Toast"请先选择左侧案件…"，不发消息
5. 选中案件进入案件对话后 → 快捷 chips 不显示（仅全局空态）
6. chips hover/点击动效顺滑，reduced-motion 生效

⚠️ 执行纪律：
1. 只修改 BrainChat.tsx 一个文件；不碰业务逻辑/接口/路由
2. 不引入新依赖；动效统一 spring；每步完成运行验证；失败先报告
```

### 上传给 AI Studio 的参考文件（最小集）

```
src/components/brain/BrainChat.tsx
src/components/brain/ConfirmCard.tsx
src/services/api/chat.ts
src/stores/uiStore.ts
src/types/api.ts
```

---

## 批 F-6e：主导航上移顶栏（今日工作台 / 全局咨询）

> 用户定稿（2026-08-13）：今日工作台 / 全局咨询 是页面级主入口，放**顶栏搜索栏旁**（全局可见、任何视图可回）；侧栏彻底减负——底部只留 待办·看板·统计·设置 + 更多。侧栏搜索**保留图标式**（不改）。(32) 已实现的阶段节点/筛选 tabs/图标统一保持不动。

### 提示词正文（复制给 AI Studio）

```
# 任务：Vera Workbench — 主导航上移顶栏（F-6e 修正）

## 背景
在 ui/vera-工作台 (32) 基础上：把"今日工作台 / 全局咨询"两个页面级主入口从侧栏底部**移到顶栏**（搜索栏左侧、品牌右侧），
全局可见；侧栏底部只保留 待办·看板·统计·设置 + 更多。侧栏搜索**保留现有图标式**（不删不改）。只改导航结构与样式，不动业务逻辑/接口/路由。

## 技术约束
- TypeScript strict / React / Vite / Tailwind / motion/react / zustand（现有）
- 不引入新依赖；颜色从现有 CSS 变量派生；动效统一 spring（damping 1.0 / response 0.3-0.4）；遵守 prefers-reduced-motion
- 图标一律 lucide，样式与现有底部工具入口一致（无 emoji、无特殊色）

## 改动范围（严禁超出）

| 文件 | 操作 |
|------|------|
| src/components/layout/TopNavBar.tsx | 修改：品牌右侧新增 今日工作台/全局咨询 tabs |
| src/components/brain/CaseListSidebar.tsx | 修改：底部导航移除 今日工作台/全局咨询，只留 SYSTEM_TABS + 更多 |

⚠️ 严禁修改其他文件；严禁改动业务逻辑/接口/路由。

## 一、TopNavBar 新增主导航 tabs
- 品牌区（AI 圆标 + Vera Workbench）右侧、搜索框左侧，加两个紧凑 tabs：
  - **今日工作台**：lucide `Home` 图标 + 文字；点击 `onNavigate('home')`；选中态（activeView==='home'）accent-soft + accent 文字
  - **全局咨询**：lucide `MessageSquare`（或 Sparkles）图标 + 文字；点击 `setCurrentCase(null)` + `onNavigate('brain')`；选中态（activeView==='brain' && currentCase===null）同款
  - 样式：与侧栏底部工具入口一致（text-xs font-bold、p-1.5/px-2.5 rounded-lg、hover 背景、whileTap scale 0.95）
- 搜索框保持居中（如空间紧张，max-w-md 可收窄到 max-w-sm）
- 右侧通知/主题/用户不变

## 二、CaseListSidebar 底部精简
- **移除**底部导航区的 今日工作台 + 全局咨询（展开态行 1 的两列、折叠态的两个图标、相关 Home/Sparkles import 若不再使用一并清理）
- 底部只保留：SYSTEM_TABS（待办·看板·统计·设置，一行横排）+ 更多功能 dropdown（现有样式不动）
- 折叠态：底部只留 SYSTEM_TABS 竖排图标 + 更多
- 侧栏搜索图标式**保留**（不改）；阶段节点/筛选 tabs/案件卡样式全部不动

## 验证
- npx tsc --noEmit → 零错误；npm run build → 成功

## 验收参考（手动）
1. 顶栏：品牌右侧有 [今日工作台][全局咨询] tabs；当前在首页时 今日工作台 高亮；在全局咨询（无案件对话）时 全局咨询 高亮
2. 点击全局咨询 → 进入全局对话（无客户名/无案件上下文），右栏统计面板；再点案件 → 切案件对话，全局咨询 tab 取消高亮
3. 侧栏底部只剩 待办·看板·统计·设置 + 更多（无 今日工作台/全局咨询）
4. 侧栏搜索图标式保留（点 🔍 展开、失焦收起）
5. 折叠侧栏 → 底部只剩 4 入口图标 + 更多；顶栏 tabs 不受影响（全局可见）

⚠️ 执行纪律：
1. 只修改改动范围表中的 2 个文件；不碰业务逻辑/接口/路由
2. 不引入新依赖；图标统一 lucide；动效统一 spring；每步完成运行验证；失败先报告
```

### 上传给 AI Studio 的参考文件（最小集）

```
src/components/layout/TopNavBar.tsx
src/components/brain/CaseListSidebar.tsx
src/types/navigation.ts
src/stores/caseStore.ts
src/stores/uiStore.ts
```

---

## 批 F-6d（最终版）：侧栏架构 + 首页头部 + 动效统一（参考原型 `vera-workbench-—-今日工作台`）

### 提示词正文（复制给 AI Studio）

```
# 任务：Vera Workbench — 侧栏架构重构 + 首页头部精简 + 动效统一（最终版）

## 背景
在 ui/vera-工作台 (31) 基础上做最终修整。核心原则：**侧栏内容在上、导航在下**（案件列表是高频内容区，页面入口是低频导航）；
全部导航图标统一一套 lucide 样式（无 emoji、无特殊色）；案件搜索保留在侧栏但图标化；顶栏搜索下拉改干净。
只改布局/样式/微交互，不动业务逻辑、接口、props、路由。

## 技术约束
- TypeScript strict / React / Vite / Tailwind / motion/react / zustand（现有）
- 不引入新依赖；颜色从现有 CSS 变量派生；动效统一 motion/react spring（damping 1.0 / response 0.3-0.4），可中断；遵守 prefers-reduced-motion
- 不复制原型写死色（bg-gray-100 等）与硬编码日期

## 改动范围（严禁超出）

| 文件 | 操作 |
|------|------|
| src/components/layout/TopNavBar.tsx | 修改：品牌保留；搜索下拉改干净单列 |
| src/components/brain/CaseListSidebar.tsx | 修改：架构重构（内容上导航下）+ 图标统一 + 搜索图标化 + 阶段节点 |
| src/components/brain/HomePage.tsx | 修改：头部精简（日期放大、去早安/badge）+ 卡片动效统一 |
| src/components/brain/GlobalStatsPanel.tsx · TodoCard.tsx · BrainChat.tsx | 修改：统一卡片 hover/按压微交互（只改样式） |

⚠️ 严禁修改其他文件；严禁改动业务逻辑/接口/路由。

## 一、侧栏架构：内容在上、导航在下（核心重构）

最终结构（自上而下）：

```
┌───────────────────────┐
│ 案件          [🔍]     │  ← 分组标题 + 搜索图标（点击展开输入框）
│ [全部|紧急|递交中]      │  ← 筛选 tabs
│ 案件卡片列表（滚动主区）│  ← 主内容，占大部分高度
├───────────────────────┤
│ 今日工作台 · 全局咨询   │  ← 底部固定导航区：一行 2 个
│ 待办 · 看板 · 统计 · 设置 │  ← 一行 4 个
│ ▾ 更多                 │  ← 知识中心/草稿箱/档案库/导入历史/数据迁移
└───────────────────────┘
```

1. **去品牌行**：侧栏顶部不再放 "Vera Workbench"（顶栏已有品牌）；直接以"案件"分组标题开头，标题行右侧放折叠按钮 + 搜索图标
2. **今日工作台 / 全局咨询 移到底部导航区**（不再压在案件上方）：与待办·看板·统计·设置同区，分两行（首页/全局一行，系统四入口一行），全部图标风格统一
3. **案件列表为主内容**：筛选 tabs（全部/紧急/递交中）+ 案件卡列表，占据主要高度；折叠态（60px）保留图标入口

## 二、导航图标统一（全部一套 lucide 样式）

- **去掉** 今日工作台 / 全局咨询 的 emoji 前缀（🏠/💬）与特殊色（amber 房子、purple 火花）
- 统一为 lucide 图标 + 同一按钮样式：尺寸 w-4、默认 text-secondary、hover 背景、选中态 accent-soft + 指示条（与待办·看板·统计·设置完全一致）
- 图标选择：今日工作台 = `Home`（或 `LayoutDashboard`），全局咨询 = `MessageSquare`（或 `Sparkles`）——与底部四入口同质感

## 三、搜索：侧栏图标化 + 顶栏下拉优化

### 侧栏（案件搜索最自然，保留但压缩）
- "案件"标题右侧放 🔍 搜索图标（Search 图标按钮）
- 点击展开为输入框（聚焦保持展开，失焦或再点图标收起）；展开时下方筛选 tabs 保持
- 折叠态（60px）：不显示搜索，仅图标入口

### 顶栏全局搜索下拉（改干净，去掉满屏高亮框）
- 单列结果面板：每行 = 客户名 + 银行徽章 + 阶段；**只有 hover 的那一行淡色高亮**（不是整面板多框高亮）
- 最多 6 条；无结果显示"没有匹配结果"空态
- 交互：Enter 跳第一条、Esc 关闭、点击外部关闭、输入时聚焦框细 ring（现有样式保留）

## 四、案件列表卡片：阶段关键节点
- 在案件卡"客户名/银行"下方，把单条阶段文字升级为**紧凑阶段进度**：
  - 关键节点：建档 → 收集 → 递交 → 补件 → 批准 → 结算（6 个节点）
  - 呈现：一排小圆点/短段条，当前节点高亮（accent），已过节点实心、未到节点空心/弱化；下方保留当前阶段中文小字
  - 映射：根据 c.stage 关键词定位（含"建档/收集/准备"→收集；"递交/审贷/评估"→递交；"补件"→补件；"批准/预批"→批准；"结算/交割"→结算；默认建档）
  - 折叠态（60px）不显示节点，保留首字母头像

## 五、首页头部精简（参考原型）
- **去掉**："早安，Vera！今日业务概览"主标题、"Vera 经纪人工作台"紫色 badge
- **日期放大为主标题**：`{todayDateStr}` 用 text-2xl/3xl font-extrabold tracking-tight（参考原型 h1）
- 日期下方保留一行 muted 概览："今天有 N 个紧急待办 · 到期预警 · 银行审贷回复待处理"
- 快捷操作（新建案件/写邮件/统计视图）保留在右侧，与放大日期对齐（视觉平衡、不拥挤）
- 顶部到期/逾期提醒条保留

## 六、卡片动效统一（参考原型，全页面统一规范）
- **统计卡 / 小组件卡**（HomePage 4 统计卡、快捷看板卡、专家贴士卡；GlobalStatsPanel 数字卡）：hover 抬升 `whileHover={{ y: -2 }}` + 阴影加深（shadow-sm→shadow-md，用现有 --shadow-* 变量），spring 可中断
- **今日待办卡**（HomePage 待办行、TodoCard）：hover 边框高亮（逾期 `hover:border-red-400`，普通 `hover:border-[var(--accent)]`）+ 轻微抬升；点击回弹 `whileTap={{ scale: 0.98 }}`
- **可点按钮/入口**（侧栏入口、快捷操作、工具卡）：统一 `whileTap={{ scale: 0.96-0.97 }}` 点击回弹 + hover 过渡（transition-colors/opacity）
- 统一到全部页面（BrainChat 工具卡/建议卡、侧栏案件卡/入口、首页全部卡片），保证交互手感一致
- reduced-motion：所有抬升/回弹退化为透明度变化（现有 useReducedMotion 模式）

## 验证
- npx tsc --noEmit → 零错误；npm run build → 成功
- 后端未启动/接口失败 → 页面不崩溃

## 验收参考（手动）
1. 侧栏自上而下：案件区（标题+🔍+筛选 tabs+列表）→ 底部导航（今日工作台·全局咨询 / 待办·看板·统计·设置 / 更多）；**案件上方没有任何页面入口**
2. 全部导航图标统一 lucide 样式（无 emoji、无特殊色），选中态一致
3. 案件标题旁 🔍 点击展开搜索框、失焦收起；顶栏搜索下拉单列干净、仅 hover 行高亮、Enter/Esc/外点可用
4. 案件卡有 6 节点阶段进度，当前阶段高亮；折叠态正常
5. 首页头部：大日期为主标题，无"早安/工作台 badge"，不拥挤
6. 所有卡片 hover 抬升/边框高亮、点击回弹，动效一致可中断；reduced-motion 生效

⚠️ 执行纪律：
1. 只修改改动范围表中的文件；不碰业务逻辑/接口/路由
2. 不引入新依赖；颜色走现有变量；动效统一 spring 规范
3. 每步完成运行验证；失败先报告
```

### 上传给 AI Studio 的参考文件（最小集）

```
src/components/layout/TopNavBar.tsx
src/components/brain/CaseListSidebar.tsx
src/components/brain/HomePage.tsx
src/components/brain/GlobalStatsPanel.tsx
src/components/brain/TodoCard.tsx
src/components/brain/BrainChat.tsx
src/themes/tokens.css
src/stores/caseStore.ts
```

> 参考原型（仅设计参考）：`ui/vera-workbench-—-今日工作台` 的 `HomePage.tsx`（日期块 + 卡片动效）与 `LeftSidebar.tsx`（底部导航/图标风格）。

---

## 批 F-6c：首页融合（原型设计 × 主前端数据）+ 侧栏布局修整

> 参考独立原型 `ui/vera-workbench-—-今日工作台`（固定顶栏、Bento 统计卡、快捷看板、专家贴士、待办筛选 tabs、底部 4 入口），把它的**设计模式**融合进主前端 `ui/vera-工作台 (29)`（已接真实 store/接口），并修整侧栏布局。**只借鉴设计与组件模式，不复制其单文件 store/写死颜色/硬编码日期；数据一律走主前端现有服务层。**

### 提示词正文（复制给 AI Studio）

```
# 任务：Vera Workbench — 首页融合 + 侧栏布局修整（F-6c）

## 背景
主前端（ui/vera-工作台 (29)）已有 HomePage（接真实数据：taskStore / getOverview / caseStore / sendChat）和左栏 4 入口（待办·看板·统计·设置），但：
① 没有固定顶栏 → 仍是"网页感"；② 首页缺信息密度与小组件；③ 侧栏布局拥挤、无分区、入口层级混乱。
另有一个独立设计原型 `ui/vera-workbench-—-今日工作台`，其固定顶栏、Bento 统计卡、快捷看板、专家贴士、待办筛选 tabs、底部导航分组值得借鉴。
本次：把原型的设计模式**融合**进主前端，并修整侧栏布局。**只借鉴设计与组件模式；不复制原型的 store 单文件结构、写死颜色或硬编码日期；所有数据走主前端现有服务层。**

## 技术约束
- TypeScript strict / React 18 / Vite / Tailwind CSS / motion/react / zustand（现有技术栈）
- **不引入任何新的 npm 依赖**（图标用现有 lucide-react；不引入图表/插画库）
- 不修改后端、不新增接口；数据只用现有：`useTaskStore`（待办）、`getOverview`（统计数字）、`useCaseStore`（案件）、`sendChat`（对话）
- 颜色从现有 CSS 变量派生（--bg-app/--bg-panel/--bg-card/--border/--text-primary/--text-muted/--accent 等）；可在 tokens.css 补材质变量，禁止新色板；**不用原型里的写死色（bg-gray-100 等）**
- 动效：motion/react spring，默认阻尼 1.0 / response 0.3-0.4，可中断；遵守 prefers-reduced-motion / prefers-reduced-transparency
- 固定栏可用玻璃材质（backdrop-filter）增强应用感，注意可读性
- 保留现有三栏（案件对话 + 客户全景 + 全局咨询 + 统计面板）全部可用

## 一、固定顶栏（新增，解决"网页感"）

新建 `src/components/layout/TopNavBar.tsx`，AppShell 顶部固定（h-14，玻璃：`backdrop-blur` + 半透明背景，z 高于内容；主内容区在顶栏下方滚动）：
- 左侧：品牌区——AI 圆标（渐变）+ 应用名 "Vera Workbench"（点击回首页 home）
- 中部：全局搜索框（可搜索案件/客户，回车跳对应案件对话；V1 本地过滤案件列表即可）
- 右侧：通知铃铛（未读数角标；点开下拉面板：通知列表 + 全部已读；无通知显示空态）——数据可先用现有 useNotifications/taskStore 推导或 mock 分支
- 主题切换（亮/暗）、用户信息（Vera 头像 + 名称）
- 折叠/移动端不处理（桌面优先）

## 二、首页融合（改造现有 HomePage.tsx，保留真实数据）

结构自上而下：
1. **到期/逾期提醒条**（保留现有）：琥珀/红、脉冲点、"查看逾期待办"、可关闭
2. **日期 + 业务概览行**（保留现有）：今天日期 + "今天 N 个待办 · N 个到期/逾期 · 银行回复待处理"
3. **快捷操作**（保留现有 3 个）：新建案件（主按钮）/ 写邮件（预填对话）/ 统计视图
4. **Bento 统计数字卡**（对齐原型样式）：4 卡——活跃案件 / 本月新增 / 已递交 / 预估佣金；label 大写 tracking、数值 2xl bold、hover 阴影（数据 getOverview）
5. **主内容区（Bento 双栏）**：
   - 左栏（span 2）**今日待办**：筛选 tabs（全部 / 逾期 / AI 建议，带数量）+ 排序（逾期→优先级→截止日，已完成沉底）+ 行设计（逾期红标"已逾期 N 天"/AI 建议蓝标/常规灰标 + 标题 + 客户·银行·说明 + 截止日 + 优先级色）；点击 → 跳对应案件对话（setCurrentCase + view=brain）；空态（图标 + 主副文案）
   - 右栏（span 1）**Bento 小组件**：
     - **快捷看板**：案件按阶段分组（资料收集/银行递交/预批批复/待结算）进度条（数量 + 百分比条，来自 useCaseStore 案件 stage 统计）+"进入完整看板 →"按钮
     - **Vera 专家小贴士**：渐变高亮卡（indigo），AI 建议一句（可先用现有 AI 建议文案/mock 占位，标注 TODO 接真实建议）
6. **首页对话入口**（保留现有 handleStartChat → 预填 pendingChatPrompt → 跳 brain）

## 三、侧栏布局修整（CaseListSidebar.tsx）

目标：分区清晰、入口分组、间距舒适、风格统一：
1. **品牌行**（顶部）：Vera Workbench + 折叠按钮（保留）
2. **案件区**（独立分组，加小标题"案件"）：
   - 筛选 tabs：全部 / 紧急 / 递交中（本地过滤，选中态 accent）
   - 搜索框 + 新案件按钮（保留现有）
   - 案件卡片列表（保留现有：客户名/银行/阶段/清单进度条）
3. **底部固定导航区**（分隔线以上，两小组）：
   - 组 1（对话/首页）：🏠 今日工作台 · 💬 全局咨询
   - 分隔线
   - 组 2（系统）：待办 · 看板 · 统计 · 设置（4 入口）
   - 更多功能 ▾（知识中心/草稿箱/档案库/导入历史/数据迁移）
4. **统一细节**：全部图标用 lucide（去掉 🏠/💬 emoji 前缀）；间距放宽（p-2.5/p-3、space-y-1）；选中态 accent-soft + 左侧 3px 指示条；折叠态（60px）只留图标 + title tooltip，底部导航图标居中

## 产出物
- 新建 src/components/layout/TopNavBar.tsx；AppShell 挂载（home 与 brain 视图共用）
- 改造 src/components/brain/HomePage.tsx（保留真实数据，补 Bento/小组件/tabs）
- 改造 src/components/brain/CaseListSidebar.tsx（分区 + 分组 + 去 emoji + 间距 + 折叠态）
- 需要时可补 tokens.css 材质/指示条变量

## 验证
- npx tsc --noEmit → 零错误；npm run build → 成功
- 后端未启动/接口失败 → 页面不崩溃，合理降级（沿用现有 mock 兜底）

## 验收参考（手动）
1. 打开软件 → 固定顶栏（玻璃）存在，品牌/搜索/通知/主题/用户齐全；主内容在顶栏下方滚动
2. 首页：提醒条 + 日期概览 + 快捷操作 + 4 统计卡 + 今日待办（tabs 可切换、逾期红、点击跳案件对话）+ 快捷看板进度条 + 专家贴士 + 底部对话可开聊
3. 侧栏：案件区独立分组（标题 + 筛选 tabs）；底部导航分两小组（首页/全局 + 待办/看板/统计/设置）；无 emoji 混搭；间距舒适
4. 折叠侧栏 → 图标 + tooltip 正常；展开/折叠动画顺滑可中断
5. 点击通知 → 下拉面板；主题切换正常；reduced-motion 生效
6. 旧三栏（案件对话/全景/全局咨询/统计面板）不受影响

⚠️ 执行纪律：
1. 只修改上表/产出物提到的文件；严禁改动其他文件（业务逻辑/接口/路由不动）
2. 不引入新依赖；不复制原型写死色/硬编码日期/mock 单文件 store
3. 数据一律走主前端现有 store/services；每步完成运行验证；失败先报告
4. 动效统一 spring（damping 1.0 / response 0.3-0.4），可中断，遵守 reduced-motion
```

### 上传给 AI Studio 的参考文件（最小集）

```
src/App.tsx
src/components/layout/AppShell.tsx
src/components/brain/HomePage.tsx
src/components/brain/CaseListSidebar.tsx
src/components/brain/BrainChat.tsx
src/components/brain/CasePanorama.tsx
src/components/brain/GlobalStatsPanel.tsx
src/stores/caseStore.ts
src/stores/taskStore.ts
src/stores/uiStore.ts
src/stores/modeStore.ts
src/services/api/tasks.ts
src/services/api/analytics.ts
src/services/api/chat.ts
src/types/api.ts
src/themes/tokens.css
```

> 另附参考：独立原型 `ui/vera-workbench-—-今日工作台` 的 `src/components/TopNavBar.tsx`、`src/components/brain/HomePage.tsx`、`src/components/LeftSidebar.tsx`（仅作设计参考，不照抄代码）。

---

## 批 F-6：首页（今日工作台）界面设计

> 用户定调：现在默认页"像网页、不正式"——顶栏/侧边栏直接铺内容、没有固定栏。首页要像**桌面应用**：固定应用框架 + 信息密度 + AI First 对话入口。本批**不锁死布局与视觉**，让 AI Studio 自由发挥，功能要求必须全覆盖；产出后先评审再定稿。

### 提示词正文（复制给 AI Studio）

```
# 任务：Vera Workbench — 首页（今日工作台）界面设计

## 设计目标（请认真体会）
产品是一个贷款经纪人的"案件大脑"桌面工作台（Windows 桌面应用方向）。现在默认页"像网页、不正式"：
顶部和侧边栏直接铺内容、没有固定栏、没有应用框架感。
请设计一个**像正式桌面应用主页**的界面——有明确的固定顶栏/侧边栏/主内容区骨架，
一打开就能看到"今天要干什么、业务怎么样"，同时**对话仍然是核心入口**（AI First）。
视觉与布局自由发挥，但下面这些**功能要求必须全部覆盖**，一个都不能少。

## 功能要求（必须全覆盖）

1. **固定应用框架**（解决"网页感"）：
   - 顶部固定栏：应用名称/Logo、全局搜索（可选）、通知铃铛（有未读提示）、主题切换、用户信息（Vera）
   - 左侧固定导航：案件列表（可按客户/银行搜索）+ 底部固定入口
   - 主内容区：随下方模块滚动，但顶栏/侧边栏始终固定
   - 参考观感：桌面 IM/工作台应用（如 Slack/Notion/微信桌面版），不是网页长页面
2. **今日概览区**（主内容最上方）：
   - 今天日期 + 一句业务概览（如"今天 3 个待办 · 2 个到期 · 1 个银行回复待处理"）
   - 3-4 个关键数字卡：活跃案件 / 新增 / 递交 / 佣金（数据来自现有统计接口）
3. **今日待办列表**（核心区）：
   - 跨案件汇总的待办（手动任务 + AI 建议待确认），按到期时间排序，**到期/逾期优先并标红"已逾期 N 天"**
   - 每条显示：客户名 + 银行 + 待办标题 + 优先级徽章 + 截止日
   - 点击任意一条 → 进入对应案件的对话（可继续处理）
4. **到期/逾期提醒条**：今天/本周有到期事项时，顶部一条琥珀/红色提醒条（可关闭）
5. **快捷操作区**：新建案件 / 写邮件 / 查看统计 三个主按钮（图标 + 文字）
6. **对话入口（AI First）**：首页必须保留"直接和 AI 说话"的入口——可以是主内容区底部的常驻对话输入框，也可以是显眼的"开始对话"主按钮；你说她可以随时开聊，不一定要先点案件
7. **案件入口**：左侧案件列表点击 → 进入该案件的对话 + 客户全景（右栏）
8. **左侧底部固定入口**（4 个）：**待办 · 看板 · 统计 · 设置**（知识中心收起，进入"设置"里的能力中心；草稿箱等低频入口放"更多"）

## 技术约束（必须遵守）
- TypeScript strict / React 18 / Vite / Tailwind CSS / motion/react / zustand（现有技术栈）
- **不引入任何新的 npm 依赖**（图标用现有 lucide-react；不引入图表/插画库）
- 不修改后端、不新增接口——只使用现有 API：`GET /api/tasks`（待办）、`GET /api/analytics/overview`（概览数字）、案件列表（现有 store）、对话（现有 sendChat）
- 颜色从现有 CSS 变量派生（--bg-app/--bg-panel/--bg-card/--border/--text-primary/--text-muted/--accent 等）；可在 tokens.css 加材质变量，禁止新色板
- 动效：motion/react spring，默认临界阻尼（damping 1.0 / response 0.3-0.4），可中断；遵守 prefers-reduced-motion / prefers-reduced-transparency
- 固定栏可用玻璃材质（backdrop-filter）增强"应用感"，但注意可读性（禁止浅玻璃叠浅玻璃）
- 现有三栏（案件对话 + 客户全景）要保留可用：点击案件/待办跳回对应案件对话视图

## 产出物
- 新建首页组件（建议 src/components/brain/HomePage.tsx 或你更合适的命名/结构）
- 接管"打开软件默认视图"（AppShell 默认渲染首页；点案件/待办再进对话视图，可保留返回）
- 左栏底部入口修正为：待办 · 看板 · 统计 · 设置（+ 更多：草稿箱/档案库/导入历史/数据迁移）
- 空态：无待办/无案件时给出友好空态（图标 + 文案 + 主操作）

## 验证
- npx tsc --noEmit → 零错误；npm run build → 成功
- 数据缺失/后端未启动时（真实接口失败）页面不崩溃，显示合理降级

## 验收参考（手动）
1. 打开软件 → 第一眼是"正式的应用主页"：固定顶栏 + 固定侧边栏 + 有信息密度的主内容区，不是网页长页面
2. 今日概览数字正确；待办按到期排序、逾期标红；点待办 → 跳到对应案件对话
3. 到期提醒条出现/可关闭；快捷操作可点击（新建案件弹表单、统计进统计页）
4. 对话入口明显可用（直接开聊能收到 AI 回复）
5. 左栏底部 4 入口：待办 · 看板 · 统计 · 设置；知识中心不再出现在主入口
6. 空态不丑；动画顺滑可中断；reduced-motion 生效

⚠️ 说明：本次是**设计批次**，布局/视觉你有自由；但 8 条功能要求 + 技术约束是硬性的，完成时逐条对照自查。
```

### 上传给 AI Studio 的参考文件（最小集）

```
src/App.tsx
src/components/layout/AppShell.tsx
src/components/brain/CaseListSidebar.tsx
src/components/brain/BrainChat.tsx
src/components/brain/CasePanorama.tsx
src/components/brain/GlobalStatsPanel.tsx
src/components/brain/TodoCard.tsx
src/stores/caseStore.ts
src/stores/taskStore.ts
src/stores/uiStore.ts
src/stores/modeStore.ts
src/services/api/tasks.ts
src/services/api/analytics.ts
src/services/api/chat.ts
src/types/api.ts
src/themes/tokens.css
```

---

## 批 F-4：Apple 风格视觉打磨（全项目统一）

> 依据项目 `apple-design` skill（WWDC 流体界面/材质/排版规范）。目标：去掉"临时感"——建立材质层次、排版层级、统一动效与微交互，并把旧页面（任务工作台/看板/统计/设置）统一进同一视觉语言。**只改视觉与交互，不改任何业务逻辑与接口。**

### 提示词正文（复制给 AI Studio）

```
# 任务：Vera Workbench — F-4 Apple 风格视觉打磨（全项目统一）

## 背景
当前界面"临时感"来自：平铺卡片+细边框无层次、字号几乎全是 text-xs 无层级、动效参数不统一、
hover/按压/焦点态缺失、空态只有文字、旧页面与新三栏风格混搭。本次按 Apple 设计规范统一：
① 材质层次（玻璃/阴影/层次）② 排版层级（光学字号/字距/行高）③ 动效（临界阻尼 spring、可中断、进出同路径）
④ 微交互（pointer-down 反馈、hover 抬升、焦点环）⑤ 空态插画 ⑥ 旧页面视觉统一。

## 技术约束
- 前端：TypeScript strict / React 18 / Vite / Tailwind CSS / motion/react（现有版本）
- 禁止：引入任何新的 npm 依赖（空态插画用 lucide-react 图标组合 + 渐变，不引入图片/插画库）
- 禁止：修改任何业务逻辑、接口、props 契约、页面路由；只改 className/样式/动画/文案层级
- 颜色：一律从现有 CSS 变量派生（--bg-app/--bg-panel/--bg-card/--border/--text-primary/--text-muted/--accent 等），可在 tokens.css 新增**材质/层级变量**（玻璃背景、阴影、模糊），禁止引入新色板
- 字体：系统字体栈（现有），不引入新字体
- 动效：统一 motion/react spring——默认 **damping 1.0 / response 0.3-0.4（临界阻尼，无过冲）**；抽屉/弹层/拖拽释放等动量交互 **damping 0.8 / response 0.3**；全部可中断、从当前值继续；遵守 prefers-reduced-motion（退化为 opacity 交叉淡变）

## 改动范围（严禁超出）

| 文件 | 操作 |
|------|------|
| src/themes/tokens.css | 修改：新增材质/层级/焦点变量（玻璃、阴影阶梯、blur、ring） |
| src/index.css | 修改：排版基础（系统字体、字距/行高工具、焦点可见性、reduced-motion/transparency/contrast 媒体查询） |
| src/components/layout/AppShell.tsx | 修改：三栏层次 + 玻璃顶栏 + 滚动边缘渐变（只改样式） |
| src/components/brain/CaseListSidebar.tsx | 修改：玻璃材质 + hover/press/焦点态 + 文字层级 |
| src/components/brain/BrainChat.tsx | 修改：消息气泡层次、输入条玻璃、工具卡/横幅材质、按压反馈 |
| src/components/brain/CasePanorama.tsx | 修改：分区层级、待办卡/风险卡 hover、事实折叠动效（spring 统一） |
| src/components/brain/GlobalStatsPanel.tsx | 修改：数字卡层级/间距/趋势条视觉 |
| src/components/brain/SubmissionBanner.tsx | 修改：横幅材质（amber 玻璃）与进出动效（同路径） |
| src/components/brain/DraftCard.tsx · ConfirmCard.tsx · RecordedEventsDrawer.tsx · TodoCard.tsx · RiskSection.tsx · FactCard.tsx · CompletionHint.tsx | 修改：统一材质/层级/hover/按压（每个组件只改样式） |
| src/pages/TaskWorkbench.tsx · CaseBoard.tsx · Analytics.tsx · Settings.tsx | 修改：顶栏/卡片/按钮统一到新视觉语言（**只改样式，零逻辑**） |
| src/components/ui/Toast.tsx | 修改：Toast 玻璃材质 + 进出动效（同路径、可中断） |
| src/components/cases/NewCaseModal.tsx | 修改：sheet 玻璃材质 + 弹簧上滑（damping 0.8 / response 0.3）+ 遮罩渐变 |

⚠️ 严禁修改上表以外的文件。严禁改动任何业务逻辑、接口、props、路由。严禁删除/重命名现有文件。

## 设计规范（必须遵守，来自 apple-design skill）

### 材质与层次（§12）
1. **中栏保持实底浅色**（信息密集区，避免玻璃干扰阅读）；**左/右栏与顶栏、弹层、抽屉、Toast 用玻璃**：`backdrop-filter: blur(20px) saturate(180%)` + 半透明背景（从现有色板派生，如 `rgba(var(--bg-panel-rgb), 0.6)`）
2. **材质重量编码层级**：结构性区域（侧栏）用较重玻璃；交互元素（按钮/卡片）用轻表面；**禁止浅玻璃叠浅玻璃**（可读性崩塌）
3. **大表面更厚**：弹层/抽屉 blur 更强 + 阴影更深；上下文感知阴影（浮在内容上阴影重，浮在空白上阴影轻）
4. **滚动边缘效果替代硬分割线**：粘性头/浮动条与内容交接处用渐变遮罩（模糊/渐隐），不是 1px 边框
5. **材质化而不是纯淡入**：玻璃表面进出时 blur 半径与 scale 一起动（像真实材质到达），不是单纯 opacity
6. 玻璃上文字：更高对比、略重字重、+0.01em 字距（vibrancy 保可读）

### 排版（§15）
7. 层级用**字重+字号+行高组合**，不单靠字号：标题（font-extrabold + 负字距 -0.01~-0.02em + 行高 1.1-1.2）；正文（默认字重 + 字距 0 + 行高 1.5-1.6）；小字/标签（font-medium + 字距 +0.01~0.02em）
8. 字号阶梯收敛为 3-4 档（如 13/14/15/20），删除零散 text-[10px]/[11px]（muted 标签除外）
9. 尊重用户文本大小（尽量 rem/em，不用纯 px 撑布局）

### 动效与微交互（§1/§3/§7）
10. **反馈在 pointer-down**：可点元素 `:active { transform: scale(0.97) }`（100ms ease-out）；hover 抬升（translateY(-1px) + 阴影加深，spring 可中断）
11. 弹层/抽屉/横幅：**进出同路径**（从右滑入 → 向右滑出；从下上滑 → 向下退出）；锚定触发源（transform-origin 指向触发按钮）
12. 默认 spring 临界阻尼（damping 1.0 / response 0.3-0.4）；抽屉/sheet/Toast 动量交互 damping 0.8 / response 0.3；全部可中断、从当前 on-screen 值继续
13. 焦点可见性：键盘焦点有清晰 ring（2px accent + offset 2px），不破坏视觉

### 可访问性（§14）
14. `@media (prefers-reduced-motion: reduce)` → 滑动/弹簧退化为 200ms opacity 交叉淡变，禁弹性过冲
15. `@media (prefers-reduced-transparency: reduce)` → 玻璃退化为实底（背景不透明、去 blur）
16. `@media (prefers-contrast: more)` → 近实底背景 + 明确对比边框

### 空态（无新依赖）
17. 三个空态（全局咨询/无案件全景/无待办）升级：lucide 图标组合（大图标 + 渐变圆底）+ 主文案（bold）+ 副文案（muted）+ 主操作按钮，居中、间距平衡

## 实施步骤

### Step 1：基础令牌
- [ ] src/themes/tokens.css：新增材质/阴影/ring 变量（玻璃背景、--shadow-1/2/3、--blur-glass、--ring）
- [ ] src/index.css：排版基础 + 焦点可见性 + 3 组媒体查询（reduced-motion/transparency/contrast）

### Step 2：三栏骨架材质
- [ ] AppShell/CaseListSidebar/BrainChat/CasePanorama：按规范 1-6、10-13 应用材质/层次/微交互（只改样式）

### Step 3：组件统一
- [ ] 其余 brain 组件 + Toast + NewCaseModal：材质/动效统一（规范 1-13）

### Step 4：旧页面视觉统一
- [ ] TaskWorkbench/CaseBoard/Analytics/Settings：顶栏/卡片/按钮对齐新视觉语言（只改样式）

### Step 5：空态 + 验证
- [ ] 三个空态按规范 17 升级
- [ ] npx tsc --noEmit → 零错误；npm run build → 成功

## 验收标准（手动）
1. 左/右栏与顶栏呈玻璃质感（背景内容模糊透出），中栏清晰实底；无"浅玻璃叠浅玻璃"
2. 标题/正文/标签字距行高有明确层级；无零散 text-[10px]
3. 按钮按压瞬间有 scale 反馈；hover 有抬升；键盘 Tab 有焦点环
4. 抽屉/横幅/Toast 进出同路径、可中途反方向抓回；默认无过冲（弹层/抽屉有轻微回弹可接受）
5. 开启系统"减少动态效果" → 全部退化为淡变；"降低透明度" → 玻璃变实底
6. 三个空态有图标插画 + 层级文案，不丑不空
7. 旧页面（任务工作台/看板/统计/设置）顶栏卡片与三栏视觉一致，不突兀
8. 暗色/亮色主题切换后玻璃材质正常（变量派生，不破色）

⚠️ 执行纪律：
1. 只修改改动范围表中的文件，绝不碰其他文件
2. **严禁改动任何业务逻辑、接口、props、路由**——本次是纯视觉/交互层
3. 不引入新依赖（尤其不引入插画/图表/字体库）
4. 颜色只用现有变量派生；每步完成运行验证；失败先报告
5. 动效统一 spring（默认 damping 1.0 / response 0.3-0.4；抽屉/弹层 0.8 / 0.3），可中断，遵守 reduced-motion
```

### 上传给 AI Studio 的参考文件（最小集）

```
src/themes/tokens.css
src/index.css
src/components/layout/AppShell.tsx
src/components/brain/CaseListSidebar.tsx
src/components/brain/BrainChat.tsx
src/components/brain/CasePanorama.tsx
src/components/brain/GlobalStatsPanel.tsx
src/components/brain/SubmissionBanner.tsx
src/components/brain/DraftCard.tsx
src/components/brain/ConfirmCard.tsx
src/components/brain/RecordedEventsDrawer.tsx
src/components/brain/TodoCard.tsx
src/components/brain/RiskSection.tsx
src/components/brain/FactCard.tsx
src/components/brain/CompletionHint.tsx
src/components/ui/Toast.tsx
src/components/cases/NewCaseModal.tsx
src/pages/TaskWorkbench.tsx
src/pages/CaseBoard.tsx
src/pages/Analytics.tsx
src/pages/Settings.tsx
```

---

## 批 F-3b：右栏重构为"案件指挥中心"

> 依据 2026-08-12 定稿（#15 三件事：卡在哪一步/下一步/有没有坑；#4 待办；#11 全景待办卡；#1 右栏=AI 知道什么）。右栏从"事实看板"改为"指挥中心"：待办最优先 → 风险/坑 → 时间线 → 补全进度 → 事实折叠；**移除记一笔**；老 Kanban 案件看板入口收进"更多"。递交模式联动外线视图仍留后续（依赖 WO-18 后）——本批右栏固定内线。

### 提示词正文（复制给 AI Studio）

```
# 任务：Vera Workbench — F-3b 右栏重构为"案件指挥中心"

## 背景
在 F-1~F-3（ui/vera-工作台 (26)）基础上重构右栏 CasePanorama。产品定稿：右栏是"AI 知道什么"的可视化，
但 Vera 每天打开案件第一眼要的是——现在卡在哪一步、下一步该干什么、有没有坑（#15），不是事实明细。
新结构（自上而下）：
① 客户名 + 阶段 + 一句话摘要（卡在哪一步）→ ② 待办/下一步（最核心）→ ③ 风险/坑 → ④ 最近时间线（压缩）→ ⑤ 补全进度灰提示 → ⑥ "查看全部事实"折叠区。
同时：移除右栏"记一笔"（对话里直接说）；老"案件看板"入口从主 Tab 收进"更多"。

## 技术约束
- 前端：TypeScript strict / React 18 / Vite / Tailwind CSS / motion/react / zustand（现有版本）
- 图标：lucide-react（现有）；Toast：useToastStore（现有）
- 禁止：引入任何新的 npm 依赖；禁止修改后端；禁止改动现有页面逻辑（Analytics/TaskWorkbench 等只读）
- 样式：一律使用项目现有 CSS 变量（var(--bg-app)/var(--bg-panel)/var(--bg-card)/var(--border)/var(--text-primary)/var(--text-muted)/var(--accent) 等），不新增配色；优先级色用现有语义（urgent=red/amber，high=amber，normal=默认）
- 动画：motion/react spring（damping 1.0 / response 0.3-0.4），可中断；遵守 prefers-reduced-motion

## 改动范围（严禁超出）

| 文件 | 操作 |
|------|------|
| src/components/brain/TodoCard.tsx | 新建：单条待办卡 |
| src/components/brain/RiskSection.tsx | 新建：风险/坑区 |
| src/components/brain/CasePanorama.tsx | 修改：重排为指挥中心结构 + 事实折叠 + 移除记一笔 + 待办加载 |
| src/components/brain/CaseListSidebar.tsx | 修改：案件看板入口从主 Tab 收进"更多" |

⚠️ 严禁修改上表以外的文件。严禁删除/重命名现有文件。严禁改动后端。

## 接口契约

1. TodoCard.tsx：
   - props: `{ task: TaskResponse; onOpen: (taskId: number) => void }`（TaskResponse 用现有 types/api.ts 类型）
   - 渲染：标题（task.title）+ priority 徽章（urgent→红/high→琥珀/normal→默认 muted）+ deadline（"8/18 到期"或"已逾期 N 天"红字）+ suggested_action 摘要（单行截断）
   - 点击 → onOpen(task.id)；hover 抬升（transform + shadow，spring 可中断）
2. RiskSection.tsx：
   - props: `{ risks: string[]; specialCircumstances?: string; hasUndisclosed: boolean }`
   - 渲染：标题"风险与注意事项"；risks 逐条（AlertCircle 图标，红/琥珀）；specialCircumstances 非空时追加一条（信息图标，muted）；hasUndisclosed=true 时顶部 amber 小条"⚠️ 含未披露事项（递交前需确认）"
   - risks 与 special 均空且无未披露 → 渲染 null（不占位）
3. CasePanorama.tsx 重构（保留折叠/宽度动画/context 加载/刷新逻辑）：
   - **新结构顺序**：
     1. 顶部客户名 + 阶段徽章 + 一句话摘要（context.memory 或 summary，单行截断）——保留现状
     2. "下一步"区：标题 + 待办列表（TodoCard）；数据 = getTasks({ filter: 'all' }) 后按 task.case_id === caseId 过滤，取前 5 条；无待办 → 空态小字"暂无待办"；加载骨架 2 行；mock 分支 MOCK_TASKS（2 条，1 条 urgent 逾期）
     3. RiskSection（数据 = context.risk + context.facts.special_circumstances + hasUndisclosed=BrainFact 存在 category==='disclosure' 且 key 含 undisclosed）
     4. "最近动态"时间线（现有 OverviewTimeline，压缩显示，保持原逻辑）
     5. 补全进度灰提示（现有 CompletionHint，保留）
     6. "查看全部事实"折叠区（AnimatePresence）：默认收起，点开展示现有事实分组（FactCard 列表）；展开/收起 spring 可中断
   - **移除**：右栏"记一笔"输入区及其 createContextEvent 调用（对话里记录）
   - 无案件（caseId=null）→ 保持空态（全局统计面板由 AppShell 处理，不在本组件）
4. CaseListSidebar.tsx：
   - BOTTOM_TABS 移除 `{ id: 'cases', label: '案件看板', icon: Briefcase }`（Briefcase import 一并删除）
   - MORE_ITEMS 开头加入 `{ id: 'cases' as ViewId, label: '案件看板', icon: Briefcase }`（icon 复用，若已删 import 则加回）
   - 其余 Tab/更多项不动

## 实施步骤

### Step 1：TodoCard + RiskSection
- [ ] 新建 src/components/brain/TodoCard.tsx（契约 1）
- [ ] 新建 src/components/brain/RiskSection.tsx（契约 2）

### Step 2：CasePanorama 重构
- [ ] src/components/brain/CasePanorama.tsx：按契约 3 重排（保留折叠/context/刷新/时间线/补全进度；移除记一笔；加待办加载 + 事实折叠）

### Step 3：看板入口收进"更多"
- [ ] src/components/brain/CaseListSidebar.tsx：BOTTOM_TABS 移除 cases、MORE_ITEMS 加入 cases（契约 4）

### Step 4：验证
- [ ] npx tsc --noEmit → 零错误
- [ ] npm run build → 成功

## 验收标准（手动）
1. 打开某案件 → 右栏自上而下：客户名/阶段/摘要 → "下一步"待办 → 风险 → 最近动态 → 补全进度 → 事实折叠
2. 待办卡显示 priority 徽章 + 截止日；逾期任务红字"已逾期 N 天"；无待办显示"暂无待办"
3. 有未披露事实（mock）→ 风险区顶部 amber 提示"含未披露事项"
4. 事实区默认收起；点"查看全部事实" → 展开事实分组；再点收起，动画顺滑可中断
5. 右栏**不再有"记一笔"输入框**
6. 左栏底部主 Tab 无"案件看板"；点"更多" → 列表里有"案件看板"可进入旧页
7. 折叠右栏仍可用；无案件空态正常；后端未启动（真实分支失败）→ Toast + mock 兜底不崩溃

⚠️ 执行纪律：
1. 只修改改动范围表中的文件，绝不碰其他文件
2. 接口名/props/字段名严格按契约，一个字符不改
3. 不引入新依赖；不改动现有页面内部逻辑（时间线/刷新/折叠/context 加载保持原样）
4. 每完成一步运行验证；失败先报告，不自作主张修计划外代码
5. 动画一律 spring（damping 1.0 / response 0.3-0.4），可中断，遵守 prefers-reduced-motion
```

### 上传给 AI Studio 的参考文件（最小集）

```
src/types/api.ts
src/services/api/tasks.ts
src/services/api/cases.ts
src/components/brain/CasePanorama.tsx
src/components/brain/CaseListSidebar.tsx
src/components/brain/FactCard.tsx
src/components/brain/CompletionHint.tsx
src/components/cases/overview/OverviewTimeline.tsx
src/stores/taskStore.ts
src/stores/caseStore.ts
src/stores/toastStore.ts
```

---

## 批 F-5：全局咨询右栏 — 统计分析面板

> 无案件（全局咨询）时，右栏不再空态，显示"业务概览"统计面板：概览数字 + 迷你趋势 + AI 用量；切到案件恢复客户全景。后端依赖：现有 analytics 端点 + WO-17 usage 端点（WO-17 交付前 mock 兜底）。

### 提示词正文（复制给 AI Studio）

```
# 任务：Vera Workbench — F-5 全局咨询右栏统计分析面板

## 背景
在 F-1~F-3（ui/vera-工作台 (26)）基础上：全局咨询（无选中案件）时，右栏 CasePanorama 目前是空态。
改为渲染"业务概览"统计面板（GlobalStatsPanel）：概览数字（活跃/新增/递交/批准/佣金）+ 迷你趋势（pipeline）+ AI 用量；
选中案件时右栏恢复客户全景。她大部分时间在全局聊天，右栏给业务全貌，点数字可进完整统计页。

## 技术约束
- 前端：TypeScript strict / React 18 / Vite / Tailwind CSS / motion/react / zustand（现有版本）
- 图标：lucide-react（现有）；Toast：useToastStore（现有）
- 禁止：引入任何新的 npm 依赖（**不引入图表库**，趋势用纯 div 高度条）；禁止修改后端；禁止改动现有页面逻辑
- 样式：一律使用项目现有 CSS 变量（var(--bg-app)/var(--bg-panel)/var(--bg-card)/var(--border)/var(--text-primary)/var(--text-muted)/var(--accent) 等），不新增配色
- 动画：motion/react spring（damping 1.0 / response 0.3-0.4），可中断；遵守 prefers-reduced-motion

## 改动范围（严禁超出）

| 文件 | 操作 |
|------|------|
| src/types/api.ts | 修改：新增 AnalyticsUsage / UsagePeriod 类型 |
| src/services/api/analytics.ts | 修改：新增 getUsage（mock 兜底） |
| src/components/brain/GlobalStatsPanel.tsx | 新建：全局统计面板 |
| src/components/layout/AppShell.tsx | 修改：brain 视图右栏按有无案件条件渲染 |

⚠️ 严禁修改上表以外的文件。严禁删除/重命名现有文件。严禁改动后端。

## 接口契约

1. types/api.ts 新增（对齐后端 WO-17 AnalyticsUsageResponse）：
   ```typescript
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
   ```
2. services/api/analytics.ts 新增：
   ```typescript
   export async function getUsage(granularity: Granularity): Promise<AnalyticsUsage> {
     // mock 分支返回 MOCK_USAGE（current.calls=38, cost_usd≈2.4, cache_hit_rate=0.72 等合理值）；
     // 真实分支 GET /api/analytics/usage?granularity=...；失败回退 mock
   }
   ```
3. GlobalStatsPanel.tsx：
   - props: `{ onNavigate: (v: ViewId) => void }`（ViewId 从 types/navigation 导入）
   - 顶部：标题"业务概览" + 天/周/月切换（三个 pill，选中态 accent，复用现有 Granularity 类型）
   - **概览数字区**（getOverview）：6 个数字卡（活跃案件 / 新增 / 递交 / 批准 / 结算 / 佣金），每卡：label + 数值 + 变化箭头（trend up/down/flat 用 ArrowUpRight/ArrowDownRight 图标）+ compare_label 小字；网格 2 列
   - **迷你趋势区**（getPipeline，buckets=5）：标题"近期走势"；用纯 div 柱状条展示最近 5 桶 new_cases / submitted / approved（每组 3 根细柱，高度按最大值归一化；hover 显示数值 title）
   - **AI 用量区**（getUsage）：标题"AI 用量"；一行小字：`调用 {calls} 次 · {cost_usd}$ · 缓存命中 {cache_hit_rate%}`；`corrected_count > 0` 时加"已纠正 {n} 次"（muted）
   - 底部：[查看完整统计] 按钮（onNavigate('analytics')）
   - 加载中：骨架闪烁；失败：Toast + 显示 mock 数据（沿用现有 getOverview 等"失败回退 mock"模式）
4. AppShell.tsx（brain 视图三栏右栏）：
   - 原 `caseId={currentCase?.caseId ?? null}` 的 CasePanorama 改为条件渲染：
     ```tsx
     {currentCase ? (
       <CasePanorama caseId={currentCase.caseId} collapsed={panoramaCollapsed} onToggle={...} />
     ) : (
       <GlobalStatsPanel onNavigate={(v) => setView(v)} />
     )}
     ```
   - 右栏折叠按钮仍只对 CasePanorama 生效（全局统计面板不折叠，V1）
   - 其余渲染零改动

## 实施步骤

### Step 1：类型 + API
- [ ] src/types/api.ts：AnalyticsUsage / UsagePeriod（契约 1）
- [ ] src/services/api/analytics.ts：getUsage（契约 2）

### Step 2：GlobalStatsPanel
- [ ] 新建 src/components/brain/GlobalStatsPanel.tsx（契约 3；不引入图表库）

### Step 3：AppShell 条件渲染
- [ ] src/components/layout/AppShell.tsx：右栏按 currentCase 有无切换（契约 4）

### Step 4：验证
- [ ] npx tsc --noEmit → 零错误
- [ ] npm run build → 成功

## 验收标准（手动）
1. 全局咨询（无案件）→ 右栏显示"业务概览"：6 个数字卡 + 近期走势柱状 + AI 用量 + [查看完整统计]
2. 天/周/月切换 → 数字与走势随粒度刷新（mock 数据各有不同）
3. 点 [查看完整统计] → 进入完整 Analytics 页
4. 点击左栏案件 → 右栏切换为客户全景；返回全局 → 恢复统计面板
5. 趋势柱状 hover 显示数值；加载有骨架；后端未启动（真实分支失败）→ Toast + mock 兜底不崩溃
6. 动画 spring 可中断；prefers-reduced-motion 生效

⚠️ 执行纪律：
1. 只修改改动范围表中的文件，绝不碰其他文件
2. 接口名/props/字段名严格按契约，一个字符不改
3. 不引入新依赖（尤其不引入图表库）；不改动现有页面内部逻辑（Analytics 页不动）
4. 每完成一步运行验证；失败先报告，不自作主张修计划外代码
5. 动画一律 spring（damping 1.0 / response 0.3-0.4），可中断，遵守 prefers-reduced-motion
```

### 上传给 AI Studio 的参考文件（最小集）

```
src/types/api.ts
src/types/navigation.ts
src/services/api/analytics.ts
src/services/http.ts
src/components/brain/CasePanorama.tsx
src/components/layout/AppShell.tsx
src/pages/Analytics.tsx
src/stores/caseStore.ts
src/stores/toastStore.ts
```

---

## 批 F-2b：中栏递交模式 + 草稿卡骨架

> 配对后端 **WO-16**（submission_suggest 卡 + ChatRequest.track 已就绪）。本批：递交模式横幅（中栏常驻 + 手动切换）、建议卡（点进入递交模式）、草稿卡组件骨架（mock 渲染，payload 契约对齐 WO-18 预留）。同时建立 `modeStore`（全局递交模式状态，供 F-3b 右栏联动）。

### 提示词正文（复制给 AI Studio）

```
# 任务：Vera Workbench — F-2b 中栏递交模式 + 草稿卡骨架

## 背景
在 F-1~F-3（ui/vera-工作台 (26)）基础上：
① 中栏 BrainChat 增加"递交模式"横幅（#9：手动切换为主、黄色横幅常驻、AI 建议进入）；
② 对话流渲染 submission_suggest 工具卡（点 [进入递交模式] → 切模式）；
③ 草稿卡组件骨架（DraftCard，mock 渲染，payload 契约对齐后端 WO-18 预留）；
④ 新建全局 modeStore（zustand）——递交模式状态，供右栏 F-3b 联动预留。

## 技术约束
- 前端：TypeScript strict / React 18 / Vite / Tailwind CSS / motion/react / zustand（现有版本）
- 图标：lucide-react（现有）；Toast：useToastStore（现有）
- 禁止：引入任何新的 npm 依赖；禁止修改后端；禁止改动现有页面逻辑
- 样式：一律使用项目现有 CSS 变量（var(--bg-app)/var(--bg-panel)/var(--bg-card)/var(--border)/var(--text-primary)/var(--text-muted)/var(--accent) 等），不新增配色；递交横幅黄色用 amber（现有 amber-500 系，禁止引入新色板）
- 动画：motion/react spring（damping 1.0 / response 0.3-0.4），可中断；遵守 prefers-reduced-motion

## 改动范围（严禁超出）

| 文件 | 操作 |
|------|------|
| src/stores/modeStore.ts | 新建：全局递交模式状态 |
| src/types/api.ts | 修改：ToolCard / DraftPayload / SubmissionSuggestPayload 类型 |
| src/services/api/chat.ts | 修改：sendChat 支持 track 参数 |
| src/components/brain/SubmissionBanner.tsx | 新建：递交模式横幅 |
| src/components/brain/DraftCard.tsx | 新建：草稿卡骨架（mock 渲染） |
| src/components/brain/BrainChat.tsx | 修改：挂横幅 + 建议卡 + 草稿卡 + 发送带 track |

⚠️ 严禁修改上表以外的文件。严禁删除/重命名现有文件。严禁改动后端。

## 接口契约

1. modeStore.ts（zustand）：
   ```typescript
   interface ModeState {
     mode: 'internal' | 'external';              // 默认 'internal'
     setMode: (m: 'internal' | 'external') => void;
   }
   export const useModeStore = create<ModeState>()(...);
   ```
2. types/api.ts 新增（对齐后端 ToolCard / WO-18 预留）：
   ```typescript
   export interface ToolCard {
     type: 'record_confirm' | 'draft' | 'submission_suggest' | 'flow';
     title: string;
     payload: Record<string, unknown>;
   }
   export interface DisclosureItem { fact_key: string; text: string; disclosed: boolean; }
   export interface DraftPayload {
     subject?: string;
     body: string;
     disclosure: { needs_review: boolean; items: DisclosureItem[] };
   }
   export interface SubmissionSuggestPayload { message: string; }
   ```
3. services/api/chat.ts：`sendChat({ message, case_id, track })`，`track?: 'internal' | 'external'`（追加到现有 body，默认 internal，不破坏既有调用）。
4. SubmissionBanner.tsx：
   - props 无（读 useModeStore）；mode==='external' 时渲染黄色横幅（amber 底 + 边框）：
     "🟡 递交模式：AI 只引用已披露/外线内容" + 右侧 [退出递交] 按钮（setMode('internal')）
   - mode==='internal' → 渲染 null
   - 横幅顶部一行、可关闭（退出即 internal）；spring 上下滑入/滑出（可中断）
5. DraftCard.tsx：
   - props: `{ draft: DraftPayload; clientName: string; lender: string }`
   - 渲染：标题（subject 或 "邮件草稿"）+ body（多行可展开）+ 披露清单区：
     - needs_review=true 且存在 disclosed=false 项 → 黄色提示"以下信息未标记可披露：fact_key 列表"（amber，不弹窗）
     - 全部披露 → 绿色小标"✅ 披露检查通过"
   - 底部操作按钮（V1 占位）：[翻译英文] [复制] → Toast"WO-18 后可用"（真实逻辑等后端 draft_email）
   - 客户名确认行（#9 外线强制确认）："收件客户：{clientName}（{lender}）" 常驻显示
6. BrainChat.tsx 修改（只加不改既有逻辑）：
   - 引入 useModeStore：发送时 `sendChat({ message: text, case_id: caseId ?? undefined, track: mode })`
   - 顶部（header 之下）挂 `<SubmissionBanner />`；**仅 caseId 非空时渲染**（全局对话无外线草稿，#2）
   - 对话流渲染 tool_cards：
     - type==='submission_suggest' → 建议卡：payload.message + [进入递交模式]（→ setMode('external') + Toast"已进入递交模式"）
     - type==='draft' → `<DraftCard draft={payload} clientName={...} lender={...} />`（从当前案件取 clientName/lender；无案件不渲染）
   - mock 分支：MOCK_TOOL_CARDS = 1 张 submission_suggest + 1 张 draft（draft payload 含 needs_review=true + 1 条 disclosed=false）
   - 无案件（caseId=null）→ 不渲染横幅、不渲染 draft 卡；suggest 卡 mock 也不显示

## 实施步骤

### Step 1：store + 类型 + API
- [ ] src/stores/modeStore.ts（契约 1）
- [ ] src/types/api.ts：ToolCard / DraftPayload / SubmissionSuggestPayload（契约 2）
- [ ] src/services/api/chat.ts：sendChat 加 track（契约 3）

### Step 2：SubmissionBanner
- [ ] 新建 src/components/brain/SubmissionBanner.tsx（契约 4）

### Step 3：DraftCard
- [ ] 新建 src/components/brain/DraftCard.tsx（契约 5）

### Step 4：BrainChat 挂载
- [ ] src/components/brain/BrainChat.tsx：横幅 + 建议卡 + 草稿卡 + track 发送（契约 6）

### Step 5：验证
- [ ] npx tsc --noEmit → 零错误
- [ ] npm run build → 成功

## 验收标准（手动）
1. 打开某案件 → 中栏顶部**无**递交横幅（默认内线）；点左栏案件正常
2. mock 分支：对话流出现"要进入递交模式吗？"建议卡 → 点 [进入递交模式] → 顶部出现黄色横幅"递交模式：AI 只引用已披露/外线内容"
3. 横幅 [退出递交] → 横幅消失、恢复内线
4. 递交模式下发送消息 → 网络请求 body 含 `track: "external"`（可 DevTools 验证）
5. mock 分支：建议卡下方出现一张草稿卡（含未披露黄色提示 + 客户名确认行 + [翻译英文][复制] 占位 Toast）
6. 全局咨询（无案件）→ 无横幅、无建议卡、无草稿卡
7. 切换案件/刷新 → mode 保持（zustand 内存态即可，V1 不持久化）
8. 动画 spring 可中断；prefers-reduced-motion 生效

⚠️ 执行纪律：
1. 只修改改动范围表中的文件，绝不碰其他文件
2. 接口名/props/字段名严格按契约，一个字符不改
3. 不引入新依赖；不改动现有页面内部逻辑
4. 每完成一步运行验证；失败先报告，不自作主张修计划外代码
5. 动画一律 spring（damping 1.0 / response 0.3-0.4），可中断，遵守 prefers-reduced-motion
```

### 上传给 AI Studio 的参考文件（最小集）

```
src/stores/uiStore.ts
src/stores/caseStore.ts
src/types/api.ts
src/services/api/chat.ts
src/components/brain/BrainChat.tsx
src/components/brain/ConfirmCard.tsx
src/components/brain/FactCard.tsx
src/components/brain/RecordedEventsDrawer.tsx
src/components/layout/AppShell.tsx
```

---

## 批 F-3：右栏客户全景实化（事实卡 + 补全进度）

> 配对后端 **WO-15 BrainFact**（GET /api/cases/{id}/facts 已就绪）。待办卡拆到 F-3b（需先确认 tasks 端点契约）；**递交模式联动外线视图拆到 F-3b**（需模式状态 store，F-2b 建立）——右栏 V1 固定内线视图，不做常驻内外线切换（#9 定稿：内外线是**中栏递交模式**的横幅交互，不是右栏手动切换）。

### 提示词正文（复制给 AI Studio）

```
# 任务：Vera Workbench — F-3 右栏客户全景实化（事实卡 + 补全进度）

## 背景
在 F-1/F-2（ui/vera-工作台 (25)）基础上，实化右栏 CasePanorama：
① 从 GET /api/cases/{id}/facts 加载当前有效 BrainFact，按类别分组渲染为事实卡；
② 显示"补全进度"灰提示（缺收入/就业/负债/身份等关键类时，灰色一行，不打扰）。
时间线、记一笔、刷新按钮保留（复用现有 OverviewTimeline / context 加载逻辑）。

## 内外线说明（重要）
右栏 V1 **固定内线视图**（track="internal"，只显示真实情况），不做常驻内外线切换按钮。
递交模式（外线视图）由**中栏 BrainChat 的递交模式横幅**（F-2b）激活后联动切换，本批不做。
API 的 track 参数保留（listBrainFacts 已支持），为 F-3b 联动预留，本批调用时固定传 internal。

## 技术约束
- 前端：TypeScript strict / React 18 / Vite / Tailwind CSS / motion/react（现有版本）
- 图标：lucide-react（现有）；状态：zustand（现有）；Toast：useToastStore（现有）
- 禁止：引入任何新的 npm 依赖；禁止修改后端；禁止改动现有页面逻辑（TaskWorkbench 等只读）
- 样式：一律使用项目现有 CSS 变量（var(--bg-app)/var(--bg-panel)/var(--bg-card)/var(--border)/var(--text-primary)/var(--text-muted)/var(--accent) 等），不新增配色
- 动画：motion/react spring（damping 1.0 / response 0.3-0.4），可中断；遵守 prefers-reduced-motion

## 改动范围（严禁超出）

| 文件 | 操作 |
|------|------|
| src/types/api.ts | 修改：新增 BrainFact 接口 |
| src/services/api/cases.ts | 修改：新增 listBrainFacts |
| src/components/brain/FactCard.tsx | 新建：单条事实卡 |
| src/components/brain/CompletionHint.tsx | 新建：补全进度灰提示 |
| src/components/brain/CasePanorama.tsx | 修改：事实卡区 + 补全进度挂载（track 固定 internal） |

⚠️ 严禁修改上表以外的文件。严禁删除/重命名现有文件。严禁改动后端。

## 接口契约

1. BrainFact 接口（types/api.ts，对齐后端 BrainFactResponse）：
   ```typescript
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
   }
   ```
2. services/api/cases.ts 新增：
   ```typescript
   export function listBrainFacts(
     caseId: string,
     params?: { track?: 'internal' | 'external' },
   ): Promise<BrainFact[]>;
   ```
3. FactCard.tsx：
   - props: `{ fact: BrainFact; categoryLabel: string }`
   - 渲染：key 中文标签（映射表见下）+ value + conflict 时右侧 "⚠️ 已更新/冲突" 角标（amber）
   - 布局：一行 label（text-muted 小字）+ value（text-primary）；卡片 bg-card 边框 border
4. CompletionHint.tsx：
   - props: `{ missingCategories: string[] }`
   - 无缺失 → 渲染 null；有缺失 → 一行灰色提示："补全进度：还缺 收入、签证、负债"（muted 小字，非红色、不弹窗、可点击展开说明）
5. CasePanorama.tsx 修改（只加不改既有逻辑）：
   - **不做内外线切换 UI**：本批 track 固定 `'internal'`（context 走现有 getCaseContext 默认值，facts 调 `listBrainFacts(caseId, { track: 'internal' })`）；注释标明"递交模式联动外线视图留 F-3b（模式状态 store 就绪后接入）"
   - 事实卡区：facts 按 category 分组，组标题用中文映射：
     identity→身份 / income→收入 / employment→就业 / property→房产 / loan→贷款 /
     liability→负债 / bank→银行 / stage→阶段 / commitment→承诺 / disclosure→披露 / special→特殊情况
     每组下渲染 FactCard 列表；空组不显示
   - 补全进度：V1 前端内置关键类集合 `{ income, employment, liability, identity }`（注释：V1 内置，后续可后端化）；
     该 category 在 facts 中无任何有效事实 → 计入 missingCategories（identity 提示文案用"签证/身份"）
   - mock 分支：VITE_USE_MOCK !== 'false' 时用 MOCK_FACTS（含 bank.lender=CBA、stage.current、一条 conflict 事实）+ MOCK_MISSING（["income","liability"]）
   - 无案件（caseId=null）→ 事实区/切换/补全均空态，不加载
   - 保留：时间线、记一笔输入、刷新按钮、折叠（现有逻辑不动）

## 实施步骤

### Step 1：类型 + API
- [ ] src/types/api.ts：新增 BrainFact 接口（契约第 1 条）
- [ ] src/services/api/cases.ts：新增 listBrainFacts（契约第 2 条）

### Step 2：FactCard
- [ ] 新建 src/components/brain/FactCard.tsx（契约第 3 条）

### Step 3：CompletionHint
- [ ] 新建 src/components/brain/CompletionHint.tsx（契约第 4 条）

### Step 4：CasePanorama 实化
- [ ] src/components/brain/CasePanorama.tsx：事实分组 + 补全进度挂载（track 固定 internal，不做切换 UI）（契约第 5 条）

### Step 5：验证
- [ ] npx tsc --noEmit → 零错误
- [ ] npm run build → 成功

## 验收标准（手动）
1. 打开某案件 → 右栏显示事实卡分组（银行/阶段/收入等按需），无空组
2. 有冲突事实 → 该卡片显示 ⚠️ 角标
3. 缺收入/负债的客户 → 顶部一行灰色"补全进度：还缺 收入、负债"（不红、不弹窗）
4. 右栏**无内外线切换按钮**（V1 固定内线视图）；external 内容不出现在右栏（红线）
5. 全局咨询（无案件）→ 右栏空态，不报错
6. mock 分支：显示 2-3 张事实卡（含 1 张冲突）+ 补全提示
7. 折叠按钮仍可用；动画顺滑可中断；prefers-reduced-motion 生效
8. 后端未启动（真实分支报错）→ Toast 提示，页面不崩溃

⚠️ 执行纪律：
1. 只修改改动范围表中的文件，绝不碰其他文件
2. 接口名/props/字段名严格按契约，一个字符不改
3. 不引入新依赖；不改动现有页面内部逻辑（时间线/记一笔/刷新/折叠保持原样）
4. 每完成一步运行验证；失败先报告，不自作主张修计划外代码
5. 动画一律 spring（damping 1.0 / response 0.3-0.4），可中断，遵守 prefers-reduced-motion
```

### 上传给 AI Studio 的参考文件（最小集）

```
src/types/api.ts
src/services/api/cases.ts
src/services/http.ts
src/components/brain/CasePanorama.tsx
src/components/brain/BrainChat.tsx
src/components/cases/overview/OverviewFacts.tsx
src/components/cases/overview/OverviewTimeline.tsx
src/components/panel/details/BrainPanel.tsx
src/stores/caseStore.ts
src/stores/toastStore.ts
```

---

# F-15：WO-27 共创 Dialog 卡片 + WO-28 技能中心（前端批次）

> 后端契约已冻结（WO-26b/26c/27/28 验收通过，全量 843 测试全绿）。本批次只做前端，禁止改后端。

## 一、共创 Dialog 卡片（WO-27）

1. 新增三种流程卡类型渲染：`flow_followup` / `flow_chaser` / `flow_os_reply`，`presentation=dialog`，payload 遵循 DraftCardPayload 契约：
   `{ schema_version, card_type, action, state:{version,branch_label,message_id}, result:{versions:[{subject,body,version,branch_label,message_id}]}, status }`
2. 弹窗深谈交互：
   - 展示 subject + body（英文正文，可编辑）
   - V1/V2/V3 版本链：点"生成下一版" → 以当前 message_id 为 parent_message_id 重跑（action=version）
   - 方案对比：branch_label A/B 分支（action=branch）
   - "确认此版本" → action=confirm → 卡片 status=confirmed_draft，内容进草稿箱（DraftCard 出口，**只出草稿，绝不发送**）
   - 重跑机制：操作提交 = 发一条新对话消息携带结构化参数（`$arg.action` / `$arg.parent_message_id` / `$arg.branch_label` / `$arg.recipient_hint`），后端走 chat → match_flow → run_flow 返回新卡片，前端**替换旧卡片**（不做实时双向绑定/流式）
3. payload 版本兼容：按 schema_version 降级渲染，老卡片不白屏
4. 红线 UI：任何地方不出现"发送"按钮，只有"确认 / 保存草稿"

## 二、技能中心（WO-28）

1. 设置页新增"技能中心"入口，对接 `/api/skills`：
   - 列表（category/status 筛选）、详情（含版本）、创建草稿（draft，Vera 手动）
   - 激活（仅 Vera 操作；draft 不可触发）、停用、回滚（选目标版本）
   - AI 提议（created_by=ai_propose 的 draft）：展示理由 + 查看/修改/确认激活/拒绝
2. 状态呈现：draft（灰）/ active（绿）/ deprecated（暗），版本号 + 历史版本可回滚
3. 人闸：draft 永不参与触发；激活必须显式确认；拒绝可填反馈
4. 内置技能（config/agent_flows 6 个流程包）只读展示，不可编辑

## 三、约束

- 只改前端（ui/vera-工作台 (N)），不碰 server/ 后端；接口契约以本文件 + server/api/schemas.py 为准
- 卡片交互沿用现有 tool_cards 渲染体系，扩展而非重写
- 自测：三触发语（跟进邮件 / 催件 / OS 回复）弹出 dialog 卡、V1→V2 版本链、确认进草稿箱；技能中心 CRUD + 人闸闭环
---

# F-15 补丁：真实后端对接（AI Studio）

> 背景：F-15 UI 已完成（ui/vera-工作台 (40)），但**真实后端对接未打通**（mock 模式默认开掩盖了问题）。后端已补齐（e995c91，全量 855 测试全绿），本批次只改前端。

## 后端已就绪的契约（自包含，无需访问后端文件）

> 完整契约另见 docs/前端API契约快照.md——**把快照整份粘贴给 AI Studio 即可**。以下为关键契约内嵌：

1. `POST /api/agent/cards/action` — 卡片动作通道
   body: `{"flow_key": "followup|chaser|os_reply", "case_id"?, "action": "new|version|branch|confirm", "parent_message_id"?, "branch_label"?, "recipient_hint"?, "extra"?}`
   返回：`{reply, tool_cards:[ToolCard(payload=DraftCardPayload)], recorded_facts, presentation}`
   DraftCardPayload：`{schema_version:1, card_type:"draft_email", action, status:"draft"|"confirmed_draft", state:{version, branch_label, message_id}, result:{versions:[{subject, body, version, branch_label, message_id}]}}`
2. `PUT /api/skills/{key}` — 更新草稿（仅 draft）body `{"manifest": SkillManifest, "reason"?: str}`；非 draft → 422
3. `POST /api/skills/{key}/reject` — 拒绝 AI 提议 body `{"reason"?: str}`；无 AI 提议 → 404
4. 既有：`GET /api/skills?category=&status=`、`GET /api/skills/{key}`、`POST /api/skills`（body `{manifest, reason}`，201 draft）、`POST /api/skills/propose`（body `{manifest, reason必填, scope?}`）、`POST /api/skills/{key}/activate`（body `{version, operator:"vera"}`，非 vera → 403）、`POST /api/skills/{key}/deactivate?version=`、`POST /api/skills/{key}/rollback`（body `{target_version}`）
5. `SkillResponse` 字段：`key,name,description,version,category(agent|tool|flow|knowledge),triggers[],presentation,permission,inputs,outputs,steps,assets,confirm_required,status(draft|active|deprecated),author,db_id?,created_by?,reason?`；内置=`created_by==="system"`，AI 提议=`created_by==="ai_propose"`
6. `SkillManifest` 字段：`key,name,description?,version?,category?,triggers?,presentation?,permission?,inputs?,outputs?,steps:[{tool,params?,output?}],assets?,confirm_required?,status?,author?`；白名单工具：`declaration_check/calculator_assess/policy_check/context_event_write/draft_email`

## 要改的前端

1. `src/services/api/skills.ts`（真实模式对齐，mock 保留）：
   - `activateSkill(key, version)` → POST `/api/skills/{key}/activate` body `{version, operator:"vera"}`
   - `deactivateSkill(key, version)` → POST `/api/skills/{key}/deactivate?version=...`
   - `rollbackSkill(key, target_version)` → body `{target_version}`（不是 version）
   - `rejectSkillProposal(key, reason)` → POST `/api/skills/{key}/reject` body `{reason}`
   - `updateSkillDraft(key, manifest)` → PUT `/api/skills/{key}` body `{manifest}`
   - `createSkillDraft` → POST `/api/skills` body `{manifest:{key,name,description,version,category,triggers,presentation,permission,steps,assets,confirm_required}, reason}`
   - SkillItem 字段对齐后端 SkillResponse：`key/name/description/version/category(agent|tool|flow|knowledge)/status(draft|active|deprecated)/triggers/presentation/permission/steps/assets/confirm_required/db_id/created_by/reason`；前端展示层自行映射（`is_builtin` 用 `created_by==='system'` 推断；`versions` 历史列表可由列表接口返回的多版本记录组装）
2. `src/components/brain/BrainChat.tsx`：
   - `FlowDialogCard.onActionSubmit` 改为调 `POST /api/agent/cards/action`（flow_key 映射 card.type；action=version/branch 带 parent_message_id/branch_label；confirm 带 parent_message_id）→ 用返回的新卡片**替换旧卡片**
   - confirm 成功后同步刷新草稿箱视图（或提示已入草稿箱）
3. 红线保持：无发送按钮；确认只进草稿箱

## 自测（关 mock：VITE_USE_MOCK=false）

- 三张卡（跟进/催件/OS 回复）V1 → 生成下一版(V2) → 方案 B → 确认进草稿箱，链路全通
- 技能中心：创建草稿 / 编辑草稿 / 激活（人闸确认） / 停用 / 回滚 / AI 提议拒绝（带理由）
- 后端响应字段缺啥补啥时，先看 server/api/schemas.py，不要改后端
---

# F-16：案件文件夹关联（WO-29 前端）

> 后端已就绪（901 全绿）。本批次只改前端；契约内嵌如下，另把 docs/前端API契约快照.md 一并粘贴给 AI Studio。

## 一、建档时关联文件夹
- 建档表单（NewCaseModal/NewCaseSheet）新增"案件文件夹"区块：
  - 方式选择：自动创建（默认） / 选择已有
  - 自动创建：提示"将按 broker/client/case 命名自动建标准子目录（_Inbox / Send to Lender / Don't send 等）"；建档后调 `POST /api/cases/{id}/folder` body `{"mode":"auto"}`
  - 选择已有：输入/粘贴相对路径（相对 CLIENT_FILES_ROOT），调 body `{"mode":"existing","path":"..."}`；422 时展示后端 detail（越界/穿越/目录不存在/缺 path）
- 建档响应含 `folder_path`，展示在案件详情

## 二、案件详情显示
- CaseDetail/DetailPanel 显示：关联文件夹路径 + 状态（已关联 ✅ / 未关联）；未关联时提供"关联文件夹"入口（同上两种方式）
- 契约：`POST /api/cases/{id}/folder` → 200 `{case_id, folder_path, mode}`；404 无案件；422 越界/穿越/目录不存在/缺 path

## 三、红线
- 只读展示路径；不提供任何文件操作按钮（移动/改名/删除一律不做）；不做文件扫描
---

# F-17：三档渐进前端（WO-31 自动发现 / WO-32 按需取 / WO-33 主动预判）

> 后端已就绪（901 全绿）。本批次只改前端；契约内嵌如下，另把 docs/前端API契约快照.md 一并粘贴。

## 一、发现提醒（WO-31）
- 监听 SSE 事件 `file_discovered`（数据：`{case_id, file_id, original_name, doc_type, matched[]}`）
- 通知中心（NotificationBell）显示"材料到了：{original_name}（已自动匹配清单 / 待确认）"
- 高置信自动匹配时：案件清单对应项显示"已收（自动）"徽标 + **撤销**按钮 → `POST /api/cases/{id}/folder-files/{file_id}/revoke` → 刷新清单
- 低置信仅提醒，不自动匹配（显示"待确认"）

## 二、folder_lookup 结果卡（WO-32）
- 渲染 `flow_folder_lookup`（result_card，payload：`{files:[{rel_path,size,mtime,doc_type}]}`）
- 卡片内"解析"按钮 → 触发对应文件解析，展示脱敏摘要（结果卡更新）
- 触发语"去案件文件夹找 X"→ 后端路由 folder_lookup 流程包

## 三、gap_analysis 缺口卡（WO-33）
- 渲染 `flow_gap_analysis`（result_card，payload：`{missing[], matched[], suggestions[], summary}`）
- 展示缺口列表（缺什么 / 原因）+ 建议（draft 标记），按钮"生成建议清单"→ 草稿出口
- 触发语"缺什么材料 / 材料缺口 / 主动预判"

## 四、红线
- 所有卡片无"发送"按钮；提醒/建议均为只读呈现 + 草稿出口；文件操作只读（无移动/改名/删除）
---

# F-18：全局咨询右栏统计分析

> 后端已就绪（GET /api/analytics/overview|pipeline|lenders|efficiency，契约见前端API契约快照第 4 节）。本批次只改前端。

## 一、右栏统计分析面板（全局咨询无案件时）
- 概览卡：活跃案件 / 新增案件 / 递交 / 批准 / 结算 / 佣金估算 / 完成任务（overview current vs previous，标注环比 ▲▼）
- Pipeline 漏斗：各阶段数量 + 金额（默认近 6 个月、月粒度，可切 天/周/月 + buckets）
- 银行表现：案件数 / 平均批准天数 / OS 率 / 批准率（lenders）
- 效率：完成任务 / 准时率 / 清单确认率 / AI 采纳数 / 客户平均回复天数（efficiency current vs previous）
- 空库显示 0 或 —，不报错

## 二、布局
- 跟随现有右栏风格（可折叠/展开）；不阻塞对话；数据刷新：进入面板时拉取一次 + 手动刷新按钮
---

# F 批次状态勘误（2026-08-14）

> 当前生效前端目录：`ui/vera-工作台 (33)`（AI Studio 已合并，前端整体移出 git 跟踪）。

- **F-15 补丁**：✅ 已完成验收（按当时 (41) 核对；最新 (33) 如需可再复核）
- **F-16 案件文件夹关联**：📋 待做（已在 (33) 核实不存在：建档无选文件夹/自动创建、详情无 folder_path 展示）
- **F-17 三档渐进前端**：📋 待做（已在 (33) 核实不存在：无 file_discovered 提醒、无 folder_lookup/gap_analysis 卡片）
- **F-18 全局咨询右栏统计分析**：✅ **已有，撤回**（`components/brain/GlobalStatsPanel.tsx` 右栏业务概览 + `pages/Analytics.tsx` 完整统计页已实现，无需再做）
---

# F-16 修订 v2（2026-08-14，Vera 拍板）：案件文件夹关联 UX

> 替代原 F-16 的交互部分（目录选择器 + 自动预填）。后端配套端点见 WO-34（浏览/解析），契约以快照更新后为准。

## 一、新建案件表单：关联文件夹按钮
- 客户姓名等字段旁新增"关联文件夹"按钮 → 打开"选择文件夹"弹窗
- 弹窗内两种方式：
  1. **自动创建**：按 broker/client/case 命名自动建标准子目录（_Inbox / Send to Lender / Don't send 等）→ `POST /api/cases/{id}/folder` body `{"mode":"auto"}`
  2. **浏览选择已有**：目录选择器（见二）→ 选完 → `{"mode":"existing","path":"相对路径"}`

## 二、目录选择器弹窗（替代"输入路径"）
- 后端 `GET /api/folders/browse?path=<rel>`：列出 CLIENT_FILES_ROOT 下子目录（安全边界内，拒绝越界/穿越）
- 弹窗 = 文件夹树浏览：面包屑 + 子目录列表 + 搜索框（按名称过滤）；可逐级进入；选中 → 确认
- 说明：浏览器拿不到电脑绝对路径，用"浏览案件根目录"弹窗替代系统文件选择器——案件文件夹都在 CLIENT_FILES_ROOT 下，安全且够用

## 三、选完自动预填
- 后端 `GET /api/folders/parse?path=<rel>` → `{client_name?, broker_name?, case_id?}`
- 解析：优先按三段结构 broker/client/case-id；取末段清理（去下划线/连字符/数字尾巴）兜底
- 选完文件夹 → 调 parse → 自动填入客户姓名（等字段），Vera 可改

## 四、红线
- 只读浏览；无文件操作按钮；路径校验全部由后端完成
---

# F-16 修订 v3（2026-08-14，Electron 优先模式）

> 替代 v2 的目录选择器部分。原则：**选择器做成 provider 抽象，Electron 打包时只换实现、不重做**。

## 一、目录选择器 = 可替换 Provider
- 前端定义统一接口：`pickExistingFolder(): Promise<{ path: string }>`（返回路径，绝对或相对皆可，后端统一校验）
- **Electron 实现（WO-05 目标形态，WO-05 施工单里的预留契约）**：
  - preload 暴露 `window.vera.chooseDirectory()`（IPC → `dialog.showOpenDialog({ properties: ['openDirectory'] })`）→ 返回**绝对路径**
  - 前端拿到绝对路径直接调 `POST /api/cases/{id}/folder {"mode":"existing","path":绝对路径}`（后端 `validate_path_safety` 已兼容绝对/相对路径并校验在 CLIENT_FILES_ROOT 内）
- **Web 过渡实现（现在）**：输入相对路径 或 浏览弹窗（如后端已做 `GET /api/folders/browse`）；代码标注 `// TODO(WO-05): 替换为 Electron 原生目录选择器`

## 二、新建案件表单
- "关联文件夹"按钮：自动创建（mode=auto）/ 选择已有（provider 返回路径 → mode=existing）
- 选完 → `GET /api/folders/parse?path=` → 自动预填客户姓名等字段（Vera 可改）→ 提交建档

## 三、为什么打包不重做
- 后端契约固定：`POST /api/cases/{id}/folder` 接受绝对/相对路径；`GET /api/folders/parse` 两模式共用
- 前端只有 `pickExistingFolder()` 一个实现点：Web 输入/浏览 ↔ Electron 原生，其余（按钮/弹窗壳/预填/关联）全部复用

## 四、红线
- 只读浏览；无文件操作按钮；路径校验全部由后端完成
---

# F-19 补丁：GapAnalysisCard 字段对齐 + 设置页顶栏拥挤（WO-33 契约 / 布局）

> 后端 gap_analysis payload 契约（WO-33，已验收）：
> `{ missing: [{master_id, name, reason}], matched: [{master_id, name}], suggestions: [{type, title, description, action_type, status, item_name}], summary }`
> 当前 `GapAnalysisCard` 读的是 `missing[].item` 和 `suggestions[].item/suggestion` → 显示 undefined。

要改（src/components/brain/GapAnalysisCard.tsx）：
1. missing 列表：`m.item` → `m.name`（原因字段 `m.reason` 已对）
2. suggestions 展示：`s.item` → `s.title`；`s.suggestion` → `s.description`（可在 description 前加"建议："）
3. 保留 summary 直显；matched 可加"已收"徽标（可选）
4. mock 数据同步改为后端字段名（name/title/description）
---

## F-19 之二：设置页顶栏拥挤（src/pages/Settings.tsx）
- 现状：标题块 + 5 个标签挤在同一行（`flex-col sm:flex-row ... justify-between`），长标题挤压标签，标签 `gap-1` 太紧
- 期望：顶栏改两行——第一行标题+副标题；第二行 5 个标签整行铺开（`flex flex-col gap-4 pb-4 border-b` + 标签行 `flex flex-wrap items-center gap-2 p-1.5 rounded-xl ... w-full`），换行不挤

---

# F-21 补丁（2026-08-14，Gemini 执行）：GapAnalysisCard 草稿字段对齐 + F-20 AI 用量概况增强

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (43)`（已解压，最新）。本批次只改 2 个文件，不碰后端。

## 任务 1：GapAnalysisCard 导出草稿字段对齐（src/components/brain/GapAnalysisCard.tsx）

后端 gap_analysis payload 契约（WO-33，已验收）：
`{ missing: [{master_id, name, reason}], matched: [{master_id, name}], suggestions: [{type, title, description, action_type, status, item_name}], summary }`

- 现状：渲染部分已兼容（`item.name || item.item`、`sug.title || sug.item || sug.item_name`），但 `handleGenerateDraftList`（约 L21/L23）导出草稿仍用旧字段
- 要改：L21 `m.item` → `m.name`；L23 `s.item` → `s.title`、`s.suggestion` → `s.description`
- 否则导出的"补件清单草稿"会出现 undefined

## 任务 2：F-20 AI 用量概况增强（src/components/brain/GlobalStatsPanel.tsx 的 #ai-usage-section 区块）

后端 `GET /api/analytics/usage?granularity=day|week|month`（默认 day）已就绪；前端 `getUsage(granularity)` 服务与 `UsagePeriod` 类型均已存在，组件 `loadData()` 已拉取 `current/previous`——**不要新增请求、不改类型/服务层**。

`UsagePeriod`：`{calls, prompt_tokens, completion_tokens, prompt_cache_hit_tokens, prompt_cache_miss_tokens, cache_hit_rate, cost_usd, avg_latency_ms, corrected_count}`

在现有"AI 用量概况"区块（组件内 `currentUsage`）上增强 6 点：
1. **Token 构成条**：用 `prompt_cache_hit_tokens`（命中）与 `prompt_cache_miss_tokens`（未命中）画水平堆叠条（两色块按比例），下方标 `Prompt {prompt_tokens.toLocaleString()} · Completion {completion_tokens.toLocaleString()}`；两值合计 0 时整行隐藏
2. **缓存命中率强化**：`cache_hit_rate` 为 `null` 时显示 `—`（不显示 0%）；有值时数字旁加小环形进度（内联 SVG，勿引新依赖），沿用现有紫色系
3. **平均延迟**：新增一行 `平均延迟 {avg_latency_ms?.toFixed(0) ?? '—'} ms`
4. **环比（current vs previous）**：调用次数、费用、缓存命中率、纠正次数四项，与 overview 卡片一致的 ▲▼ 样式（ArrowUpRight / ArrowDownRight），变化量 = current − previous；previous 为 0 显示 `—`
5. **空状态**：`currentUsage.calls === 0` 显示"暂无 AI 调用数据"，不报错、不渲染 0% 误导
6. 视觉参考 DeepSeek Harness Web UI 底部的 Token + 缓存命中率面板：数字为主、紧凑一行、实时可读；保持右栏小卡片风格，勿做成分页/弹窗

## 红线
- 只改 `src/components/brain/GapAnalysisCard.tsx` 与 `src/components/brain/GlobalStatsPanel.tsx`（如抽子组件，仅允许同目录新建 `AiUsageBar.tsx`，≤120 行）
- 不改 `src/types/api.ts`、`src/services/api/analytics.ts`、后端任何文件
- 不引入任何新的 npm 依赖（环形进度用内联 SVG）
- `npx tsc --noEmit` 零错误

## 验收
1. 缺口卡点击"生成建议清单"→ 草稿内容为 `【缺】{name} — 原因：{reason}` 与 `{title}: {description}`，无 undefined
2. 右栏统计面板"AI 用量概况"：Token 构成条 + 命中率环形 + 延迟 + 四项环比
3. 空库显示"— / 暂无 AI 调用数据"，不报错
4. 切换 日/周/月 粒度后数据刷新
5. `npx tsc --noEmit` 零错误；未引入新依赖

---

# F-20 补丁：AI 用量概况增强（Token 构成 + 环比 + 延迟；借鉴 DeepSeek Harness 用量面板）

> 后端契约已就绪（`GET /api/analytics/usage?granularity=day|week|month`，默认 day，本批次**不改后端**）。
> 当前 `GlobalStatsPanel.tsx` 已有"AI 用量概况"区块（组件内 `currentUsage` 已渲染 调用/费用/缓存命中率/纠正次数），本次是**在原区块上增强**，不是新建面板。

## 一、数据契约（前端类型已在 src/types/api.ts，勿改）

```typescript
interface UsagePeriod {
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
interface AnalyticsUsage {
  current: UsagePeriod;
  previous: UsagePeriod;
}
```

服务层 `getUsage(granularity)` 已存在且组件已在 `loadData()` 中拉取 `current/previous`；**勿新增请求、勿改服务层**。

## 二、要改（src/components/brain/GlobalStatsPanel.tsx 的 `#ai-usage-section` 区块）

1. **Token 构成条**：用 `prompt_cache_hit_tokens`（命中）与 `prompt_cache_miss_tokens`（未命中）画一条水平堆叠条（两色块，占比按两值比例），下方标注 `Prompt {prompt_tokens.toLocaleString()} · Completion {completion_tokens.toLocaleString()}`；两值合计为 0 时整行隐藏。
2. **缓存命中率强化**：现有 `缓存命中 {Math.round((cache_hit_rate ?? 0) * 100)}%` 改为：命中率为 `null` 时显示 `—`（不显示 0%）；有值时在数字旁加一个小的环形进度（可用纯 SVG，勿引新依赖），配色沿用现有紫色系。
3. **平均延迟**：新增一行 `平均延迟 {avg_latency_ms?.toFixed(0) ?? '—'} ms`（null 显示 —）。
4. **环比（current vs previous）**：调用次数、费用、缓存命中率、纠正次数四项，与 overview 卡片一致的 ▲▼ 样式（ArrowUpRight / ArrowDownRight，颜色红涨绿跌或按现有惯例），变化量 = current − previous；previous 为 0 时显示 `—`。
5. **空状态**：`currentUsage.calls === 0` 时区块显示"暂无 AI 调用数据"，不报错、不渲染 0% 误导。
6. 视觉参考：DeepSeek Harness Web UI 底部的 Token 消耗 + 缓存命中率实时面板——数字为主、紧凑一行、实时可读；本区块保持右栏小卡片的紧凑风格，勿做成分页/弹窗。

## 三、红线
- 只改 `GlobalStatsPanel.tsx` 一个文件（如抽子组件，仅允许在同目录新建 `AiUsageBar.tsx`，≤120 行）
- 不改 `src/types/api.ts`、`src/services/api/analytics.ts`、后端任何文件
- 不引入任何新的 npm 依赖（环形进度用内联 SVG）
- `npx tsc --noEmit` 零错误

## 四、验收
1. 右栏统计分析面板可见增强后的"AI 用量概况"：Token 构成条 + 命中率环形 + 延迟 + 环比
2. 无数据（空库）时显示"— / 暂无 AI 调用数据"，不报错
3. 切换 日/周/月 粒度后四项数据随之刷新
4. TypeScript 编译零错误；未引入新依赖

---

# F-22 补丁（2026-08-14）：能力中心对话触发状态同步（WO-36 后端已就绪）

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (44)`。后端 WO-36 已完成（commit 6c1f674）：active 技能（status=available + enabled + flow_key）的触发语已并入对话意图路由——用户在全局咨询/案件对话里说出技能触发词会直接路由到对应流程包。本批次让能力中心如实反映"对话可触发"状态，并把顶部触发语改为动态生成。

## 一、要改（src/components/settings/AbilityCenter.tsx）

1. **顶部常用触发语动态化**：现有 `PROMPT_CHIPS` 是硬编码 4 条；改为从 `agents` 状态动态生成——取 `category==='agent' && status==='available' && enabled===true` 的 `triggers` 平铺去重，截取前 6 条；无数据时回退现有硬编码列表。说明文案改为："以下触发语已接入对话路由，可直接在全局咨询或案件对话中对 Vera 说出"。点击行为保持 toast（不改习惯，不引新依赖）。
2. **Agent 状态徽标细分**（`agent.status === 'available'` 分支处）：
   - `available + enabled` → 徽标文案"对话可触发"，样式沿用 emerald/绿或改紫色 Zap（与顶部 chips 呼应）
   - `available + disabled` → 徽标文案"已停用"，灰色
   - `pending` → 维持"待接入 (执行数据待后端接入)"
3. **触发词 chips 联动**：`available + enabled` 正常显示（紫底）；`available + disabled` 时触发词 chips 加 `opacity-50`；`pending` 维持现状。
4. **工具库区不动**（tools 无对话触发语义）。

## 二、红线
- 只改 `src/components/settings/AbilityCenter.tsx` 一个文件
- 不改 `src/services/api/agents.ts`、`src/types/api.ts`、后端任何文件
- 不引入新的 npm 依赖；`npx tsc --noEmit` 零错误

## 三、验收
1. 顶部触发语列表来自后端 agents 数据（打开/关闭一个 available 技能后刷新，chips 随之增减）
2. available+enabled 技能显示"对话可触发"，disabled 显示"已停用"，pending 显示"待接入"
3. 关闭某技能后其触发词 chips 变半透明，卡片整体 opacity-60
4. 无新依赖、编译零错误

---

# F-23 补丁（2026-08-14）：顶栏精简 + 更多功能重组（方案已拍板）

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (45)`。主文档定稿"左栏底部 4 入口（待办/看板/统计/设置）+ 低频页藏更多"，本次进一步：顶栏去重、低频页统一收右上角头像下拉、导入历史/数据迁移从导航移除（代码保留）。

## 一、任务 1：顶栏精简（src/components/layout/TopNavBar.tsx）

1. **Logo 块**：删除英文副标题 `AI-Powered Mortgage Broker Desktop`，保留渐变图标 + "Vera" 单行；点击回今日工作台（不变）
2. **删除"今日工作台" Tab**（与 Logo 点击行为重复）；保留"全局咨询" Tab
3. **右侧头像**：删除 `Vera / 资深信贷顾问` 文字（lg 屏显示那段），只留头像圆 + 在线点
4. **新增头像下拉菜单**（点击头像打开，`AnimatePresence` 样式与通知下拉一致）：
   - 知识中心 / 档案库 / 草稿箱 / 设置（4 项，走现有 `onNavigate`）
   - 分隔线
   - 版本信息：调 `getVersion()`（src/services/api/system.ts，已有）显示版本号，加载失败显示 "—"
5. **保留**：通知铃铛、主题切换快捷按钮（高频，不进下拉）
6. **明确不做窗口控制按钮**（最小化/最大化/关闭）：当前浏览器模式无效；Electron WO-05 阶段用系统原生标题栏，前端不预留占位

## 二、任务 2：左栏底部重组（src/components/brain/CaseListSidebar.tsx）

1. **保留 4 主 Tab**：待办 / 看板 / 统计 / 设置（`SYSTEM_TABS` 不动，含折叠态）
2. **移除整个"更多功能"下拉**：`MORE_ITEMS` 数组删除、`moreOpen` 状态与下拉渲染删除、`nav-bottom-more` 按钮删除；相关图标 import（Brain/FileText/Archive/History/Database/ChevronDown）清理
3. **导航入口清理**：
   - 知识中心 / 档案库 / 草稿箱 → 只经右上角头像下拉进入（页面保留，ViewId 不动）
   - 导入历史 → 从导航移除，代码注释 `// TODO(V2): 历史项目批量导入恢复时升级为导入中心`
   - 数据迁移 → 从导航移除，代码注释 `// TODO(Phase 2): 设置页"数据与备份"区入口`
4. 被移除的页面文件本身（pages/ImportHistory.tsx、Migration.tsx 等）**一律不动**，只是入口消失

## 三、红线
- 只改 `src/components/layout/TopNavBar.tsx`、`src/components/brain/CaseListSidebar.tsx`（如路由需要联动，仅允许同批次加 `src/components/layout/AppShell.tsx` 一处）
- 不改后端、不改 `src/types/api.ts`（VersionInfo 已有）、不新增 npm 依赖
- 不实现窗口控制按钮（见任务 1 第 6 条）
- `npx tsc --noEmit` 零错误

## 四、验收
1. 顶栏：Logo（图标+"Vera"）点击回今日工作台；只有"全局咨询"一个 Tab；右侧 = 铃铛 + 主题 + 头像（无名字/职位文字、无英文副标题）
2. 头像下拉含：知识中心 / 档案库 / 草稿箱 / 设置 + 分隔线 + 版本号（真实 /api/version，失败显示 —）
3. 左栏底部只有 待办/看板/统计/设置 4 项，无"更多功能"按钮
4. 导入历史、数据迁移无任何导航入口（页面文件保留）
5. 全站无窗口控制按钮
6. `npx tsc --noEmit` 零错误；未引入新依赖

---

# F-24 补丁（2026-08-14）：顶栏澳洲时间 + 时区/日历/假期面板

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (45)`。Vera 团队总部堪培拉（ACT）、客户集中在悉尼（NSW）与布里斯班（QLD），中国与澳洲协同。后端 WO-39 提供 `GET /api/holidays`（today 三州状态 / upcoming / next / dls），本批次消费它 + 浏览器 Intl 实时时钟（零新依赖）。

## 一、顶栏（src/components/layout/TopNavBar.tsx，与 F-23 同批）

1. 通知铃铛左侧新增**澳洲时间按钮**：显示"堪培拉 16:32"（`Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit', hour12: false })`，每分钟刷新；`Australia/Sydney` 自动含夏令时）。点击 → 打开下面的时区面板（复用通知下拉的 AnimatePresence 样式）。
2. 折叠/窄屏（md 以下）时按钮只显示时间不显示"堪培拉"前缀。

## 二、时区/日历/假期面板（建议新文件 src/components/layout/AuTimePanel.tsx，≤200 行）

1. **三时区对照**（三列）：堪培拉（大号，标注 = 悉尼时区）/ 布里斯班（QLD 无夏令时，夏令时期间与悉尼差 1 小时，可加小标注"无夏令时"）/ 北京。全部 Intl timeZone 实时刷新，夏令时由浏览器自动处理。
2. **今日银行工作日状态**（数据 `GET /api/holidays` 的 `today`）：ACT / NSW / QLD 三行，各自 ✅ 银行工作日 或 ⛔ 休息日（周末或假期名，如 "Good Friday"）。
3. **中澳办公重叠提示**：北京 09:00-17:00 与 悉尼/堪培拉 09:00-17:00 的换算——当前若双方均在办公时段显示"当前中澳均在办公 ✅"，否则显示"仅 X 在办公"。计算用两时区当前小时（堪培拉 09-17 且 北京 09-17 = 双方办公；规则写在注释里便于校对）。
4. **本月日历**：小月份视图（当前月），三州假期分别用三种颜色圆点标记（ACT 紫 / NSW 蓝 / QLD 绿），底部图例。
5. **未来假期列表**（`upcoming`，默认 10 条）：日期 + 名称 + 州徽标（ACT/NSW/QLD），按日期升序。
6. **下一个假期倒计时**（`next`，默认州）："距 Good Friday（2026-04-03）还有 7 天"。
7. **夏令时提示**（`dls`）：sydney.dls_active 时显示"悉尼已进入夏令时（AEDT，UTC+11，与北京差 3 小时）"，否则"悉尼标准时（AEST，UTC+10，与北京差 2 小时）"；布里斯班恒 UTC+10。
8. 加载失败/空库：显示"—"，不报错；`getHolidays()` 服务方法失败时回退 mock 数据（按现有 service 模式）。

## 三、服务层（src/services/api/holidays.ts，新建）

```typescript
export interface HolidayStateToday { date: string; state: string; is_working_day: boolean; holiday_name?: string | null; weekday: number; }
export interface HolidayItem { date: string; name: string; state: string; display: string; }
export interface DlsStatus { utc_offset_hours: number; dls_active: boolean; }
export interface HolidaysResponse { today: Record<string, HolidayStateToday>; upcoming: HolidayItem[]; next: HolidayItem | null; dls: Record<string, DlsStatus>; }
export async function getHolidays(state?: string, limit?: number): Promise<HolidaysResponse>;  // GET /api/holidays?state=&limit=
```

`types/api.ts` 同步追加上述接口（**允许改 types/api.ts，本次唯一例外**）；`services/api/index.ts` 导出。

## 四、红线
- 只改/新建：`TopNavBar.tsx`（时间按钮 + 面板入口）、`src/components/layout/AuTimePanel.tsx`（新建）、`src/services/api/holidays.ts`（新建）、`src/types/api.ts`（追加接口）、`src/services/api/index.ts`（导出）
- 后端已就绪（WO-39），不改后端；不新增 npm 依赖（Intl 原生）
- 面板为纯只读展示，无任何写操作
- `npx tsc --noEmit` 零错误

## 五、验收
1. 顶栏显示堪培拉实时时间（每分钟跳动），点击弹出面板
2. 面板含：三时区（堪培拉/布里斯班/北京）、三州今日状态、办公重叠提示、本月日历（三色假期点+图例）、未来假期列表、倒计时、夏令时提示
3. 夏令时期间堪培拉与布里斯班差 1 小时正确显示
4. 无新依赖、编译零错误；后端未就绪时 mock 兜底不报错

---

# F-25 补丁（2026-08-14）：AU 时间面板加宽 + 不透明背景（Vera 验收反馈）

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (46)`。Vera 反馈两个问题，均已验证属实：
> ① 面板 `w-80`（320px）太窄，三时区 `grid-cols-3` 每列约 100px，布里斯班"（无夏令时）"标签换行成两排；且 `max-h-[85vh] overflow-y-auto` 内容多时需滚动。
> ② 面板用 `glass-card`（`--surface-translucent-card: rgba(28,31,46,0.85)` + blur(12px)），背景内容透出，观感发虚。

## 一、要改（src/components/layout/AuTimePanel.tsx）

1. **加宽**：根容器 `w-80` → `w-[420px]`（三时区三列各约 130px，单行放下）
2. **不透明背景**：根容器去掉 `glass-card` 类，改 `style={{ backgroundColor: 'var(--bg-card)' }}`（实色，不透背景）；保留 `rounded-2xl border shadow-2xl` 与圆角/阴影
3. **一屏无滚动**：移除根容器 `max-h-[85vh] overflow-y-auto no-scrollbar`；内部假期列表 `max-h-28 overflow-y-auto no-scrollbar` 改为不滚动——`upcoming` 显示前 8 条即可（`slice(0, 8)`），并去掉外层滚动容器（或改两列 grid，任选其一保证一屏内无滚动条）
4. **布里斯班标签单行**：`<span>布里斯班</span><span>(无夏令时)</span>` 加 `whitespace-nowrap` 且外层 flex 不换行；或把"(无夏令时)"改为小圆点 tooltip——**确保不换行成两排**
5. 三时区列内文字全部 `whitespace-nowrap`（堪培拉/悉尼、布里斯班、北京三列各自单行）
6. **可选统一**：通知下拉、头像下拉同为 `glass-card`，若观感一致偏透，可一并改为 `style={{ backgroundColor: 'var(--bg-card)' }}`（仅这 3 处弹窗，不动全局 tokens.css）

## 二、红线
- 只改 `src/components/layout/AuTimePanel.tsx`（可选：`TopNavBar.tsx` 通知/头像两处下拉容器）
- 不动 `src/themes/tokens.css` / `src/index.css`（全局透明度变量不动）
- 不改后端、不新增 npm 依赖；`npx tsc --noEmit` 零错误

## 三、验收
1. 面板宽度 420px，三时区三列各自单行，布里斯班不再换行成两排
2. 整面板一屏内展示完全，无任何滚动条
3. 背景不再透出（面板为实色 var(--bg-card)）
4. 无新依赖、编译零错误

---

# F-26 补丁（2026-08-14，方案已拍板）：AU 时间面板宽度回 320 + 假期瘦身 + 三个新增信息

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (47)`。Vera 反馈 F-25 的 420px 太宽；第一版 320px 宽度合适，问题根源是假期列表撑高内容。本批：宽度回 320px、假期单列固定 4 条、日历压缩，并新增 3 个信息（A 下一个工作日 / B 今日业务摘要 / C 中国长假倒计时，C 后端已就绪 WO-39b）。

## 一、布局（src/components/layout/AuTimePanel.tsx）

1. **宽度回第一版**：`w-[420px]` → `w-80`（320px）
2. **假期列表重排**：当前 `grid-cols-2` + `slice(0, 8)` 改为**单列固定 4 条** `slice(1, 5)`——倒计时条已承担"下一个假期"（next），列表从第二条开始避免重复；每条一行 `MM-DD + 名称(truncate) + 州徽标`；**移除滚动容器**
3. **日历压缩**：日期格子 `min-h-[22px]` → `min-h-[18px]`、内边距微调（整块约省 24px）
4. **三时区列**：三列文字 `whitespace-nowrap` 单行（布里斯班"(无夏令时)"用 tooltip 或小圆点，不换行）
5. 保持：不透明背景 var(--bg-card)、圆角/阴影、三州工作日状态、办公重叠提示、夏令时提示、日历三色标记

## 二、新增信息

### A. 下一个银行工作日（顶部，一行）
- 今日为休息日时显示：`今日休息（{假期名或周末}）→ 下一个工作日 4/7 周二`
- 前端计算：从明天起逐日，`weekday < 5` 且不在该州未来假期日期集合内（用 today + upcoming 数据）→ 首个即结果；30 天内必有

### B. 今日业务摘要（底部，一行，可点击）
- 显示：`今日待办 {n} 件 · 7 天内 Finance 截止 {m} 案`
- 数据：`useTaskStore().tasks` 算今日到期/超期待办；cases 算 `finance_deadline` 在 7 天内（dateDiff）的案件数
- 点击整行 → `onNavigate('home')`（今日工作台）；无数据时显示 `—`

### C. 中国长假倒计时（底部，一行）
- 显示 `next_china`：`距 国庆节（10/1）还有 {n} 天`；`china` 列表第 2 条可并列显示（如 `· 春节 2/6`）
- 数据：`getHolidays()` 返回的 `china` / `next_china`（后端 WO-39b 已就绪，state="CN"）
- 无数据/失败显示 `—`

## 三、服务层类型（src/services/api/holidays.ts + src/types/api.ts）

`HolidaysResponse` 追加：
```typescript
china: HolidayItem[];        // 中国主要长假首日（state="CN"）
next_china: HolidayItem | null;
```
（HolidayItem 已有 date/name/state/display，无需新类型）

## 四、红线
- 只改 `AuTimePanel.tsx`、`holidays.ts`、`types/api.ts`（+ 如接任务数据需要 `TopNavBar.tsx` 传入 onNavigate，允许）
- 不改后端、不新增 npm 依赖；`npx tsc --noEmit` 零错误

## 五、验收
1. 面板宽度 320px，三时区各单行、布里斯班不换行
2. 整面板一屏无滚动（日历 + 倒计时 + 假期 4 条 + A/B/C）
3. A：今天休息时显示下一个工作日；工作日时不显示该行
4. B：显示真实待办/截止数，点击跳今日工作台
5. C：显示距下一个中国长假天数（真实 /api/holidays 数据）
6. 背景仍为实色不透；无新依赖、编译零错误

---

# F-26b 补丁（2026-08-14，Vera 反馈）：中国假期红色标记进日历

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (48)`。F-26 主体已验收通过；Vera 反馈：日历目前只标记 ACT/NSW/QLD 三州假期（紫/蓝/绿圆点），中国长假（春节/国庆）没有显示。中国长假对中澳协同影响最大，应进日历用**红色**标记。

## 一、要改（src/components/layout/AuTimePanel.tsx）

1. **getDayHolidays 增加中国判断**：`data.china`（HolidayItem[]，state="CN"）中 `date === dateStr` → 列表加 `'CN'`（三州逻辑不动）
2. **getDayHolidays 增强返回值（新增 hover 名称需要）**：返回 `{ state: string; name: string }[]` 替代 string[]——三州查 `data.upcoming` 取 `name`；中国查 `data.china` 取 `name`（state="CN"）。渲染处同步适配（圆点颜色按 state 映射：ACT 紫 / NSW 蓝 / QLD 绿 / CN 红）
3. **日历渲染红色标记**：CN → 红色圆点 `bg-rose-500`（或红色日期数字底色 `bg-rose-500/15 text-rose-600`，二选一），保持 18px 格子放得下
4. **hover tooltip（本次核心，覆盖所有假期）**：日期格子 `title` = `${name}（${state}）`，如 `Good Friday（NSW）`、`春节（CN）`——三州与中国假期格子都能悬停显示名称；无假期格子不设 title
5. **图例补充**：日历标题行图例加红点 + "中国"（tooltip"中国长假首日"）
6. 说明：中国配置只存**首日**（春节初一 / 国庆 10/1），日历只标首日即可，不做区间高亮

## 二、红线
- 只改 `AuTimePanel.tsx`；不改后端（china/next_china 数据已就绪）、不新增 npm 依赖；`npx tsc --noEmit` 零错误

## 三、验收
1. 当前月含春节或国庆首日时，日历该日期显示红色标记（圆点或红底）
2. **鼠标悬停任意假期日期格 → 显示假期名 + 州（含三州与中国）**；无假期格子无 tooltip
3. 图例含"中国（红）"；无中国假期月份图例正常（不报错）
4. 三州紫/蓝/绿圆点行为不变；日历格子高度不变（一屏无滚动）
5. 无新依赖、编译零错误

---

# F-27 补丁（2026-08-14，B 收尾）：知识中心/文件预览/邮件分析字段真实化（清 mock）

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (49)`。后端已就绪：知识中心 CRUD（commit 02785ee）、文件预览、邮件 AI 分析。本批次把前端三处 mock 接真实端点。

## 一、知识中心真实化（核心）

### 服务层（新建 src/services/api/knowledge.ts）
```typescript
export interface KnowledgeEntry {
  id: string;
  layer: 'case' | 'global' | 'industry';
  case_id?: string | null;
  content: string;
  source: string;
  vera_confirmed: boolean;
  lender?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}
export function getKnowledge(params?: { layer?: string; case_id?: string; lender?: string; limit?: number }): Promise<KnowledgeEntry[]>;
export function createKnowledge(body: { layer: string; content: string; case_id?: string; lender?: string; source?: string }): Promise<KnowledgeEntry>;
export function updateKnowledge(id: string, body: { content?: string; lender?: string; vera_confirmed?: boolean }): Promise<KnowledgeEntry>;
export function confirmKnowledge(id: string): Promise<KnowledgeEntry>;
export function deleteKnowledge(id: string): Promise<void>;
```
`types/api.ts` 同步追加 `KnowledgeEntry`；`services/api/index.ts` 导出。

### 组件接线（src/components/knowledge/）
- **CaseMemoryTab**：选中案件 → `getKnowledge({ layer: 'case', case_id })` 替换 MOCK_MEMORIES；支持 新增（输入内容 → createKnowledge，layer=case + case_id）、确认（confirmKnowledge，vera_confirmed 标记）、删除（deleteKnowledge）
- **GlobalExperienceTab**：`getKnowledge({ layer: 'global' })` 替换 MOCK_KNOWLEDGE；支持 新增/编辑（updateKnowledge）/确认/删除
- **IndustryKnowledgeTab**：`getKnowledge({ layer: 'industry' })` 同上
- 加载失败 → 空态 + 提示"加载失败"，不落 mock（**清 mock 是本批目的，不再 fallback mock 数据**）

## 二、文件预览真实化（src/components/panel/details/FilePreviewPanel.tsx）
- 接 `GET /api/files/{file_id}/preview`（后端 FileResponse）：按 `file_extension` 渲染——PDF 用 iframe/embed、图片 img、文本 fetch 后显示纯文本；失败显示"预览不可用"
- 组件 props 增加 `fileId` 或从现有 file 对象取 id；去掉占位文案

## 三、邮件详情 AI 字段真实化（收件箱详情）
- 详情页"AI 分析"区接 `POST /api/inbox/{msg_id}/analyze`，返回 `{ id, is_fallback, summary, action_type, stage_signal, deadline, conditions, urgency_score }`
- 展示：摘要 summary、动作类型 action_type、阶段信号 stage_signal、截止 deadline、条件列表 conditions、紧急度 urgency_score；is_fallback=true 时标注"规则兜底结果"
- 触发：详情打开时自动调一次 + 手动"重新分析"按钮

## 四、文件详情字段真实化
- 文件列表/详情接 `GET /api/cases/{case_id}/files`（返回 assigned_type/confidence/status/file_extension/file_size/created_at），替换 mock 分类/置信度字段；解析按钮走既有 parse-file 端点（如已接则不动）

## 五、红线
- 只改/新建：`services/api/knowledge.ts`、`types/api.ts`、`services/api/index.ts`、`components/knowledge/`（3 tab）、`components/panel/details/FilePreviewPanel.tsx`、收件箱详情组件（1 处）
- 不改后端（已就绪）、不新增 npm 依赖；`npx tsc --noEmit` 零错误
- 知识中心不做批量导入/复杂编辑，仅列表 + 新增/编辑/确认/删除

## 六、验收
1. 知识中心三 tab 显示真实后端数据；新增一条 global 经验 → 刷新可见；确认后 vera_confirmed=true；删除后消失
2. 案件记忆按选中案件过滤（layer=case + case_id）
3. 文件预览真实渲染 PDF/图片/文本（本地上传文件）
4. 邮件详情 AI 分析返回真实字段（或"规则兜底"标注）
5. 文件详情分类/置信度来自后端
6. 无 mock fallback；无新依赖、编译零错误

---

# F-28 补丁（2026-08-14，方案拍板）：案件筛选 5 类 + 待办老板分类 + 待办↔AI 联动

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (49)`。后端 WO-40 已就绪（commit 0fe460b）：聊天 escalate 工具 + TaskResponse 加 `escalated_to_boss` / `boss_decision`、CaseResponse 加 `has_boss_pending`。本批次：案件筛选贴合工作流、老板拍板分类恢复、待办与 AI 聊天上下文联动。

## 一、案件筛选 5 类（src/components/brain/CaseListSidebar.tsx）

`caseFilter: 'all' | 'urgent' | 'submitting'` → `'all' | 'urgent' | 'lender' | 'waiting' | 'boss'`，Tab 文案：
1. 全部
2. 🔥 紧急——`finance_deadline ≤7 天` 或 `os_pending_count > 0` 或 `checklistProgress < 40`（数据驱动，不再用 stage 字符串猜）
3. 📨 审贷中——stage 含 `递交/审贷/评估/批复/预批`
4. 📋 等材料——stage 含 `收集/补件/准备/资料`
5. 👑 待老板——`hasBossPending === true`（CaseResponse 新字段）

`CaseInfo`（types/api.ts 或 stores/caseStore）补 `hasBossPending: boolean`；caseMapper 从后端 `has_boss_pending` 映射。

## 二、今日待办分类加"待老板拍板"（src/components/brain/HomePage.tsx）

`taskTab` 下拉加选项：`👑 待老板拍板 ({n})`——过滤 `task.escalatedToBoss === true`；卡片显示"👑 待老板拍板"徽标（金色）+ `bossDecision` 问题摘要。

## 三、任务工作台 brandon 分类接真实数据（src/components/tasks/TaskList.tsx + TaskCard.tsx）

1. `TaskItem` 类型补 `escalatedToBoss?: boolean` / `bossDecision?: string`；`taskMapper`（后端 TaskResponse → TaskItem）映射 `escalated_to_boss` / `boss_decision`
2. `filter === "brandon"` 改为过滤 `task.escalatedToBoss === true`（不再依赖 `type === "BOSS_DECISION"`）
3. 卡片：`escalatedToBoss` 时显示金色"👑 待老板拍板"徽标 + 问题（bossDecision 或 title）
4. 老板答复入口：卡片/详情提供 approve / reject / defer 三按钮 → `POST /api/tasks/{id}/boss-reply`（body `{decision, note?}`，已有端点）；答复后刷新列表，任务状态按 approve→completed / reject→rejected / defer→deferred

## 四、待办 ↔ AI 对话联动（TaskCard.tsx + DetailPanel.tsx）

- 任务卡片/详情加"进入案件对话"按钮（`caseId` 存在时显示）→ `setCurrentCase(该案件)` + `onNavigate('brain')`——让 AI 带上该案件上下文（`/api/cases/{id}/context`）
- 无 caseId 的任务不显示该按钮

## 五、红线
- 只改：CaseListSidebar、HomePage、TaskList、TaskCard、DetailPanel、types/api.ts、caseMapper、taskMapper、caseStore（如有）
- 不改后端（WO-40 已就绪）、不新增 npm 依赖；`npx tsc --noEmit` 零错误

## 六、验收
1. 案件筛选 5 Tab：紧急（数据口径）、审贷中、等材料、待老板（有升级事项的案件出现在"待老板"）
2. 今日待办下拉含"👑 待老板拍板"，过滤出真实升级任务并显示问题摘要
3. 任务工作台 brandon 分类只显示升级任务；卡片金色徽标 + 老板答复三按钮可用（答复后状态变化）
4. 待办点"进入案件对话"→ AI 聊天切到该案件并带上下文
5. 无新依赖、编译零错误

---

# F-29（2026-08-14 定稿）：中栏双悬浮（任务 + 清单）+ 右栏重组

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (49)`（或最新编号）。
> 后端依赖：WO-40（已就绪）/ WO-41（任务 Agent，POST /api/tasks/ 已扩 deadline/priority/assignee）/
> WO-43（清单 Agent，POST /api/cases/{id}/checklist 新增项）。
> 定稿依据：docs/CASE大脑_客户上下文维护与任务视图_定稿.md §3.1 / §3.2 / §10.2 / §13。
> 目标：AI First 三栏布局下，中栏是对话主战场，任务和清单做成"按需弹出的操作抽屉"，
> 与右栏"只看不管"的指挥中心划清边界。

## 一、中栏 BrainChat 头部：两个小图标（src/components/brain/BrainChat.tsx）

在头部右侧（现有"客户全景"折叠按钮旁）加两个图标按钮，**仅选中案件时显示**：

1. `📋 清单`（ListChecks 图标，绿色系）→ 打开清单抽屉；
2. `✅ 任务`（CheckSquare 图标，紫色系）→ 打开任务抽屉。

样式与"客户全景"按钮一致（圆形/圆角小按钮 + border + hover），tooltip 分别为"材料清单"、"客户任务"。
全局咨询（无案件）时两个按钮隐藏。

## 二、任务抽屉 TaskDrawer（新建 src/components/brain/TaskDrawer.tsx）

**定位：该客户的全量任务台账 + 就地操作（"管"），与右栏 Top5（"看"）互补，绝不重复卡片化展示。**

1. 入口：中栏头部"✅ 任务"按钮，点击从右侧滑入覆盖层/抽屉（宽度 ~420px，中栏内，不遮右栏）；
2. 数据：`listTasks('all')` 后按 `case_id === 当前案件` 过滤（含 completed）；标题显示"客户任务 (N)"；
3. 分类 tab：全部 / 进行中 / 待老板（escalatedToBoss）/ 已委派（delegatedTo）/ 已完成；
4. 列表项：紧凑一行式（标题 + 分类徽标 + 截止红黄绿 + 状态），**不用卡片**；
   - 红黄绿：逾期=红（已逾期 X 天）、今天到期=黄、≤7 天=橙、其余=灰；
   - 分类徽标：👑 老板 / 📧 邮件 / 📁 文件 / 🏦 OS / ⚙️ 其他；
5. 操作（每项 hover 显示）：
   - 标记完成（调用已有 completeTask 或 POST /api/tasks/{id}/dispatch {action:"approve"}）；
   - 委派：小弹窗填 委派人 + 截止 → 已有 delegate 端点；
   - 改截止：小弹窗选日期 → 后端支持时调用；后端未支持则 toast"即将支持"（不阻塞本批）；
   - 进入任务详情：打开 OsWorkbench（OS 类）或通用任务详情（非 OS 类，复用 DetailPanel 组件或现有任务详情页）；
6. 新建任务：抽屉底部"＋ 新建任务"按钮 → 表单（标题 * / 截止日期 / 优先级下拉 urgent|high|normal|low / 负责人下拉 vera|brandon）→ `POST /api/tasks/`（body 含 case_id）→ 成功后刷新列表并 toast；
7. 数据同源：任务更新后同步刷新右栏待办与首页今日待办（复用 taskStore，天然同步）。

## 三、清单抽屉 ChecklistDrawer（新建 src/components/brain/ChecklistDrawer.tsx）

**定位：材料台账的日常维护入口，复用 ChecklistPanel/ChecklistItem 组件能力，按业务分类展示。**

1. 入口：中栏头部"📋 清单"按钮，抽屉形态同任务抽屉；
2. 数据：`GET /api/cases/{case_id}/checklist`；
3. **按业务分类分组展示**（master category，中文标签）：
   - 身份 / 收入（PAYG）/ 收入（自雇）/ 银行特定 / 特殊情况 / 房产 / 结算 / 其他
   - 组内按 is_required 先必选后可选；每组显示已收/总数
4. 每项：名称 + 必选/AI建议徽标 + 已收状态（勾选）+ 撤销匹配按钮（有文件时）；
5. 补勾/去勾：点选调 `POST .../checklist/{item_id}/confirm` / `/revoke`（复用 checklistStore 或直接 API）；
6. 新增项（抽屉顶部"＋ 新增"）：
   - 表单：名称 *（文本框）+ 分类 *（下拉：身份/收入PAYG/收入自雇/银行特定/特殊情况/房产/结算）+ 指定银行（可选下拉 22 家）+ 适用条件（可选，V1 只存不校验，留文本或 JSON 输入框收起）；
   - 提交 `POST /api/cases/{case_id}/checklist`（body：name_zh/name_en?/category/is_required/applicable_when?/bank_specific?）→ 成功后新项出现在当前分类组，toast"已加入清单并沉淀到清单总库"；
7. 预选确认入口：建档完成对话提示"已按 XX 银行预选 N 项"时，卡片/提示带"查看清单"按钮 → 打开本抽屉。

## 四、右栏 CasePanorama 重组（src/components/brain/CasePanorama.tsx）

保持"案件指挥中心"骨架（摘要 → 下一步 → 风险 → 时间线 → 事实），只做三处增量：

1. **顶部"关键截止"块**（新增，置于摘要卡之后）：
   - 数据：context.deadlines（finance_due/days_left）+ 案件任务中带 deadline 的前 3 条；
   - 展示：最多 3 条，每条 截止名称 + 日期 + 红黄绿（逾期红 / ≤3 天黄 / 其余灰），无截止则整块隐藏；
2. **"下一步待办"排序 + 分类徽标**（改造现有待办区）：
   - 排序：逾期 > 今天到期 > ≤7 天 > 其他（按 deadline 升序）；
   - 卡片内加分类徽标（👑老板 / 📧邮件 / 📁文件 / 🏦OS / ⚙️其他），优先级徽章保留；
   - 仍取前 5 条，标题区加"查看全部 (N)" → 打开中栏任务抽屉（跨组件联动，用 uiStore 事件或全局状态）；
3. **下部折叠**（改造）：
   - 风险/政策：默认展开；
   - 最近动态（时间线）/ 补全进度 / 查看全部事实：收进一个"更多"折叠区（ChevronDown/Up），默认收起；
4. **硬规则：右栏不出现任何任务操作按钮**（标记完成/委派/新建都不放），只读 + 点击跳转任务详情。

## 五、红线
- 只改：BrainChat、CasePanorama、新建 TaskDrawer/ChecklistDrawer（可放 components/brain/）、
  types/api.ts、api 服务（tasks.ts/cases.ts 若需加方法）、taskStore/checklistStore（如需要）、uiStore（抽屉开关状态）；
- 不改后端、不新增 npm 依赖；样式只用项目现有 CSS 变量 + Tailwind + motion；
- 后端未就绪的方法（如改截止）必须 mock/toast 兜底，不阻塞本批验收。

## 六、验收
1. 选中案件 → 中栏头部出现"清单/任务"两个图标；全局咨询时隐藏
2. 任务抽屉：分类 tab 正确、红黄绿+徽标、新建任务（POST /api/tasks/ 带 deadline/priority/assignee）成功并即时出现
3. 清单抽屉：按业务分类分组、补勾/撤销可用、新增项（POST /api/cases/{id}/checklist）成功后出现在对应分类并提示已沉淀
4. 右栏：关键截止块出现（有截止时）、待办按紧迫度排序+分类徽标、"查看全部"能打开任务抽屉、下部折叠生效、无操作按钮
5. `npx tsc --noEmit` 零错误；无新依赖

---

# F-29 补丁（2026-08-14，Codex 审查 (51) 后）：清单新增分类提交 422 修复 + 建档联动提示

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (51)`（或最新编号）。
> 背景：F-29 主体已验收通过（双图标/任务抽屉/清单抽屉/右栏重组均符合定稿），
> 但审查发现 **ChecklistDrawer 新增清单项提交必 422**：新增表单的 category 传的是中文
> （如"身份"），而后端 WO-43 `POST /api/cases/{id}/checklist` 要求 category 为英文枚举
> `identity / income_payg / income_self_employed / bank_specific / special / property / settlement`。

## 一、修复分类提交（src/components/brain/ChecklistDrawer.tsx，必改）

1. 在 `MASTER_CATEGORIES` 定义后新增映射：

```typescript
// 中文分类 → 后端枚举（WO-43 ChecklistAddRequest.category 白名单）
const CATEGORY_TO_EN: Record<string, string> = {
  '身份': 'identity',
  '收入（PAYG）': 'income_payg',
  '收入（自雇）': 'income_self_employed',
  '银行特定': 'bank_specific',
  '特殊情况': 'special',
  '房产': 'property',
  '结算': 'settlement',
};
```

2. 提交处（现 `category: newCategory`）改为：

```typescript
category: CATEGORY_TO_EN[newCategory] ?? 'special',
```

3. **新增表单的分类下拉**：移除"其他"选项（后端枚举无 other），只留 7 个业务分类；
   展示分组（按 master_category 归类）保留"其他"作未知项兜底，不受影响。

## 二、建档联动提示（可选，推荐补上）

`src/components/cases/NewCaseSheet.tsx` 建档成功回调（onCreated 前）：

- 若后端返回含 `checklist_total`，toast 提示"已按 XX 银行预选 N 项清单，可在对话栏点 📋 查看/调整"；
- 不强制打开抽屉（避免打断建档流程），仅提示入口。

## 三、红线
- 只改：ChecklistDrawer.tsx、NewCaseSheet.tsx（如做第二项）；
- 不改后端（WO-43 枚举为唯一真源）、不新增 npm 依赖；
- `npx tsc --noEmit` 零错误。

## 四、验收
1. 清单抽屉新增"收入（自雇）"分类项 → 提交成功（200），新项出现在"收入（自雇）"分组；
2. 新增下拉无"其他"选项；分组展示"其他"仍可用（历史/未知项正常显示）；
3. 新建案件成功后出现"已预选 N 项清单"提示（如做第二项）；
4. `npx tsc --noEmit` 零错误。

---

# F-29 补丁二（2026-08-14，Vera 拍板）：中栏头部精简 + 递交模式常驻入口

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (51)`（或最新编号）。
> 背景：中栏头部拥挤。拍板方案——左侧只留客户名（无徽章）；右侧清单/任务/**递交模式**保留文字（易辨识），
> 客户全景折叠只留图标按钮。递交模式当前只有 AI 建议卡入口，缺手动切换，本次补上常驻 pill。

## 一、左侧精简（src/components/brain/BrainChat.tsx 头部）

案件对话态左侧只保留**客户名纯文字**（`text-sm font-extrabold`），删除：
- lender 紫色徽章；
- stage 灰色徽章；
- "🧠 已注入案件上下文"整段（Brain 图标 + 文字）。

全局咨询态不变（Sparkles + "全局咨询"）。

## 二、右侧布局（案件对话态）

顺序（自左向右）：

1. **📋 清单**按钮：保留现状（图标 + "清单"文字）；
2. **✅ 任务**按钮：保留现状（图标 + "任务"文字）；
3. **递交模式 pill**（新增，modeStore 驱动）：
   - `mode === 'internal'`：显示"🔒 内线"（紫色系 pill，`title="点击进入递交模式"`），点击 → `setMode('external')`；
   - `mode === 'external'`：显示"📤 递交"（琥珀/黄色系 pill，`title="递交模式：AI 只引用已披露/外线内容，点击退出"`），点击 → `setMode('internal')`；
   - 仅 `activeCaseInfo` 时显示；
4. **客户全景折叠按钮**：去掉 `<span>客户全景</span>` 文字，只留 `PanelRightClose` 图标（`title="展开/收起右栏客户全景"` 保留）。

## 三、切案件复位内线（防串线）

- 在 BrainChat 内监听 `caseId` 变化（`useEffect`），切换案件/进入全局咨询时 `setMode('internal')`；
- 保证递交状态不跨案件残留（红线：外线内容绝不串到另一个客户）。

## 四、高度微调（可选）

- 头部 `py-3` → `py-2.5`，整体更紧凑；其他样式不动。

## 五、红线
- 只改 `BrainChat.tsx`（+ 若复位逻辑需放 AppShell 则仅一处）；不改 SubmissionBanner（黄色警示横幅保留）；
- 不改后端、不新增 npm 依赖；`npx tsc --noEmit` 零错误。

## 六、验收
1. 案件对话态：左侧仅客户名；右侧"📋清单 / ✅任务 / 🔒内线·点击变📤递交 / 全景图标"
2. 点"🔒 内线" → 变"📤 递交"（黄），SubmissionBanner 黄色横幅出现；再点退出 → 回内线、横幅消失
3. 切换到另一案件 → 自动复位"🔒 内线"（无黄色横幅）
4. 全局咨询态：无清单/任务/递交 pill，仅"全局咨询" + 全景按钮
5. `npx tsc --noEmit` 零错误

# F-32（2026-08-14 定稿）：AI 助手设置（人格/名字/称呼）+ 首次对话引导（✅ 已交付 (53)，Codex 验收通过，待真机）

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (52)`（或最新编号）。
> 背景：后端已内置 4 种 AI 人格（a 专业稳重型 / b 亲和贴心型 / c 干脆高效型 / d 活泼幽默型，默认 a）并
> 新增拟人化设置：Vera 首次使用时可给 AI 起名字、告诉 AI 怎么称呼她；后续对话 AI 用名字自称、用她的称呼回应。
> 设置页需要能随时改这三项。后端接口已就绪，无需等待联调。

## 一、后端接口（已上线）

### GET /api/settings/assistant

返回：

```json
{
  "ai_name": "小V",
  "user_address": "Vera姐",
  "persona_key": "d",
  "default_persona": "a",
  "personas": [
    {"key": "a", "name": "专业稳重型", "role": "资深澳洲信贷顾问", "style": "专业、直接、不废话、会主动提醒风险"},
    {"key": "b", "name": "亲和贴心型", "role": "贴心业务助理", "style": "温和、主动关怀、会解释为什么、共情客户处境"},
    {"key": "c", "name": "干脆高效型", "role": "极简效率助手", "style": "最短回复、只给结论和下一步"},
    {"key": "d", "name": "活泼幽默型", "role": "轻松有趣的搭档", "style": "轻松、偶尔幽默、有活力，但专业底线不松"}
  ],
  "onboarding_needed": true
}
```

- `ai_name` / `user_address` 为 null 表示未设置；`persona_key` 为 null 表示用默认（a）。
- `onboarding_needed = !(ai_name && user_address)`：名字或称呼任一为空即 true。

### PATCH /api/settings/assistant

body 示例：`{"ai_name": "小V", "user_address": "Vera姐", "persona_key": "d"}`

- 省略的字段不改动；空字符串清除该字段；persona_key 非法 → 422。
- 返回完整对象（同 GET）。

## 二、要做的事 1：首次对话引导卡（全局咨询 BrainChat）

仅全局咨询（无案件上下文）时生效：

1. 进入全局咨询且 `onboarding_needed === true` → 在消息流顶部显示**引导卡**（内嵌卡片，不用模态框）；
2. 引导卡内容（紧凑单卡）：
   - 标题："认识一下？给我起个名字，也告诉我该怎么称呼您。"
   - AI 名字输入框（placeholder "小V"，maxLength 40）；
   - Vera 称呼输入框（placeholder "Vera"，maxLength 20）；
   - 人格选择：4 个单选（显示 name，悬停 title 显示 role+style）；
   - 按钮："保存并开始"；
   - 右上角关闭 X：可跳过，本次会话不再显示（刷新/重进仍显示，直到设置完成）。
3. 保存 → `PATCH /api/settings/assistant` → 成功后收起卡片，并在对话流插入一条本地 AI 欢迎消息
   （不调后端）："你好，{user_address}！我是{ai_name}，以后就这样叫我。"；
4. 未保存直接关闭 → 不插欢迎消息，正常使用；
5. PATCH 失败 → toast 错误，卡片保留可重试。

## 三、要做的事 2：设置页"AI 助手"卡片（Settings.tsx → 基础配置与健康度 tab 顶部）

1. 在系统设置 tab 最顶部（健康检查区块之前）加"AI 助手"卡片：
   - AI 名字输入框（当前值回显，null 为空）；
   - Vera 称呼输入框（当前值回显）；
   - 人格选择：4 个单选（当前值回显；null 时默认 a 高亮）；
   - 按钮："保存" → `PATCH` → 成功 toast；失败 toast 错误；
   - 小字说明："AI 名字与称呼仅用于内线对话；外线邮件/递交材料不会出现 AI 名字。"
2. 进入该 tab 时 `GET` 一次回显；保存成功后本地状态同步。

## 四、范围与风格

- 只改：`src/components/brain/BrainChat.tsx`（引导卡）、`src/pages/Settings.tsx`（AI 助手卡片）；
  如需可新增小组件文件（如 `AssistantOnboardingCard.tsx` / `AssistantSettingsCard.tsx`）；
- 风格跟随现有设计系统（卡片圆角、motion 动效、现有色板），不要引入新依赖；
- 引导卡内嵌对话流，禁止全屏模态。

## 五、验收

1. 全新状态（无 ai_name/user_address）进入全局咨询 → 显示引导卡；
2. 填名字/称呼/选人格 → 保存 → 卡片消失，出现"你好，X！我是Y…"欢迎消息；
3. 关闭引导卡不保存 → 不出现欢迎消息，可正常对话；
4. 设置页系统 tab：AI 助手卡片回显已保存值，修改保存成功、toast 提示；
5. 保存后重新进入全局咨询 → 不再显示引导卡（onboarding_needed=false）；
6. `npx tsc --noEmit` 零错误。

# F-30（2026-08-14 定稿）：客户全景页重构 — 上下文维护中心 + 时间线（✅ 已交付 (53)，Codex 验收通过，待真机）

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (52)`（或最新编号）。
> 背景：右栏客户全景（CasePanorama）目前是"只读事实卡 + mock 上下文 + 待办卡"。WO-42 后端已上线
> （事实锁定/修正/披露标记 + 蒸馏锁定保护），定稿：全景页 = **上半区上下文维护**（AI 注入的 BrainFact
> 摊开、每项可维护）+ **下半区时间线**（事件证据链）；**不放任务汇总**（右栏最多保留紧凑"下一步"态势）。
> 依据：docs/CASE大脑_客户上下文维护与任务视图_定稿.md §3.3-3.6。

## 一、后端接口（WO-42 已上线，全部真实）

- `GET /api/cases/{case_id}/facts?track=internal|external` → 事实列表，每条含
  `locked_by_user: bool`、`disclosure: 'disclosed' | 'internal_only' | null`（WO-42 新增）；
- `POST /api/cases/{case_id}/facts/{fact_id}/lock` / `unlock` → 锁定/解锁（幂等）；
- `PATCH /api/cases/{case_id}/facts/{fact_id}/disclosure`，body `{"disclosure": "disclosed" | "internal_only" | null}`；
- `POST /api/cases/{case_id}/facts/{fact_id}/amend`，body `{"value": "...", "reason": "..."}` →
  新行替换旧行（旧值走 supersede 审计链）+ 新行自动锁定；
- `GET /api/cases/{case_id}/context-events` → 时间线事件流（含 track/status/created_at）；
- `POST /api/cases/{case_id}/context-events` → 记一笔（手动补充入口）；
- `POST /api/cases/{case_id}/context-events/{event_id}/confirm` / `supersede` → 确认/撤销事件；
- `GET /api/cases/{case_id}/context` → AI 实际注入的上下文（预览用）。

## 二、类型与 API 服务（先做）

1. `src/types/api.ts` `BrainFact` 追加：`locked_by_user: boolean; disclosure: 'disclosed' | 'internal_only' | null;`
2. `src/services/api/cases.ts` 新增：`lockFact` / `unlockFact` / `setFactDisclosure` / `amendFact`
   （对齐上述端点，复用现有 request 封装）。

## 三、上半区：客户上下文维护（重构 CasePanorama / FactCard）

- 数据源改为 `listBrainFacts(caseId)`（不再用 MOCK_CONTEXT 的事实部分），按 `category` 分组展示；
- 每条事实行：
  - 左侧：key 中文名 + value（保留现有 FactCard 样式与 conflict ⚠️ 角标）；
  - track 徽章：**internal 内线 = 黄底** / **external 递交 = 蓝底**（红线：两轨清楚区分，不混排）；
  - 锁定态：🔒 已锁定（人工锁定，AI 不能覆盖）→ 点击弹确认解锁；
  - 披露标记：`internal_only` 显示红色"不能给银行看"角标；`disclosed` 显示绿色"可披露"；null 不显示；
  - 操作按钮（每行 hover 出现）：修正（弹窗：新值 + 原因 → amend）、锁定/解锁、披露标记（三态选择）、
    撤销（确认弹窗 → supersede，仅事件级可撤销时走事件接口）；
- "记一笔"手动补充按钮 → 复用 `POST context-events`（source_type=manual_note），成功后刷新事实与时间线；
- 空态：无事实时显示引导文案"暂无已提取事实，可在对话中记录或点击记一笔"。

## 四、下半区：时间线（证据链）

- 数据源改为 `GET context-events`（不再用 `context.timeline` mock）；按 created_at **倒序**展示全部（可滚动）；
- 每条：source_type 图标 + content + track 徽章（黄/蓝）+ status 状态（pending/confirmed/superseded 置灰）+ 时间；
- pending 事件行提供"确认 / 撤销"操作（复用现有 confirm/supersede 接口），确认后刷新上半区事实；
- 沿用 OverviewTimeline 的视觉风格，但数据与数量不再截断为 5 条。

## 五、预览 / 导出（替换"打包为 AI 上下文 + 复制"）

- 全景页顶部加"预览 AI 上下文"按钮 → 弹层（只读）展示 `GET /api/cases/{case_id}/context` 完整内容 + "复制"按钮。

## 六、删改与保留

- **删除**：CasePanorama 中的完整任务汇总/待办列表（定稿 §3.6：全景页不放任务汇总）；
- **保留**：最多 5 条的紧凑"下一步"态势（若现有 TodoCard 即此形态可保留并保持紧凑）；RightTop 其余卡片按现状；
- 清掉 MOCK_CONTEXT 的事实/时间线回退（加载中可用骨架屏，不允许 mock 数据冒充真实）。

## 七、红线与范围

- 只改右栏相关：`CasePanorama.tsx` / `FactCard.tsx` / `OverviewTimeline.tsx` / `services/api/cases.ts` /
  `types/api.ts`（必要时拆 FactCard 小组件）；不动中栏 BrainChat、不动设置页、不动后端；
- **内外线隔离**：外线视图只展示 `track=external` 的事实（后端已保证 `?track=external` 不返回内线事实），
  前端不得自行把内线内容拼进外线视图；披露标记只是展示层提示，不作为拼接依据；
- 不新增 npm 依赖；`npx tsc --noEmit` 零错误。

## 八、验收

1. 打开案件右栏：上半区事实按类分组，内线黄底 / 递交蓝底清晰可辨；
2. 锁定一条事实 → 🔒 角标；再点解锁 → 消失；
3. 修正事实 → 新值替换、旧值呈"已修正"审计样式；新事实自动带锁定；
4. 标 internal_only → 红色"不能给银行看"角标；`track=external` 视图不出现该事实；
5. 时间线显示真实事件（倒序、全量可滚动）；"记一笔"后立即出现；
6. 撤销一条 pending 事件 → 状态置灰，事实区同步刷新；
7. "预览 AI 上下文"弹层完整显示并可复制；
8. 右栏不再显示完整任务汇总；
9. `npx tsc --noEmit` 零错误。

# F-33（2026-08-14 定稿）：防串案建议卡 + 递交模式二次确认

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (52)`（或最新编号）。
> 背景：防串案协议②（缺口清单 #2，定稿 2026-08-12）——AI 提取事实只归当前会话绑定案件；对话中出现其他客户名 →
> 未确认不写事实、不进蒸馏，弹建议卡。后端已上线（5a2ed97），本批做卡展示与交互。
> 同时补上递交模式进入前的二次确认（此前直接切换，缺防误切）。

## 一、后端已就绪（无需等待）

LLM 调 `record_fact` 且内容命中其他案件客户名时，后端**不写入**，chat 响应的 `tool_cards` 追加一条：

```json
{
  "type": "attribution_suggest",
  "title": "这条信息看起来属于其他客户",
  "payload": {
    "content": "还原后的事实原文",
    "matched_client": "李四",
    "matched_lender": "NAB",
    "matched_case_id": "AS-2",
    "track": "internal"
  }
}
```

此时 `recorded_facts` 为空、无事件落库（红线：未确认不写入、不进蒸馏）。

## 二、防串案建议卡（BrainChat.tsx 卡片渲染区，submission_suggest 分支旁新增）

- 新增 `card.type === 'attribution_suggest'` 分支，渲染**红色警示系**卡片（与 submission_suggest 的琥珀色区分）：
  - 标题：⚠️ 这条信息看起来属于其他客户；
  - 正文：「{matched_client}（{matched_lender}）」+ 事实摘要（`content` 截断 80 字）；
  - 三个按钮：
    1. **「切换到 {matched_client}」** → `useCaseStore.setCurrentCase(matched_case_id)`，并触发与左栏点案件一致的导航动作
       （F-28 已有 setCurrentCase + brain 联动，参照即可）；卡片消失；toast「已切换到 李四（NAB）」；
    2. **「仍记录到当前案件」** → `POST /api/cases/{当前case}/context-events`，
       body `{"source_type": "manual_note", "content": payload.content, "track": payload.track, "status": "confirmed"}`
       → 成功 toast「已记录到当前案件」+ 卡片消失 + 刷新该案件上下文/事实；
    3. **「取消」** → 卡片消失，不写入。

## 三、递交模式二次确认（BrainChat.tsx）

- 新增 `requestEnterSubmission()`：打开轻量确认弹窗（motion，样式跟随现有设计系统）：
  - 标题：「进入递交模式？」；
  - 正文：「递交模式下 AI 只引用已披露/外线内容生成对外草稿，内线信息不会出现在外线内容中；草稿仍需你确认后发送。」；
  - 按钮：「进入递交」→ `setMode('external')` + toast「已进入递交模式」；「取消」→ 关闭。
- 两个触发点都走同一弹窗：
  1. 头部递交 pill：`mode === 'internal'` 时点击 → `requestEnterSubmission()`；`mode === 'external'` 时点击 →
     直接 `setMode('internal')`（退出不确认）；
  2. `submission_suggest` 卡片的「进入递交模式」按钮：onClick → `requestEnterSubmission()`（不再直接 `setMode('external')`）。
- 切换案件自动复位内线（F-29 补丁二已有）保持不变。

## 四、范围与红线

- 只改 `BrainChat.tsx`（如需要同步 CardType 类型定义）；不动后端、不动设置页、不新增 npm 依赖；
- `attribution_suggest` 卡展示的 `content` 是后端还原后的真实文本（本地展示安全），前端不得自行拼接外线内容；
- `npx tsc --noEmit` 零错误。

## 五、验收

1. 张三案件对话触发"记一下李四转贷" → 出现红色建议卡「李四（NAB）」+ 事实摘要；`recorded_facts` 为空；
2. 点「切换到李四」→ 当前案件切到李四案件、卡片消失、toast 提示；
3. 点「仍记录到当前案件」→ 事件落库到当前案件、toast 成功、卡片消失、上下文刷新；
4. 点「取消」→ 卡片消失，无任何写入；
5. 点头部「🔒 内线」→ 弹确认框；确认后进入递交（黄）；取消不切换；
6. submission_suggest 卡「进入递交模式」→ 同样弹确认框；
7. 递交态点 pill → 直接回内线，无弹窗；
8. `npx tsc --noEmit` 零错误。

# F-31（2026-08-14 定稿）：待办工作台退役 — TaskDetailOverlay + 清单 tab 退役

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (53)`（或最新编号）。
> 背景：待办工作台（TaskWorkbench = TaskList + DetailPanel）退役——列表价值已被首页今日待办（跨客户）+
> 中栏任务抽屉（单客户，F-29）覆盖；详情价值独家（8 类任务详情处理），抽成通用覆盖层 TaskDetailOverlay，
> 从所有出现任务的地方打开。清单 tab（CaseDetail）退役，维护职责由中栏"清单"抽屉承担（F-29）。
> OsWorkbench 保留为 OS 专用。依据：定稿 §9.1/§9.2/§10.2。

## 一、TaskDetailOverlay（核心，新建）

- 新建 `src/components/tasks/TaskDetailOverlay.tsx`：
  - Props：`task: TaskItem | null`、`onClose: () => void`（打开入口统一 `useUiStore`/`taskStore.selectedTaskId` 联动）；
  - 内容 = 现有 `DetailPanel` 的详情车间（`src/components/panel/DetailPanel.tsx`，全项目仅 TaskWorkbench 引用）：
    - 把 8 类详情组件按 `task.type` 分发原样迁入（EMAIL_DISPATCH→EmailDispatchDetail、NEW_CLIENT→NewClientDetail、
      GENERAL_EMAIL→GeneralEmailDetail、FILE_MATCH→FileMatchDetail、OS→OsAttackDetail、
      BOSS/ESCALATION→BossDecisionDetail、OVERDUE→OverdueDetail、SETTLEMENT→SettlementDetail，
      实际 type 枚举以现有 DetailPanel switch 为准，一字不改）；
    - 保留 `selectedTaskId → caseStore` 联动（ContextBar 显示当前客户上下文）；
    - 保留就地操作（标记完成/委派/改截止/老板三键/邮件草稿等），**只搬不重构**；
  - 形态：全屏大覆盖层（右滑入 + 遮罩，motion，跟随设计系统），顶部任务标题 + 关闭 X；
  - 关闭：X / 点遮罩 / Esc。

## 二、打开入口（全部接 TaskDetailOverlay）

1. **首页今日待办**（HomePage 待办项）：每项加"打开详情"图标按钮（ArrowUpRight）；
2. **中栏任务抽屉**（TaskDrawer）：每项加"打开详情"；
3. **对话任务卡"打开详情"**：BrainChat 中 task 相关卡片如有详情入口则接入（没有可跳过）；
4. 其他出现任务的地方（右栏"下一步态势"全量待办入口等）保持跳转中栏任务抽屉即可，不强接覆盖层。

## 三、页面退役

- `src/pages/TaskWorkbench.tsx` 与 `src/components/tasks/TaskList.tsx` 退役：AppShell `view === "tasks"` 移除或重定向首页，
  导航（Sidebar/TopNav）不再有待办工作台入口；分类筛选能力已由首页 taskTab（all/overdue/boss/ai）+
  中栏抽屉 tab 覆盖；
- `src/pages/CaseDetail.tsx`：移除 `checklist` tab（清单维护 → 中栏清单抽屉），overview/timeline 保留；
- `TodoCard.tsx` 已无引用（F-30 移除），随本批清理（如仍无引用）。

## 四、清单抽屉唯一化

- 中栏清单抽屉（`ChecklistDrawer`）确认已复用 `ChecklistDrawerContent`/`ChecklistPanel` 的维护能力
  （标记已收/撤销文件匹配/新增自定义项/换文件）；如尚未复用，本批补上——清单 tab 退役后中栏抽屉是唯一维护入口。

## 五、保留

- `OsWorkbench`（OS 专用：OsConditionsColumn / OsStrategyColumn / OsDraftColumn）保持不动；
- DetailPanel 内非 8 类的组件（ChatPanel 悬浮对话等）随页面退役评估，不在覆盖层里保留的不迁移。

## 六、范围与红线

- 主要改动：新建 TaskDetailOverlay.tsx；改 HomePage.tsx / TaskDrawer.tsx / AppShell.tsx / CaseDetail.tsx /
  ChecklistDrawer.tsx（如需复用）；DetailPanel 下 8 类详情组件文件可移动/可保留原位（逻辑零改动）；
- 不改后端、不新增 npm 依赖、OsWorkbench 零改动；`npx tsc --noEmit` 零错误。

## 七、验收

1. 首页今日待办每项可"打开详情" → TaskDetailOverlay 按类型渲染正确详情（老板三键/邮件草稿/OS 回复/文件匹配/委派）；
2. 中栏任务抽屉每项可"打开详情"；覆盖层可 X/遮罩/Esc 关闭；
3. 待办工作台页面不再可达（导航无入口）；
4. CaseDetail 无"清单"tab；中栏清单抽屉可完成标记已收/新增/换文件；
5. OsWorkbench 正常；待办的操作（完成/委派/改截止/升级老板）在覆盖层里照常可用；
6. `npx tsc --noEmit` 零错误。

# F-34（2026-08-14 定稿）：文件 Agent — 中栏"文件"入口 + 案件文件夹抽屉

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (53)`（或最新编号）。
> 背景：文件操作定稿（主文档 §十三）落地。Vera 拍板：中栏"清单/任务"边上加**文件**按钮，点击打开
> **案件映射文件夹抽屉**，点文件可预览；改名/移动/放入均弹窗确认；改名弹窗带**规范命名建议**；
> 放入=复制保留原文件；V1 不做物理删除。后端 WO-44 提供接口（浏览/预览/改名/移动/放入/命名建议）。

## 一、后端接口（WO-44，契约固定）

- `GET /api/cases/{case_id}/folder/files?path=` → `{current_path, items:[{name, rel_path, is_dir, size, mtime, doc_type}]}`（一层，子目录在前）
- `GET /api/cases/{case_id}/folder/files/preview?path=` → `{rel_path, size, mtime, doc_type, text_preview, parse_error}`
- `POST /api/cases/{case_id}/folder/files/rename` body `{source, new_name}` → `{ok, source, target, event_id}`
- `POST /api/cases/{case_id}/folder/files/move` body `{source, target_dir}`
- `POST /api/cases/{case_id}/folder/files/import`（multipart：`file` + `target_dir`，复制保留原文件）
- `GET /api/cases/{case_id}/folder/naming-suggest?filename=` → `{doc_type, suggested, template_key, matched, reasons}`

## 二、中栏"文件"入口（BrainChat.tsx 头部）

- 案件对话态，在「清单」「任务」之间加**文件**按钮（`FileText` 图标 + "文件"文字，样式同清单/任务按钮）；
- 全局咨询态不显示；点击 → `useUiStore.setFileDrawerOpen(true)`（新增状态）；
- 对话触发语（"打开文件/文件/预览文件"等）命中 WO-44 流程包 → dialog 卡 → 同样打开文件抽屉
  （参照 calculator dialog 卡打开 CalculatorPanel 的现有机制）。

## 三、文件抽屉 FileDrawer（新建 `src/components/brain/FileDrawer.tsx`）

1. **头部**：案件名 + 当前相对路径（面包屑，可点上级）+ 刷新 + 「放入文件」+ 关闭 X；
2. **文件列表**：当前层子目录（可点击进入）+ 文件行（名称 / 大小 / 时间 / doc_type 徽章）；
3. **预览**：点击文件行 → 行内/下方预览面板：`text_preview` + 元数据；`parse_error` 时显示错误提示（不白屏）；
4. **改名**（hover 按钮）：弹窗 = 旧名 → 新名输入 + 「AI 建议命名」按钮（调 naming-suggest，展示 `suggested`
   与 reasons，一键填入）+ 确认（POST rename）→ toast + 刷新列表；
5. **移动**：弹窗 = 案件内子目录选择（复用文件夹树数据，逐层进入选目录）+ 确认（POST move）→ toast + 刷新；
6. **放入文件**：`<input type="file">` 选文件 → 目标子目录选择 → 确认（POST import）→ toast
   "已复制到案件文件夹（原文件保留）"；
7. 底部安全小字："操作只作用于当前案件文件夹；目标已存在将拒绝；不会覆盖任何文件。"

## 四、范围与红线

- 主要改动：`BrainChat.tsx`（头部按钮 + dialog 卡联动）、新增 `FileDrawer.tsx`、`uiStore`（fileDrawerOpen）、
  `types/api.ts`（FileOps 类型）、`services/api/fileOps.ts`（新服务封装）；
- 不改后端、不新增 npm 依赖；文件操作全部由后端 PathGuard 校验，前端只负责展示与确认；
- `npx tsc --noEmit` 零错误。

## 五、验收

1. 案件对话态中栏有「文件」按钮，全局咨询无；
2. 点击打开抽屉：显示案件文件夹当前层（子目录在前、文件带元数据），面包屑可回上级；
3. 点击文件 → 预览面板显示解析文本/元数据；无法解析显示错误提示；
4. 改名弹窗：AI 建议命名一键填入，确认后列表刷新 + toast；
5. 移动弹窗：选子目录确认后刷新 + toast；
6. 放入：选文件 + 目标目录 → 复制成功 toast；重名被拒提示；
7. 后端 422/404/409 时前端显示对应错误 toast，不白屏；
8. 对话说"打开文件"→ 出现 dialog 卡并可打开抽屉；
9. `npx tsc --noEmit` 零错误。

# F-35 补丁（2026-08-14 定稿）：中栏三件套（清单/任务/文件）改居中悬浮面板

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (54)`。
> 背景：清单/任务/文件三个抽屉目前都是**右侧滑出**（`flex justify-end` + `x:100%` 动画），悬在中栏与右栏全景
> 之间，视觉重心偏右且与客户全景抢注意力。拍板：改成**中栏居中的悬浮面板**——浮在中栏正中，
> 左右两侧露出左栏案件列表与右栏全景；轻量操作小面板，深度详情（TaskDetailOverlay）保持大覆盖层不变。

## 一、容器与定位（三个文件各改一处）

- `src/components/brain/TaskDrawer.tsx`、`ChecklistDrawer.tsx`、`FileDrawer.tsx`：
  - 遮罩容器：`absolute inset-0 bg-black/20 dark:bg-black/40 z-30 backdrop-blur-xs flex justify-end`
    → `flex items-center justify-center`（FileDrawer 若用 `fixed inset-0` 也统一改 `absolute inset-0`，
    三者都相对中栏容器居中）；
  - 面板：右侧整高面板 → **居中悬浮卡片**：
    - 任务/清单：`w-[480px] max-w-[92%] h-[min(760px,90%)] rounded-2xl border shadow-2xl bg-[var(--bg-panel)] flex flex-col overflow-hidden`；
    - 文件：`w-[640px] max-w-[94%] h-[min(820px,92%)] rounded-2xl border shadow-2xl bg-[var(--bg-panel)] flex flex-col overflow-hidden`（需要预览空间）；
  - 动画（motion）：遮罩 `opacity 0→1`；面板 `initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}`
    `exit={{ opacity: 0, scale: 0.96 }}`（从中心淡入缩放，**去掉 `x:'100%'` 右滑**）；reduced motion 时仅 opacity；
  - 关闭：保留现有 X；补上点击遮罩关闭 + Esc 关闭（如未实现）。

## 二、内容零改动

- 三个抽屉**内部内容结构、状态、交互全部不动**（任务列表/清单维护/文件浏览预览改名移动放入），
  只改容器定位与动画；顶部标题栏保留（案件名 + 当前功能名 + 关闭 X）。
- TaskDetailOverlay（F-31 深度详情大覆盖层）**不在本批范围**，保持大覆盖层形态。

## 三、范围与红线

- 只改：`TaskDrawer.tsx` / `ChecklistDrawer.tsx` / `FileDrawer.tsx` 三个文件的容器层；
- 不改后端、不新增 npm 依赖；`npx tsc --noEmit` 零错误。

## 四、验收

1. 案件对话态点「清单」「任务」「文件」→ 三个面板均**居中于中栏**（左右两栏可见），从中心缩放淡入；
2. 关闭：X / 点遮罩 / Esc 均可，退出动画反向；
3. 文件抽屉 640px、清单/任务 480px，内部内容与操作完全不变（预览/改名/移动/放入/标记已收/建任务照常）；
4. 全局咨询态不显示三个按钮（现状保持）；
5. TaskDetailOverlay 大覆盖层不受影响；
6. `npx tsc --noEmit` 零错误。

# F-36（2026-08-14 晚定稿）：右栏回归"看态势"（只读瘦身）

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (54)`。
> 背景：批次修正定稿（客户上下文维护与任务视图_定稿.md §十四）——F-30 把"上下文维护中心"做进了右栏，
> 与定稿（右栏看态势、客户全景页管"AI 知道什么"）颠倒。本批把**右栏瘦身回归只读态势**，
> 维护能力由 F-37 承接进 CaseDetail 客户全景 tab。

## 一、目标形态（CasePanorama.tsx 重做）

右栏 = **只读态势**，硬规则：**无任何操作按钮、只读、点击跳转**。

1. **头部**：只留标题「客户全景」+ 右侧折叠按钮；**删除**：预览 AI 上下文、记一笔、刷新按钮、分轨视域整行；
2. **客户横幅**：客户名（银行）+ 阶段 + 一行摘要/记忆（truncate），保留；
3. **关键截止**（1–3 条）：Finance Clause 等截止，红黄绿紧迫度（复用现有 keyDeadlines 逻辑，改名为关键截止）；
4. **下一步待办 ≤5**：按紧迫度排序（逾期 > 今天 > 7 天内 > 其他），红黄绿 + 分类徽标（👑老板 / 📧邮件 / 📁文件 / 🏦OS）；
   **只读**——点击条目跳转中栏任务抽屉（保留"全量待办"入口）；
5. **风险情报**：真实风险（RiskSection）默认展开；政策（PolicyHintCard）**折叠成一行**（✅/⚠️ 政策画像，可点开）；
6. **事实快照**（折叠，≤5 条）：只读展示 key/value + 轨道徽章，底部「去维护 →」跳 CaseDetail 客户全景 tab；
7. **时间线快照**（折叠，≤5 条）：context-events 只读倒序，底部「去维护 →」跳 CaseDetail 客户全景 tab。

## 二、导航接线（AppShell）

- CasePanorama 内"去维护"→ `window.dispatchEvent(new CustomEvent('open-case-detail', { detail: caseId }))`；
- AppShell 监听该事件：`setSelectedCaseId(caseId); setView("case-detail")`（复用 CaseBoard 的 onOpenCase 逻辑）。

## 三、删除与保留

- **删除**：FactAmendModal / ManualNoteModal / ContextPreviewModal 在右栏的引用（F-37 迁到全景页）；
  FactCard 的锁定/披露/修正操作 UI（快照只用只读行）；分轨筛选；全部操作按钮；
- **保留**：PolicyHintCard（折叠）、RiskSection、OverviewTimeline（改为 ≤5 只读快照）、加载骨架/空态/错误态。

## 四、范围与红线

- 只改：`CasePanorama.tsx`、`AppShell.tsx`（+ 事件监听）、必要时 `FactCard.tsx` 加只读模式；
- 不改后端、不新增 npm 依赖；右栏不出现任何"写"操作（红线：只读 + 点击跳转）；
- `npx tsc --noEmit` 零错误。

## 五、验收

1. 右栏头部只有标题 + 折叠，无预览/记一笔/刷新/分轨；
2. 关键截止 1–3 条红黄绿；下一步待办 ≤5 只读，点击可跳到中栏任务抽屉；
3. 风险默认展开、政策折叠一行；
4. 事实/时间线折叠快照 ≤5 条，只读；「去维护」跳 CaseDetail 客户全景 tab；
5. 无任何操作按钮/弹窗（修正/记一笔/预览全部不在右栏）；
6. `npx tsc --noEmit` 零错误。

# F-37（2026-08-14 晚定稿）：CaseDetail 客户全景 tab 升级 = 上下文维护中心 + 时间线

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (54)`。
> 背景：批次修正定稿 §十四——"全景页管 AI 知道什么"。把 F-30 在右栏做的那套**上下文维护中心 + 时间线**
> 迁移/复用进 CaseDetail 客户全景 tab（BrainPanel），清掉旧卡片与 mock；右栏只读态势由 F-36 负责。

## 一、BrainPanel 重做（CaseDetail 客户全景 tab）

1. **上半区 上下文维护中心**（复用 F-30 在 CasePanorama 里已实现的逻辑与组件，原样迁移）：
   - 数据：`listBrainFacts(caseId)`（含 locked_by_user/disclosure），按 category 分组（CATEGORY_TITLES）；
   - 操作：锁定/解锁、披露三态（disclosed / internal_only / 清除）、修正弹窗（新值 + 原因，成功后新值自动锁定）、
     "记一笔"（track 内线/递交可选）；
   - 分轨筛选：全部 / 🟡内部 / 🔵递交（影响事实 + 时间线）；
   - 空态："暂无已提取事实，可点击记一笔或在对话中记录"；
2. **下半区 时间线（证据链）**：`listContextEvents` 倒序全量滚动，轨道徽章（黄/蓝）+ 状态
   （pending 可确认/撤销、confirmed、superseded 置灰划线）；
3. **预览/导出**：保留 ContextPreviewModal，按钮文案改「导出案件上下文」（说明：案件数据包，非 AI 内部提示词）。

## 二、清 mock 与旧形态

- 删除 BrainPanel 的 `MOCK_CONTEXT` 与 `VITE_USE_MOCK` 分支，全部走真实接口；
- 删除 OverviewFacts 卡片网格 / OverviewTools / 旧 OverviewTimeline（context.timeline 5 条）引用；
- TimelinePanel（CaseDetail 时间线 tab，里程碑 `/timeline`）**保留**，同样删除 `MOCK_EVENTS` 与 mock 分支。

## 三、组件复用（不搬文件，直接 import）

- `src/components/brain/` 下的 `FactCard` / `FactAmendModal` / `ManualNoteModal` / `ContextPreviewModal` /
  `OverviewTimeline` 由 BrainPanel 直接复用；F-36 后右栏不再使用维护相关组件。

## 四、范围与红线

- 只改：`BrainPanel.tsx`（重做）、`TimelinePanel.tsx`（清 mock）、必要时 `CaseDetail.tsx`（tab 布局微调：
  客户全景 tab 内容可上下分区滚动）、`types/api.ts`（如需）；
- 不改后端、不新增 npm 依赖；维护操作仍走既有端点（锁定/修正/披露/事件），前端只做确认弹窗；
- `npx tsc --noEmit` 零错误。

## 五、验收

1. 案件看板 → 客户全景 tab：上半区事实按类分组（内线黄/递交蓝），锁定/解锁/披露/修正/记一笔全部可用；
2. 下半区时间线 = context-events 证据链（倒序全量、pending 可确认/撤销）；
3. "导出案件上下文"弹窗可复制；无任何 mock 数据（PERSON_1/CBA 假数据不再出现）；
4. CaseDetail 时间线 tab = 里程碑（/timeline），真实数据；
5. 右栏（F-36 后）只读态势，维护操作只在全景页出现；
6. `npx tsc --noEmit` 零错误。

# F-38 补丁（2026-08-14 晚，Codex 审查 (55) 后）：三处修复

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (55)`。
> 背景：Vera 反馈三处问题——① 右栏看不到"标记为不披露（internal_only）"的信息；② 中栏逾期提醒
> 点「查看待办」只弹 toast、页面无变化；③ 案件看板客户全景页空态文案"在右侧对话中录入聊天记录"错误。

## 一、右栏披露标记（CasePanorama.tsx + RiskSection.tsx）

1. **事实快照**（CasePanorama 事实快照行）：在轨道徽章旁增加披露徽章——
   `fact.disclosure === 'internal_only'` → 红色「🔒 不能给银行看」；
   `fact.disclosure === 'disclosed'` → 绿色「可披露」；null 不显示；
2. **RiskSection 接线修复**：`CasePanorama` 里
   `hasUndisclosed={facts.some((f) => f.category === 'disclosure')}`（错误：查的是事实分类）
   → `hasUndisclosed={facts.some((f) => f.disclosure === 'internal_only')}`（正确：查披露标记）；
   并新增 `undisclosedCount={facts.filter((f) => f.disclosure === 'internal_only').length}`，
   RiskSection 显示「N 条标记为不能给银行看」的警示行（如无则显示"无"或不显示）。

## 二、中栏逾期提醒 → 真正打开任务抽屉（CaseReminderBanner.tsx + BrainChat.tsx + TaskDrawer.tsx）

1. `CaseReminderBanner` 增加 prop `onViewTodos?: () => void`：点击横幅或「查看待办」→ 调用 `onViewTodos()`
   （不再只 `showToast`）；
2. `BrainChat` 传入 `onViewTodos={() => setTaskDrawerOpen(true)}`（并保留 toast 提示或移除）；
3. `TaskDrawer` 增加 **「逾期」筛选 tab**（TabType 加 `'overdue'`：`!t.completed && deadline < now`，
   红黄绿紧迫度逻辑复用），并把逾期 tab 排在「全部」之后；
4. 联动（推荐）：提醒点击后**打开抽屉并自动切到「逾期」tab**——`BrainChat` 打开前通过
   `useUiStore` 加 `taskDrawerInitialTab` 状态（或 TaskDrawer 接收外部 prop），逾期时置 `'overdue'`，
   手动点头部按钮打开时默认 `'all'`。

## 三、全景页空态文案（BrainPanel.tsx）

- `可点击上方「记一笔」手动补充事实，或在右侧对话中录入聊天记录`
  → `可点击上方「记一笔」手动补充事实，或在案件对话中与 VERA 聊天时记录`（全景页无"右侧对话"）。

## 四、范围与红线

- 只改：`CasePanorama.tsx` / `RiskSection.tsx` / `CaseReminderBanner.tsx` / `BrainChat.tsx` /
  `TaskDrawer.tsx` / `BrainPanel.tsx`（+ `uiStore` 若加 initialTab）；
- 不改后端、不新增 npm 依赖；披露标记仅展示层，不改变外线隔离逻辑（后端已保证）；
- `npx tsc --noEmit` 零错误。

## 五、验收

1. 右栏事实快照：`internal_only` 事实显示红色「🔒 不能给银行看」；风险区出现「N 条标记为不能给银行看」警示；
2. 中栏逾期提醒点击 → 任务抽屉打开并自动切「逾期」tab，逾期项可见；手动点头部按钮 → 默认「全部」；
3. 案件看板客户全景页空态：文案不再出现"右侧对话"；
4. `npx tsc --noEmit` 零错误。

# F-38 补丁二（同日追加，Codex 深度对照定稿 §3.1）：右栏区块骨架常驻（空态占位）

> 背景：深度对照发现右栏五块内容代码已实现，但"关键截止 / 下一步待办 / 风险情报"是**条件渲染且无空态占位**
> ——无数据时整块消失，Vera 看到空案件右栏只剩横幅 + 两个折叠快照，误以为规划内容未落地。
> 修复：三块加空态占位行，区块骨架**始终可见**，有数据自然填充。

## 一、关键截止（CasePanorama.tsx）

- 现有 `{keyDeadlines.length > 0 && (...)}` 改为**常驻渲染**：
  - 有数据：现状内容（1–3 条，红黄绿）；
  - 无数据：区块保留标题「关键截止」+ 一行灰字「暂无关键截止」（不占高度、不显得空荡）。

## 二、下一步待办（CasePanorama.tsx）

- `{sortedNextTasks.length > 0 && (...)}` 改为**常驻渲染**：
  - 有数据：现状内容（≤5 条，红黄绿 + 分类徽标，只读 + 点击跳转）；
  - 无数据：标题「下一步待办」+ 灰字「暂无待办」+ 保留「全量待办 (N) →」入口（点击仍打开中栏任务抽屉）。

## 三、风险情报（RiskSection.tsx）

- RiskSection 当前 `if (!hasRisks && !hasSpecial && !hasUndisclosed) return null;`
  → 无内容时渲染一行灰字「暂无风险提示」（区块标题「风险情报」保留，PolicyHintCard 折叠逻辑不变）。

## 四、范围与验收

- 只改：`CasePanorama.tsx` / `RiskSection.tsx`；不改后端、不新增依赖；
- 验收：
  1. 空案件右栏：关键截止/下一步待办/风险情报三块标题+灰字占位**全部可见**；
  2. 有数据案件：占位被真实内容替换，行为与现状一致；
3. 「全量待办」入口在空态下仍可跳转；
4. `npx tsc --noEmit` 零错误。

# F-38 补丁三（同日追加）：事实快照折叠标题加"🔒 不能给银行看"角标

> 背景：补丁一已把披露徽章加进事实快照行，但快照**默认折叠**且徽章只在有 internal_only 事实时出现，
> Vera 不展开就看不到"有不披露信息"。本补丁让折叠态也可见。

## 一、CasePanorama.tsx 事实快照折叠标题

- 计算 `undisclosedCount = facts.filter((f) => f.disclosure === 'internal_only').length`；
- 折叠标题「事实快照 (N)」→ 有 internal_only 时显示：
  `事实快照 (N) · 🔒 M 不能给银行看`（红色小字，M = undisclosedCount）；
- 无 internal_only 时保持原样「事实快照 (N)」。

## 二、范围与验收

- 只改 `CasePanorama.tsx`；不改后端、不新增依赖；
- 验收：
  1. 案件有 internal_only 事实时，**不展开快照**也能在标题看到「🔒 M 不能给银行看」；
  2. 无标记事实时标题无角标；
  3. 展开后行内红标与标题角标一致；
  4. `npx tsc --noEmit` 零错误。

# F-39（2026-08-15 定稿）：中栏底部收纳 + 快捷发问 + 顶部数量徽章 + 发文件识别入口

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (56)`。
> 背景：Vera 对 (56) 中栏提出四件事——① 底部常驻「已记录 N 条」挂栏不美观，收进小入口，同区域放快捷发问；
> ② 中栏顶部「清单」「任务」按钮显示数量徽章；③ 待确认（pending）记录要有可见提醒防漏确认；
> ④ 中栏输入框加「发文件/图片给 VERA 识别」入口（OCR：工资单/银行流水/证件），后端 WO-44 的
> `import` + `preview` 端点已就绪，本批纯前端接线。

## 一、中栏底部（BrainChat.tsx）

现状（(56) 代码位置）：
- `L1075-1085`：`confirmedEvents.length > 0` 时整行渲染紫色挂栏「📌 已记录 N 条」+「查看」→ 打开 RecordedEventsDrawer；
- `L1060-1074`：pendingEvents 待确认卡（ConfirmCard）混在消息流底部；
- `L1087-1100`：输入框 footer（Sparkles + input + 发送）。

改法：
1. **删除整行「已记录 N 条」挂栏**，改为输入框 footer 左侧（Sparkles 之前）的小胶囊按钮：
   - `id="recorded-events-pill"`，图标 📌 + 数字（`confirmedEvents.length`）；为 0 时不显示；
   - 点击打开现有 RecordedEventsDrawer（复用 `drawerOpen` 状态）；
   - `pendingEvents.length > 0` 时胶囊右上角加红色脉冲小圆点（`title="有待确认记录 N 条"`）。
2. **快捷发问 chips 行**（消息流与输入框之间，`flex-shrink-0`）：
   - 复用现有 `QUICK_ASKS`（8 项，BrainChat.tsx L32-42），横向滚动 `overflow-x-auto no-scrollbar`；
   - chip 样式沿用现有按钮：`var(--bg-card)`/`var(--border)`，hover `border-purple-500/40`；
   - 点击 = 等价输入并发送：`action === 'ask'` → 直接发消息；`'calculator'` → 打开 CalculatorPanel；
     `'new_case'` → 触发建案（现有 handler）；`'compose_email'` → 触发写邮件流程（现有 mock 分支 L331-549 的对应映射）；
   - 全局咨询（无案件）与案件模式都显示。
3. 待确认卡区块（pendingEvents → ConfirmCard）保持现状不折叠——确认是高频动作要保持显眼；胶囊红点仅作入口提醒。

## 二、中栏顶部数量徽章（BrainChat.tsx header，L645-676）

1. **「任务」按钮**：右上角数字徽章 = 当前案件未完成任务数（`completed === false`）；
   数据源与现有 `overdueCount/dueTodayCount` 同源（taskStore），可新增 `uncompletedCount`；
   `overdueCount > 0` 时徽章红色，否则紫色系。
2. **「清单」按钮**：右上角数字徽章 = 未收完数（`status !== 'received' && status !== 'confirmed'`）；
   ChecklistDrawer 目前自己 fetch `getChecklist`（L90-110），BrainChat 拿不到 →
   方案 A（推荐）：BrainChat 新增 `checklistPendingCount` state，caseId 变化时调
   `getChecklist(caseId)`（services/api/cases 已导出）计算未收完数；
   方案 B：抽公共 hook `src/hooks/useDrawerCounts.ts` 返回 `{taskUncompleted, taskOverdue, checklistPending, fileCount}`。
   二选一，推荐 A（改动面最小）。
3. **「文件」按钮**：可选。显示文件夹文件数（FileDrawer 列表长度）；做则一致显示，不做保持现状（本批不强制）。
4. 徽章样式：按钮右上角绝对定位小圆点/胶囊（按钮已可加 `relative`）；数字 ≤99 显示数字，>99 显示 `99+`；
   颜色沿用按钮主色系（清单绿/文件蓝/任务紫），逾期任务用红色。

## 三、中栏输入框附件入口（BrainChat.tsx input footer）

1. 输入框左侧（Sparkles 之前）加「📎 附件」按钮：`id="brain-chat-attach-btn"`；
   隐藏 `input type="file"`：`accept=".pdf,.doc,.docx,.xlsx,.xls,.msg,.txt,.jpg,.jpeg,.png,.csv"`（与 WO-44 白名单一致，单选）。
2. **仅案件模式显示**（有 `activeCaseInfo/caseId`）；全局咨询不显示（无案件可归属的文件夹）。
3. 选择文件后的流程：
   - `importCaseFile(caseId, file, '')`（services/api/fileOps.ts L165）→ 复制进案件文件夹根目录（保留原文件语义）
     → 成功拿到 rel_path；重名 409 → toast「同名文件已存在」；
   - `previewCaseFile(caseId, rel_path)`（fileOps.ts L104）→ 拿 `text_preview`（≤2000 字符，即 OCR 识别文本）；
     `parse_error` 时 toast 提示但对话继续；
   - 成功后向对话流 append 一条 **assistant 系统上下文消息**（视觉标「📄 文件识别」小标签）：
     `已识别文件《{name}》：\n{text_preview 截断 800 字}`；
   - 后续用户消息自动附带文件上下文（prompt 前缀「已识别文件《name》，请基于以上内容处理：」或 payload
     带 `attached_file`，二选一，推荐前缀法，改动最小）；
   - 失败：toast 错误，不阻塞输入。
4. 识别中状态：按钮 loading（旋转图标）防重复点击；后端 60s 超时已有，前端仅 loading，不额外计时。

## 四、范围与红线

- 只改：`BrainChat.tsx`（必改）、`ChecklistDrawer.tsx` 或新增 `src/hooks/useDrawerCounts.ts`（徽章计数，二选一）、
  `RecordedEventsDrawer.tsx`（可选微调胶囊/标题）；
- 不改后端、不新增 npm 依赖、不直接访问文件系统（浏览器 File 对象走现有 API）；
- 附件入口与 FileDrawer 导入并存：附件入口 = 「发文件让 VERA 识别」，FileDrawer = 「管理文件夹」；
- 附件按钮只在有案件时出现；不自动改名/移动（WO-44 语义：import=复制、原文件保留）；文本预览只进对话上下文。

## 五、验收

1. 底部不再有整行「已记录 N 条」挂栏，只有小胶囊；点击打开记录抽屉；有待确认时红点可见；
2. 快捷发问 chips 在输入框上方一行、横向滚动可用，点击能发出消息/打开计算器等；
3. 「任务」按钮显示未完成数、逾期红色；「清单」按钮显示未收完数；确认/完成操作后数字实时更新；
4. 输入框附件按钮仅案件模式可见；选文件后自动导入+识别，对话出现「📄 文件识别」消息含 OCR 文本；重名/失败有 toast；
5. `npx tsc --noEmit` 零错误。

# F-40（2026-08-16 定稿 v2）：中栏快捷折叠 + 三共创弹窗深谈 + 文件原文预览

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (57)`。
> 背景：Vera 对 (57) 提出三问题——① 文件预览显示的是解析文本而非原文；② 中栏底部快捷按钮太多；
> ③ 邮件没有独立悬浮窗，「写补件邮件」点击无反应。
> **v2 升级（2026-08-16 拍板）**：按主文档 §二 定稿，共创类（邮件/催件/OS 回复）= **弹窗深谈（独立子会话）**，
> 三个共创流程统一对齐（不只邮件）；DraftCard 的"翻译/复制"占位按钮一并修复。
> 后端配套 = WO-46（raw 原文流 + POST /api/drafts）+ WO-46b（共创对话端点：案件全景注入/澄清/版本链/收尾）；
> WO-46/WO-46b 未交付前相关功能保持 mock/占位不报错。

## 一、中栏快捷按钮折叠（BrainChat.tsx）

1. **删除 QUICK_ASKS chips 行**（现状 (57) L1215-1230 一整行横向滚动）；
2. 输入框左侧按钮组固定为三件：`📌 已记录`（现有 recorded-events-pill）｜`📎 附件`（现有 brain-chat-attach-btn）｜
   **新增「⚡ 工具」按钮**（id="brain-tools-btn"，样式同附件按钮，紫/琥珀色系区分）；
3. 点击 ⚡ 弹出**小浮层菜单**（Popover，向上展开，AnimatePresence，点击外部/选择后关闭），分组：
   - **工具动作**：🧮 服务能力计算器（`setIsCalculatorOpen(true)`）／✉️ 写补件邮件（打开 CoCreateDialog flowKey='followup'，见二）／
     🆕 帮我建案件（`setNewCaseOpen(true)`）／📂 去案件文件夹找材料（`handleSend('去案件文件夹找材料')`）；
   - **快捷提问**：🔍 材料缺口主动预判／📄 检查申报一致性／今日到期·逾期／查 CBA 政策（均 `handleSend(label)`）；
   - **全局咨询（无 activeCaseInfo）**：只显示 计算器／建案件／查政策；邮件/文件夹/缺口/申报置灰或隐藏，
     title 提示「请先选择案件」；
4. 移除旧的 `handleQuickAsk`/`handleQuickAskClick` 中 chips 专属分支，统一走新菜单 handler
   （compose_email 不再只 toast，见二）；
5. **触发语联动**：对话命中 followup/chaser/os_reply 流程包时，**不再在主对话消息流出共创卡**，
   改为打开 CoCreateDialog（flowKey 对应 followup/chaser/os_reply）；主对话只保留一条
   「已进入 {流程} 共创弹窗」的轻提示消息 + 「继续共创」恢复入口（sessionId）。

## 二、三共创通用弹窗深谈（新建 src/components/brain/CoCreateDialog.tsx，替代原 MailComposeModal）

1. Props：`{ open, onClose, caseId, flowKey: 'followup'|'chaser'|'os_reply', sessionId?, clientName?, lender? }`；
2. 布局（居中悬浮，**两栏**，宽约 900px，同 TaskDrawer 风格：遮罩 + 圆角卡片 + 关闭按钮，
   id="co-create-dialog"）：
   - **左栏「和 VERA 说」（对话区）**：独立消息流（不写主对话 UI）+ 输入框 +
     快捷意图 chips（「正式一点」「简短点」「加上礼金信说明」「语气委婉」）；
   - **右栏「草稿预览」**：Subject + Body（英文，只读展示）+ 版本链（V1/V2/V3 切换）+ A/B 分支切换 +
     披露徽章（外线模式「只引用已披露内容」；有未披露项时红色警告行）；
   - **底部操作条**：保存草稿 / 确认此版本 / 复制英文 / 中文对照；
3. 交互流（对 WO-46b 端点，见后端契约；未交付/mock 时本地模拟引导+模板草稿，不报错）：
   - **打开 → action=clarify**：VERA 首条消息 = 已拉案件全景摘要（客户/银行/阶段/补件要求/相关待办）+
     澄清问题（1-3 轮：「想跟进什么？语气？重点？收件人？」）；
   - 你回答意图 → **action=generate** → 出 V1 到草稿预览区；
   - 继续对话改稿（「语气正式点」「加上估值报告」）→ **action=version** → V2/V3（存差异，保留最终版）；
   - **action=branch** → 生成 B 分支，版本区 A/B 切换对比；
   - 满意 → **action=confirm** → 后端写事件 + 可选建待办 → 草稿进草稿箱 → 弹窗显示「已确认 V3」+ 关闭；
   - 中途关闭 → 主对话保留「继续写{流程}」入口（sessionId 恢复，不丢版本链）；
4. 触发：⚡ 工具菜单「✉️ 写补件邮件」→ flowKey='followup'；触发语命中 followup/chaser/os_reply →
   对应 flowKey；无案件 → toast「请先选择左侧案件再写邮件」；
5. BrainChat 挂载 `<CoCreateDialog>`；state `coCreateOpen` + `coCreateFlowKey` + `coCreateSessionId`；
6. **红线**：任何地方不出现「发送」按钮；只出草稿；外线模式禁止引用内线内容（披露徽章硬提示）。

## 二b、DraftCard 出口修复（DraftCard.tsx）

1. **「复制」按钮**：现状是占位 toast（handleActionToast「WO-18 后可 用」）→ 改为真复制：
   `navigator.clipboard.writeText(draft.body)` → toast「已复制」；
2. **「翻译英文」按钮**：草稿已是英文，按钮语义不明 → 改为「中文对照」：点击在卡片内展开中文翻译区
   （WO-46b 交付前先本地 mock 或收起按钮；交付后调后端翻译）；
3. 无发送按钮（保持）。

## 三、文件原文预览（FileDrawer.tsx + services/api/fileOps.ts）

1. `fileOps.ts` 新增 `previewRawFileUrl(caseId, path): Promise<string>`：
   `GET /api/cases/{id}/folder/files/raw?path=` → fetch blob → `URL.createObjectURL(blob)` 返回；
   （如后端为 cookie/session 认证可直接返回 URL 字符串，实现时二选一，blob 方式最稳）；
2. FileDrawer 预览面板（现状 L468-507「解析与内容预览」）改**双 tab**：
   - **Tab「原文」（默认）**：按 doc_type/扩展名渲染——
     pdf → `<iframe src={rawUrl} className="w-full h-96 rounded-xl border" />`；
     jpg/jpeg/png → `<img src={rawUrl} className="max-h-96 object-contain mx-auto" />`；
     txt/md/csv → `<pre>` 显示原文文本；doc/docx/xlsx/xls/msg → 占位文案
     「该格式暂不支持在线原文预览，请打开本地案件文件夹查看」+ 仍可切解析 tab；
   - **Tab「解析内容」**：保留现有 text_preview 面板内容（解析/OCR 文本，仍有用）；
   - 加载中 spinner；raw 失败（404/422/413）→ 显示错误行 + 自动切解析 tab 兜底；mock 模式显示占位；
3. 面板默认打开即懒加载原文；预览面板标题改为「文件预览」。

## 四、范围与红线

- 只改前端：`BrainChat.tsx` / `FileDrawer.tsx` / `services/api/fileOps.ts` / 新建 `MailComposeModal.tsx`
  → 新建 `CoCreateDialog.tsx`（替代 MailComposeModal）/ `DraftCard.tsx`（复制/中文对照）
  （+ `types/api.ts` 若需 CoCreate/DraftCreate 类型）；
- 依赖后端 WO-46（raw + POST /api/drafts）+ WO-46b（co-create 对话端点）；未交付前 mock/localStorage 占位，不报错；
- 不新增 npm 依赖；**不出现发送按钮**（只出草稿）；文件预览只读不落盘；
- `npx tsc --noEmit` 零错误。

## 五、验收

1. 中栏底部无 chips 行；输入框左侧 = 📌已记录｜📎附件｜⚡工具；⚡ 菜单分组显示、点击动作正确；
   全局咨询只显示全局可用项；
2. 「写补件邮件」打开 CoCreateDialog 弹窗深谈（案件模式）：VERA 首条消息含案件全景 + 澄清问题；
   对话出 V1、改稿出 V2/V3、A/B 分支可切换；确认后进草稿箱；中途关闭可恢复；**无发送按钮**；
3. 触发语「跟进/催件/OS 回复」→ 打开对应 flowKey 的 CoCreateDialog，主对话不再出共创卡；
4. DraftCard「复制」真复制到剪贴板；「中文对照」可用（或 mock）；
5. 文件预览默认显示原文（PDF/图片/文本），可切「解析内容」tab；不支持格式有占位提示；raw 失败有兜底；
6. `npx tsc --noEmit` 零错误。

# F-40 联调补丁（2026-08-16）：共创弹窗接真后端 + 手动草稿 + 原文预览真数据

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (58)`。
> 背景：后端 WO-46（2ddccf4：raw 原文流 + POST /api/drafts）与 WO-46b（cd8c615：
> POST /api/agent/co-create/chat）已完成。(58) 的共创弹窗/原文预览目前是 mock，本补丁切真端点；
> mock 分支（VITE_USE_MOCK !== 'false'）保留，联调无后端时可退回。
> **重要：AI Studio 在网页环境编辑，无法连接本地后端**——本补丁只要求**按下方后端契约写接线代码**，
> 不需要运行后端、不需要真数据验证；mock 分支保留供无后端预览。**真联调验收由本地执行（见六、本地联调验收）**，
> 不要求 AI Studio 验证真后端行为。

## 一、修复：CoCreateDialog 打不开（BrainChat.tsx）

- (58) L1506 传的是 `isOpen={coCreateOpen}`，但 CoCreateDialog 的 props 是 `open`——props 名不匹配，
  弹窗恒不显示。改为 `open={coCreateOpen}`。

## 二、CoCreateDialog 接真 co-create 端点（新建 services/api/coCreate.ts + 改 CoCreateDialog.tsx）

1. 新建 `src/services/api/coCreate.ts`：
   - `sendCoCreateChat(body: CoCreateChatRequest): Promise<CoCreateResponse>`
   - `POST /api/agent/co-create/chat`，body：
     `{case_id, flow_key: 'followup'|'chaser'|'os_reply', action: 'clarify'|'generate'|'version'|'branch'|'confirm',
     message, session_id, parent_message_id, branch_label, create_todo}`
2. `types/api.ts` 新增：
   - `CoCreateChatRequest`（如上）
   - `CoCreateDraft {subject, body, version, branch_label, message_id}`
   - `CoCreateResponse {reply: string, draft: CoCreateDraft|null, versions: CoCreateDraft[],
     status: 'clarifying'|'draft'|'confirmed'|'blocked', event_id: number|null, task_id: number|null}`
3. CoCreateDialog 交互改为调后端（**VITE_USE_MOCK 分支保留现状本地模拟**，真实分支如下）：
   - 打开时：`action='clarify'` → reply（案件全景 + 澄清问题）作为首条 assistant 消息
     （替换本地写死的初始消息；若返回 status=blocked 显示 reason）；
   - 用户发送：首轮（无父版本）→ `action='generate'`（message=用户输入）；
     后续 → `action='version'`（parent_message_id=当前版本 message_id、message=修改指令）；
     返回 reply 追加到对话流，`draft/versions` 更新版本预览区（subject/body/version/branch_label 映射）；
   - 分支切换 B → `action='branch'`（parent_message_id=当前版本）；
   - 确认此版本 → `action='confirm'`（create_todo=勾选状态，默认 false）→ 成功 toast
     「已确认 V3，写入案件历史 + 草稿箱」+ 弹窗显示已确认；
   - `session_id` 从 props 传入并回传（恢复会话）；`message_id` 用后端返回的版本 message_id 作父版本；
   - 中文对照：保留前端本地逻辑（后端无翻译端点，V1 不做真翻译）。
4. 红线：任何地方不出现「发送」按钮；`create_todo` 默认 false（仅在用户勾选「同时建跟进待办」时为 true）。

## 三、保存草稿接真端点（services/api/drafts.ts + CoCreateDialog.tsx）

1. `drafts.ts` 新增 `createManualDraft(body: {case_id: string, subject: string, body: string, track?: string}):
   Promise<DraftListItem>` → `POST /api/drafts`（后端 draft_type=manual）；
2. CoCreateDialog「保存草稿」：真实模式调 `createManualDraft`（当前版本 subject/body）→ toast「已存入草稿箱」；
   mock 模式保留现状 toast。

## 四、文件原文预览真数据（FileDrawer.tsx，已接线确认）

- `previewRawFileUrl` 已实现（fileOps.ts：mock 分支 + 真端点
  `GET /api/cases/{id}/folder/files/raw?path=` → blob → objectURL）；
- 确认真实模式走真端点；raw 失败自动切「解析内容」tab（已有逻辑），无需大改。

## 五、范围与红线

- 只改前端：`BrainChat.tsx`（isOpen 修复）/ `CoCreateDialog.tsx` / 新建 `services/api/coCreate.ts` /
  `services/api/drafts.ts`（+createManualDraft）/ `types/api.ts`；
- 不新增 npm 依赖；无发送按钮；create_todo 默认 false；VITE_USE_MOCK 分支保留；
- `npx tsc --noEmit` 零错误。

## 六、验收（AI Studio 侧）

1. 中栏 ⚡ 工具 → 「写补件邮件」→ CoCreateDialog **能打开**（isOpen 修复）；
2. 代码按上述契约接线：`coCreate.ts` 请求体字段/端点路径一字不差；`createManualDraft` 走 `POST /api/drafts`
   （body 含 case_id/subject/body/track?）；`previewRawFileUrl` 走
   `GET /api/cases/{id}/folder/files/raw?path=`；
3. mock 模式（VITE_USE_MOCK 非 false）：CoCreateDialog 打开有全景+澄清引导、对话能出 V2/V3、
   保存草稿 toast、文件预览双 tab 正常（UI 无回归）；
4. `npx tsc --noEmit` 零错误。

## 七、本地联调验收（Vera / Codex 执行，AI Studio 不负责）

> 前端导出后本地运行（后端已就绪：WO-46/46b），逐项验证：

1. ⚡ → 写补件邮件 → 弹窗打开；首条消息 = **后端 clarify 返回的案件全景 + 澄清问题**（非本地写死）；
2. 对话改稿 → V2/V3 由真实 LLM 生成（请求体 parent_message_id 正确）；
3. 确认版本 → 案件事件写入（CaseContextEvent）+ 勾选「建待办」时生成 FOLLOWUP_TODO Action；
4. 「保存草稿」→ POST /api/drafts 落库，DraftsBox 可见 status=draft / draft_type=manual；
5. 文件预览原文 → 真 raw 流（PDF 内嵌渲染 / 图片显示 / 解析 tab 可切）。

# F-41 色彩搭配方案（2026-08-16）：专业设计师视角审查 + 成体系配色方案（暂不改代码）

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (59)`。
> 任务性质：**只审查 + 出专业配色方案，不改任何代码**。Vera 看完方案、拍板后再出修改批次。
> 背景：**Vera 的核心诉求 = "现在的主题颜色搭配不够舒服"**（不是缺功能、不是对比度 bug，而是整体配色
> 让人不舒服）。请以专业 UI 设计师的身份，先诊断"为什么不舒服"，再给出**成体系的配色方案**
> （含具体色值），让界面像专业的贷款经纪人工作台，而不是功能堆叠的临时页面。
> 已知线索：accent 蓝紫（#4f6ef7）与大量紫色（AI/记录/任务）并存，功能色（绿/蓝/紫/琥珀/红）随批次
> 逐渐增多，紫色系偏重——请重点评估"主色不收敛、彩色打架"的问题。

## 一、诊断：当前配色为什么不舒服（先回答这个）

1. **主色收敛性**：当前 accent（蓝紫）vs 大量紫色（AI/记录/任务/草稿）——是否"两个主色打架"？主色应该收敛到几个？
2. **彩色密度**：绿/蓝/紫/琥珀/红在界面同屏出现的频次——功能色是"辅助语义"还是"抢视觉"？
   哪些地方彩色用多了（如彩色按钮、彩色徽章、彩色文字堆在一起）？
3. **明暗主题和谐**：dark 与 light 两套是否同一套色彩逻辑？转换时是否有突兀？
4. **层次与秩序**：背景层级（--bg-app→panel→card→input）对比是否足够、边框/阴影是否让卡片有秩序感；
   哪些区域"平"（缺乏层级）或"花"（元素各说各话）？
5. **专业感**：对照专业金融/B2B 工作台（如银行后台、Notion、Linear、Figma 的克制配色），
   本项目的配色在"克制 vs 花哨"上偏哪边，具体位置在哪。

## 二、交付：成体系配色方案（重点，给具体色值）

给出 **1 套主推方案 + 1 套备选**，每套包含：

1. **色板**（tokens.css 层面，逐变量给新色值，dark 与 light 各一套）：
   - 主色（收敛后的 accent，建议 1 个；说明色相选择逻辑——金融可信感/亲和感/专业感）
   - 背景层级 4 级（--bg-app/--bg-panel/--bg-card/--bg-input）
   - 文字 3 级（--text-primary/--text-secondary/--text-muted）
   - 语义色 5 个（成功/信息/警告/危险/强调）——明确"哪些功能色保留、哪些合并进主色系"
2. **使用规则**：主色用在哪些场景（主操作/选中/链接）；语义色只用于状态标记（徽章/警告/成功）不用于
   大面积填充；彩色按钮 vs 中性按钮的取舍（建议大多数按钮中性化，只保留 1-2 个彩色主操作）；
3. **AI/任务/记录等紫色系的去向**：并入主色系 / 降为浅紫辅助 / 改用中性+图标，给出具体建议；
4. **明暗双主题一致性**：dark/light 用同一套色相，仅调亮度/饱和度（给出对照表）。

## 三、附：问题清单（辅助方案落地）

按"位置（组件/文件行号）| 现象 | 严重度（高/中/低）"列出当前最刺眼的 10-15 处（如彩色按钮过密、
紫蓝双主色冲突、text-muted 过暗等），并标注对应方案里的哪条规则。

## 四、硬性约束

- **只审查、只出方案，不改任何代码**（含 tokens.css）；
- 不新增 npm 依赖；不要求运行后端（纯静态审查即可）；
- 色值必须可直接落进 `tokens.css`（16 进制或 rgba），且通过简单对比度自查（正文 vs 背景 ≥ 4.5:1）；
- 方案要"可执行"：Vera 拍板后能直接按色板转成 F-41b 修改批次（只改 tokens.css + 少量类名）。

# F-41b 修改批次（2026-08-16）：采纳方案一落地 + 三处修正 + 全量硬编码清理（可直接执行）

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (59)`。
> 背景：F-41 方案已由 Vera 认可——采纳**方案一（Cobalt & Precision Slate）**；Codex 实测复核发现
> 三处需修正（见一），并确认硬编码彩色类名远超方案清单的 12 处（预计 40+ 处）。本批**直接改代码**，
> 不再审查。目标：全局零"非语义"硬编码彩色 + 为多主题随意切换打好变量化基础。

## 一、tokens.css 替换（方案一色板 + 三处修正）

按 F-41 方案一整套色板（dark Obsidian Graphite / light Precision Slate），但以下三处**必须按修正值**：

1. **dark --text-muted**：方案给 #64748b（实测对 #0b0d12 仅 4.08:1、对卡片 #181c28 仅 3.57:1，不达标）
   → 改为 **#94a3b8**（Slate-400，实测 7.58:1 达标）；
2. **light --text-muted**：#64748b 对浅灰底 #f1f5f9 仅 4.34:1（临界不达标）→ 改为 **#5b6b82**
   （或同亮度深一档，保证纯白卡与浅灰底都 ≥4.5:1）；
3. **dark 主操作按钮**：白字 on #3b82f6 = 3.68:1（14px 按钮文字需 ≥4.5）→ 新增 **--accent-strong**
   （dark: #2563eb / light: #1d4ed8）作为**主按钮实心底色**；--accent 保留给边框/图标/链接/hover；
   按钮实心底统一用 `var(--accent-strong)`，文字白。

tokens.css 保持"一组语义变量 = 一套主题"结构，变量按组注释（表面层级/边框/文字/交互色/语义色/
圆角/阴影/焦点/动画）——这是未来多主题（新增 `[data-theme="xxx"]` 块即可）的令牌基础。

## 二、全量硬编码彩色清理（重点，不止 12 处）

1. **全量扫描** `src/**/*.tsx`、`*.ts`、`*.css` 中硬编码彩色类/内联色：
   `bg-purple-500/*`、`text-purple-*`、`bg-amber-500/*`、`text-amber-*`、`bg-blue-500/*`、`text-blue-*`、
   `bg-emerald-500/*`、`text-emerald-*`、`bg-rose-*`、`text-rose-*`、`bg-red-*`、`text-red-*`、
   `border-purple-*`、`focus-within:border-*`、`#8b5cf6`、`#4f6ef7` 等（含 inline style）；
2. **逐处决策，三类处理**：
   - **常规控制/图标/背景（非状态）→ 中性化**：`bg-[var(--bg-card)] text-[var(--text-secondary)]
     border-[var(--border)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]`。
     已知重点：BrainChat 📌已记录 / ⚡工具 / 📎附件 三按钮、⚡ 菜单内 5 色图标、输入框
     focus-within 紫边框、CoCreateDialog 顶部紫色 Header、DraftCard 紫边框/标签、各抽屉头部彩色、
     CasePanorama 右栏彩色元素、首页/统计/设置里的彩色按钮与卡片；
   - **语义状态标记 → 保留彩色但收敛**：逾期=红、待办/预警=黄、已收/成功=绿、AI 特质=小面积紫
     （仅 ✨/Sparkles/共创弹窗标识），一律用 8%-12% soft 底 + 主色文字/小圆点，禁止高饱和纯色打底；
   - **焦点/激活/选中 → 统一 `var(--ring)` / `var(--border-active)` / `var(--accent)`**。
3. 交付报告必须附**完整替换清单**（文件/行号/原类名/新类名），数量应覆盖全部扫描命中（40+ 处）。

## 三、多主题架构预留（不实现多主题，只打基础）

- 不新增主题选择器、不加 npm 依赖、不改 themeStore 逻辑（dark/light 维持现状）；
- 只保证：**除语义状态标记与 AI 小面积紫外，全局零硬编码彩色**——颜色全部来自 tokens.css 变量，
  未来新增一套主题只需加一组 `[data-theme="xxx"]` 变量块。

## 四、验收（AI Studio 侧）

1. light / dark 两套视觉走查：中栏、CoCreateDialog、三抽屉、右栏、首页、统计、设置——
   无"非语义"彩色残留；语义色仍清晰（逾期红/清单绿/待办黄可辨）；
2. 对比度自查用**真实计算**（非估计）：primary/secondary/muted 三档文字在真实背景 ≥4.5:1
   （muted 若按辅助文本可 ≥3:1，但需在报告标注）；主按钮白字 on --accent-strong ≥4.5:1；
3. `npx tsc --noEmit` 零错误；若项目有 build 脚本跑 `npm run build` 通过；
4. 无新增 npm 依赖。

## 五、本地联调验收（Vera / Codex 执行，AI Studio 不负责）

1. 前后端本地跑，light/dark 切换各页面无白屏/错位、无"彩色花哨"残留；
2. 语义色在真实数据下仍一眼可辨（逾期任务红、清单未收黄/已收绿、AI 共创紫标识）；
3. 主按钮（发送/确认）白字对比度目测清晰；
4. 真机确认"舒服了"再收口；若有残留再出 F-41c 微调。

# F-41c（2026-08-16）：主题选择器闭环 + 活跃组件硬编码收尾

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (60)`。
> 背景：F-41b 验收通过（方案一 + 对比度修正 + 重点组件变量化）；AI Studio 已做出 6 套主题 tokens
> （dark/light/ivory/eyecare/blush/sand）+ themeStore（applyTheme/getInitialTheme/localStorage），
> 但**设置页缺切换 UI**；活跃组件（CalculatorPanel/NotificationBell/FolderPickerModal 等）仍有非语义
> 硬编码彩色，切主题不跟随。本批把"随意换主题"闭环。

## 一、设置页主题选择器

1. 设置页（`src/pages/Settings.tsx`）新增「外观 / 主题」区块（Tab 或卡片，与现有 AssistantSettingsCard
   同级）；主题数据直接用 `src/themes/index.ts` 已导出的 `THEMES` 数组
   （`{id, name, preview}` 六项已齐，**不要改 themes/index.ts / tokens.css / themeStore**）；
2. 渲染 6 个主题卡片：预览色块（preview hex 背景）+ 中文名 + 选中态高亮
   （`current === id` 时边框用 `var(--accent)`）；点击 → `useThemeStore().setTheme(id)`
   （applyTheme 已处理 data-theme + localStorage 持久化）；
3. 配一行说明文案："主题即时生效并自动记住选择"；
4. 不新增 npm 依赖。

## 二、活跃组件非语义硬编码清理（多主题完整性）

1. **CalculatorPanel.tsx**（中栏计算器，活跃）——全量扫非语义紫色
   （bg-purple-500/10、text-purple-*、border-purple-*、选中态实心 bg-purple-500）：
   - 选中态/主操作 → `var(--accent)` / `var(--accent-strong)`；
   - 面板装饰/标题紫色 → 保留小面积 `var(--purple)` / `var(--purple-soft)`（计算器特质）或中性化，
     二选一但必须走变量；
   - 语义结果色保留：surplus 正负 emerald/rose（状态标记，改走 `var(--green)` / `var(--red)`）；
2. **NotificationBell.tsx / FolderPickerModal.tsx** 及仍渲染的旧组件：非语义硬编码 → var()，
   按 F-41b 三类规则（常规控件中性化 / 语义状态保留并走 var / 焦点统一 --ring）；
3. **brain 内非语义残留**：HomePage / CaseListSidebar / 各卡片里若有"装饰性"彩色（非状态标记）
   一并清；
4. 交付报告必须附**完整替换清单**（文件/行/原类名/新类名），并标注"哪些是语义色有意保留"。

## 三、语义状态色保留确认清单（附报告）

列出全局**有意保留**的语义色位置（逾期红 / 清单绿 / 待办黄 / 风险分级 / AI 紫 / 计算器结果正负），
确认这些全部走 `var(--red)/var(--green)/var(--yellow)/var(--purple)` 等变量，**不得有 tailwind 写死色残留**
（bg-red-500 这类不跟随主题的类名）。

## 四、验收（AI Studio 侧）

1. 设置页 6 主题卡片可见，点击即时切换，刷新后保持（localStorage）；
2. 切到 ivory / eyecare / blush / sand 后：中栏、计算器、通知、文件夹选择器颜色全部跟随
   （无残留写死色块/文字）；
3. 6 套主题 light/dark 与 4 个新主题都无白屏、无错位、文字可读；
4. `npx tsc --noEmit` 零错误；无新增 npm 依赖。

## 五、本地联调验收（Vera / Codex 执行）

真机依次切 6 套主题，走查中栏 / 共创弹窗 / 三抽屉 / 右栏 / 首页 / 统计 / 设置 / 计算器 / 通知 /
文件夹选择器：颜色全部跟随、语义色仍清晰、无"某个页面还是旧紫色"的漏网。

---

# F-42a（2026-08-15）：全站色彩收口（紫色语义化 + Tailwind 色收编 + 渐变收敛）+ 动效 house style

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (61)`（如后续有更新版本以最新编号为准）。
> 背景：F-41c 验收通过（主题选择器 + 活跃组件清理），但全站仍有 **509 处 purple-XXX 硬编码 + 52 处
> var(--purple)**，rose/amber/emerald/indigo/blue/gray 等 Tailwind 默认色遍布 80 个文件，
> 切主题不跟随；同时 **16 种 spring 参数混用**，动效手感碎片化。本批收口色彩 + 统一动效语言。
> 依据：`docs/F-42_前端品味审查报告.md`（三套设计 skill 审查：taste-skill / web-design-engineer / apple-design）。

## 一、紫色语义化（核心规则：紫色只留给 AI）

全站 `purple-*` 类和 `var(--purple)` 按以下语义归类替换：

1. **AI 相关（保留紫色，但统一走 `var(--purple)` / `var(--purple-soft)`）**：
   BrainChat 工具菜单、CalculatorPanel 头部徽章与结果卡、CoCreateDialog、FlowDialogCard、
   DeclarationCheckCard 等"AI 能力"标识；若原为 `purple-500/600` 类，一律换 `var(--purple)`。
2. **老板/拍板语义（换 `var(--yellow)` / `var(--yellow-soft)`）**：
   CaseListSidebar 底部"老板"筛选 tab、HomePage 待办"👑 待老板拍板"徽章、CasePanorama 任务徽章
   `escalated_to_boss` 分支。
3. **澳洲时区/假期语义（换 `var(--accent)` 或中性 `var(--text-secondary)`）**：
   AuTimePanel 全面板紫色（Globe 图标、堪培拉卡片、日历今天、假期徽章、今日待办按钮）。
   例外：日历 4 色状态点（ACT/NSW/QLD/CN）是**信息编码，保留**，但改为 4 个语义令牌
   `--mark-act` / `--mark-nsw` / `--mark-qld` / `--mark-cn`（在 tokens.css 六个主题各加 4 行：
   ACT 用紫、NSW 用蓝、QLD 用绿、CN 用红，值取当前各主题的 --purple/--blue/--green/--red）。
4. **关联案件语义（换 `var(--accent)`）**：DetailPanel "关联案件"横幅（bg-purple-500/10、
   bg-purple-600 按钮）。
5. **装饰图标（换 `var(--text-secondary)`，hover 再 `var(--text-primary)`）**：
   TopNavBar 的 Clock/Bell/SunMoon 图标、通知面板 Bell 图标、HomePage 今日待办标题 CheckCircle2
   与计数徽章、CasePanorama 头部 User 图标等"无业务语义"的紫色。
6. **搜索聚焦态（换 `var(--ring)`）**：TopNavBar 搜索框 `border-purple-500/50 ring-purple-500/10`、
   HomePage 右栏输入框 `focus-within:border-purple-500/50`。
7. **拖拽分隔条**：PanelDivider 的 `bg-purple-500/50` / `hover:bg-purple-500/30` → 走
   `var(--accent)` 半透明（如 `var(--accent-soft)`，拖动中更实、hover 更淡）。

## 二、Tailwind 默认色收编（玫瑰/琥珀/翠绿/靛蓝/蓝/灰 → 语义令牌）

全站扫描 `text-/bg-/border-/ring-/from-/via-/to-` 前缀的
`rose/amber/emerald/indigo/blue/gray` 类，按语义替换（**禁止再引入新的 tailwind 色类**）：

| 原类 | 语义 | 替换为 |
|---|---|---|
| rose-* | 逾期/错误/危险 | `var(--red)` / `var(--red-soft)` |
| amber-* | 预警/待办/待决策 | `var(--yellow)` / `var(--yellow-soft)` |
| emerald-* | 成功/已收/可披露 | `var(--green)` / `var(--green-soft)` |
| indigo-* / blue-* | 信息/链接/递交态 | `var(--accent)` / `var(--accent-soft)` |
| gray-* | 中性次要 | `var(--text-secondary)` / `var(--text-muted)` / `var(--bg-subtle)` |

重点文件（残留最多的 10 个，其余一并扫）：NewCaseSheet(30)、HomePage(22)、BrainChat(21)、
SkillCenter(16)、OverviewFacts(15)、CasePanorama(15)、PolicyHintCard(14)、CaseFolderCard(14)、
GapAnalysisCard(13)、NewCaseFields(13)。

注意：**保留有明确语义的彩色编码**（如任务来源徽章 邮件=accent / 文件=green / OS=yellow、
披露状态 内部=accent / 可披露=green / 不能给银行看=red），但一律改走 var()，不得留 tailwind 类。

## 三、黑白透明度硬编码收编（新增 --bg-subtle 令牌）

1. tokens.css 六个主题各加 2 个令牌：
   - `--bg-subtle`：弱表面（替代 `bg-black/5 dark:bg-white/5`）——dark 系取 `rgba(255,255,255,0.05)`，
     light 系取 `rgba(15,23,42,0.04)`，其他主题按各自底色明暗取同思路；
   - `--bg-subtle-strong`：稍强表面（替代 `bg-black/10 dark:bg-white/10`）——约 2 倍透明度。
2. 全站 `bg-black/5 dark:bg-white/5` → `bg-[var(--bg-subtle)]`；
   `bg-black/10 dark:bg-white/10` → `bg-[var(--bg-subtle-strong)]`；hover 变体同理。

## 四、AI 渐变收敛（删除 4 处多色渐变）

1. **Sidebar logo**：`linear-gradient(135deg, var(--accent), var(--purple))` → 单色 `var(--accent)`；
2. **首页 Vera 专家贴士卡**：`from-indigo-600/10 via-purple-600/10 to-amber-500/10` →
   `var(--accent-soft)` 单色底 + 保留细边框；
3. **TopNavBar 头像**：`from-amber-500 via-rose-500 to-purple-600` → 单色 `var(--accent)`；
4. **CasePanorama 空态**：`from-purple-500/20 to-pink-500/20` → `var(--accent-soft)`。

## 五、动效 house style（apple-design 标准）

1. **Spring 统一为 2 档**（全站收编 16 种参数）：
   - 浮层/下拉/弹窗/抽屉进出场：`type: 'spring', damping: 25, stiffness: 300`（默认，无过冲感）；
   - 卡片 hover lift / 按钮 whileTap / 列表项位移：`type: 'spring', damping: 25, stiffness: 400`
     （轻快，允许轻微弹性）。
   - 其他全部参数组合替换为以上两档之一（按交互性质归类，报告里附归类说明）。
2. **同族初始位移统一**：弹窗/卡片进入 `y: 10`；下拉菜单进入 `y: 6`；工具提示进入 `x: 8`。
3. **hover lift 统一**：卡片统一 `whileHover={{ y: -2 }}`，小按钮/条目统一 `y: -1`。
4. 不动现有 reduced-motion 分支写法（`initial={reduced ? {opacity:0} : ...}`），照旧保留。

## 六、红线

1. 不改 tokens.css 既有令牌的值（只允许新增 --bg-subtle / --bg-subtle-strong / --mark-*）；
2. 不新增 npm 依赖；不改任何组件功能逻辑与文案；
3. 全部替换必须**机械替换**：只动 className / style 值，不改结构、不改状态、不重构组件。

## 七、交付报告必须附

1. 完整替换清单（文件 / 行 / 原类名 / 新类名），按"紫色语义化 / Tailwind 收编 / 黑白透明度 /
   渐变收敛 / spring 统一"五类分列；
2. 标注**有意保留的语义色位置**（任务来源徽章、披露状态、逾期/预警/成功、州级日历点、AI 高亮），
   确认全部已走 var()；
3. spring 归类说明（每种原参数 → 归入哪一档，为什么）。

## 八、验收（AI Studio 侧）

1. `npx tsc --noEmit` 零错误；构建通过；
2. 全站无 `purple-*` / `rose-*` / `amber-*` / `emerald-*` / `indigo-*` / `blue-*` / `gray-*`
   tailwind 色类残留（除有意保留且已 var() 化的）；`bg-black/` 类残留为 0；
3. 无 spring 第三档参数（除规定的两档）；
4. 切 6 套主题关键页无死色（提交前自查一次）。

## 九、本地联调验收（Vera / Codex 执行）

真机切 6 套主题走查：首页 / 中栏 / 三抽屉 / 右栏 / 设置 / 计算器 / 通知 / AU 时间面板 /
看板 / 详情页——颜色全部跟随、语义色仍清晰、动效无突兀跳变、无"某个页面还是旧紫色"漏网。

---

# F-42a 补丁（2026-08-15）：F-42a 验收未过，全站替换 + 动效收编补完

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (62)`（本批在 (62) 基础上改）。
> 背景：F-42a 验收发现**只完成了点名重点组件 + tokens 令牌基建，全站机械替换未做完**。
> 具体：tailwind 色类仍残留 **632 处**（purple- 237 / amber- 128 / emerald- 94 / rose- 87 /
> blue- 73 / red- 16 / gray- 9 / indigo- 2 / pink- 2 / green- 1），bg-black/dark:bg-white 仍残留
> **180 处**（47 个文件），**动效 spring 参数 40+ 种组合一个都没收编**。
> 已完成的（不要再动）：tokens.css 六主题 --bg-subtle/--bg-subtle-strong/--mark-*、
> TopNavBar/Sidebar/HomePage/DetailPanel/PanelDivider/CaseListSidebar/AuTimePanel 的紫色收敛。
> 本补丁任务：**把剩余的机械替换和动效收编一次做完**。

## 一、执行方式（重要）

1. **按文件逐个扫**，不要只扫"重点文件"——以下目录全部覆盖：
   `src/pages/`、`src/components/ai/`、`src/components/brain/`、`src/components/calculator/`、
   `src/components/cases/`、`src/components/chat/`、`src/components/knowledge/`、
   `src/components/layout/`、`src/components/os/`、`src/components/panel/`、`src/components/settings/`、
   `src/components/tasks/`、`src/components/ui/`、`src/components/ErrorBoundary.tsx`；
2. **机械替换**：只改 className / style 值，不改结构、不改状态、不改文案、不重构；
3. **做一页交一页**：每扫完一个目录自查一次（rg 计数下降），直到全站清零。

## 二、tailwind 色类 → 语义令牌（632 处清零）

替换映射（全站统一，禁止再引入任何带数字的 tailwind 色类）：

| 原类 | 语义 | 替换为 |
|---|---|---|
| purple-*（AI 能力标识） | AI 高亮 | `var(--purple)` / `var(--purple-soft)` |
| purple-*（非 AI） | 装饰/信息 | `var(--accent)` / `var(--text-secondary)` |
| rose-* | 逾期/错误/危险 | `var(--red)` / `var(--red-soft)` |
| amber-* | 预警/待办/待决策 | `var(--yellow)` / `var(--yellow-soft)` |
| emerald-* | 成功/已收/可披露 | `var(--green)` / `var(--green-soft)` |
| blue-* / indigo-* | 信息/链接/递交态 | `var(--accent)` / `var(--accent-soft)` |
| gray-* | 中性次要 | `var(--text-secondary)` / `var(--text-muted)` |
| red-* / green-* / yellow-* | 语义状态 | `var(--red)` / `var(--green)` / `var(--yellow)`（+ -soft） |

注意：
- 原 `text-purple-600 dark:text-purple-400` 这类双态 → 直接 `text-[var(--purple)]`（var 自动适配主题）；
- `bg-purple-500/10` → `bg-[var(--purple-soft)]`；`border-purple-500/20` → `border-[var(--purple-soft)]`；
- **有明确语义的状态色照常保留颜色，但必须走 var()**（如 PolicyHintCard 的风险分级红/黄/绿、
  TaskDrawer 的任务来源徽章、RecordedEventsDrawer 撤销红色按钮、SubmissionBanner 递交警示）。

已知重灾区（按残留量排序，逐个清空）：FlowDialogCard、TaskDrawer、PolicyHintCard、
Analytics、DraftsBox、ImportHistory、Archive、Migration、OsWorkbench、OsConditionsColumn、
OsDraftColumn、OsStrategyColumn、CaseBoard、CaseCard、TaskCard、TaskDetailOverlay、
GlobalStatsPanel、RecordedEventsDrawer、RiskSection、SubmissionBanner、ManualNoteModal、
ChatPanel、KnowledgeCenter、Settings、CaseDetail、KpiBar、ErrorBoundary、FloatingAI、
FloatingAIMessages、ChecklistDrawerContent、DelegateDialog、CasePanorama（空态）。

## 三、bg-black / dark:bg-white → --bg-subtle（180 处清零）

1. `bg-black/5 dark:bg-white/5` → `bg-[var(--bg-subtle)]`（含 hover: 前缀变体）；
2. `bg-black/10 dark:bg-white/10` → `bg-[var(--bg-subtle-strong)]`（含 hover: 前缀变体）；
3. `border-black/5 dark:border-white/10` 等同理 → `var(--border)` 或 `var(--bg-subtle)`。

## 四、动效 house style 收编（apple-design 两档，40+ 种 → 2 种）

全站 `type: 'spring', ...` 统一为两档：

1. **档 A —— 浮层/弹窗/下拉/抽屉/面板进出场**（有 initial/animate/exit 的 motion 容器）：
   `type: 'spring', damping: 25, stiffness: 300`；
2. **档 B —— 卡片 hover lift / 按钮 whileTap / 列表项位移**（whileHover/whileTap 类）：
   `type: 'spring', damping: 25, stiffness: 400`；
3. 其他参数组合（damping 20/24/26/28/30/35、stiffness 350/500 等）按以上两档归类替换；
4. 同族初始位移统一：弹窗/卡片进入 `y: 10`；下拉菜单 `y: 6`；工具提示 `x: 8`；
5. 卡片 hover lift 统一 `whileHover={{ y: -2 }}`，小按钮/条目 `y: -1`；
6. 现有 reduced-motion 分支写法（`initial={reduced ? {opacity:0} : ...}`）**保留不动**。

## 五、渐变残留清理（4-5 处）

1. `FloatingAI.tsx` 两处 `linear-gradient(135deg, var(--accent) 0%, #8b5cf6 100%)` →
   `linear-gradient(135deg, var(--accent), var(--purple))`（AI 悬浮球保留渐变但去掉硬编码 hex）；
2. `FloatingAIMessages.tsx` `from-blue-500 to-indigo-600` / `from-purple-500 to-pink-500` →
   单色 `var(--accent)`（用户气泡）和 `var(--purple)`（AI 气泡）；
3. `AssistantOnboardingCard.tsx` / `SkillCenter.tsx` 渐变底 → `var(--accent-soft)` / `var(--purple-soft)`
   单色底 + 保留细边框；
4. `CasePanorama.tsx` 空态 `from-purple-500/20 to-pink-500/20` → `var(--accent-soft)`。

## 六、红线

1. 不改 tokens.css 已有令牌的值；不新增 npm 依赖；不改组件逻辑/结构/文案；
2. 语义色保留清单必须写入交付报告（哪些位置有意保留、走了哪个 var）。

## 七、交付前自查（必须跑，数字达标才算完成）

在项目根目录执行以下命令（Windows PowerShell），全部达标：

```powershell
rg -n "(purple|rose|amber|emerald|indigo|blue|gray|pink|violet|sky|teal|cyan|fuchsia|red|green|yellow|orange)-[0-9]" src --glob "*.tsx" | Measure-Object   # 期望 0
rg -n "bg-black|dark:bg-white" src --glob "*.tsx" | Measure-Object                                    # 期望 0
rg -o "type: 'spring'[^}]*" src --glob "*.tsx" | Sort-Object -Unique                                  # 期望仅 2 种参数
rg -n "#[0-9a-fA-F]{6}" src --glob "*.tsx"                                                            # 期望仅 ThemePicker 预览色
```

## 八、验收（AI Studio 侧）

1. `npx tsc --noEmit` 零错误；
2. 上述 rg 自查 4 项全部达标；
3. 交付报告附完整替换清单（文件 / 原类名 / 新类名）+ 语义色保留清单 + spring 归类说明。

## 九、本地联调验收（Vera / Codex 执行）

切 6 套主题走查：首页 / 中栏 / 三抽屉 / 右栏 / 设置 / 统计 / 草稿箱 / 档案 / 导入历史 / 迁移 /
OS 工作台 / 知识中心 / 看板 / 详情页——颜色全部跟随、语义色清晰、动效无跳变。

---

# F-42a 补丁二（2026-08-15）：验收发现的 4 处小问题（坏渐变 / --amber 令牌 / spring 缺参 / 紫色语义残留）

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (63)`（本批在 (63) 基础上改）。
> 背景：F-42a 补丁验收**主体通过**（tailwind 色类 0、bg-black 0、spring 两档），
> 仅剩 4 处小问题，修完即全绿。本批为收尾补丁，只改下列文件，禁止扩大范围。

## 一、坏渐变修复（2 处，真实渲染 bug）

1. `src/components/ai/FloatingAIMessages.tsx:64`：
   - 原：`isUser ? 'bg-gradient-to-r var(--accent)' : 'bg-gradient-to-r var(--purple)'`
   - 改：`isUser ? 'bg-[var(--accent)]' : 'bg-[var(--purple)]'`（单色底即可，渐变无意义）；
2. `src/components/brain/CasePanorama.tsx:208`：
   - 原：`bg-gradient-to-tr var(--accent-soft)`
   - 改：`bg-[var(--accent-soft)]`（保留其余 className 与 border-[var(--purple-soft)] 不动）。

## 二、--amber 未定义令牌修复（2 处，改用 --yellow 语义令牌）

1. `src/components/cases/KanbanCard.tsx:104`：
   `var(--amber, #f59e0b)` → `var(--yellow)`；
2. `src/components/os/OsDraftColumn.tsx:48`：
   `var(--amber-soft, rgba(245, 158, 11, 0.1))` → `var(--yellow-soft)`；
   `var(--amber, #f59e0b)` → `var(--yellow)`。

## 三、spring 缺参修复（1 处）

`src/components/brain/BrainChat.tsx:832`：`type: 'spring',` → `type: 'spring', damping: 25, stiffness: 300`。

## 四、紫色语义残留（3 处，紫色只留给 AI）

1. `src/components/tasks/TaskCard.tsx:22`：`BOSS_DECISION` 的
   `bgVar: 'var(--purple-soft)', colorVar: 'var(--purple)'` →
   `bgVar: 'var(--yellow-soft)', colorVar: 'var(--yellow)'`（老板拍板语义与 TaskDrawer 对齐）；
2. `src/components/cases/overview/OverviewFacts.tsx:43/44/124`：
   `text-[var(--purple)]`（银行徽章/交易结构/ShieldCheck 图标）→ `text-[var(--accent)]`；
3. `src/components/cases/CaseFolderCard.tsx:182`（及 367 行同款）：
   `_Inbox` 目录名 `text-[var(--purple)]` → `text-[var(--accent)]`（系统约定高亮，非 AI 语义）。

## 五、红线

1. 只改上述文件对应行；不改 tokens.css；不新增依赖；不改逻辑/结构/文案；
2. 交付报告附逐条改动说明。

## 六、验收

1. `npx tsc --noEmit` 零错误；
2. 全站无 `bg-gradient-to-[a-z]+ var(` 坏类、无 `var(--amber`；
3. `type: 'spring',` 无参数处为 0；
4. TaskCard 老板徽章与 TaskDrawer 均为黄色；OverviewFacts 银行徽章为 accent。

---

# F-42b（2026-08-15）：字号令牌体系（消灭 8-10px，关键信息 ≥12px）+ reduced-motion 补全覆盖

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (64)`（本批在 (64) 基础上改）。
> 背景：F-42a 已全绿（色彩令牌化 + 动效两档）。本批处理可读性与无障碍：
> ① 全站字号仍有过小（9px×39、10px×404、11px×353，中文在 10px 以下几乎不可读）；
> ② reduced-motion 覆盖率不足（107 个文件、83 个含 motion 组件、仅 38 个有 useReducedMotion，
>    45 个文件的 spring 动画在"减弱动态"设置下仍会滑动弹跳——全局 CSS 拦不住 Motion 库的 JS 动画）。

## 一、字号体系（三条规则）

1. **消灭 8-9px**：`text-[8px]`（4 处）与 `text-[9px]`（39 处）全部上提：
   - 徽章/角标/纯标签 → `text-[10px]`；
   - 有实际内容的文字 → `text-[11px]`；
2. **text-[10px]（404 处）分类处理**：
   - **业务关键信息 → `text-xs`（12px）**：金额、日期、截止天数、客户名、银行名、
     按钮文字、可点击项、状态徽章、任务标题、KPI 数字、表单标签；
   - **无足轻重的时间戳/纯装饰 → `text-[11px]`**：消息时间、版本号、辅助角标；
3. **text-[11px]（353 处）保留**（次要时间戳/辅助说明可接受）；
4. 不改 tokens.css（text-xs/sm/base 已是 rem 基准，满足系统字号缩放）；不新增依赖。

判断口诀：**"用户要读/要点/要判断的值"一律 ≥12px；"给眼睛扫一眼的辅助"才允许 11px。**

## 二、reduced-motion 补全覆盖（45 个文件）

给所有"含 motion 组件但无 useReducedMotion"的文件补上（标准样板）：

```tsx
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

export function Xxx() {
  const reduced = useReducedMotion();
  // ...
  <motion.div
    initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
    whileHover={reduced ? undefined : { y: -2 }}
    whileTap={reduced ? undefined : { scale: 0.97 }}
  >
```

规则：
1. reduced 下：位移/缩放全部去掉，只保留 opacity 淡入淡出（不许滑动/弹跳）；
2. whileHover / whileTap 在 reduced 下置 undefined（保留颜色/背景 hover 态，去掉位移）；
3. `AnimatePresence` 的 enter/exit 同规则处理；
4. 已有 reduced 分支的文件**保持原样**，不要重复改。

需补文件清单（TOP 20，其余 25 个一并扫）：
TaskCard、GlobalExperienceTab、CaseFolderCard、OverdueDetail、FloatingAI、FileMatchDetail、
NewClientDetail、CoCreateDialog、DraftEditor、BossDecisionDetail、Migration、OsDraftColumn、
OsAttackDetail、Archive、SettlementDetail、DraftsBox、ChecklistPanel、ImportHistory、KpiBar、
AssistantOnboardingCard。

## 三、红线

1. 不改 tokens.css；不新增依赖；不改组件逻辑/结构/文案；
2. 字号只改 className，不调布局尺寸（如 min-w/px 宽度若与字号强绑定导致溢出，可做最小必要微调并注明）；
3. 交付报告附：字号替换统计（9/10px → 目标档位数量）+ 补 reduced-motion 的文件清单。

## 四、交付前自查

```powershell
rg -n "text-\[(8|9)px\]" src --glob "*.tsx" | Measure-Object          # 期望 0
rg -n "text-\[10px\]" src --glob "*.tsx" | Measure-Object             # 期望大幅下降（≤ 60 处可接受）
rg -l "motion\." src --glob "*.tsx" | % { $c = Get-Content $_ -Raw; if ($c -notmatch 'useReducedMotion') { $_ } }   # 期望空
```

## 五、验收（AI Studio 侧）

1. `npx tsc --noEmit` 零错误；构建通过；
2. 8px/9px 为 0；10px 仅剩纯时间戳类；关键信息（金额/日期/按钮/客户名/银行名/状态）全部 ≥12px；
3. 所有含 motion 的文件都有 useReducedMotion 分支；
4. 交付报告附替换统计与文件清单。

## 六、本地联调验收（Vera / Codex 执行）

1. 走查首页/中栏/右栏/看板/详情/统计/设置：无 8-10px 的"看不清"文字，金额日期清晰；
2. 系统开启"减弱动态"后：弹窗/抽屉/下拉全部为淡入淡出，无滑动弹跳，交互仍可用。

---

# F-42c（2026-08-15）：玻璃只留浮层 + 删死代码 + 弹层锚定触发源

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (65)`（本批在 (65) 基础上改）。
> 背景：F-42a/b 已全绿（色彩令牌化 + 动效两档 + 字号体系 + reduced-motion 100%）。
> 本批处理结构层：① 玻璃拟态用于静态容器导致"全是浮层"、层次锚定弱且透出背景内容；
> ② `Sidebar.tsx` 是死代码（AppShell 实际用 CaseListSidebar）；③ 顶栏下拉未从触发按钮"长出来"。

## 一、玻璃只留给浮层（静态 chrome 改实底）

规则：**fixed/absolute 定位的弹层/抽屉/下拉保留 `glass-panel` / `glass-card`；
静态定位的容器/页面卡片改实底 `var(--bg-panel)` 或 `var(--bg-card)`，去掉 backdrop-filter。**

改实底清单（保留 rounded/border/阴影等其余样式，只改背景与玻璃类）：

1. `src/components/layout/TopNavBar.tsx`：header 的 `glass-panel` → 实底 `var(--bg-panel)`；
2. `src/components/brain/CaseListSidebar.tsx`：左栏 `glass-panel` → `var(--bg-panel)`；
3. `src/components/brain/CasePanorama.tsx`：右栏外层 `glass-panel` → `var(--bg-panel)`
   （内部卡片已是 var 背景，不动）；
4. `src/components/brain/HomePage.tsx`：今日待办卡/快捷看板/AI 对话框卡的 `glass-panel`
   → `var(--bg-card)`（页面内卡片实底，白卡更清晰）；
5. `src/components/brain/BrainChat.tsx`：底部输入区 `glass-panel` → `var(--bg-panel)`；
6. `src/components/brain/GlobalStatsPanel.tsx`、`src/components/settings/SkillCenter.tsx`、
   `src/components/settings/CalculatorManager.tsx`、`src/components/settings/BankPlatformPanel.tsx`、
   `src/components/cases/overview/OverviewTimeline.tsx`、`src/components/brain/FactCard.tsx`：
   页面容器/卡片的 `glass-panel` → `var(--bg-card)` 或 `var(--bg-panel)`（按层级）；

保留玻璃清单（浮层，不动）：CalculatorPanel、CoCreateDialog、ChecklistDrawer、FileDrawer、
TaskDrawer、FlowDialogCard、RecordedEventsDrawer、ContextPreviewModal、FactAmendModal、
ManualNoteModal、TaskDetailOverlay 及所有 dropdown/popover 容器。

## 二、删死代码 Sidebar.tsx

1. 删除 `src/components/layout/Sidebar.tsx`（AppShell 已改用 CaseListSidebar，无任何引用）；
2. 若 `src/components/layout/` 下有 index 导出引用它，一并清理；
3. 确认删除后 `rg "layout/Sidebar" src` 无结果、`npx tsc --noEmit` 仍通过。

## 三、弹层锚定触发源（origin awareness）

给以下下拉容器加 `transformOrigin`，让弹层从触发按钮方向"长出来"（不是中心缩放）：

1. `src/components/layout/TopNavBar.tsx` 三个下拉：
   - AU 时间面板容器 → `transformOrigin: 'top right'`；
   - 通知面板容器 → `transformOrigin: 'top right'`；
   - 头像菜单容器 → `transformOrigin: 'top right'`；
2. `src/components/brain/BrainChat.tsx` 工具弹出菜单（bottom-full 向上展开）→
   `transformOrigin: 'bottom left'`；
3. 其余 bottom-full/top-full 的 popover 容器：给对应方向 origin（top-full → 'top left/right'，
   bottom-full → 'bottom left/right'），已在 initial 的 scale 动画上生效；
4. 保持现有 spring 两档与 reduced-motion 分支不变，只加 origin。

## 四、红线

1. 只做以上三类改动；不改 tokens.css；不新增依赖；不改逻辑/结构/文案/字号/动效参数；
2. 删除 Sidebar.tsx 前先确认无引用（tsc 兜底）；
3. 交付报告附：实底化文件清单 + 保留玻璃清单 + 新增 transformOrigin 清单。

## 五、验收（AI Studio 侧）

1. `npx tsc --noEmit` 零错误；构建通过；
2. 静态容器（顶栏/左右栏/页面卡片）无 glass-panel/glass-card；
3. 浮层（弹窗/抽屉/下拉）glass 保留；下拉展开方向从触发按钮 origin 生长；
4. 删除 Sidebar.tsx 后无失效 import。

## 六、本地联调验收（Vera / Codex 执行）

1. 走查：顶栏/左右栏/首页卡片为不透明实底，内容不再透出；弹窗/抽屉仍为毛玻璃浮层；
2. 顶栏三个下拉/中栏工具菜单展开方向自然（从按钮方向长出）；
3. 切 6 套主题无回归；无报错。

---

# F-42d（2026-08-15）：无门控硬编码 mock PII 清理 + emoji 徽章收敛（F-42 收尾批）

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (66)`（本批在 (66) 基础上改）。
> 背景：F-42a/b/c 已全绿。本批收尾两类问题：
> ① **无门控的硬编码 mock PII**（真实人名风格 + 银行 + 金额写死在 UI 上，未联调也显示——
>    红线相关，必须清）；② emoji 当 UI 元素混排（渠道徽章/快捷提问/状态标记）。

## 一、无门控硬编码 mock PII 清理（红线，最高优先）

1. `src/components/layout/TopNavBar.tsx`：
   - `INITIAL_NOTIFICATIONS`（L31-33，写死"陈伟 (NAB Bank) 补件超期预警 / PERSON_1 (CBA) /
     西太银行预审通过…"）→ 改为**空数组 `[]`**；
   - 通知面板保留空态分支（"暂无任何通知"）——确认 L60+ 已有；
2. `src/components/brain/HomePage.tsx`：
   - Vera 专家贴士卡文案（L589）移除写死客户名与案件，改为通用提示：
     `💡 系统将持续根据活跃案件实况生成审贷风控提醒（补件/截止/政策变化）。`；
   - "一键制定加速方案"按钮（L595）onClick 参数移除人名：
     `handleStartChat("帮我分析当前案件的下一步加速策略")`；
3. `src/components/brain/BrainChat.tsx`：
   - 删除 L307 硬编码案件特例：
     `if ((caseId === 'CASE_001' || caseId === 'CASE-2026-0801') && (t.id === 1 || t.id === 6))`
     ——整段逻辑删除（它只服务于 mock 数据，联调会误匹配真实案件）；
4. `src/components/brain/FolderLookupCard.tsx`：
   - mock 摘要（L28-29 等，VITE_USE_MOCK 门控内）中的"雇主 Tech Corp / $180,000"等
     具体化假数据 → 改为中性演示文案（如"演示数据：识别到申请人近两期 PAYG 工资单"），
     不出现具体公司名/金额。

## 二、emoji 徽章收敛（建议批，改完即 F-42 收官）

规则：**渠道/来源徽章 → lucide 图标；装饰性 emoji → 删除；仅保留表意强且无图标的（🔒 不能给银行看）。**

1. 任务来源徽章（`TaskDrawer.tsx` / `CasePanorama.tsx` 的 getTaskBadge）：
   `👑 老板`→ Crown 图标、`📧 邮件`→ Mail、`📁 文件`→ FolderOpen、`🏦 OS`→ Landmark、
   `📋 任务`→ ClipboardList、`⚙️ 其他`→ Settings（lucide 均有）；
   - 保留文字标签，图标 + 文字并排（`<Icon className="w-3 h-3" /> 老板`）；
2. 快捷提问/工具菜单 emoji 前缀（`BrainChat.tsx` QUICK_ASKS、工具菜单选项）：
   🧮→Calculator、📂→FolderSearch、🔍→Search、✉️→Mail、🆕→PlusCircle、
   📄→FileCheck、⏰→Clock——图标已存在则删除 emoji，用图标；
3. 状态标记：✅⛔（AuTimePanel 工作日状态）→ 保留语义色 + 文字（绿"工作日"/红"休息"），
   删 emoji；🏖️ 假期提示 → 删 emoji 保留文字；🇨🇳🇦🇺 旗帜 → 删（文字已有"中澳/北京/堪培拉"）；
4. 保留：🔒 不能给银行看、📌 记录胶囊、⚠️ 已在语义色徽章内的（如逾期 ⚡ 可删）。

## 三、红线

1. 只改上述文件；不改 tokens.css；不新增依赖；不改逻辑/结构/布局；
2. mock 清理只动"无门控硬编码"，VITE_USE_MOCK 门控内的数据保留（联调后自然消失）；
3. 交付报告附：清理清单（文件/行/原文/新文）+ emoji 替换对照表。

## 四、验收（AI Studio 侧）

1. `npx tsc --noEmit` 零错误；构建通过；
2. 全站无"陈伟/PERSON_1（非门控）/CASE_001 特例"硬编码（rg 自查）；
3. 任务来源徽章、快捷提问、AU 时间面板无装饰性 emoji（🔒/📌 除外）；
4. 交付报告附清单。

## 五、本地联调验收（Vera / Codex 执行）

1. 打开首页：无任何客户真名/银行名硬编码文案；
2. 顶栏通知为空态"暂无任何通知"（不显示假通知）；
3. 中栏任务/清单/文件抽屉与右栏：渠道徽章为图标+文字，无 emoji 混排；
4. AU 时间面板无旗帜/emoji 状态，语义色清晰。

---

# F-42d 补丁（2026-08-15）：FloatingAI 无门控假数据清理 + 占位符 fallback 收尾

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (68)`（本批在 (68) 基础上改）。
> 背景：F-42d 验收**主体通过**，发现 2 处漏网的无门控硬编码 + 2 处占位符 fallback，
> 修完即 F-42 全系列收官。只改下列文件，禁止扩大范围。

## 一、FloatingAIMessages.tsx 无门控假数据清理（最重要）

`src/components/ai/FloatingAIMessages.tsx` 无任何 VITE_USE_MOCK 门控，是全局悬浮 AI
的固定展示内容：

1. L48 `⚡ 建议优先处理: Wang Li 的 ANZ OS 条件（Finance Due 仅剩 3 天）。` →
   通用文案：`⚡ 建议优先处理：请在今日工作台查看最新逾期/紧急待办。`
   （不得出现任何客户名/银行名/具体案件）；
2. L37-40 写死的假统计（28 个活跃案件 / 5 个 OS 条件 / 12 封新邮件 / $12,350 佣金）：
   - 若该文件已接真实数据来源 → 用真实数据；
   - 若仍是写死 → 改为中性演示文案：
     `• 活跃案件与紧急事项请查看今日工作台` / `• OS 条件与邮件进度请在对应页面查看`
     （不出现具体数字与金额）；
3. 保留 💰 图标可删除，文案保持中性。

## 二、占位符 fallback 收尾（2 处）

1. `src/components/os/OsWorkbench.tsx:18`：
   `task?.caseName || 'PERSON_1'` → `task?.caseName || '客户'`；
2. `src/components/os/OsDraftColumn.tsx` 两个草稿模板常量（DEFAULT_CN_DRAFT / DEFAULT_EN_DRAFT）：
   `PERSON_1` → `【客户姓名】`（模板占位符，用户发送前替换）。

## 三、红线

1. 只改上述 3 个文件对应处；不改 tokens.css；不新增依赖；不改组件逻辑/布局；
2. 交付报告附逐条改动说明。

## 四、验收

1. `npx tsc --noEmit` 零错误；
2. rg 自查：全站无"Wang Li"、无"PERSON_1"（除 VITE_USE_MOCK 门控内与 placeholder）；
3. FloatingAI 悬浮面板无假客户名/银行名/假金额。

---

# F-43（2026-08-17）：六主题色值重构（背景≠按钮色系）+ 按钮文字色令牌 + FloatingAI mock 中性化

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (69)`（本批在 (69) 基础上改）。
> 背景（Vera 拍板）：**主题背景与按钮主色必须不同色系但协调**（现六套大多"底什么色、钮什么色"）。
> 方案经 apple-design + WCAG 对比度实测验证（详见 docs/F-42_前端品味审查报告.md §十四）。
> 关键工程点：**金色按钮配白字不达标（3.19），需引入 `--on-accent` / `--on-accent-strong`
> 按钮文字色令牌**（暗色主题=深棕字，亮色主题=白字），并替换全站 39 处 accent 底 text-white。

## 一、tokens.css 六主题色值重构（只改 tokens.css 的色值，结构/令牌名不删）

### 1. dark → Midnight 深夜钴蓝

| 令牌 | 现值 | 改为 |
|---|---|---|
| --bg-app | #0b0d12 | **#0e1420** |
| --bg-panel | #12151e | **#141b2a** |
| --bg-card | #181c28 | **#1a2233** |
| --bg-card-hover | #202536 | **#222c40** |
| --bg-input | #11141f | **#101722** |
| --surface-translucent | rgba(18,21,30,0.78) | rgba(20,27,42,0.78) |
| --surface-translucent-card | rgba(24,28,40,0.88) | rgba(26,34,51,0.88) |
| --border | #23283b | **#263047** |
| --border-active | #3b82f6 | **#e0a458** |
| --text-primary | #f1f5f9 | **#e2e8f0** |
| --text-secondary | #94a3b8 | **#8fa3bf** |
| --text-muted | #94a3b8 | **#6d7f9c** |
| --accent | #3b82f6 | **#e0a458**（浅金：链接/图标/边框/焦点） |
| --accent-strong | #2563eb | **#d97706**（琥珀金：实心主按钮） |
| --accent-soft | rgba(59,130,246,0.12) | rgba(224,164,88,0.14) |
| --blue | #3b82f6 | **#e0a458** |
| --green | #10b981 | **#059669** |
| --green-soft | rgba(16,185,129,0.12) | rgba(5,150,105,0.14) |
| --yellow | #f59e0b | **#d97706** |
| --yellow-soft | rgba(245,158,11,0.12) | rgba(217,119,6,0.14) |
| --red | #ef4444 | **#dc2626** |
| --red-soft | rgba(239,68,68,0.12) | rgba(220,38,38,0.14) |
| --orange | #f97316 | **#ea580c** |
| --orange-soft | rgba(249,115,22,0.12) | rgba(234,88,12,0.14) |
| --purple | #8b5cf6 | **#c084fc** |
| --purple-soft | rgba(139,92,246,0.10) | rgba(192,132,252,0.14) |
| --ring | #3b82f6 | **#e0a458** |
| --shadow-card | 0 4px 16px rgba(0,0,0,0.40) | **0 4px 16px rgba(37,99,235,0.16)**（蓝色 tint） |
| --shadow-overlay | 0 16px 40px rgba(0,0,0,0.65) | **0 16px 40px rgba(7,11,24,0.70)** |
| --purple | #8b5cf6 | **#38bdf8**（青蓝，金×青蓝互补协调；soft 改 rgba(56,189,248,0.16)） |
| **新增 --on-accent** | — | **#1a1206**（浅金底上的深棕字） |
| **新增 --on-accent-strong** | — | **#1a1206**（琥珀金底上的深棕字） |
| **新增 --on-purple** | — | **#1a1206**（青蓝 AI 底上的深棕字，白字仅 2.14 不达标） |

### 2. light → Paper 纸感日光

| 令牌 | 现值 | 改为 |
|---|---|---|
| --bg-app | #f1f5f9 | **#fafaf7** |
| --bg-panel | #f8fafc | **#f4f3ee** |
| --bg-card-hover | #f8fafc | **#f4f3ee** |
| --bg-input | #f1f5f9 | **#f2f1ec** |
| --surface-translucent | rgba(248,250,252,0.82) | rgba(244,243,238,0.84) |
| --border | #e2e8f0 | **#e6e3da** |
| --border-active | #2563eb | **#1e4f8a** |
| --text-primary | #0f172a | **#1a2233** |
| --text-secondary | #475569 | **#5a6472** |
| --text-muted | #5b6b82 | **#7a8494** |
| --accent | #2563eb | **#1e4f8a**（墨蓝） |
| --accent-strong | #1d4ed8 | **#163e6e** |
| --accent-soft | rgba(37,99,235,0.08) | rgba(30,79,138,0.08) |
| --blue | #2563eb | **#1e4f8a** |
| --ring | #2563eb | **#1e4f8a** |
| --shadow-sm/card/overlay | 灰黑 | **暖灰 tint**（如 rgba(90,80,60,0.06)/0.07/0.12） |
| --purple | #7c3aed | **#c2570a**（深琥珀，纸面×琥珀=荧光笔批注感；soft 改 rgba(194,87,10,0.12)） |
| **新增 --on-accent** | — | **#ffffff** |
| **新增 --on-accent-strong** | — | **#ffffff** |
| **新增 --on-purple** | — | **#ffffff**（深琥珀底白字 4.5 ✓） |

### 3. ivory 象牙米（微调，保留主色）

- `--blue: #2563eb` → **`#d97757`**（清残留，与 accent 同步）；
- `--purple` → **`#0369a1`**（深青，米底橙钮×青 AI 暖冷平衡；soft 改 rgba(3,105,161,0.12)）；
- **新增 `--on-purple: #ffffff`**（深青底白字 ≥4.5）；
- 新增 `--on-accent: #ffffff`、`--on-accent-strong: #ffffff`；
- 其余不动。

### 4. eyecare → Warm Paper 暖米护眼

| 令牌 | 现值 | 改为 |
|---|---|---|
| --bg-app | #edf3e8 | **#f5f1e8** |
| --bg-panel | #f5f9f2 | **#efe9dc** |
| --bg-card | #ffffff | **#fdfbf7**（关键：非纯白，护眼核心） |
| --bg-card-hover | #e1ebe0 | **#efe9dc** |
| --bg-input | #edf3e8 | **#efe9dc** |
| --surface-translucent | rgba(245,249,242,0.85) | rgba(239,233,220,0.86) |
| --surface-translucent-card | rgba(255,255,255,0.9) | rgba(253,251,247,0.92) |
| --border | #cad8c8 | **#e0dac8** |
| --border-active | #2e7d32 | **#4a6b2e** |
| --text-primary | #1b331e | **#2d2a24** |
| --text-secondary | #426346 | **#5f5949** |
| --text-muted | #537557 | **#6b6557** |
| --accent | #2e7d32 | **#4a6b2e**（深橄榄绿） |
| --accent-strong | #1b5e20 | **#3f5c26** |
| --accent-soft | rgba(46,125,50,0.12) | rgba(74,107,46,0.12) |
| --blue | #2563eb | **#4a6b2e** |
| --ring | #2e7d32 | **#4a6b2e** |
| --purple | #7c3aed | **#a0523f**（深陶土，橄榄绿钮×陶土 AI 自然暖调低刺激；soft 改 rgba(160,82,63,0.14)） |
| **新增 --on-accent / --on-accent-strong** | — | **#ffffff / #ffffff** |
| **新增 --on-purple** | — | **#ffffff**（深陶土底白字 5.57 ✓） |

### 5. blush → Sakura 樱花粉（给女生）

| 令牌 | 现值 | 改为 |
|---|---|---|
| --bg-app | #f9f0f2 | **#fdf2f4** |
| --bg-panel | #fcf6f7 | **#f9e9ec** |
| --bg-card-hover | #f2e2e6 | **#f9e9ec** |
| --bg-input | #f9f0f2 | **#f9e9ec** |
| --surface-translucent | rgba(252,246,247,0.85) | rgba(249,233,236,0.86) |
| --border | #e0c8ce | **#ecd9dd** |
| --border-active | #be5170 | **#2f6b50** |
| --text-primary | #381a22 | **#3a2b2e** |
| --text-secondary | #6e4450 | **#6d5459** |
| --text-muted | #825462 | **#8b7278** |
| --accent | #be5170 | **#2f6b50**（墨绿，粉×绿经典搭配） |
| --accent-strong | #9e3955 | **#265743** |
| --accent-soft | rgba(190,81,112,0.12) | rgba(47,107,80,0.12) |
| --blue | #3b82f6 | **#2f6b50** |
| --ring | #be5170 | **#2f6b50** |
| --purple | #9333ea | **#be5170**（玫粉，粉底×玫粉 AI 温柔女性向；soft 改 rgba(190,81,112,0.14)） |
| **新增 --on-accent / --on-accent-strong** | — | **#ffffff / #ffffff** |
| **新增 --on-purple** | — | **#ffffff**（玫粉底白字 4.56 ✓） |

### 6. sand 暖沙（保留微调）

- 主色保留（暖棕黑底 `#1c1812` + 琥珀 `#d97706`）；
- `--purple` → **`#7dd3fc`**（青蓝，暖棕底×青蓝 AI 冷暖对比突出；soft 改 rgba(125,211,252,0.16)）；
- **新增 `--on-accent: #1a1206`、`--on-accent-strong: #1a1206`**（金系按钮深字，与 Midnight 一致）；
- **新增 `--on-purple: #1a1206`**（青蓝 AI 底上的深棕字）；
- 其余不动。

## 二、按钮文字色机制（.btn-primary 与组件）

1. `tokens.css` 末尾 `.btn-primary { color: #ffffff; }` → **`color: var(--on-accent-strong);`**；
2. 全站 **39 处 "accent 底 + text-white"** 替换：
   - `bg-[var(--accent-strong)] text-white` → `bg-[var(--accent-strong)] text-[var(--on-accent-strong)]`；
   - `backgroundColor: 'var(--accent-strong)'`（style 写法）→ 同一元素加
     `color: 'var(--on-accent-strong)'`；
   - `backgroundColor: 'var(--accent)'` 的**实心按钮/气泡/图标块**（如 ChatPanel 用户气泡、
     CaseBoard 按钮、FloatingAI 发送、Archive/DraftsBox/ImportHistory 图标块）→ 加
     `color: 'var(--on-accent)'`；
   - **图标/链接/边框用 var(--accent) 的前景色不用改**（不是实心底，无文字色问题）；
3. **语义色按钮（bg-[var(--red)] text-white 等 37 处）保持白字，本次不动**；
4. 头像/渐变/非令牌背景的 text-white（61 处）不动。

5. **AI 实心底 21 处 `bg-[var(--purple)] text-white` → `text-[var(--on-purple)]`**：
   FloatingAIMessages（AI 气泡）、AssistantOnboardingCard（开始配置）、AssistantSettingsCard
   （保存）、FileDrawer（AI 解析）、SkillCenter（开关）、FlowDialogCard（确认）、BrainChat
   （气泡角标）等——Midnight/sand 的 AI 青蓝色白字仅 1.67-2.14 不达标，必须深棕字；
   AiUsageBar 进度条、CasePanorama 圆点等无文字元素不动。

重点文件（39 处分布）：CalculatorPanel、CoCreateDialog、ChatPanel、FloatingAI、CaseBoard、
Archive、DraftsBox、ImportHistory、CaseDetail、HomePage、BrainChat 等，逐文件扫
`text-white` + `accent` 组合替换。

## 三、FloatingAI.tsx mock 回复中性化

`src/components/ai/FloatingAI.tsx` L125-136（VITE_USE_MOCK 门控内）：

1. 默认回复（L127）：
   `收到关于「...」的问询。全量 28 个案件数据已完成交叉分析，涉及 CBA/ANZ/NAB 的贷款进度正常，建议关注 Wang Li 案件的补件与 Finance Due 倒计时。`
   → `收到关于「${currentInput}」的问询。已基于当前案件库与银行政策完成初步分析，可继续询问具体案件或补件状态。`；
2. "周报"分支（L130-133）：`本周新接入案件: 4 件 ($3.4M) / Unconditional 获批: 2 件 ($1.8M) / 结佣预估: $12,350 / ANZ 自雇 ABN 转 CBA 案件` → 中性：
   `📊 **Vera 贷款周报（智能生成预览）**\n- 本周案件新增、获批与结佣数据请以今日工作台统计为准\n- 需重点跟进案件已在首页待办中列出`；
3. "分析"分支（L135-137）：`平均批复周期 12.4 天 / CBA 8 天 / ANZ 45%` → 中性：
   `📈 案件批复周期与银行时效分析将在联调后接入真实数据，当前为演示回复。`

## 四、红线

1. 只改 tokens.css 色值与上述组件文字色/FloatingAI 文案；**不改任何组件结构、逻辑、字号、动效**；
2. 不新增 npm 依赖；tokens.css 令牌名不删不改（只改值、新增 --on-accent/--on-accent-strong）；
3. 交付报告附：六主题替换清单 + 39 处 text-white 替换明细 + FloatingAI 文案前后对照。

## 五、验收（AI Studio 侧）

1. `npx tsc --noEmit` 零错误；构建通过；
2. `rg -n "text-white" src --glob "*.tsx"` 中 accent 底组合为 0（仅剩语义色/头像/渐变）；
3. `rg -n "on-accent" src/themes/tokens.css` 六主题各 2 个令牌齐全；
4. 切 6 套主题：主按钮文字可读（Midnight/sand 金钮深棕字、其余白字），背景与按钮色系不同；
5. FloatingAI 演示回复无假客户名/假金额。

## 六、本地联调验收（Vera / Codex 执行）

1. 切 6 套主题逐套走查：主按钮文字对比清晰、无"绿底绿钮/粉底粉钮"同色系现象；
2. 首页/中栏/右栏/设置/计算器/通知/草稿箱/AU 面板配色协调，语义色仍可辨识；
3. 悬浮 AI 演示回复中性；无回归（色类 0、bg-black 0、spring 两档、字号、reduced-motion）。

---

# F-43 补丁（2026-08-17）：验收未过的 4 项收尾（--purple 协调色 / --on-purple / 30 处文字色替换）

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (70).zip`（解压后在本批基础上改）。
> 背景：F-43 验收发现**主色重构已正确，但 AI 色与按钮文字替换漏做**：
> ① 六主题 --purple 仍是旧紫（协调色方案未落地）；② --on-purple 令牌未加；
> ③ accent+text-white 残留 17 处；④ purple+text-white 残留 13 处。
> 本补丁只做这 4 项，其余（已完成的背景/accent/on-accent/btn-primary/FloatingAI）不要再动。

> ⚠️ **冲突解除说明（重要，先读）**：本补丁是对 F-43 的收尾，与任何历史指令冲突时**以本补丁为准**：
> ① F-42 系列"紫色保留为 AI 高亮、不改 tokens.css、text-white 保持"等表述**本轮不适用**
> （Vera 已拍板 AI 色改为每主题协调色，不再固定紫）；
> ② F-43 原红线"令牌名不删不改（只改值、新增 --on-accent/--on-accent-strong）"中
> 的"只改值"**包含 --purple 的值**，"新增"**包含 --on-purple**——本补丁逐一列明，照做即可；
> ③ tokens.css 中 --purple 行的旧注释（"仅保留为智能 AI 特殊高亮辅助"）**请同步更新为
> "AI 高亮色（每主题协调色，非固定紫）"**，避免后续误读。

## 一、tokens.css 六主题 --purple / --purple-soft 更新 + --on-purple 新增

在每个主题块（:root[data-theme="..."]）内：

| 主题 | --purple 改为 | --purple-soft 改为 | 新增 --on-purple |
|---|---|---|---|
| dark (Midnight) | `#38bdf8`（青蓝） | `rgba(56,189,248,0.16)` | `#1a1206`（深棕，白字仅 2.14 ✗） |
| light (Paper) | `#c2570a`（深琥珀） | `rgba(194,87,10,0.12)` | `#ffffff` |
| ivory | `#0369a1`（深青） | `rgba(3,105,161,0.12)` | `#ffffff` |
| eyecare (Warm Paper) | `#a0523f`（深陶土） | `rgba(160,82,63,0.14)` | `#ffffff` |
| blush (Sakura) | `#be5170`（玫粉） | `rgba(190,81,112,0.14)` | `#ffffff` |
| sand | `#7dd3fc`（青蓝） | `rgba(125,211,252,0.16)` | `#1a1206`（深棕，白字仅 1.67 ✗） |

同步更新 --purple 行注释为"AI 高亮色（每主题协调，非固定紫）"。

## 二、17 处 accent+text-white → on-accent（逐条替换）

| 文件:行 | 原 | 改 |
|---|---|---|
| BrainChat.tsx:714 | `bg-[var(--accent)] text-white` | `bg-[var(--accent)] text-[var(--on-accent)]` |
| CoCreateDialog.tsx:600 | `bg-[var(--accent-strong)] text-white` | `text-[var(--on-accent-strong)]` |
| ManualNoteModal.tsx:124 | `bg-[var(--accent)] ... text-white` | `text-[var(--on-accent)]` |
| FileDrawer.tsx:368 / 519 / 531 / 916 | `bg-[var(--accent)] ... text-white` | `text-[var(--on-accent)]` |
| HomePage.tsx:582 | `bg-[var(--accent)] text-white` | `text-[var(--on-accent)]` |
| CaseFolderCard.tsx:236 / 303 / 403 | `bg-[var(--accent)] ... text-white` | `text-[var(--on-accent)]` |
| NewCaseFields.tsx:105 | `bg-[var(--accent)] text-white` | `text-[var(--on-accent)]` |
| EmailDispatchDetail.tsx:235 | style backgroundColor accent + `text-white` | style 加 `color: 'var(--on-accent)'` |
| FileFieldsPanel.tsx:111 | `bg-[var(--accent)] text-white` | `text-[var(--on-accent)]` |
| FilePreviewPanel.tsx:145 / 195 | `bg-[var(--accent)] text-white` | `text-[var(--on-accent)]` |
| GeneralEmailDetail.tsx:232 | style backgroundColor accent + `text-white` | style 加 `color: 'var(--on-accent)'` |

## 三、13 处 purple+text-white → on-purple（逐条替换）

| 文件:行 | 原 | 改 |
|---|---|---|
| SkillCenter.tsx:333 | `bg-[var(--purple)] text-white` | `text-[var(--on-purple)]` |
| AssistantSettingsCard.tsx:163 | 同上 | `text-[var(--on-purple)]` |
| AssistantOnboardingCard.tsx:164 | 同上 | `text-[var(--on-purple)]` |
| BrainChat.tsx:807 | 同上（角标） | `text-[var(--on-purple)]` |
| NewCaseFields.tsx:216 | 同上 | `text-[var(--on-purple)]` |
| NewCaseSheet.tsx:575 / 878 / 887 / 896 | 同上 | `text-[var(--on-purple)]` |
| FactAmendModal.tsx:137 | 同上 | `text-[var(--on-purple)]` |
| FileDrawer.tsx:727 | 同上 | `text-[var(--on-purple)]` |
| FlowDialogCard.tsx:199 / 333 | 同上 | `text-[var(--on-purple)]` |

## 四、红线

1. 只做上述 4 项；不改已完成的背景/accent/on-accent/btn-primary/FloatingAI；不改逻辑/结构/字号/动效；
2. 不新增依赖；交付报告附逐条替换明细。

## 五、验收（AI Studio 侧）

1. `npx tsc --noEmit` 零错误；构建通过；
2. `rg -n "text-white" src --glob "*.tsx"` 中 accent/purple 底组合为 0；
3. `rg -n -- "--on-purple" src/themes/tokens.css` 六主题各 1 个；
4. `rg -n -- "--purple:" src/themes/tokens.css` 六主题值 = 38bdf8/c2570a/0369a1/a0523f/be5170/7dd3fc；
5. 切 6 套主题：AI 元素（计算器/共创/AI 建议）颜色与主题协调且与主色可区分。

---

# F-43 补丁二（2026-08-17）：首页逾期预警闪烁点被裁剪修复（truncate 冲突）

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (71)`（本批在 (71) 基础上改）。
> 背景：F-43 验收通过，但发现首页"到期/逾期预警"banner 的红色闪烁点（animate-ping）
> 上半被切掉、显示不完整。根因：闪烁点所在外层容器带 `truncate`（Tailwind = overflow:hidden），
> ping 扩散动画（scale 2x）超出容器顶部时被裁剪。全站仅此一处 animate-ping。

## 一、修复（src/components/brain/HomePage.tsx，逾期 banner 区块）

**原结构（约 L181-200）：**

```jsx
<div className="flex items-center space-x-3 truncate">
  <div className="p-1.5 rounded-xl bg-[var(--yellow-soft)] text-[var(--yellow)] flex-shrink-0 relative overflow-visible">
    <AlertTriangle className="w-4 h-4" />
    <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5 pointer-events-none">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--red)] opacity-75" />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--red)] shadow-xs" />
    </span>
  </div>
  <div className="truncate">
    …文字…
  </div>
</div>
```

**改为：**

```jsx
<div className="flex items-center space-x-3">
  <div className="p-1.5 rounded-xl bg-[var(--yellow-soft)] text-[var(--yellow)] flex-shrink-0 relative overflow-visible">
    <AlertTriangle className="w-4 h-4" />
    <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5 pointer-events-none">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--red)] opacity-75" />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--red)] shadow-xs" />
    </span>
  </div>
  <div className="truncate">
    …文字（不变）…
  </div>
</div>
```

要点：
1. **只动外层容器**：`flex items-center space-x-3 truncate` → `flex items-center space-x-3`
   （去掉 truncate，避免裁剪 ping 扩散）；
2. **文字省略保留**：把 truncate 移到文字容器（若已是 `<div className="truncate">` 则不变），
   保证小屏下文字仍省略、闪烁点完整显示；
3. 闪烁点自身结构、颜色（var(--red)）、动画不动。

## 二、红线

1. 只改 HomePage.tsx 逾期 banner 外层容器这一行 class；不改其他任何内容；
2. 不新增依赖；不改逻辑。

## 三、验收

1. `npx tsc --noEmit` 零错误；
2. 本地打开首页（有逾期待办时）：闪烁点完整圆形，扩散动画不被裁剪；
3. 缩小窗口宽度：文字省略正常，闪烁点仍完整。

---

# F-43 补丁三（2026-08-17）：窗口四角弧形（前端圆角 + 拖拽区预留，Electron 模式）

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (71)`（本批在 (71) 基础上改）。
> 背景：Vera 要求软件最外层四角弧形。调研结论（Codex/Cursor/ChatGPT 等主流 Electron 应用）：
> **不做真透明窗口（transparent:true 代价大：不能系统最大化/双击最大化/resize 要自研/
> Windows 材质 bug），而是"无边框窗口 + 前端 CSS 圆角 + 自定义标题栏拖拽区"**。
> 本批做前端部分（浏览器预览即可见圆角、不影响 Web 模式）；Electron 封装部分已记入 BACKLOG。

## 一、窗口圆角（前端，现在做）

1. `src/themes/tokens.css` 的 `:root` 全局块（首个 :root 处）新增：
   `--window-radius: 12px;`（窗口圆角比卡片 --radius 10px 稍大，更耐看；注释"窗口外层圆角"）；
2. `src/index.css` 新增（放 :root 定义后）：

```css
/* 窗口外层圆角（Electron 无边框窗口 + 浏览器预览通用） */
#app-shell {
  border-radius: var(--window-radius);
  overflow: hidden;
}
```

（AppShell 外层已有 `id="app-shell"` 与 `overflow-hidden`，无需改 JSX；
圆角后内容不溢出，浏览器预览直接可见。）

## 二、拖拽区预留（Electron 无边框窗口用）

1. `src/index.css` 新增：

```css
/* Electron 无边框窗口拖拽区（浏览器预览无效、无副作用） */
.electron-drag {
  -webkit-app-region: drag;
}
.electron-drag button,
.electron-drag input,
.electron-drag a,
.electron-drag select,
.electron-drag [role="button"] {
  -webkit-app-region: no-drag;
}
```

2. `src/components/layout/TopNavBar.tsx`：header 元素 className 追加 `electron-drag`
   （如 `className="h-14 border-b ... glass-panel relative electron-drag"`）；
   交互元素（搜索框/按钮/下拉）自动被 CSS 选择器设为 no-drag，无需逐个改 JSX。

## 三、红线

1. 只加上述 CSS 与 header 一个类；不改布局/逻辑/文案/动效；不改组件结构；
2. 不新增 npm 依赖；浏览器模式零影响（-webkit-app-region 在非 Electron 环境无效）；
3. 交付报告附改动说明。

## 四、验收（AI Studio 侧）

1. `npx tsc --noEmit` 零错误；构建通过；
2. 浏览器打开：App 四角呈现 12px 圆角，内容不溢出；
3. `rg -n "window-radius|electron-drag" src` 检查：tokens.css 有 --window-radius、
   index.css 有 #app-shell 圆角与 .electron-drag 规则、TopNavBar header 有 electron-drag 类。

## 五、本地联调验收（Vera / Codex 执行）

1. 浏览器预览：四角圆角清晰，无内容溢出四角；
2. 各页面切换（首页/中栏/右栏/设置）圆角不破；
3. 六套主题下圆角一致。

---

# F-43 补丁四（2026-08-17）：文件预览改居中大悬浮窗 + Office 原样排版（ifrrame 接线）

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (71)`（本批在 (71) 基础上改）。
> 背景：文件预览目前两处都偏小——FileDrawer 内嵌预览（悬浮抽屉内小区域）、FilePreviewPanel
> （右侧 520px 抽屉）。后端已具备 Office→PDF 预览能力（core/pipeline/preview.py LibreOffice
> 转换 + `GET /api/files/{file_id}/preview` 返回转换后 PDF），但前端把 doc/docx/xlsx 打进了
> "格式无法内置直显"fallback。本批：① 预览改居中大悬浮窗；② Office 格式接 iframe。
> 调研依据：旧项目 preview_converter.py 同款方案（新项目已移植后端）。

## 一、FilePreviewPanel.tsx（详情页附件预览）改居中大模态 + Office iframe

文件：`src/components/panel/details/FilePreviewPanel.tsx`（被 EmailDispatchDetail /
FileMatchDetail / GeneralEmailDetail 三处复用，改一处三处生效）。

1. **布局改居中大模态**：
   - 外层 `fixed top-0 right-0 bottom-0 w-full sm:w-[520px]` → `fixed inset-0 z-50 flex
     items-center justify-center p-4 sm:p-8`（深色遮罩 `bg-black/60 backdrop-blur-xs`
     + 点击遮罩关闭）；
   - 内容容器 `max-w-[92vw] w-full max-h-[90vh] h-[90vh] rounded-2xl border shadow-2xl
     flex flex-col overflow-hidden`（圆角 12px 与窗口一致，背景 var(--bg-card)）；
   - 保留现有 header（文件名/类型/下载/新标签/关闭）；
   - **Esc 关闭**：useEffect 监听 keydown Escape → onClose；
   - 关闭按钮与遮罩点击均调 onClose。
2. **加 Office 格式 iframe 接线**：
   - 新增 `const isOffice = ['doc','docx','docm','odt','rtf','xls','xlsx','xlsm','ods',
     'ppt','pptx','pptm','odp','csv','tsv'].includes(ext);`
   - 渲染分支：`isPdf || isOffice` → iframe（`src={previewUrl}`，后端对 Office 自动转 PDF
     返回，浏览器直接显示原样排版）；zoom/rotate 工具栏对 isOffice 同样生效；
   - fallback 分支收窄为只剩 msg 等真正无法转换的格式（保留"点击下载原文件"）。
3. 图片/文本分支不变（img object-contain / pre 文本），全部在大模态内展示。

## 二、FileDrawer.tsx（中栏文件抽屉）预览区加"全屏预览"

文件：`src/components/brain/FileDrawer.tsx`（内嵌预览区约 L495-612）。

1. **FileItem 类型加可选 file_id**：`src/types/api.ts` 的 `FileItem` 增加
   `file_id?: string;`（后端 folder files 响应将来带该字段，未带时 undefined 不报错）；
2. 内嵌预览区加"⛶ 全屏预览"按钮（预览区右上角）→ 打开大预览模态
   （`fixed inset-0 z-50` 居中，样式同 FilePreviewPanel 大模态，或直接复用
   FilePreviewPanel 组件传入 fileId=file.file_id / filename / docType）；
3. 大模态内容分派：
   - 图片/PDF：rawUrl / previewUrl 大屏（现有数据）；
   - Office（doc/docx/xls/xlsx 等）且 `file.file_id` 存在 → iframe
     `/api/files/{file_id}/preview`（后端转 PDF 原样排版）；
   - Office 无 file_id 或 msg → 显示解析文本（previewData.text_preview）+ 提示
     "原样排版预览将随文件库关联自动启用"；
4. 内嵌预览区保留（快速预览用），全屏按钮是入口。

## 三、红线

1. 只改 FilePreviewPanel.tsx / FileDrawer.tsx / types/api.ts（FileItem 加字段）；
   不改后端、不改其他组件；不新增依赖；不改逻辑/文案/动效；
2. 大模态沿用现有设计令牌（var 背景/边框/圆角 + spring 300 进场 + reduced-motion 分支）；
3. 交付报告附改动说明与格式支持矩阵。

## 四、验收（AI Studio 侧）

1. `npx tsc --noEmit` 零错误；构建通过；
2. 详情页附件预览为居中大模态（遮罩 + Esc/遮罩关闭）；
3. doc/docx/xlsx 等 Office 文件在详情页走 iframe（previewUrl），不再显示
   "格式无法内置直显"；
4. FileDrawer 预览区有"全屏预览"按钮，点击开大模态不报错。

## 五、本地联调验收（Vera / Codex 执行）

1. 中栏文件抽屉：点文件 → 内嵌快速预览；点"全屏预览" → 居中大悬浮窗，Esc 关闭；
2. 详情页附件预览：大模态展示，PDF/图片缩放旋转正常；
3. 有 file_id 的 Office 文件（联真后端）：原样排版显示（LibreOffice 转 PDF）；
4. 六套主题下大模态配色协调；圆角与窗口一致。

---

# F-44（2026-08-17）：Electron 无边框窗口标题栏（窗口按钮组 + API 地址注入）

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (72)`（本批在 (72) 基础上改）。
> 背景：Electron 封装采用 `frame: false` 无边框窗口（方案见 docs/Electron封装方案_2026-08-17.md），
> 窗口按钮由前端标题栏渲染（条件渲染，浏览器预览零影响）。Electron 侧 IPC 已实现
> （preload 暴露 `window.veraElectron`），本批做前端配合。

## 一、窗口按钮组（TopNavBar 右侧）

`src/components/layout/TopNavBar.tsx` 右侧（AU 时间/通知/主题/头像之后）新增窗口按钮组，
**仅当 `window.veraElectron` 存在时渲染**：

```tsx
const isElectron = typeof window !== 'undefined' && !!window.veraElectron;
const [maximized, setMaximized] = useState(false);

useEffect(() => {
  if (!window.veraElectron?.onMaximizedChange) return;
  const off = window.veraElectron.onMaximizedChange((m: boolean) => setMaximized(m));
  window.veraElectron.isMaximized?.().then(setMaximized);
  return off;
}, []);
```

按钮组（三个图标按钮，`pl-2 border-l` 分隔，样式沿用现有图标按钮：
`p-2 rounded-lg border text-muted hover:text-primary`）：

1. **最小化**：`Minus` 图标 → `window.veraElectron.minimize()`；
2. **最大化/还原**：`Square`（未最大化）/ `Copy`（最大化，还原图标）→
   `window.veraElectron.toggleMaximize()`；
3. **关闭**：`X` 图标 → `window.veraElectron.close()`（Electron 侧默认最小化到托盘）；

非 Electron 环境（浏览器/AI Studio 预览）：整个按钮组不渲染。

## 二、最大化时窗口圆角变直角

监听 `onMaximizedChange`：`maximized=true` 时给 `#app-shell`（或 documentElement）
加 `data-maximized` 属性，`index.css` 增加：

```css
#app-shell[data-maximized] {
  border-radius: 0;
}
```

还原时移除属性，圆角恢复 12px。

## 三、API 地址注入（后端换端口时前端跟随）

Electron 生产模式后端可能使用 8000-8010 中可用端口；preload 暴露
`window.veraElectron.getApiBase()`。`src/services/http.ts`（及 sseClient.ts /
calculator.ts 的 BASE_URL 定义）改为优先读：

```ts
const electronBase = (window as any).veraElectron?.getApiBase
  ? awaitPromise((window as any).veraElectron.getApiBase())
  : null;
export const BASE_URL = electronBase || import.meta.env.VITE_API_URL || 'http://localhost:8000';
```

> 注：getApiBase 是 async（返回 Promise）。BASE_URL 若是模块级常量，改为
> `let BASE_URL = ...` + 启动时异步覆盖；或在请求函数内每次取
> `(window as any).veraElectron?.apiBase`（若 preload 同步暴露则更简单——由
> Electron 侧在 preload 同步注入 `apiBase` 字符串，本批前端优先支持同步字段
> `window.veraElectron?.apiBase`，没有则用默认值）。

**推荐实现**：请求函数内取 `const base = (window as any).veraElectron?.apiBase ||
import.meta.env.VITE_API_URL || 'http://localhost:8000';`（避免异步初始化问题）。

## 四、类型声明

`src/types/` 或 `src/vite-env.d.ts` 增加：

```ts
interface VeraElectronApi {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  getVersion: () => Promise<string>;
  getApiBase: () => Promise<string>;
  apiBase?: string;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (cb: (maximized: boolean) => void) => () => void;
}
declare global {
  interface Window {
    veraElectron?: VeraElectronApi;
  }
}
```

## 五、红线

1. 只加窗口按钮组/样式/类型/apiBase 读取；不改其他组件逻辑；不新增依赖；
2. 浏览器预览必须零影响（按钮组不渲染、BASE_URL 走默认值）；
3. 交付报告附改动说明。

## 六、验收（AI Studio 侧）

1. `npx tsc --noEmit` 零错误；构建通过；
2. 浏览器打开：无窗口按钮组（不渲染）；API 正常走默认 localhost:8000；
3. `rg -n "veraElectron" src`：TopNavBar / http.ts / sseClient.ts / types 均有引用且类型完整。

## 七、本地联调验收（Vera / Codex 执行，Electron 环境）

1. `electron .` 启动：窗口无系统边框，右上角出现 最小化/最大化/关闭 三个按钮；
2. 点击最小化 → 窗口最小化；最大化 → 圆角变直角、图标切换；还原 → 圆角恢复；
3. 关闭 → 最小化到托盘；托盘"退出" → 完全退出且后端进程被清理；
4. 后端在 8001（8000 被占）时：前端 API 自动指向 8001，数据正常加载。

---

# F-45（2026-08-17）：案件文件夹关联双模式（选已有 / 选父目录新建）+ Electron 原生目录选择器

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (73)`（本批在 (73) 基础上改）。
> 背景（Vera 拍板，主文档 §十三"无总根模式"）：**CLIENT_FILES_ROOT 不再是总根**，
> 每个 CASE 关联 Vera 手动选择的**任意绝对路径**文件夹。后端契约已更新：
> `POST /api/cases/{id}/folder` 请求体 `{ mode: "existing"|"create", path: 绝对路径, folder_name?: string }`。
> 本批做前端 UI 配套。

## 一、FolderPickerModal 双模式（src/components/folderPicker/FolderPickerModal.tsx）

现有"关联文件夹"弹窗改为两个明确 Tab/按钮：

1. **关联已有文件夹（existing）**：
   - Electron：调用 `window.veraElectron.chooseDirectory()`（原生目录选择器，返回绝对路径）
     → 选中后预览路径 → 提交 `{ mode: "existing", path }`；
   - Web 过渡：保留文件夹树浏览（`/api/folders/browse?path=` 现支持任意绝对目录，
     当前端有值传入浏览该目录）+ 手动输入路径；
2. **在父目录下新建（create）**：
   - Electron：`chooseDirectory()` 选**父目录** → 显示文件夹名输入框
     （预填"客户名_case_id"，可改）→ 提交 `{ mode: "create", path: 父目录, folder_name }`；
   - Web 过渡：同 browse/输入父目录 + 文件夹名；
3. 提交后沿用现有成功/错误处理（422 detail 显示）；关联成功后刷新案件列表/文件夹卡。

## 二、Electron 原生目录选择器接线

1. `src/types/` 的 `VeraElectronApi` 增加 `chooseDirectory: () => Promise<string | null>`；
2. preload（Electron 侧，Codex 已实现）暴露同名方法；前端仅调用，**浏览器预览时
   `window.veraElectron` 不存在 → 走 Web 过渡（browse/输入）**；
3. FolderPickerModal 判断 `window.veraElectron?.chooseDirectory` 存在则用原生选择器。

## 三、NewCaseSheet / CaseFolderCard 入口文案微调

- "自动创建"文案 → **"在父目录下新建"**（避免误解为系统随便建）；
- 一客多 CASE 说明：允许"关联已有文件夹"选择已关联的同一文件夹（共享）。

## 四、红线

1. 只改 FolderPickerModal / 入口文案 / types；不改后端；不新增依赖；
2. 浏览器预览零影响（Electron API 不存在时走 Web 过渡）；
3. 交付报告附改动说明。

## 五、验收（AI Studio 侧）

1. `npx tsc --noEmit` 零错误；构建通过；
2. 浏览器：FolderPickerModal 有"关联已有 / 在父目录下新建"两模式，Web 过渡可用；
3. `rg -n "chooseDirectory|mode.*create|folder_name" src`：调用与类型完整；
4. 提交请求体符合 `{mode, path, folder_name?}` 契约。

## 六、本地联调验收（Vera / Codex 执行，Electron）

1. 新建案件 → 关联文件夹：原生目录选择器打开，选已有文件夹 → 关联成功；
2. "在父目录下新建"：选父目录 + 确认文件夹名 → 系统创建标准子目录并关联；
3. 一客多 CASE：第二个案件选同一文件夹 → 关联成功（共享）；
4. 路径穿越/系统目录（选 C:\Windows）→ 后端 422 提示。

---


---

# F-45 补丁二（2026-08-17 终版）：进度条充满整行（不加粗）+ 右侧元素贴右 + truncate 修复

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (74)`（本批在 (74) 基础上改）。
> 背景（Vera 反馈，Electron 真机）：
> ① 进度条压缩靠左、未横跨整行；② 银行徽章/进度% 未固定右侧，跟着客户名/阶段跑；
> ③ 长客户名/长阶段与右侧元素贴合。根因：卡片内行容器宽度未显式撑满 + truncate
> 在 flex 子项缺 min-w-0 + 右侧元素依赖 justify-between（宽度塌缩时失效）。

## 一、进度条：不加粗、充满整行（高度保持 h-1.5）

1. `src/components/brain/CaseListSidebar.tsx` 6 节点阶段条容器：
   `<div className="flex items-center justify-between gap-0.5">` → **`flex items-center gap-0.5 w-full`**
   （去掉 justify-between，加 w-full；每个节点 `flex-1 w-full h-1.5` 保持——容器占满行宽后
   节点条即横跨整行）；
2. `src/components/cases/CaseCard.tsx` 清单进度条：外层 `<div className="space-y-1.5">`
   → **加 `w-full`**；进度条 `w-full h-1.5` 保持；
3. `src/components/cases/KanbanCard.tsx` 清单进度条：外层 `<div className="space-y-1">`
   → **加 `w-full`**；进度条 `w-full h-1.5` 保持。

## 二、右侧元素强制贴右（ml-auto，不依赖 justify-between）

1. `CaseListSidebar.tsx` 客户名 + 银行徽章行：
   容器 `flex items-center justify-between space-x-1` → **`flex items-center space-x-1 w-full`**；
   客户名 span → **`min-w-0 flex-1 truncate`**；银行徽章 span → **`ml-auto flex-shrink-0`**
   （保持原样式类）；
2. `CaseListSidebar.tsx` 节点条下方阶段/进度行：
   容器 `flex items-center justify-between ... pt-0.5` → **`flex items-center ... pt-0.5 w-full`**；
   阶段 span → **`min-w-0 flex-1 truncate`**；% span → **`ml-auto flex-shrink-0`**；
3. `CasePanorama.tsx` 右栏标题行（约 L186-190）：标题 span 加 `min-w-0 flex-1 truncate`，
   折叠按钮加 `ml-auto flex-shrink-0`；容器加 `w-full`；
4. `BrainChat.tsx` 中栏标题行（约 L673-675）：标题 span 加 `min-w-0 flex-1 truncate`，
   右侧元素加 `ml-auto flex-shrink-0`；容器加 `w-full`。

## 三、不动

- 非 flex 子项/独立行的 truncate（块级 p/h/独立 span，本身生效）：TaskCard 摘要、
  AuTimePanel 假期名、DraftsBox subject 等保持原样；
- 进度条高度 h-1.5 保持（**不加粗**）。

## 四、红线

1. 只改上述 class；不改结构/逻辑/文案/其他样式；不新增依赖；
2. 交付报告附改动说明。

## 五、验收（AI Studio 侧）

1. `npx tsc --noEmit` 零错误；
2. 进度条容器均含 `w-full`、高度仍 `h-1.5`；
3. 客户名/stage/标题 span 均含 `min-w-0 flex-1 truncate`，银行/%/按钮含 `ml-auto`；
4. CaseListSidebar 节点条容器无 `justify-between`。

## 六、本地联调验收（Vera / Codex 执行，Electron）

1. 进度条横跨整行、不靠左压缩、高度正常；
2. 长客户名省略、银行徽章恒在右侧；长阶段省略、% 恒在右侧；
3. 右栏/中栏标题超长省略、按钮不被挤压；六套主题正常。

---

# F-46（2026-08-17）：统计接口真机适配（后端 current/previous 结构，修复页面崩溃）

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (74)`（本批在 (74) 基础上改）。
> 背景（Electron 真机联调发现，页面打开即崩）：
> `GET /api/analytics/overview` 后端真实返回 **`{ granularity, current: {...}, previous: {...} }`**，
> 但前端按旧 mock 结构读 `overview.active_cases.value`——`active_cases` 为 undefined →
> `Cannot read properties of undefined (reading 'value')` → 首页/统计页/全局面板全崩。
> 根因：统计接口从未真机联调，mock 结构掩盖了契约断裂。本批按后端真实结构适配。
> **范围说明（Vera 拍板）**：交付为**空数据库**给试用方，本批只做"必要项"：
> ① 页面不崩（空库/无数据兜底 0）；② 读后端 current 结构（对方录入数据后统计可见）。
> **不做精美上期对比**：空库 previous 全 0，百分比无意义——prev>0 才显示百分比，
> 否则显示 0 或 "—"。改动保持最小，不做新 UI。

## 一、后端真实响应结构（契约，勿再偏离）

`GET /api/analytics/overview` 返回：

```json
{
  "granularity": "week",
  "current":  { "active_cases": 5, "new_cases": 1, "submitted": 2, "approved": 0, "settled": 0, "commission_estimate": 0.0, "tasks_done": 0 },
  "previous": { "active_cases": 0, "new_cases": 0, "submitted": 0, "approved": 0, "settled": 0, "commission_estimate": 0.0, "tasks_done": 0 }
}
```

（`pipeline` / `lenders` / `efficiency` / `usage` 端点返回结构不变，前端已按各自类型使用。）

## 二、types/api.ts：AnalyticsOverview 改为后端结构

```ts
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
```

删除不再使用的 `AnalyticsMetricItem`（或保留供他处使用——确认无引用后删）。

## 三、HomePage.tsx（首页 4 个 KPI 卡，L286-361）

现有 `analyticsOverview?.active_cases.value ?? cases.length` 等 → 改为 current 指标，变化率由
current/previous 计算：

```ts
const current = analyticsOverview?.current;
const previous = analyticsOverview?.previous;
const pct = (cur: number, prev: number) =>
  prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null;  // null → 渲染 "—"
```

- 活跃案件：`current?.active_cases ?? cases.length`，变化 `+{pct(current?.active_cases ?? 0, previous?.active_cases ?? 0)}%`；
- 本月新增：`current?.new_cases ?? 0`（无后端字段用 current.new_cases）；
- 已递交：`current?.submitted ?? 0`；
- 预估佣金：`${(current?.commission_estimate ?? 0).toLocaleString()}`；
- **删除** `?.active_cases.value` / `.change_pct` 等旧字段读取（保留 `??` 兜底防空）。
- **变化率渲染**：pct 返回 null 时显示 "—"（空库不显示百分比）；

## 四、Analytics.tsx（统计页 overview 卡，L97-107）

6 指标卡改为 current 值 + 与 previous 对比：

```ts
const cur = overview?.current;
const prev = overview?.previous;
const cards = [
  { label: '活跃案件', value: cur?.active_cases ?? 0, pct: pct(cur?.active_cases ?? 0, prev?.active_cases ?? 0) },
  { label: '新增案件', value: cur?.new_cases ?? 0, pct: pct(cur?.new_cases ?? 0, prev?.new_cases ?? 0) },
  { label: '递交审批', value: cur?.submitted ?? 0, pct: pct(cur?.submitted ?? 0, prev?.submitted ?? 0) },
  { label: '获得批复', value: cur?.approved ?? 0, pct: pct(cur?.approved ?? 0, prev?.approved ?? 0) },
  { label: '完成结算', value: cur?.settled ?? 0, pct: pct(cur?.settled ?? 0, prev?.settled ?? 0) },
  { label: '预计佣金', value: cur?.commission_estimate ?? 0, pct: pct(cur?.commission_estimate ?? 0, prev?.commission_estimate ?? 0), currency: true },
];
```

渲染 `cards.map`（替换原 `item.m.value.toLocaleString()` / `renderTrend(item.m.change_pct, ...)`）；
`compare_label` 不再存在（后端无该字段）→ 标题改 `业务总体概览 ({overview?.granularity})` 或直接"业务总体概览"。

## 五、GlobalStatsPanel.tsx（业务概览卡，L52-57）

`overviewCards` 改为：

```ts
const cur = overview?.current;
const overviewCards = cur ? [
  { key: 'active', label: '活跃案件', value: cur.active_cases },
  { key: 'new', label: '新增案件', value: cur.new_cases },
  { key: 'submitted', label: '递交案件', value: cur.submitted },
  { key: 'approved', label: '批准案件', value: cur.approved },
  { key: 'settled', label: '结算案件', value: cur.settled },
  { key: 'commission', label: '预期佣金', value: cur.commission_estimate, isCurrency: true },
] : [];
```

渲染处 `item.value`（替换 `item.item.value` 旧读法；无旧字段则保持当前渲染逻辑适配）。

## 六、services/api/analytics.ts：mock 同步为后端结构

`getOverview` 的 mock 返回值改为 `{ granularity, current: {...}, previous: {...} }`（字段照 §一），
保证 AI Studio 网页预览（mock 模式）也能正常渲染统计页。

## 七、红线

1. 只改上述 4 个文件（types/api.ts、HomePage.tsx、Analytics.tsx、GlobalStatsPanel.tsx、
   services/api/analytics.ts）；不改后端；不新增依赖；
2. 所有读取必须可选链 + 兜底（`?.` + `?? 0`），页面永不因空数据崩溃；
3. 交付报告附改动说明。

## 八、验收（AI Studio 侧）

1. `npx tsc --noEmit` 零错误；构建通过；
2. `rg -n "active_cases\.value|change_pct|compare_label|item\.m" src` → 无残留旧结构读取；
3. mock 预览：统计页 6 指标显示 current 值 + 对比 %，不报错。

## 九、本地联调验收（Vera / Codex 执行，Electron 真后端）

1. 打开首页：4 个 KPI 显示真实数据（活跃案件=5 等），不崩；
2. 打开统计页：6 指标 + 与上期对比正常；切天/周/月正常；
3. 全局咨询右栏（GlobalStatsPanel）：6 卡片正常；
4. 空库/无案件时不崩（全 0 或兜底值）。

---

# F-46 补丁（2026-08-17）：统计页 pipeline/efficiency 契约适配（overview 已修，补剩余接口）

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (75)`（本批在 (75) 基础上改）。
> 背景：F-46 只适配了 overview；真机复测发现统计页仍崩——**pipeline 与 efficiency 也是
> current/previous 结构**，前端仍按旧 mock 平铺读。补两处：

## 一、pipeline（后端 `{ granularity, series: [...] }`，前端误读 buckets）

后端真实返回：

```json
{ "granularity": "month", "series": [
  { "period": "2026-03", "new_cases": 0, "submitted": 0, "approved": 0, "settled": 0, "amount": 0.0, "commission": 0.0 }
] }
```

1. `src/pages/Analytics.tsx`（约 L150）：`pipeline.buckets.length === 0` / `pipeline.buckets.map`
   → **`pipeline.series.length === 0` / `pipeline.series.map`**（b 字段 new_cases/submitted/approved/
   settled/commission 与后端一致，其余渲染不变）；
2. `src/components/brain/GlobalStatsPanel.tsx`（约 L66）：`pipeline?.buckets || []`
   → **`pipeline?.series || []`**；
3. `src/types/api.ts`：`AnalyticsPipeline` 的 `buckets` 字段改 `series`（类型对齐后端）。

## 二、efficiency（后端 `{ granularity, current: {...}, previous: {...} }`，前端误读平铺）

后端真实返回：

```json
{ "granularity": "month",
  "current":  { "tasks_done": 0, "on_time_rate": 0.0, "checklist_confirm_rate": 0.0,
                "ai_adoption_count": 0, "avg_client_reply_days": null },
  "previous": { ...同字段... } }
```

`src/pages/Analytics.tsx`（约 L195-210，efficiency 卡）：

```ts
const ecur = efficiency?.current;
const eprev = efficiency?.previous;
const ePct = (c: number | null, p: number | null) =>
  (p ?? 0) > 0 && c != null ? Math.round(((c - (p ?? 0)) / (p ?? 0)) * 1000) / 10 : null;
const effCards = [
  { label: '处理任务总数', value: ecur?.tasks_done ?? 0, pct: ePct(ecur?.tasks_done ?? 0, eprev?.tasks_done ?? 0) },
  { label: '按时完成率', value: ecur?.on_time_rate ?? 0, unit: '%', pct: ePct(ecur?.on_time_rate ?? 0, eprev?.on_time_rate ?? 0) },
  { label: '清单确认率', value: ecur?.checklist_confirm_rate ?? 0, unit: '%', pct: ePct(ecur?.checklist_confirm_rate ?? 0, eprev?.checklist_confirm_rate ?? 0) },
  { label: 'AI 深度采纳', value: ecur?.ai_adoption_count ?? 0, pct: ePct(ecur?.ai_adoption_count ?? 0, eprev?.ai_adoption_count ?? 0) },
  { label: '客户平均回复', value: ecur?.avg_client_reply_days, unit: '天', pct: null },
];
```

渲染 `effCards.map`（替换原 `item.m.current/change_pct/previous/unit` 读取；value 为 null 显示 "—"）。
`src/types/api.ts`：`AnalyticsEfficiency` 改为 `{ granularity, current: AnalyticsEfficiencyMetrics,
previous: AnalyticsEfficiencyMetrics }`，指标字段对齐后端
（tasks_done / on_time_rate / checklist_confirm_rate / ai_adoption_count / avg_client_reply_days）。

## 三、无需改

- **usage**：AiUsageBar 已用 `usage?.current / previous` ✓；
- **lenders**：后端 `{ lenders: [] }` 与前端 `lenders.lenders` 匹配 ✓；
- **overview**：F-46 已适配 ✓。

## 四、红线

1. 只改 Analytics.tsx / GlobalStatsPanel.tsx / types/api.ts；不改后端；不新增依赖；
2. 所有读取 `?.` + `?? 0` 兜底；value null 显示 "—"。

## 五、验收（AI Studio 侧）

1. `npx tsc --noEmit` 零错误；
2. `rg -n "pipeline\.buckets|efficiency\.[a-z_]+\.|item\.m" src/pages/Analytics.tsx` → 无残留；
3. mock 预览统计页正常（pipeline 表 + efficiency 卡显示 0/—）。

## 六、本地联调验收（Vera / Codex 执行，Electron 真后端空库）

1. 统计页整页打开不崩：overview 6 卡 / pipeline 表（空态"暂无数据"）/ efficiency 5 卡 / lenders（空态）；
2. 首页 4 KPI 正常；全局右栏正常；切天/周/月不崩。

---


---

# F-46 补丁二（2026-08-17）：快捷提问精简为短语 + 移到中栏常驻（两模式可见）

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (76)`（本批在 (76) 基础上改）。
> 背景（Vera 反馈）：
> ① 快捷提问 chips **只在"全局咨询模式"（无案件）显示**——案件模式下中栏完全看不到；
> ② QUICK_ASKS 混入了 4 个工具类（计算器/文件夹/建案/邮件），这些已在"⚡ 工具"菜单/顶部按钮，
>    快捷提问应只留**短语**（问句类）；③ "⚡ 工具"菜单里还重复了一份"快捷提问"分区。
> **目标：快捷提问 = 4 个短语 chips，常驻中栏输入区上方（案件/全局模式都显示）；
> 工具菜单只保留"工具动作"。**

## 一、QUICK_ASKS 拆两组（src/components/brain/BrainChat.tsx 顶部）

**中栏（案件模式）——保持一行、只留 4 条：**

```ts
const CASE_QUICK_ASKS: QuickAsk[] = [
  { label: '这个案件缺什么材料？', action: 'ask' },
  { label: '检查申报一致性', action: 'ask' },
  { label: '当前案件下一步做什么？', action: 'ask' },
  { label: '查一下银行政策', action: 'ask' },   // 发送时动态替换为 activeCaseInfo.lender
];
```

**全局咨询（无案件）——含周报：**

```ts
const GLOBAL_QUICK_ASKS: QuickAsk[] = [
  { label: '今天有哪些到期/逾期？', action: 'ask' },
  { label: '查一下 CBA 的政策', action: 'ask' },
  { label: '有多少案件在审贷中？', action: 'ask' },
  { label: '生成这周周报', action: 'ask' },       // 发送：'生成这周的周报，总结都推进了哪些案件'
  { label: '最近业务怎么样？', action: 'ask' },
];
```

（`QuickAsk` 类型 action 收窄为 `'ask'`；`handleQuickAsk` 中 new_case/compose_email/calculator
分支删除；中栏"查一下银行政策"发送时用 `handleSend(\`查一下 ${activeCaseInfo?.lender} 的政策\`)`。）

**渲染时按场景选组**：`const quickAsks = caseId ? CASE_QUICK_ASKS : GLOBAL_QUICK_ASKS;`

## 二、chips 从"全局咨询空态"移到输入区上方常驻

1. **删除**：全局咨询空态分支（caseId 为空时的欢迎区）里的"快捷提问 chips 区"整块
   （约 L816-845：Lightbulb 标题 + QUICK_ASKS.map 渲染）；
2. **新增**：在输入区容器 `<div className="p-3 border-t flex items-center space-x-2 flex-shrink-0 ...">`
   （约 L1189）**之前**插入常驻快捷短语行，**带场景引导标签**：

```jsx
{/* 快捷提问（按场景选组 + 引导标签，常驻） */}
<div className="px-3 pb-1 flex items-center gap-1.5 flex-wrap flex-shrink-0"
     style={{ backgroundColor: 'var(--bg-panel)' }}>
  <span className="text-[10px] font-bold text-muted flex-shrink-0">
    {caseId ? '案件快捷提问' : '全局快捷提问'}
  </span>
  {quickAsks.map((item, idx) => (
    <button
      key={idx}
      type="button"
      onClick={() => {
        if (item.label === '查一下银行政策' && activeCaseInfo?.lender) {
          handleSend(`查一下 ${activeCaseInfo.lender} 的政策`);
        } else if (item.label === '生成这周周报') {
          handleSend('生成这周的周报，总结都推进了哪些案件');
        } else {
          handleQuickAsk(item);
        }
      }}
      id={`quick-ask-chip-${idx}`}
      className="px-2.5 py-1 rounded-full border text-[11px] font-medium cursor-pointer transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--bg-card-hover)]"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
    >
      {item.label}
    </button>
  ))}
</div>
```

（案件模式显示 CASE 组 4 条（一行放得下）；全局模式显示 GLOBAL 组 5 条含周报——
统一放输入区上方、消息列表下方，两模式都常驻。）

## 三、删除工具菜单内重复"快捷提问"分区

删除工具弹出菜单内 `{/* Quick Questions Section */}` 整块（含 `border-t pt-1` 容器、
"快捷提问"标题、4 个按钮：tool-opt-gap / tool-opt-decl / tool-opt-overdue / tool-opt-policy）。
工具菜单只保留"工具动作"（计算器/写邮件/建案/文件夹）。

## 四、清理 unused import（tsc 门禁）

删除后若 `Search / FileCheck / Clock` 图标在文件内无其他引用，从 lucide-react import 中移除
（逐一确认；QUICK_ASKS chips 只用文本 label，不用图标）。

## 五、红线

1. 只改 BrainChat.tsx 的 QUICK_ASKS / chips 位置 / 工具菜单 / unused import；不改其他组件；
   不新增依赖；
2. 工具动作菜单、消息列表、输入区行为不变；motion/reduced 分支保持。

## 六、验收（AI Studio 侧）

1. `npx tsc --noEmit` 零错误；构建通过；
2. `rg -n "tool-opt-gap|tool-opt-decl|tool-opt-overdue|tool-opt-policy" src` → 无残留；
3. `rg -n "CASE_QUICK_ASKS|GLOBAL_QUICK_ASKS" src/components/brain/BrainChat.tsx` → 两组齐全；
4. 快捷 chips 在案件模式（4 条一行）与全局模式（5 条含周报）都渲染，带场景标签。

## 七、本地联调验收（Vera / Codex 执行，Electron）

1. 中栏（选案件）：输入区上方一行 4 条（缺口/申报/下一步/银行政策），标签"案件快捷提问"，
   银行政策点击发送"查一下 {银行} 的政策"；
2. 全局咨询（无案件）：标签"全局快捷提问"，5 条含"生成这周周报"（点击发送周报总结语）；
3. "⚡ 工具"菜单：只剩计算器/写邮件/建案/文件夹 4 项，无"快捷提问"；
4. 全局欢迎区不再有重复 chips；无报错、无回归。

---

# F-46 补丁三（2026-08-17）：右栏客户情况概览空数据占位（Client Banner 常显）

> 前端目录：`C:\Users\Yaruo\Downloads\vera-工作台 (76)`（本批在 (76) 基础上改）。
> 背景（Vera 反馈）：右栏"客户情况概览"（Client Banner：客户名/银行/阶段/摘要）目前是
> `{context && ...}` 条件渲染——空库/无 context 数据时整块消失，右栏直接露出"关键截止"。
> **目标：客户情况概览始终显示；无 context 时用当前案件基本信息 + 占位文案。**

## 一、接入当前案件信息（src/components/brain/CasePanorama.tsx）

1. 引入 caseStore 取当前案件：

```ts
import { useCaseStore } from '../../stores/caseStore';
// 组件内
const caseInfo = useCaseStore((s) =>
  caseId ? s.cases.find((c) => c.caseId === caseId) : undefined
);
```

2. **Client Banner 改为始终渲染**（L238 起 `{context && (...)}` → 无条件渲染，内容分两态）：

```jsx
{/* 1. Client Banner（客户情况概览，常显） */}
<div className="p-3 rounded-xl border space-y-1.5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
  <div className="flex items-center justify-between">
    <span className="font-extrabold text-xs truncate" style={{ color: 'var(--text-primary)' }}>
      {context?.facts.client_name || caseInfo?.clientName || '客户'}
      {context?.facts.lender || caseInfo?.lender ? ` (${context?.facts.lender || caseInfo?.lender})` : ''}
    </span>
    <span className="px-2 py-0.5 rounded text-xs font-bold bg-[var(--purple-soft)] text-[var(--purple)] flex-shrink-0">
      {context?.facts.stage || caseInfo?.stage || '推进中'}
    </span>
  </div>
  {context?.summary || context?.memory ? (
    <p className="text-[11px] leading-relaxed text-muted truncate pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
      ✨ {context.summary || context.memory}
    </p>
  ) : (
    <p className="text-[11px] leading-relaxed text-muted pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
      暂无客户画像，录入资料后自动生成
    </p>
  )}
</div>
```

（`caseInfo` 取不到时显示"客户"，银行/阶段取不到用占位——空库也完整显示区块。）

## 二、红线

1. 只改 CasePanorama.tsx（import + Client Banner）；不改其他区块/组件；不新增依赖；
2. 有 context 时显示效果与原来一致；空数据只多占位，不报错。

## 三、验收（AI Studio 侧）

1. `npx tsc --noEmit` 零错误；
2. Client Banner 无 `context &&` 条件（始终渲染），含 caseInfo 兜底与"暂无客户画像"占位文案；
3. mock 预览：选择案件后右栏顶部始终有客户情况概览（有数据显数据，无数据显占位）。

## 四、本地联调验收（Vera / Codex 执行，Electron 空库）

1. 空库选案件：右栏顶部显示客户名/银行/阶段（来自案件）+ "暂无客户画像，录入资料后自动生成"；
2. 录入数据后：显示 context 摘要；不崩、无回归。


