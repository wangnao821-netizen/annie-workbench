# AI Studio 前端改造提示词：批次 P7（WO-59 档案与知识中心 AI 先例智库与审批官画像）

## 你的角色
你是精通 React 19 + TypeScript + TailwindCSS + Lucide Icons 的前端专家，正在为 **Vera 工作台** 构建「AI 先例智库与审批官画像（Precedents & Assessor Insights）」模块。

---

## 改造目标
在档案中心 / 知识中心中，新增 **「先例智库与审批官雷达」** 面板：

### 1. 顶部 Tab 切换
- **Tab A（★ 默认）：实战先例检索器 (Precedent Finder)**
- **Tab B：审批官画像库 (Assessor Radar)**

---

### 2. Tab A：实战先例检索器 (Precedent Finder)
- **多维筛选栏**：
  - 机构选择：全部 / ORDE / CBA / Westpac / Brighten / Latrobe 等；
  - 方案类型：全部 / Alt Doc / Full Doc / Lite Doc；
  - 搜索框：关键词搜索（如 "Granville"、"自雇"、"低估价" 等）；
- **先例卡片网格流**：
  - 调用 `GET /api/archive/precedents`；
  - 每个卡片呈现：客户、机构、借款金额、利率、放款日期与关键亮点摘要；
  - 点击卡片可弹出 **《实战复盘知识卡》**（调用 `GET /api/archive/cases/{case_id}/knowledge-card`），展示三段式复盘：
    1. 🎯 **背景与痛点**
    2. 💡 **突破与申诉策略**
    3. 🏆 **最终获批与经验启示**

---

### 3. Tab B：审批官画像库 (Assessor Radar)
- 调用 `GET /api/archive/assessors`；
- 卡片式呈现已知银行审批官（如 `Rachel Fonseka · ORDE`）：
  - 负责案件总数、最近负责案号；
  - **常见卡点倾向标签**：`[估价缺口偏好]`、`[自雇流水严格]`、`[MIR 补件率高]`；
  - **AI 沟通锦囊**：如“建议邮件提供清晰材料清单并一次性补齐，附估价复议对照表”。

---

## 接口契约参考

### 获取审批官列表
`GET /api/archive/assessors`
返回：
```typescript
interface AssessorInsightItem {
  assessor_name: string;
  lender?: string;
  case_count: number;
  latest_case_id?: string;
  latest_case_ref?: string;
  common_blockers: string[];
  communication_tips: string;
}

interface AssessorListResponse {
  ok: boolean;
  total_assessors: number;
  assessors: AssessorInsightItem[];
}
```

### 多维检索先例
`GET /api/archive/precedents?lender=...&doc_type=...&keyword=...`
返回：
```typescript
interface CasePrecedentItem {
  case_id: string;
  client_name: string;
  property_address?: string;
  lender?: string;
  loan_amount?: number;
  doc_type?: string;
  interest_rate?: string;
  settlement_date?: string;
  summary_highlight?: string;
}

interface CasePrecedentSearchResponse {
  ok: boolean;
  total_found: number;
  precedents: CasePrecedentItem[];
}
```

### 获取案件复盘卡
`GET /api/archive/cases/{case_id}/knowledge-card`
返回：
```typescript
interface KnowledgeCardResponse {
  ok: boolean;
  card?: {
    case_id: string;
    client_name: string;
    lender: string;
    loan_amount: number;
    strategy_summary: string;
    key_challenges: string[];
    approved_conditions: string;
    takeaway: string;
  };
  message?: string;
}
```

---

## 验收（AI Studio 侧）
1. `npx tsc --noEmit` 零错误；构建通过；
2. 先例检索器支持按银行、方案类型流畅过滤；
3. 点击先例卡片能弹出三段式实战复盘经验卡；
4. 审批官画像库能清晰展示审批官卡片与沟通锦囊。
