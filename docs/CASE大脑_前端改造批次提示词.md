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
