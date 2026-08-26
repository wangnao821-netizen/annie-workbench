# WO-78 右栏清单 8 大板块完整呈现 + 工具栏轻量化 + 文件关联优化 — 施工单

> **状态**：待执行
> **关联**：[新建客户AI协同体验规划.md](../新建客户AI协同体验规划.md) §五b；WO-74（两段式清单）；WO-75（首次模板 Preliminary Assessment 8 大板块）；`ChecklistDeck.tsx`
> **目标**：彻底解决清单右栏 3 大体验缺陷：① 头部工具栏拥挤截断；② 首次材料 21 项只显示 4 项（8 大板块映射丢失 + 缺失其他兜底）；③ 关联文件弹窗把文件夹当文件导致无法关联。

---

## 一、技术约束与边界 (Tech Stack & Boundary)

- **前端**：TypeScript strict / React 18 / Vite / Lucide-react / Motion；
- **样式**：严格使用项目现有主题 CSS 语义变量（`var(--bg-card)`、`var(--border)`、`var(--accent)`、`var(--green)`、`var(--text-primary)` 等），禁止硬编码颜色；
- **无新依赖**：严禁引入任何新的 npm / pip 依赖；
- **只改范围内文件**：只改动改动范围表内列出的文件。

---

## 二、改动范围（严禁超出）

| 序号 | 文件路径 | 操作 | 说明 |
|---|---|---|---|
| 1 | `frontend/src/components/brain/ChecklistDeck.tsx` | 修改 | ① 头部工具栏去重与分层重构；② 8 大板块映射容错 + `other` 兜底分组；③ 关联文件弹窗改用 `GET /api/cases/{id}/files` 已入库文件列表（带子文件夹 tag、未匹配置顶） |
| 2 | `server/api/files.py` | 修改 | 确保 `GET /api/cases/{case_id}/checklist` 序列化时对未在模板中的历史/自定义项提供合理的 `section` 归类回退 |
| 3 | `tests/test_api/test_checklist_eight_sections.py` | **新建** | 8 大板块序列化覆盖测试、全项完整性（21项不丢失）、文件关联数据结构检验 |

---

## 三、接口与组件契约定义 (Strict Contracts)

### 1. 8 大板块 + 兜底分组定义（`ChecklistDeck.tsx`）

```typescript
// 8 大标准板块 + 1 个兜底板块
const SECTION_ORDER = [
  'id',
  'income',
  'employment_history',
  'living_expense',
  'liability',
  'living_history',
  'asset',
  'solicitor',
  'other',
] as const;

const SECTION_LABELS: Record<string, string> = {
  id: '🆔 身份证明 (ID)',
  income: '💰 收入 (Income)',
  employment_history: '👔 雇主历史 (3年)',
  living_expense: '🛒 生活开支 (Living Expense)',
  liability: '💳 负债 (Liability)',
  living_history: '🏠 居住历史 (3年)',
  asset: '🏢 资产 (Asset)',
  solicitor: '⚖️ 律师/过户师 (Solicitor)',
  other: '📦 补充/自定义材料',
};
```

### 2. 映射容错算法契约

每个 `item` 必须 100% 归入上述 9 个分组之一：
```typescript
function resolveSectionKey(item: ChecklistItemResponse): string {
  // 1. 若后端已返回有效标准 section，直接使用
  if (item.section && SECTION_ORDER.includes(item.section as any)) {
    return item.section;
  }
  // 2. 根据 master_id / 类别 / 名称进行容错归类
  const mid = (item.master_id || '').toLowerCase();
  const cat = (item.category || '').toLowerCase();
  const name = (item.item_name || item.name_zh || item.name || '').toLowerCase();

  if (mid.includes('passport') || mid.includes('driver') || mid.includes('visa') || cat.includes('identity') || name.includes('护照') || name.includes('驾照') || name.includes('签证')) {
    return 'id';
  }
  if (mid.includes('payslip') || mid.includes('salary') || mid.includes('tax') || mid.includes('financial') || mid.includes('bas') || mid.includes('ato') || cat.includes('income') || name.includes('工资') || name.includes('财报') || name.includes('税') || name.includes('流水')) {
    return 'income';
  }
  if (mid.includes('employment') || name.includes('雇主')) {
    return 'employment_history';
  }
  if (mid.includes('living_expense') || name.includes('生活开支')) {
    return 'living_expense';
  }
  if (mid.includes('loan') || mid.includes('credit_card') || mid.includes('liability') || name.includes('贷款') || name.includes('信用卡') || name.includes('负债') || name.includes('车贷')) {
    return 'liability';
  }
  if (mid.includes('living_history') || name.includes('居住')) {
    return 'living_history';
  }
  if (mid.includes('asset') || mid.includes('rates') || mid.includes('contract') || mid.includes('deposit') || mid.includes('savings') || mid.includes('super') || mid.includes('vehicle') || cat.includes('property') || cat.includes('special') || cat.includes('settlement')) {
    return 'asset';
  }
  if (mid.includes('solicitor') || name.includes('律师') || name.includes('过户师')) {
    return 'solicitor';
  }
  return 'other';
}
```

### 3. 头部工具栏布局契约（两行清爽化）

- **Row 1**：
  - 左侧：`[首次材料 X/Y] [追加要求 M/N]` 胶囊切换
  - 右侧：`[✨ 重新匹配]` `[+ 新增]` `[🔄 (仅首次材料显示)]`
- **Row 2**：
  - 左侧：`[缺件待收: N项]` `[只看缺件 checkbox/pill]`
  - 右侧：`[📧 催件/生成邮件草稿]`

### 4. 关联文件选择器契约（穿透子目录 + 真实已入库文件）

- 点击 📎 时，调用 `GET /api/cases/{case_id}/files`（返回 `FileItemResponse[]`，含 `id`、`original_name`、`nas_path` 等）；
- 解析 `nas_path` 获取相对子目录名（例如 `Loan Documents/approval.pdf` → 标记 `[Loan Documents]` 标签）；
- 未匹配文件排在前面，已匹配文件置灰或排后；
- 绝不展示空的或不能点击匹配的文件夹自身。

---

## 四、原子化实施步骤 (Atomic Task Checklist)

### Step 1：后端序列化与分组测试
- [ ] 修改 `server/api/files.py`，完善 `_to_checklist_item` 中的 `section` 计算逻辑，当 `_template_section_map()` 未命中时提供基于 `category` 的稳定备选值；
- [ ] 新建 `tests/test_api/test_checklist_eight_sections.py`，验证 21 项首次材料的 section 字段完整下发；
- [ ] 验证：`uv run pytest tests/test_api/test_checklist_eight_sections.py -v`。

### Step 2：前端 ChecklistDeck 工具栏与两段式 Tab 紧凑化
- [ ] 修改 `frontend/src/components/brain/ChecklistDeck.tsx`：
  - 移除已挤压截断的 `材料清单台账` 文本；
  - 优化 Row 1 和 Row 2 布局，确保在 320px~360px 宽度下不折行、不重叠；
- [ ] 验证：`cd frontend && npx tsc --noEmit`。

### Step 3：前端 8 大板块 + other 兜底渲染
- [ ] 修改 `frontend/src/components/brain/ChecklistDeck.tsx`：
  - 引入 `resolveSectionKey` 统一归类；
  - `initialBySection` 完整囊括 9 个分组（含 `other`）；
  - 确保当前 21 项首次材料 100% 完整展示，分类准确；
  - 并在每组标注文档项 📄 vs 信息项 ✍️；
- [ ] 验证：`cd frontend && npx tsc --noEmit`。

### Step 4：前端 📎 关联文件弹窗重构
- [ ] 修改 `frontend/src/components/brain/ChecklistDeck.tsx` 中的 `handleOpenMatchPicker`：
  - 改为调用 `listCaseFiles(caseId)` 从 `server/api/files.py` 获取实际已入库的 `CaseFile` 列表；
  - 提取子目录标签并置顶未匹配文件；
  - 点击直接调用 `matchChecklistItem(caseId, item.id, file.id)`；
- [ ] 验证：`cd frontend && npx tsc --noEmit`。

### Step 5：全量门禁验收
- [ ] 后端测试：`uv run pytest tests/ -q` 0 failed；
- [ ] 静态检查：`uv run ruff check server/ tests/` 0 error；
- [ ] 前端类型与构建：`cd frontend && npx tsc --noEmit` + `npm run build` 0 error。

---

## 五、验收标准与失败标准

### 自动验证
1. `uv run pytest tests/test_api/test_checklist_eight_sections.py` 全部通过；
2. `npx tsc --noEmit` 零错误；
3. `npm run build` 成功。

### 手动验证
1. **工具栏**：右栏宽度在 320px 时，首次材料 / 追加要求 Tab 与右侧操作按钮布局清爽，无截断或挤压；
2. **8 大板块**：首次材料 21 项完整呈现在 8 大标准板块 + 补充材料分组中，数量统计完全一致（21/21）；
3. **关联文件**：点击 📎 弹窗展示真实文件列表（带子文件夹标签），点击文件立即成功关联并自动勾选，无“文件未入库”报错。

---

⚠️ **执行纪律**：
- 严格遵循五步门禁与改动范围表，严禁越界修改其他文件；
- 实施完成后不 commit，等待核对。
