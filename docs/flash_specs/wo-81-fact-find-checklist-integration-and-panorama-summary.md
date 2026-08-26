# WO-81 Fact Find 结构化采集归位清单 + 动态受控呈现 + 全景只读摘要 — 施工单

> **状态**：待执行
> **关联**：`ChecklistDeck.tsx`、`FactFindSection.tsx`、`CasePanorama.tsx`、`server/api/fact_find.py`、WO-77
> **目标**：① 将 Fact Find 结构化录入表单从客户全景移除，归位到「材料清单」对应板块；② 动态受控呈现：清单选了哪一项 Fact Find（如 3 年雇主、3 年居住、律师信息），对应板块才展示该项录入卡；③ 确认录入后清单项自动打勾，全景与备忘录以只读结构化摘要呈现，AI 上下文全量同步。

---

## 一、技术约束与边界 (Tech Stack & Boundary)

- **前端**：TypeScript strict / React 18 / Vite / Lucide-react / Motion；
- **组件规范**：严格使用主题语义化 CSS 变量（`var(--bg-*)`、`var(--border)`、`var(--green)`、`var(--accent)` 等）；
- **后端契约**：复用既有 `GET/PUT/POST /api/cases/{id}/fact-find/{section}` 系列端点；
- **状态流转**：分发 `checklist_updated` 与 `case_facts_updated` 全局事件，保证多视图数据一致。

---

## 二、改动范围（严禁超出）

| 序号 | 文件路径 | 操作 | 说明 |
|---|---|---|---|
| 1 | `frontend/src/components/brain/FactFindSection.tsx` | 修改 | 支持单项独立卡片渲染（`FactFindItemCard`）与 `filterSections` 动态筛选模式 |
| 2 | `frontend/src/components/brain/ChecklistDeck.tsx` | 修改 | 为 `item_kind === 'info'` 的清单项嵌入 Fact Find 录入与展开交互，确认后自动打勾 |
| 3 | `frontend/src/components/brain/CasePanorama.tsx` | 修改 | 移除全景中的 Fact Find 编辑表单，改为已录入数据的只读结构化摘要面板 |

---

## 三、组件交互与数据契约定义 (Strict Contracts)

### 1. Fact Find Master ID 映射表
```typescript
const FACT_FIND_MAP: Record<string, string> = {
  employment_history: 'employment_history', // 雇主历史
  living_history: 'living_history',         // 居住历史
  solicitor_info: 'solicitor_info',         // 律师/过户师
  vehicle_asset_info: 'vehicle_asset',      // 车辆资产
  vehicle_asset: 'vehicle_asset',
  super_statement: 'super_balance',         // 养老金
  super_balance: 'super_balance',
};
```

### 2. 清单项内嵌展开契约 (`ChecklistDeck.tsx`)
- 当 `item.item_kind === 'info'` 或其 `master_id` 命中 `FACT_FIND_MAP` 时：
  - 点击卡片不再跳转全景，而在当前清单项下方平滑展开对应的 Fact Find 结构化录入卡片（支持添加多段履历/填写律师/车辆估值等）；
  - 点击「确认录入」后：
    - 调用 `POST /api/cases/{caseId}/fact-find/{section}/confirm`；
    - 后端自动同步 `CaseChecklist(status="received")` 与 `CaseContextEvent`；
    - 前端广播 `checklist_updated`，清单项立即打勾置绿。

### 3. 全景只读摘要契约 (`CasePanorama.tsx`)
- 查阅 `getFactFind(caseId)`：
  - 若各 section 的 `status === 'confirmed'`，在全景中渲染轻量摘要徽章或只读卡片；
  - 若未录入或未勾选，不占用视觉空间。

---

## 四、原子化实施步骤 (Atomic Task Checklist)

- [ ] **Step 1**：增强 `FactFindSection.tsx`，支持独立单节渲染卡片 `FactFindItemCard`，支持 `onConfirmed` 回调与双向数据同步；
- [ ] **Step 2**：修改 `ChecklistDeck.tsx`，将 `item_kind === 'info'` 的项与 `FactFindItemCard` 绑定，支持清单内直接展开录入与确认打勾；
- [ ] **Step 3**：修改 `CasePanorama.tsx`，移除 Fact Find 编辑表单，替换为只读已录入数据概览（ReadOnly Fact Summary）；
- [ ] **Step 4**：前端 TypeScript 类型检查与构建验证（`npx tsc --noEmit` + `npm run build`）；
- [ ] **Step 5**：全量后端自动化测试回归验证。

---

## 五、验收标准

1. **动态受控**：在勾选清单弹窗中勾选了哪些信息项（如 3 年雇主、律师），材料清单中就只展示这些项的 Fact Find 录入折叠卡；未选的项绝不出现；
2. **清单内闭环**：在材料清单中可直接填写并点击“确认录入”，确认后该清单项立即打勾置绿，进度条即时更新；
3. **全景与备忘录同步**：客户全景仅展示已确认数据的只读精简摘要，备忘录与 AI 上下文实时具备已录入事实。
