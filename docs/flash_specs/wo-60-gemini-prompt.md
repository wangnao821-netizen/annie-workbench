# AI Studio 前端改造提示词：批次 P8（WO-60 档案中心全景重构与最终收口）

## 你的角色
你是精通 React 19 + TypeScript + TailwindCSS + Lucide Icons 的前端专家，正在为 **Vera 工作台** 打造最终重构版的「档案中心（Archive Hub）」。

---

## 改造目标
全面升级重构 `ArchiveHub.tsx`（档案中心主页面），呈现集 **管理资产大盘、客户终生资产池、二次经营商机雷达、AI 先例智库** 于一体的现代化大中台视图：

### 1. 顶部：管理资产大盘与快捷归档（Header & Stats）
- **左侧数据概览指标**（调用 `GET /api/archive/stats`）：
  - 👥 **管理客户总数** (`total_archived_clients`)；
  - 💰 **贷款总资产规模** (`total_loan_volume`, 如 `$12.8M`)；
  - ⚡ **二次经营商机数** (`total_opportunities_count`)；
  - 🧠 **收录实战先例** (`total_precedents_count`)；
- **右侧主按钮**：
  - `[ 📂 批量归档历史客户案卷 ]` ➔ 点击直接弹出 `ArchiveBatchImportModal`。

---

### 2. 三大核心 Tab 切换
- **Tab 1（★ 默认）：客户终生资产池 (Client Portfolios)**
  - 调用 `GET /api/archive/portfolio`；
  - 搜索栏支持按客户姓名即时过滤；
  - **客户资产大卡片**：
    - 客户姓名、名下物业套数（如 `🏠 2 套抵押房产`）；
    - 贷款总额与主力机构（如 `ORDE · $1.84M`）；
    - 最新放款日期；
    - **活跃商机胶囊**（若有，显示：`🔴 固定利率临期 (还剩 45 天)`）；
    - 点击卡片展开该客户名下各房产案卷的明细列表。
- **Tab 2：二次经营商机雷达 (Retention Radar)**
  - 嵌入已开发的 4 色胶囊与红黄绿商机流（支持直接复制跟进建议与问候）。
- **Tab 3：AI 先例智库与审批官画像 (Precedents & Assessors)**
  - 嵌入已开发的实战先例检索器与审批官雷达卡片。

---

## 接口契约参考

### 获取大盘统计
`GET /api/archive/stats`
返回：
```typescript
interface ArchiveHubStats {
  total_archived_clients: number;
  total_cases_count: number;
  total_loan_volume: number;
  total_opportunities_count: number;
  total_precedents_count: number;
}
```

### 获取客户终生资产全景
`GET /api/archive/portfolio?query=...`
返回：
```typescript
interface ClientPortfolioItem {
  client_name: string;
  total_properties_count: number;
  total_loan_amount: number;
  primary_lender?: string;
  latest_settlement_date?: string;
  cases_summary: Array<{
    case_id: string;
    property_address?: string;
    lender?: string;
    loan_amount?: number;
    interest_rate?: string;
    stage: string;
  }>;
  active_opportunities_count: number;
  latest_opportunity_title?: string;
}

interface ArchivePortfolioResponse {
  ok: boolean;
  stats: ArchiveHubStats;
  clients: ClientPortfolioItem[];
}
```

---

## 验收（AI Studio 侧）
1. `npx tsc --noEmit` 零错误；构建通过；
2. 档案中心主页呈现精美的高端资产大盘；
3. 三大 Tab（客户资产池、商机雷达、先例智库）切换流畅，数据联动自然；
4. 批量归档弹窗与客户卡片展开交互丝滑。
