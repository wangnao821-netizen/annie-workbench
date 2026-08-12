# CASE 大脑 — 前端改造批次提示词（AI Studio 执行）

> 状态：**F-1 已交付**（ui/vera-工作台 (24)，2026-08-12）；F-2~F-4 待 F-1 真机运行验收后按实际代码结构撰写。
> 工作流：Codex 出提示词 → Vera 粘贴到 Google AI Studio → AI Studio 改前端 → 文件夹放回 `D:\vera-workbench\ui\` → Codex 核对。
> 约定：前端代码以 Google AI Studio 为准；Codex 不直接改前端，只出提示词与验收。

---

## 批次计划

| 批次 | 内容 | 状态 |
|------|------|------|
| F-1 | 三栏骨架：左栏案件列表 + 中栏 BrainChat + 右栏客户全景，AI 从悬浮球变主角 | ✅ 已交付（vera-工作台 (24)），待真机运行验收 |
| F-2 | 中栏实化：确认记录交互（低置信确认卡 + "已记录 N 条 [查看]" + 逐条撤销） | 已出（下文） |
| F-2b | 中栏：草稿卡 + 递交模式横幅（依赖后端对话协议 WO-16） | 待出 |
| F-3 | 右栏实化：事实卡（BrainFact）/补全进度/待办（依赖 WO-15） | 待出 |
| F-4 | Apple 风格动画与材质打磨 + 次级入口收尾 | 待出 |

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
