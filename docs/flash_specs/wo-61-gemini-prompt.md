# AI Studio 前端改造提示词：批次 P9（WO-61 知识中心与档案库全景双向打通与工作台先例智库联动）

## 你的角色
你是精通 React 19 + TypeScript + TailwindCSS + Lucide Icons 的前端专家，正在为 **Vera 工作台** 打造「知识中心与档案库全景双向打通 + 工作台先例推荐」闭环。

---

## 改造目标

### 1. 知识中心「全局经验」支持反向穿透到档案库（Knowledge ➔ Archive Traceability）
- 在 `GlobalExperienceTab.tsx`（知识中心全局经验列表）中：
  - 若条目的 `source === 'archive_precedent'`，卡片上打上特殊的金色徽标 **`[ 🏆 实战先例 ]`**；
  - 展开卡片展示三段式复盘结构（🎯 背景与痛点 ➔ 💡 突破策略 ➔ 🏆 获批经验）；
  - 提供 **`[ 📂 查看档案库原始案卷 ➔ ]`** 按钮，点击直接导航定位至档案中心该客户卡片。

---

### 2. 档案中心【默认自动沉淀 + 维护性刷新入口】
- **归档即自动入库**：归档成功后，Toast 提示直接展示：*“已成功归档 X 个案卷，并自动提炼沉淀至知识库！”*；
- **维护性小按钮**：在档案中心工具栏或右上角提供一个轻量的 `[ 🔄 刷新智库先例 ]` 图标按钮，点击调用 `POST /api/archive/sync-knowledge`，供模型升级或数据重洗使用。

---

### 3. 工作台在办案件增加「💡 历史相似先例与破局建议」（Workbench Precedents Radar）
- 在案件详情页概览（`CaseDetailView.tsx`）或卡点报警横幅下方：
  - 调用 `GET /api/cases/{case_id}/recommended-precedents`；
  - 若匹配到相似先例，渲染精致的 **「💡 AI 智能推荐：历史相似破局先例」** 折叠面板：
    - 展示先例标题（如：`【实战先例】ORDE · Yingkun CHEN · $1.84M`）；
    - 匹配理由标签：`[同机构 ORDE]`、`[同低估价卡点]`、`[Alt Doc 方案]`；
    - 破局策略摘要与经验启示；
    - 点击可查看完整复盘卡。

---

## 接口契约参考

### 一键同步/刷新先例入知识库
`POST /api/archive/sync-knowledge`
返回：
```typescript
interface KnowledgeSyncResponse {
  ok: boolean;
  synced_count: number;
  total_precedents: number;
  message?: string;
}
```

### 获取案件推荐的相似先例
`GET /api/cases/{case_id}/recommended-precedents`
返回：
```typescript
interface RecommendedPrecedentItem {
  precedent_id: string;
  case_id: string;
  title: string;
  lender?: string;
  client_name?: string;
  strategy_summary?: string;
  takeaway?: string;
  relevance_score: number;
  match_reasons: string[];
}

interface CaseRecommendedPrecedentsResponse {
  ok: boolean;
  case_id: string;
  total_recommended: number;
  precedents: RecommendedPrecedentItem[];
}
```

---

## 验收（AI Studio 侧）
1. `npx tsc --noEmit` 零错误；构建通过；
2. 知识中心能看到实战先例卡片，并能点击穿透至档案库；
3. 历史案卷归档时默认自动沉淀入知识库；
4. 工作台在办案件中，遇到卡点或特定银行时能自动推荐历史相似先例与破局建议。
