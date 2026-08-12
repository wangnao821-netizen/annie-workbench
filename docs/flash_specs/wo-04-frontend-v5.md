# 施工单 04：V5 前端工作台（完整重写版）

> 执行者：Google AI Studio（分步喂食）  
> 依赖：WO-03 API 路由就绪（mock 数据先行）  
> 参考：`docs/task_workbench_design.md`（规划方案 V5）+ `docs/task_workbench_v5_prototype.html`（交互原型）  
> 预估：8 个 Prompt，逐步验证

---

## 设计哲学

本项目前端遵循 **Apple Design** 原则：
- **Response**：按下即反馈（pointer-down 高亮，不等 click）
- **Interruptibility**：所有动画可中断（使用 spring，不用 CSS transition）
- **Spatial consistency**：进出路径一致
- **Materials & depth**：毛玻璃/半透明层级表达深度
- **Craft**：每一个间距、圆角、阴影都是刻意选择
- **Typography**：大标题负 tracking，正文宽松 line-height
- **Reduced motion**：`prefers-reduced-motion` 降级为 opacity 渐变

同时支持 **多皮肤主题切换**（深色/浅色/紫金/海洋蓝/暖沙 5 套）。

**⚠️ 执行者注意**：HTML 原型 `docs/task_workbench_v5_prototype.html` 是交互权威参考。每个 Prompt 完成后，对照原型检查交互是否一致。

---

## Prompt 1：项目初始化 + 主题系统

```markdown
# 任务

在 `d:\vera-workbench\frontend\` 初始化一个 React + TypeScript + Vite + Tailwind CSS 项目。

## 要求

1. 使用 `npx create-vite@latest ./ --template react-ts`
2. 安装依赖：tailwindcss, postcss, autoprefixer, framer-motion (用于 spring 动画), zustand, lucide-react
3. 初始化 Tailwind 配置
4. `package.json` 中 version 设为 "2.0.0"
5. 创建多皮肤主题系统
6. 不使用任何 UI 组件库（antd/MUI 等）

## 主题系统设计

创建 `src/themes/` 目录，实现 CSS 变量驱动的主题切换：

### 文件结构
```
src/themes/
├── index.ts          # 主题注册表 + 切换逻辑
├── tokens.css        # CSS 变量定义（所有主题的 token）
├── dark.ts           # 深空黑主题
├── light.ts          # 极光白主题  
├── royal.ts          # 紫金主题
├── ocean.ts          # 海洋蓝主题
└── sand.ts           # 暖沙主题
```

### CSS 变量 Token 命名规范

```css
:root[data-theme="dark"] {
  /* 表面层级 */
  --bg-app: #0f1117;              /* 最底层背景 */
  --bg-panel: #161922;            /* 侧栏/顶栏 */
  --bg-card: #1c1f2e;             /* 卡片/面板 */
  --bg-card-hover: #232740;       /* 卡片悬浮 */
  --bg-input: #1a1d2b;            /* 输入框 */
  --surface-translucent: rgba(22, 25, 34, 0.8); /* 毛玻璃 */
  
  /* 边框 */
  --border: #2a2e3f;
  --border-active: #4f6ef7;
  
  /* 文字 */
  --text-primary: #e8eaf0;
  --text-secondary: #8b8fa4;
  --text-muted: #5c6078;
  
  /* 交互色 */
  --accent: #4f6ef7;
  --accent-soft: rgba(79, 110, 247, 0.12);
  
  /* 语义色 */
  --green: #34d399;
  --green-soft: rgba(52, 211, 153, 0.12);
  --yellow: #fbbf24;
  --yellow-soft: rgba(251, 191, 36, 0.12);
  --red: #f87171;
  --red-soft: rgba(248, 113, 113, 0.12);
  --orange: #fb923c;
  --orange-soft: rgba(251, 146, 60, 0.12);
  --purple: #a78bfa;
  --purple-soft: rgba(167, 139, 250, 0.12);
  
  /* 圆角 */
  --radius: 10px;
  --radius-sm: 6px;
  
  /* 阴影 */
  --shadow-card: 0 2px 12px rgba(0,0,0,0.3);
  --shadow-overlay: 0 8px 32px rgba(0,0,0,0.5);
  
  /* 动画 */
  --transition: 0.2s ease;
}
```

每个主题只需要覆盖这些变量值。变量命名必须与上方完全一致。

### `src/themes/index.ts`

```typescript
export type ThemeId = "dark" | "light" | "royal" | "ocean" | "sand";

export interface ThemeConfig {
  id: ThemeId;
  name: string;        // 中文显示名
  preview: string;     // 预览色（hex）
}

export const THEMES: ThemeConfig[] = [
  { id: "dark", name: "深空黑", preview: "#0f1117" },
  { id: "light", name: "极光白", preview: "#f8f9fc" },
  { id: "royal", name: "紫金", preview: "#1a0a2e" },
  { id: "ocean", name: "海洋蓝", preview: "#0a1628" },
  { id: "sand", name: "暖沙", preview: "#1c1812" },
];

export function applyTheme(themeId: ThemeId): void {
  document.documentElement.setAttribute("data-theme", themeId);
  localStorage.setItem("vera-theme", themeId);
}

export function getInitialTheme(): ThemeId {
  return (localStorage.getItem("vera-theme") as ThemeId) || "dark";
}
```

### `src/stores/themeStore.ts`

```typescript
import { create } from 'zustand';
import { ThemeId, applyTheme, getInitialTheme } from '../themes';

interface ThemeState {
  current: ThemeId;
  setTheme: (id: ThemeId) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  current: getInitialTheme(),
  setTheme: (id) => {
    applyTheme(id);
    set({ current: id });
  },
}));
```

### 5 套主题的完整色板

#### dark（深空黑 — 默认）
- bg-app: #0f1117, bg-panel: #161922, bg-card: #1c1f2e, accent: #4f6ef7

#### light（极光白）
- bg-app: #f8f9fc, bg-panel: #ffffff, bg-card: #f0f1f5, accent: #4f46e5
- text-primary: #1a1a2e, text-secondary: #64748b, text-muted: #94a3b8, border: #e2e4ea

#### royal（紫金）
- bg-app: #1a0a2e, bg-panel: #241440, bg-card: #2e1a50, accent: #d4af37
- text-primary: #f0e8ff, green: #4ade80

#### ocean（海洋蓝）
- bg-app: #0a1628, bg-panel: #0f1f3a, bg-card: #152a4a, accent: #38bdf8
- text-primary: #e2e8f0

#### sand（暖沙）
- bg-app: #1c1812, bg-panel: #2a251c, bg-card: #342e22, accent: #d97706
- text-primary: #fef3c7

## 验收

- `npm run dev` 启动成功
- 浏览器打开 → 可以看到主题变量生效
- 控制台 `applyTheme("ocean")` → 页面配色切换
- 所有 5 个主题的 CSS 变量已定义
- 不使用任何 UI 组件库（antd/MUI 等）
- themeStore 可用
- `npx tsc --noEmit` 零错误
```

---

## Prompt 2：布局骨架 + 路由（对齐原型结构）

```markdown
# 任务

实现 V5 工作台的布局骨架 + 页面路由。

## ⚠️ 布局结构（必须对齐原型 HTML）

原型的布局是 **sidebar + main**，main 内部分为 **task-list + detail-panel** 两栏。
不是四栏。不要发明新的布局。

```
┌──────────────────────────────────────────────────────────┐
│ app-shell (flex, height: 100vh)                          │
├────────┬─────────────────────────────────────────────────┤
│        │ main-content (flex: 1, flex-direction: column)  │
│ Sidebar│ ┌──────────────────────────────────────────────┐│
│ 60px宽 │ │ KPI Bar (pill 标签行, flex-shrink: 0)        ││
│ 图标   │ ├──────────────────────────────────────────────┤│
│ + logo │ │ Filter Bar (标签筛选行, flex-shrink: 0)      ││
│ + badge│ ├─────────────┬────────────────────────────────┤│
│        │ │ TaskList    │ DetailPanel                    ││
│        │ │ 380px 宽    │ flex: 1                        ││
│        │ │ 可滚动      │ ┌ ContextBar (案件上下文) ─────┤│
│        │ │             │ ├ TaskDetailArea (可滚动) ─────┤│
│        │ │             │ ├ AIChatPanel (底部输入) ──────┤│
│        │ │             │ └──────────────────────────────┤│
│        │ └─────────────┴────────────────────────────────┘│
├────────┴─────────────────────────────────────────────────┤
│ FloatingAI (右下角浮动按钮, fixed, z-index: 1000)        │
└──────────────────────────────────────────────────────────┘
```

## 文件拆分（每个 ≤ 200 行）

- `src/components/layout/AppShell.tsx` — 整体壳（sidebar + main-content）
- `src/components/layout/Sidebar.tsx` — 左侧图标导航（60px 宽）
- `src/components/layout/KpiBar.tsx` — 顶部 KPI 摘要条（pill 标签）
- `src/components/layout/FilterBar.tsx` — 筛选标签行
- `src/pages/TaskWorkbench.tsx` — 任务工作台（TaskList + DetailPanel 双栏）
- `src/pages/CaseBoard.tsx` — 案件看板（空壳）
- `src/pages/KnowledgeCenter.tsx` — 知识中心（空壳）
- `src/pages/Settings.tsx` — 设置（空壳）
- `src/App.tsx` — 路由注册

## Sidebar 设计（对齐原型）

```typescript
const tabs = [
  { id: "tasks", icon: "CheckSquare", label: "任务工作台", badge: 8 },
  { id: "cases", icon: "Briefcase", label: "案件看板" },
  { id: "knowledge", icon: "Brain", label: "知识中心" },
  { id: "settings", icon: "Settings", label: "更多" },
];
```

- 顶部有 Logo 圆角方块（渐变紫蓝，字母 "V"）
- 每个 item 44×44px，图标居中
- hover 显示 tooltip（在右侧浮出）
- active 状态：背景 `accent-soft` + 颜色 `accent`
- badge 数字用红色小圆点（绝对定位右上角）

## KPI Bar 设计（对齐原型）

```
📊 28 活跃 | 💰 $3,200万 贷款额 | 🔥 3 紧急 | ⏳ 5 OS | 📧 12 新邮件 | [➕ 新建]
```

- 每个 KPI 是一个 pill 胶囊（`bg-card` 背景 + 圆角 20px）
- 紧急项有红色边框 `border: 1px solid rgba(248,113,113,0.3)`
- 右侧 [➕ 新建] 按钮用 `accent` 背景

## Filter Bar 设计（对齐原型，6 个标签）

```typescript
const filters = [
  { id: "all", label: "全部", count: 8 },
  { id: "email", label: "📧 邮件", count: 3 },
  { id: "file", label: "📎 文件", count: 2 },
  { id: "os", label: "🏦 OS", count: 1 },
  { id: "brandon", label: "👔 待老板", count: 1 },
  { id: "overdue", label: "⏰ 超期", count: 1 },
];
```

- 选中态：`accent-soft` 背景 + `accent` 文字 + subtle 边框
- count 数字用小灰色 pill

## Apple Design 细节

- KpiBar：不需要毛玻璃，用 `bg-panel` 实底背景 + 底部 border
- Sidebar：`bg-panel` + 右侧 border
- 所有间距使用 CSS 变量
- 颜色全部使用 CSS 变量（不硬编码）
- 按下按钮即缩放反馈：`active:scale-[0.97]` + `transition: transform 100ms`
- 悬浮时使用 subtle 背景

## 验收

- 布局正确渲染（sidebar + kpi + filter + task-list + detail 双栏）
- sidebar 点击 tab → MainContent 切换到对应页面
- sidebar 有 active 状态、badge、tooltip
- KPI pill 标签正确显示
- Filter 标签可点击切换（active 有样式变化）
- 切换主题 → 所有区域颜色跟随变化
- 所有按钮 pointer-down 有缩放反馈
- `npx tsc --noEmit` 零错误
```

---

## Prompt 3：任务队列 + 8 种任务卡 + Store

```markdown
# 任务

实现任务队列（任务工作台左栏）+ 8 种任务卡类型 + 数据 store。

## ⚠️ 必须对齐原型 HTML 的 8 种任务卡

原型展示了 8 种不同的任务卡场景。你必须全部实现。

## 文件拆分

- `src/components/tasks/TaskList.tsx` — 列表容器（可滚动，380px 宽）
- `src/components/tasks/TaskCard.tsx` — 单个任务卡（根据 type 渲染不同内容）
- `src/components/tasks/EmptyState.tsx` — 空状态
- `src/types/index.ts` — 所有 TypeScript 类型
- `src/stores/taskStore.ts` — 任务状态管理
- `src/services/apiClient.ts` — HTTP 请求封装（先 mock）
- `src/data/mockTasks.ts` — mock 数据（8 条，覆盖所有类型）

## 数据类型

### `src/types/index.ts`

```typescript
export type TaskType =
  | "EMAIL_DISPATCH"       // 邮件派单（已匹配，需分流）
  | "FILE_MATCH"           // 文件匹配清单（新文件到达）
  | "OS_ATTACK"            // OS 攻坚（银行 Outstanding 条件）
  | "BOSS_DECISION"        // 待老板拍板
  | "NEW_CLIENT"           // 新客户邮件（未匹配已有案件）
  | "OVERDUE_REMINDER"     // 催件超期提醒
  | "SETTLEMENT"           // 结算确认（案件已批准）
  | "GENERAL_EMAIL";       // 普通已匹配邮件

export type FilterId = "all" | "email" | "file" | "os" | "brandon" | "overdue";

// 筛选映射：filter → 匹配哪些 TaskType
// email → EMAIL_DISPATCH, NEW_CLIENT, GENERAL_EMAIL
// file → FILE_MATCH, SETTLEMENT
// os → OS_ATTACK
// brandon → BOSS_DECISION
// overdue → OVERDUE_REMINDER

export type TaskPriority = "urgent" | "high" | "normal" | "low";

export interface TaskItem {
  id: number;
  type: TaskType;
  title: string;
  subtitle: string;
  aiSummary?: string;           // AI 摘要（显示在卡片上）
  caseName?: string;            // 客户名
  caseId?: string;
  caseBank?: string;            // 银行
  loanAmount?: number;
  priority: TaskPriority;
  tags: TaskTag[];              // 标签列表
  quickActions: QuickAction[];  // 卡片上直接显示的快捷按钮
  filterCategory: FilterId;     // 用于筛选分类
  createdAt: string;            // 显示时间
  completed?: boolean;
}

export interface TaskTag {
  label: string;     // "🔥 紧急" | "✨ 新" | "⏳ 等待中" | "超期 7 天" | "🎉 获批"
  color: "red" | "accent" | "yellow" | "green" | "orange";
}

export interface QuickAction {
  label: string;     // "⚡ 进入 OS 攻坚" | "📋 复制微信话术"
  primary?: boolean; // 主操作用 accent 背景
  action: string;    // 动作标识符
}
```

## 8 条 mock 数据（必须对齐原型 HTML）

### 1. EMAIL_DISPATCH — 已匹配邮件需派单
```
title: "NAB Assessment Team"
subtitle: "Conditional Approval — Chen Wei"
aiSummary: "AI 摘要：NAB 有条件批准，附带 3 项 OS 条件"
tags: [{label: "🔥 紧急", color: "red"}]
meta: "匹配: Chen Wei (NAB, $85万) 92%"
quickActions: []  // 快捷操作在详情面板，不在卡片上
createdAt: "3 分钟前"
```

### 2. FILE_MATCH — 文件匹配清单
```
title: "收到 3 个新文件，自动匹配清单"
subtitle: "Chloe Lin · CBA · 清单 7/10 → 9/10 (+2)"
tags: [{label: "✨ 新", color: "accent"}]
meta: "本次自动匹配 2 项"
quickActions: []
createdAt: "15 分钟前"
```

### 3. OS_ATTACK — OS 攻坚
```
title: "银行 OS · Wang Li · ANZ"
subtitle: "3 项条件待回复 · 2 项可用现有文件满足"
tags: [{label: "🔥 紧急", color: "red"}]
meta: "Finance Due: 3 天"
quickActions: [{label: "⚡ 进入 OS 攻坚", primary: true}, {label: "⏭ 稍后"}]
createdAt: "1 小时前"
```

### 4. BOSS_DECISION — 待老板拍板
```
title: "待老板拍板 · Zhang Fang"
subtitle: "ANZ 拒了要不要换 CBA？等待 3 天"
tags: [{label: "⏳ 等待中", color: "yellow"}]
meta: "⚠️ 建议今日跟进"
quickActions: [{label: "📋 复制微信话术"}, {label: "✅ 记录老板回复"}]
createdAt: "3 天前升级"
```

### 5. NEW_CLIENT — 新客户邮件
```
title: "新客户邮件（未匹配已有案件）"
subtitle: "From: tom.xu@gmail.com · Loan enquiry"
tags: [{label: "✨ 新客户", color: "accent"}]
meta: "AI 提取: Tom Xu · 投资房 · $95万"
quickActions: [{label: "🆕 建案并归入", primary: true}, {label: "🔗 关联已有"}, {label: "🔇 忽略"}]
createdAt: "28 分钟前"
```

### 6. OVERDUE_REMINDER — 催件超期
```
title: "催件提醒 · Li Ming · Westpac"
subtitle: "银行流水(3个月) 催件已发 7 天无回应"
tags: [{label: "超期 7 天", color: "red"}]
meta: "清单 5/8 · Finance Due: 12 天"
quickActions: []
createdAt: "系统自动生成"
```

### 7. SETTLEMENT — 结算确认
```
title: "案件已批准 · Sarah Park · CBA"
subtitle: "预计结算日: 2026-09-15 · 佣金 $5,525"
tags: [{label: "🎉 获批", color: "green"}]
meta: "建议准备结算"
quickActions: [{label: "📋 结算前自查"}, {label: "📧 通知客户"}]
createdAt: "今天 9:30"
```

### 8. GENERAL_EMAIL — 普通已匹配邮件
```
title: "CBA Servicing Team"
subtitle: "RE: Additional docs — Chloe Lin"
tags: []
meta: "匹配: Chloe Lin (CBA, $120万) 95%"
quickActions: []
createdAt: "45 分钟前"
```

## TaskCard 设计（对齐原型 CSS）

```
┌──────────────────────────────────────────┐
│ [类型图标] 标题                            │
│           副标题                           │
│ AI 摘要（如有）                             │
│ [标签] [标签]    meta 信息                  │
│ [快捷按钮1] [快捷按钮2] ...（如有）         │
│ 时间                                       │
└──────────────────────────────────────────┘
```

### 类型图标颜色映射
```typescript
const typeIconConfig: Record<TaskType, { icon: string; bgClass: string }> = {
  EMAIL_DISPATCH:  { icon: "📧", bg: "accent-soft / accent" },
  FILE_MATCH:      { icon: "📎", bg: "green-soft / green" },
  OS_ATTACK:       { icon: "🏦", bg: "orange-soft / orange" },
  BOSS_DECISION:   { icon: "👔", bg: "purple-soft / purple" },
  NEW_CLIENT:      { icon: "📧", bg: "accent-soft / accent" },
  OVERDUE_REMINDER:{ icon: "⏰", bg: "red-soft / red" },
  SETTLEMENT:      { icon: "🎉", bg: "green-soft / green" },
  GENERAL_EMAIL:   { icon: "📧", bg: "accent-soft / accent" },
};
```

### 列表结构
- "待处理" section label（大写灰色小标题）
- 8 个 task card
- "✅ 已完成 (3)" section label
- 1 个已完成卡片（opacity: 0.5，标题 line-through）

## Store

### `src/stores/taskStore.ts`

```typescript
import { create } from 'zustand';
import { TaskItem, FilterId } from '../types';

interface TaskState {
  tasks: TaskItem[];
  selectedTaskId: number | null;
  filter: FilterId;
  setFilter: (f: FilterId) => void;
  selectTask: (id: number | null) => void;
  completeTask: (id: number) => void;
  setTasks: (tasks: TaskItem[]) => void;
}
```

### 筛选逻辑

filter 变化时，TaskList 按 `filterCategory` 过滤显示：
- `all` → 显示全部
- `email` → filterCategory === "email"
- 依此类推

### `src/services/apiClient.ts`（先 mock）

```typescript
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function fetchTasks(): Promise<TaskItem[]> {
  // TODO(WO-03): 真实 API 就绪后替换为 fetch(`${BASE_URL}/api/tasks/queue`)
  return MOCK_TASKS;
}
```

## 动画规格（Apple spring）

- 入场：stagger 50ms，spring `damping: 1.0, duration: 0.4`
- 选中态：border-color 变为 `accent` + 背景变深
- hover：border-color 变为 `border-active`，微升 translateY(-1px)
- 完成：向右滑出 + opacity → 0（spring）
- `prefers-reduced-motion` → 无动画，直接渲染

## 验收

- 8 种任务卡正确渲染（对照原型检查每种卡片的内容结构）
- 筛选标签切换 → 列表正确过滤
- 点击任务卡 → selectedTaskId 变化 + 卡片 selected 样式
- stagger 入场动画流畅
- 空状态优雅
- 全部颜色跟随主题变量
- `npx tsc --noEmit` 零错误
```

---

## Prompt 4：详情面板 — 邮件派单 + 新客户建案

```markdown
# 任务

实现右侧详情面板的前 3 种场景：邮件派单 (EMAIL_DISPATCH)、新客户建案 (NEW_CLIENT)、普通邮件 (GENERAL_EMAIL)。

## ⚠️ 必须对齐原型 HTML 的 taskDetails[1]、taskDetails[5]、taskDetails[8]

## 文件拆分

- `src/components/panel/DetailPanel.tsx` — 详情面板容器（ContextBar + DetailArea + AIChatPanel）
- `src/components/panel/ContextBar.tsx` — 案件上下文条（L0/L1/L2 三层展开）
- `src/components/panel/EmptyDetail.tsx` — 未选中状态
- `src/components/panel/details/EmailDispatchDetail.tsx` — 邮件派单详情
- `src/components/panel/details/NewClientDetail.tsx` — 新客户建案详情
- `src/components/panel/details/GeneralEmailDetail.tsx` — 普通邮件详情
- `src/components/panel/AIChatInput.tsx` — 底部 AI 输入框
- `src/stores/caseStore.ts` — 案件上下文状态

## DetailPanel 结构

```
┌─────────────────────────────────────┐
│ ContextBar (案件上下文, 仅有案件时显示) │
├─────────────────────────────────────┤
│ TaskDetailArea (flex:1, 可滚动)       │
│   根据 task.type 渲染不同的详情组件    │
├─────────────────────────────────────┤
│ AIChatInput (仅有案件时显示)           │
│ 🧠 已注入上下文: Chen Wei · NAB      │
└─────────────────────────────────────┘
```

未选中任务时显示 EmptyDetail：大图标 + "选择一个任务卡查看详情"

## ContextBar 三层渐进设计（对齐原型 HTML）

```
L0（折叠态，默认）— 单行：
┌─────────────────────────────────────────────┐
│ [客户名 bold] [银行 pill] [阶段 pill]  摘要  ▼ │
└─────────────────────────────────────────────┘

L1（点击展开）— 增加 4 格事实卡 + 操作按钮：
┌─────────────────────────────────────────────┐
│ [客户名] [银行] [阶段] [摘要] ▲               │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
│ │贷款额 │ │ LVR  │ │清单  │ │Finance│       │
│ │$850K │ │ 80%  │ │8/12  │ │Due   │        │
│ │      │ │ 黄色 │ │进度条│ │8 天  │         │
│ └──────┘ └──────┘ └──────┘ └──────┘        │
│ [🧠大脑] [📋清单] [📅时间线] [⚙️案件操作 ▾]  │
│                   ┌────────────────┐        │
│                   │ ⏸ 暂停案件     │        │
│                   │ 🔄 换银行重递   │        │
│                   │ ↩️ 客户撤回     │        │
│                   │ ❌ 终止案件     │        │
│                   └────────────────┘        │
└─────────────────────────────────────────────┘
```

点击 L0 切换展开/折叠 L1。"案件操作" 按钮弹出下拉菜单。

### `src/stores/caseStore.ts`

```typescript
interface CaseInfo {
  caseId: string;
  clientName: string;
  lender: string;
  loanAmount: number;
  stage: string;
  checklistDone: number;
  checklistTotal: number;
  checklistProgress: number;   // 百分比
  summary: string;             // 一句话摘要
  deadline: string;            // Finance Due
  lvr?: number;
}

interface CaseState {
  currentCase: CaseInfo | null;
  contextExpanded: boolean;    // L0/L1 切换
  setCurrentCase: (c: CaseInfo | null) => void;
  toggleContext: () => void;
}
```

## EmailDispatchDetail（邮件派单）— 对齐原型 task#1

```
┌─────────────────────────────────────────────────┐
│ 📧 邮件内容                                      │
│ ┌────────────────────────────────────────────┐  │
│ │ From: assessment@nab.com.au · 今天 10:32   │  │
│ │ Conditional Approval — Chen Wei #NAB-...   │  │
│ │                                            │  │
│ │ Dear Broker,                               │  │
│ │ The above application has been             │  │
│ │ [conditionally approved].  ← 黄色高亮       │  │
│ │ Outstanding Conditions:                    │  │
│ │ 1. [Updated payslips] ← 黄色高亮           │  │
│ │ 2. [Signed contract of sale]               │  │
│ │ 3. [Rental income evidence]                │  │
│ └────────────────────────────────────────────┘  │
│                                                 │
│ 🎯 派单分流                                      │
│ [🙋 我来做] [👔 给老板] [📋 给Judy] [🔇 忽略]    │
│                                                 │
│ 📝 AI 建议草稿 · 首期催件回复                      │
│ ┌────────────────────────────────────────────┐  │
│ │ ✏️ 内嵌草稿编辑              AI 自动生成    │  │
│ ├────────────────────────────────────────────┤  │
│ │ To: chen.wei@email.com                     │  │
│ │ 主题: 贷款进展更新 — NAB 有条件批准          │  │
│ ├────────────────────────────────────────────┤  │
│ │ Hi Chen Wei,                               │  │
│ │ 好消息！您在 NAB 的贷款申请已获得...         │  │
│ ├────────────────────────────────────────────┤  │
│ │ [📤 发送] [✏️ 编辑] [🗑 删除]              │  │
│ └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 派单按钮行为（alert 即可，不需要真实 API）
- 🙋 我来做 → alert("✅ 已归案 Chen Wei\n→ 时间线记录\n→ 生成 OS 条件任务卡")
- 👔 给老板 → alert("👔 委派给 Brandon")
- 📋 给 Judy → alert("📋 委派给 Judy\n→ Deadline 默认 2 天")
- 🔇 忽略 → alert("已忽略")

### 草稿编辑器组件
- 顶部：标题 + "AI 自动生成" 标签（accent 色调背景）
- To / 主题 行
- 正文区域（white-space: pre-wrap）
- 底部按钮行

## NewClientDetail（新客户建案）— 对齐原型 task#5

```
┌─────────────────────────────────────────────┐
│ 📧 新客户邮件                                │
│ [邮件预览卡]                                  │
│                                              │
│ 🤖 AI 提取字段                                │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
│ │客户名│ │ 房价 │ │贷款额│ │ LVR  │        │
│ │Tom Xu│ │$950K │ │$760K │ │ 80%  │        │
│ ├──────┤ ├──────┤ ├──────┤ ├──────┤        │
│ │ 职业 │ │年收入│ │ 身份 │ │ 用途 │        │
│ │PwC   │ │$165K │ │ PR   │ │投资房│        │
│ └──────┘ └──────┘ └──────┘ └──────┘        │
│                                              │
│ [🆕 建案并归入] [🔗 关联已有] [🔇 忽略]      │
└─────────────────────────────────────────────┘
```

- 没有 ContextBar（新客户无案件上下文）
- 没有 AIChatInput

## GeneralEmailDetail — 对齐原型 task#8

简化版：邮件预览 + 四键派单，不含草稿编辑。

## 验收

- 点击 task#1 → 右侧显示 EmailDispatchDetail（邮件内容+派单+草稿）
- 点击 task#5 → 右侧显示 NewClientDetail（邮件+AI字段+建案按钮）
- 点击 task#8 → 右侧显示 GeneralEmailDetail（邮件+派单）
- ContextBar 显示正确案件信息，点击展开 L1
- L1 的"案件操作"下拉菜单正常弹出
- AIChatInput 在有案件时显示
- 切换不同任务 → 详情面板内容切换
- 全部颜色/间距使用 CSS 变量
- `npx tsc --noEmit` 零错误
```

---

## Prompt 5：详情面板 — 文件匹配 + 清单驱动视图

```markdown
# 任务

实现文件匹配 (FILE_MATCH) 任务卡的详情面板 + 清单驱动视图。这是 V5 的核心交互。

## ⚠️ 必须对齐原型 HTML 的 taskDetails[2]

## 文件拆分

- `src/components/panel/details/FileMatchDetail.tsx` — 文件匹配详情
- `src/components/panel/details/FileMatchItem.tsx` — 单个文件匹配结果（✅/❓/⚠️）
- `src/components/panel/details/ChecklistPanel.tsx` — 递交清单面板（全集驱动）
- `src/components/panel/details/ChecklistItem.tsx` — 单个清单项

## FileMatchDetail 结构（对齐原型 task#2）

```
┌──────────────────────────────────────────────────┐
│ 📎 文件匹配结果                                    │
│                                                   │
│ ┌──────────────────────────────────────────────┐  │
│ │ ✅ 清单「最新工资单」已满足                     │  │
│ │    ← Payslip_Jul.pdf · 雇主: Tech Corp       │  │
│ │      税后: $7,450                             │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ ┌──────────────────────────────────────────────┐  │
│ │ ✅ 清单「2025 NOA」已满足                      │  │
│ │    ← NOA_2025.pdf · 应税收入: $120,000        │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ ┌──────────────────────────────────────────────┐  │
│ │ ❓ scan_003.pdf 未匹配到清单项                  │  │
│ │    AI 建议: 可能是「身份证明」(置信度 47%)      │  │
│ │    [选择清单项 ▾] [标记为无关]                  │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ ┌ ⚠️ 黄色背景卡片 ────────────────────────────┐  │
│ │ ⚠️ 字段异常                                   │  │
│ │ Payslip 税后 $7,450 vs 申请表 $7,500 — 差异$50│  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ [✅ 全部确认]  [⏭ 稍后处理]                       │
│                                                   │
│ 📋 递交清单 · CBA Full Doc                        │
│ ┌──────────────────────────────────────────────┐  │
│ │ 🟢 必选（银行要求）                            │  │
│ │ ☑ 有效护照                                    │  │
│ │ ☑ 最新 2 期工资单                             │  │
│ │ ☑ 雇佣确认信 (含试用期说明)                    │  │
│ │ ☑ 近 3 个月银行流水                           │  │
│ │ ☑ 购房合同                                    │  │
│ │                                              │  │
│ │ 🟡 AI 建议（可去勾）                           │  │
│ │ ☑ 赠予信 — "首付含 $15 万海外父母赠予"        │  │
│ │ ☑ 赠予资金到账流水 — "需证明资金路径"          │  │
│ │ ☐ 试用期雇主确认 — "CBA 可能要求，建议先准备"  │  │
│ │                                              │  │
│ │ [⬜ 更多可选（从全集添加）▾]                    │  │
│ │ [➕ 新增自定义项]                              │  │
│ └──────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

## 文件匹配结果三种状态

| 状态 | 图标 | 背景 | 含义 |
|------|------|------|------|
| ✅ 已匹配 | 绿色 ✅ | 默认 bg-card | 文件成功匹配到清单项 |
| ❓ 未匹配 | 黄色 ❓ | 默认 bg-card | AI 低置信度，需手动选择 |
| ⚠️ 异常 | 黄色 ⚠️ | yellow-soft 背景 + 黄色边框 | 字段交叉核对发现差异 |

## 清单面板设计

### 三组清单项
1. **必选（银行要求）** — 🟢 绿色圆点，checkbox 已勾选（绿色背景+白勾）
2. **AI 建议（可去勾）** — 🟡 黄色圆点，checkbox 带黄色边框，可点击 toggle
3. **更多可选** — 虚线边框按钮，点击 alert 显示全集剩余项

### 清单项交互
- 点击 AI 建议的清单项 → toggle checkbox 选中/取消
- 每个 AI 建议项下方有灰色理由文字
- "更多可选" 按钮 → alert 列出可添加的项
- "新增自定义项" 按钮 → alert 输入自定义名

## 验收

- 点击 task#2 → 右侧显示 FileMatchDetail
- 三种文件匹配状态正确渲染（颜色/图标/布局）
- 字段异常卡片有黄色背景 + 边框
- 清单面板三组正确显示
- AI 建议项可点击 toggle
- 所有按钮有 pointer-down 缩放反馈
- `npx tsc --noEmit` 零错误
```

---

## Prompt 6：详情面板 — OS/老板/催件/结算

```markdown
# 任务

实现剩余 4 种任务卡详情：OS 攻坚 (OS_ATTACK)、老板拍板 (BOSS_DECISION)、催件超期 (OVERDUE_REMINDER)、结算确认 (SETTLEMENT)。

## ⚠️ 必须对齐原型 HTML 的 taskDetails[3]、taskDetails[4]、taskDetails[6]、taskDetails[7]

## 文件拆分

- `src/components/panel/details/OsAttackDetail.tsx` — OS 攻坚
- `src/components/panel/details/BossDecisionDetail.tsx` — 老板决策
- `src/components/panel/details/OverdueDetail.tsx` — 催件超期
- `src/components/panel/details/SettlementDetail.tsx` — 结算确认

## OsAttackDetail（OS 攻坚）— 对齐原型 task#3

```
┌──────────────────────────────────────────────┐
│ 🏦 OS 条件列表                                │
│                                               │
│ ┌──────────────────────────────────────────┐  │
│ │ ☐ Updated payslips (last 2 pay periods)  │  │
│ │   📎 证据: Payslip_Jul.pdf 可用(绿色)    │  │
│ └──────────────────────────────────────────┘  │
│                                               │
│ ┌──────────────────────────────────────────┐  │
│ │ ☐ Evidence of rental income              │  │
│ │   📎 证据: 缺失 — 需客户提供(红色)       │  │
│ └──────────────────────────────────────────┘  │
│                                               │
│ ┌──────────────────────────────────────────┐  │
│ │ ☐ Signed contract of sale               │  │
│ │   📎 证据: Contract_signed.pdf 可用(绿色)│  │
│ └──────────────────────────────────────────┘  │
│                                               │
│ [⚡ 进入 OS 攻坚工作台] [📧 催客户补件]       │
└──────────────────────────────────────────────┘
```

- 每个 OS 条件是一个卡片，含红色 ☐ + 条件名 + 证据映射状态
- 证据状态：绿色 = 可用，红色 = 缺失
- "进入 OS 攻坚工作台" 按钮 → alert("进入 OS 攻坚专属三栏布局\n\n左栏: OS 条件 + 证据映射\n中栏: AI 攻坚方案 (3条策略)\n右栏: 双语草稿编辑 + 附件预览")

## BossDecisionDetail（老板决策）— 对齐原型 task#4

```
┌──────────────────────────────────────────────┐
│ 👔 待老板拍板                                  │
│ ┌──────────────────────────────────────────┐  │
│ │ ANZ 拒了 Zhang Fang 的贷款申请            │  │
│ │ • 拒绝原因: 自雇 ABN 注册仅 18 个月      │  │
│ │ • 贷款金额: $920,000 · LVR: 75%         │  │
│ │ • 年收入: $180,000 (自雇 IT 顾问)        │  │
│ │ • Vera 建议: 换 CBA (接受 18 个月 ABN)   │  │
│ └──────────────────────────────────────────┘  │
│                                               │
│ 📋 微信话术 (一键复制)                          │
│ ┌──────────────────────────────────────────┐  │
│ │ Brandon, Zhang Fang 的 ANZ 贷款被拒了。   │  │
│ │ 主要原因是自雇 ABN 只有 18 个月...        │  │
│ │ 建议换 CBA，理由：                        │  │
│ │ ① CBA 接受 18 个月 ABN + 会计师信        │  │
│ │ ② 客户其他条件都很好                      │  │
│ │ ③ CBA 目前利率也有竞争力                  │  │
│ │ 你看换 CBA 还是试其他银行？               │  │
│ └──────────────────────────────────────────┘  │
│ [📋 复制微信话术] [✅ 记录老板回复]            │
└──────────────────────────────────────────────┘
```

- "复制微信话术" → navigator.clipboard.writeText(话术) + alert("✅ 已复制到剪贴板！")
- "记录老板回复" → alert("输入老板回复 → 记录到案件时间线 → 生成后续任务卡")

## OverdueDetail（催件超期）— 对齐原型 task#6

```
┌──────────────────────────────────────────────┐
│ ⏰ 催件超期提醒                                │
│ ┌ 红色背景卡片 ────────────────────────────┐  │
│ │ 银行流水 (3个月) — 催件已发 7 天无回应     │  │
│ │ 首次催件: 7月31日 · 客户已读但未回复       │  │
│ └──────────────────────────────────────────┘  │
│                                               │
│ 🤖 AI 建议                                    │
│ [📧 生成二次催件草稿 (AI 建议语气加强)]       │
│ [📞 标记为已电话催件]                          │
│ [⏭ 延后 3 天再提醒]                           │
└──────────────────────────────────────────────┘
```

## SettlementDetail（结算确认）— 对齐原型 task#7

```
┌──────────────────────────────────────────────┐
│ ┌ 绿色庆祝卡片 (居中) ──────────────────┐    │
│ │ 🎉                                    │    │
│ │ 案件已批准！                           │    │
│ │ CBA · $680,000 · 自住房               │    │
│ └────────────────────────────────────────┘    │
│                                               │
│ 💰 佣金预估                                   │
│ ┌──────┐ ┌──────┐                            │
│ │Upfront│ │Trail │                            │
│ │$5,525 │ │$1,275│ (年化)                     │
│ └──────┘ └──────┘                            │
│                                               │
│ 📋 结算前自查                                  │
│ ☐ 所有 OS 条件已清除                           │
│ ☐ 清单 12/12 全部满足                          │
│ ☐ 客户已收到批准通知                           │
│ ☐ 律师已确认结算日                             │
│                                               │
│ [✅ 确认已结算] [📧 通知客户(草稿)]             │
└──────────────────────────────────────────────┘
```

- 自查清单每项可点击 toggle checkbox
- "确认已结算" → alert("确认结算 → 触发：\n✅ 合规文件归档\n✅ 经验沉淀\n✅ 佣金标记实得\n✅ 案件归入档案库")

## 验收

- 4 种详情面板正确渲染（逐一对照原型检查内容）
- OS 条件的证据状态颜色正确（绿/红）
- 老板决策的微信话术可复制到剪贴板
- 结算自查清单可 toggle
- 所有按钮有 pointer-down 缩放反馈
- 全部颜色使用 CSS 变量
- `npx tsc --noEmit` 零错误
```

---

## Prompt 7：全局浮动 AI + 案件看板 + 知识中心 + SSE

```markdown
# 任务

实现全局浮动 AI 助手、案件看板页面、知识中心页面、SSE 实时连接。

## ⚠️ 必须对齐原型 HTML 的浮动 AI 面板

## 文件拆分

- `src/components/ai/FloatingAI.tsx` — 右下角浮动按钮 + 弹出面板
- `src/components/ai/FloatingAIMessages.tsx` — 消息列表
- `src/pages/CaseBoard.tsx` — 案件看板（卡片网格）
- `src/components/cases/CaseCard.tsx` — 单个案件卡
- `src/components/cases/StageFilter.tsx` — 阶段筛选
- `src/pages/KnowledgeCenter.tsx` — 知识中心
- `src/services/sseClient.ts` — SSE 订阅

## 全局浮动 AI 助手（对齐原型）

### 浮动按钮
- 右下角 fixed 定位，52×52px 圆形
- 渐变背景 (accent → 紫色)
- hover 放大 1.08 + 阴影增强
- 点击 toggle 弹出面板

### 弹出面板
```
┌────────────────────────────┐
│ 🤖 全局 AI 助手             │
│ 跨案件问答 · 周报 · 数据分析 │  [✕]
├────────────────────────────┤
│ ☀️ 早上好 Vera！今日概览：   │
│ • 28 个活跃案件，3 个紧急    │
│ • 5 个 OS 待回复            │
│ • 12 封新邮件待处理          │
│ • 💰 本月已结佣 $12,350     │
│                            │
│ 建议优先处理 Wang Li 的     │
│ ANZ OS（Finance Due 仅剩    │
│ 3 天）                      │
├────────────────────────────┤
│ [问任何跨案件的问题...]  [↑] │
└────────────────────────────┘
```

- 面板 380×460px，bg-panel，圆角 16px
- 顶部有 AI 头像（渐变圆角方块）+ 标题 + 关闭按钮
- 消息区可滚动
- 底部输入框
- 用户发消息 → 添加 user 气泡 → setTimeout 500ms 添加 bot 回复
- bot 气泡：bg-card，左对齐
- user 气泡：accent 背景，右对齐

## 案件看板设计

```
┌────────────────────────────────────────────────┐
│ 案件看板                            [+ 新建案件] │
├────────────────────────────────────────────────┤
│ [全部] [预审] [递件中] [补件] [审批] [Settlement] │
├────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ 李明     │  │ 王芳     │  │ 张伟     │     │
│  │ CBA $850K│  │ ANZ $1.2M│  │ WBC $650K│     │
│  │ 阶段:补件│  │ 阶段:审批│  │ 阶段:预审│     │
│  │ 清单 6/8 │  │ 清单 8/8 │  │ 清单 2/10│     │
│  │ ████░░   │  │ ████████ │  │ ██░░░░░░ │     │
│  └──────────┘  └──────────┘  └──────────┘     │
└────────────────────────────────────────────────┘
```

- 卡片网格布局（auto-fill, min 260px）
- 每个 CaseCard：客户名 + 银行 + 金额 + 阶段 + 清单进度条
- 进度条渐变色（accent → green 随进度递增）
- hover 微升 + shadow 增强
- 点击 → 切到任务工作台（TODO: 筛选该案件）
- mock 5-6 个案件数据

## 知识中心设计

```
┌────────────────────────────────────────────────┐
│ 知识中心                                        │
├────────────────────────────────────────────────┤
│ [🔍 搜索经验库...]                              │
├────────────────────────────────────────────────┤
│ 最近经验                                       │
│ ┌─────────────────────────────────────┐       │
│ │ CBA 补件流程经验                     │       │
│ │ 2024-01-15 · 案件: 李明             │       │
│ │ "CBA 补件通常需要 3 个工作日确认..."  │       │
│ └─────────────────────────────────────┘       │
└────────────────────────────────────────────────┘
```

- 搜索框 + 知识卡片列表
- mock 3-4 条知识条目

## SSE 客户端

### `src/services/sseClient.ts`

```typescript
export interface ServerEvent {
  type: 'task_created' | 'task_updated' | 'case_updated' | 'heartbeat';
  data: Record<string, unknown>;
}

export function subscribeEvents(onEvent: (e: ServerEvent) => void): () => void {
  const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const es = new EventSource(`${BASE_URL}/api/events/stream`);
  
  es.onmessage = (msg) => {
    try {
      const event: ServerEvent = JSON.parse(msg.data);
      onEvent(event);
    } catch { /* ignore parse errors */ }
  };
  
  es.onerror = () => {
    console.warn('[SSE] Connection lost, reconnecting...');
  };
  
  return () => es.close();
}
```

在 App.tsx useEffect 中调用 subscribeEvents。连接失败时优雅降级，不影响 UI。

## 验收

- 浮动 AI 按钮点击 → 弹出面板
- 面板中发消息 → bot 回复
- 案件看板卡片网格正确渲染
- 进度条有渐变色
- 知识中心搜索框可交互
- SSE 连接失败时不报错不白屏
- 浮动 AI 在所有页面都可见
- `npx tsc --noEmit` 零错误
```

---

## Prompt 8：主题选择器 + 设置页 + 最终打磨

```markdown
# 任务

实现主题选择器 UI、设置页，并做最终打磨。

## 主题选择器

在 Settings 页面创建主题选择 UI：

```
┌───────────────────────────────────┐
│ 🎨 主题                           │
│                                   │
│  ⚫ 深空黑   ⚪ 极光白   💜 紫金  │
│  🔵 海洋蓝   🟤 暖沙               │
│                                   │
│  [每个是一个圆形色块 + 名称]       │
│  [当前选中的有光环动画]            │
└───────────────────────────────────┘
```

### 切换动画（Apple feel）
- 选中新主题 → 全屏 crossfade 过渡（opacity 200ms）
- 当前选中的圆有 ring 动画（spring 弹入）
- `prefers-reduced-motion` → 无 crossfade，直接切换

## 文件

`src/pages/Settings.tsx`、`src/components/settings/ThemePicker.tsx`

## 设置页其他内容

- 主题选择（ThemePicker 组件）
- API 连接状态：显示后端是否可达（fetch /api/version）
- 版本号：v2.0.0
- CLIENT_FILES_ROOT 路径显示（只读）

## 最终打磨清单

- [ ] 所有 hover 状态有 `var(--accent-soft)` 或对应色的 soft 背景
- [ ] 所有 active（按下）状态有 `scale(0.97)` 缩放
- [ ] 所有按钮过渡：`transition: var(--transition)`
- [ ] 空状态有优雅的图标 + 提示文字
- [ ] 加载状态有骨架屏（skeleton），不是 spinner
- [ ] 大标题 letter-spacing: -0.02em
- [ ] 正文 line-height: 1.5
- [ ] 主题切换时 `transition: background-color 200ms, color 200ms`
- [ ] `prefers-reduced-motion` 媒体查询已配置（降级为 opacity 渐变）
- [ ] TypeScript strict 模式零错误
- [ ] 每个文件 ≤ 200 行
- [ ] 所有交互元素有唯一 id（e.g. `id="btn-complete-task-{taskId}"`）
- [ ] 自定义滚动条样式（4px 宽，`var(--border)` 颜色）
- [ ] 对照原型 HTML 逐项检查：sidebar / KPI / 筛选 / 任务卡 / 详情面板 / 浮动 AI

## 验收

- 5 套主题可正常切换
- 切换时有 crossfade 过渡
- 选中的主题色块有 ring 动画
- 刷新后主题保持（localStorage）
- 设置页各项正常显示
- 全部打磨清单通过
- `npx tsc --noEmit` 零错误
- `npm run build` 构建成功
```

---

## 执行顺序

| 步骤 | Prompt | 验证后再给下一步 |
|------|--------|----------------|
| 1 | Prompt 1：项目初始化 + 主题系统 | `npm run dev` 启动 + themeStore 可用 |
| 2 | Prompt 2：布局骨架 + 路由 | sidebar 切换 + 布局正确（对照原型） |
| 3 | Prompt 3：8 种任务卡 + Store | 8 种卡片全部渲染 + 筛选可用 |
| 4 | Prompt 4：邮件派单 + 新客户建案 | 点击 task#1/#5/#8 → 详情正确 |
| 5 | Prompt 5：文件匹配 + 清单驱动 | 点击 task#2 → 文件匹配+清单 |
| 6 | Prompt 6：OS/老板/催件/结算 | 点击 task#3/#4/#6/#7 → 详情正确 |
| 7 | Prompt 7：浮动 AI + 看板 + 知识 + SSE | 浮动 AI 可用 + 看板渲染 |
| 8 | Prompt 8：主题 + 打磨 | 5 套主题 + build 成功 |

每步之间检查代码质量 + 对照原型 HTML 验证交互是否一致。如果有偏差，给补丁 Prompt。

---

## 与原型 HTML 的对照检查清单

执行完全部 8 个 Prompt 后，用以下清单逐项检查：

| # | 检查项 | 原型位置 |
|---|--------|---------|
| 1 | sidebar 4 个 tab + logo + badge | `.sidebar` |
| 2 | KPI pill 标签（活跃/贷款额/紧急/OS/新邮件）| `.kpi-bar` |
| 3 | 筛选 6 标签（全部/邮件/文件/OS/待老板/超期）| `.filter-bar` |
| 4 | 8 种任务卡类型全覆盖 | `.task-list` 内 8 个 `.task-card` |
| 5 | "已完成" section + 已完成卡片 | `.section-label` + opacity 0.5 |
| 6 | 邮件派单详情（邮件+四键+草稿）| `taskDetails[1]` |
| 7 | 文件匹配详情（✅/❓/⚠️ + 清单三组）| `taskDetails[2]` |
| 8 | OS 攻坚详情（条件+证据+攻坚入口）| `taskDetails[3]` |
| 9 | 老板拍板详情（情况+话术+复制）| `taskDetails[4]` |
| 10 | 新客户详情（邮件+AI字段+建案）| `taskDetails[5]` |
| 11 | 催件超期详情（超期卡+AI建议）| `taskDetails[6]` |
| 12 | 结算确认详情（庆祝+佣金+自查）| `taskDetails[7]` |
| 13 | 普通邮件详情（邮件+派单）| `taskDetails[8]` |
| 14 | CaseContextBar 三层展开 | `.context-bar` |
| 15 | 案件操作下拉菜单 | `.lifecycle-menu` |
| 16 | AI 输入框（案件级）| `.ai-chat-panel` |
| 17 | 全局浮动 AI + 弹出面板 | `.floating-ai` + `.floating-ai-panel` |
| 18 | 案件看板卡片网格 | CaseBoard 页面 |
| 19 | 5 套主题切换 | Settings 页面 |
