# AI Studio 前端改造提示词：批次 P6（WO-58 档案中心二次经营商机雷达看板）

## 你的角色
你是精通 React 19 + TypeScript + TailwindCSS + Lucide Icons 的前端专家，正在为 **Vera 工作台** 构建「档案中心 · 二次经营商机雷达（Retention Radar）」。

---

## 改造目标
在档案中心视图中，新增一个现代化的 **「二次经营商机雷达（Retention Radar）」看板模块**：

### 1. 顶部 4 维商机胶囊指示卡片（Summary Cards）
调用 `GET /api/archive/retention-radar`，顶部呈现 4 个醒目的统计指标卡片（支持点击快速过滤）：
- 🔴 **固定利率临期预警 (Fixed Rate Expiry)**：统计 `red_count`（未来 90 天内到期，建议转贷锁定新方案）；
- 🟡 **满年降息体检 (Annual Repricing)**：统计 `yellow_count`（满 1 年或 2 年，建议向原银行申请降息 Review）；
- 🟢 **增值套现/再置业 (Equity Cash-out)**：统计 `green_count`（满 2 年以上，主动询问再置业意向）；
- 🔵 **放款关怀与账单核对 (Settlement Care)**：统计 `blue_count`（放款 30/180 天回访）。

---

### 2. 主列表卡片区（Opportunities Feed）
- 支持按全部 / 红 / 黄 / 绿 / 蓝 进行快速切换过滤；
- 每个商机卡片呈现：
  - **客户姓名与房产地址**；
  - **贷款银行、金额与获批利率**（如 CBA · $850k · 6.09%）；
  - **放款日期与已过天数**；
  - **商机标签与行动建议**（如：`🔴 固定利率即将在 45 天内到期 ➔ 联系客户锁定新转贷方案`）；
  - **操作按钮**：
    - `[ 📋 复制跟进建议 / 草稿 ]`
    - `[ 💬 一键联系问候 ]`

---

## 接口契约参考

### 获取二次经营商机雷达
`GET /api/archive/retention-radar`
返回：
```typescript
interface RetentionOpportunityItem {
  case_id: string;
  client_name: string;
  property_address?: string;
  lender?: string;
  loan_amount?: number;
  interest_rate?: string;
  settlement_date?: string;
  level: 'red' | 'yellow' | 'green' | 'blue';
  opp_type: 'fixed_rate_expiry' | 'annual_repricing' | 'equity_cashout' | 'settlement_care';
  title: string;
  action_suggest: string;
  days_relevant: number;
}

interface RetentionRadarSummary {
  total_opportunities: number;
  red_count: number;
  yellow_count: number;
  green_count: number;
  blue_count: number;
}

interface RetentionRadarResponse {
  ok: boolean;
  summary: RetentionRadarSummary;
  opportunities: RetentionOpportunityItem[];
}
```

---

## 验收（AI Studio 侧）
1. `npx tsc --noEmit` 零错误；构建通过；
2. 档案中心能清晰看到二次经营雷达面板；
3. 顶部 4 色胶囊统计精准，点击能顺畅过滤下方商机列表；
4. 复制建议与互动操作流畅。
