# WO-79 清单全集勾选定制弹窗 + 邮件预览微调核对 + 草稿箱详情打通 — 施工单

> **状态**：待执行
> **关联**：[新建客户AI协同体验规划.md](../新建客户AI协同体验规划.md) §三 模块 A/B 与 §五b；WO-75（PA 邮件引擎）；WO-76（欢迎卡）；WO-78（8 大板块台账）；`DraftsBox.tsx`
> **目标**：① 欢迎卡与右栏分工纯粹化：新增 8 大板块 21 项全集勾选定制弹窗（ChecklistAdjustModal），右栏只看已选定项；② 生成邮件草稿改为「弹窗核对微调 → 一键复制 / 确认保存至草稿箱」（PreliminaryEmailModal）；③ 修复草稿箱无法点击打开查看草稿详情的问题。

---

## 一、技术约束与边界 (Tech Stack & Boundary)

- **前端**：TypeScript strict / React 18 / Vite / Lucide-react / Motion；
- **后端**：Python 3.11+ / FastAPI / SQLAlchemy 2.x；
- **样式**：严格使用项目主题 CSS 变量（`var(--bg-card)`、`var(--border)`、`var(--accent)`、`var(--green)`、`var(--text-primary)` 等），禁止硬编码颜色；
- **无新依赖**：严禁引入任何新的 npm / pip 依赖；
- **红线**：只生成草稿或剪贴板复制，绝不自动对外发送邮件。

---

## 二、改动范围（严禁超出）

| 序号 | 文件路径 | 操作 | 说明 |
|---|---|---|---|
| 1 | `frontend/src/components/brain/ChecklistAdjustModal.tsx` | **新建** | 8 大板块 21 项全集勾选定制弹窗（按画像智能预选、支持自由勾选、确定后批量更新生效） |
| 2 | `frontend/src/components/brain/PreliminaryEmailModal.tsx` | **新建** | 邮件预览微调弹窗（显示 To/Cc/Subject/正文、支持在线编辑、一键复制、确认保存草稿箱） |
| 3 | `frontend/src/components/brain/WelcomeCard.tsx` | 修改 | ① 修复板块中文标签统计；② 点击「调整清单」打开 `ChecklistAdjustModal`；③ 点击「生成邮件」打开 `PreliminaryEmailModal` |
| 4 | `frontend/src/components/brain/ChecklistDeck.tsx` | 修改 | 点击「生成邮件」同样呼出 `PreliminaryEmailModal` |
| 5 | `frontend/src/components/panel/DraftDetailModal.tsx` | **新建** | 草稿箱草稿详情查看弹窗（显示主题、收发件人、版本、正文、一键复制） |
| 6 | `frontend/src/pages/DraftsBox.tsx` | 修改 | 为草稿卡片加上 `onClick` 点击事件，呼起 `DraftDetailModal` |
| 7 | `server/api/drafts.py` | 修改 | 新增 `GET /api/drafts/item/{draft_id}` 端点（支持直接按草稿 ID 查询完整内容） |
| 8 | `frontend/src/services/api/drafts.ts` | 修改 | 新增 `getDraftById(draftId: number)` 前端接口方法 |
| 9 | `tests/test_api/test_drafts_query.py` | **新建** | 测试 `GET /api/drafts/item/{draft_id}` 及草稿箱打通 |

---

## 三、接口与组件契约定义 (Strict Contracts)

### 1. 后端端点：`GET /api/drafts/item/{draft_id}`

```python
@router.get("/item/{draft_id}", response_model=DraftResponse)
def get_draft_by_id(
    draft_id: int,
    db: Session = Depends(get_db),
) -> DraftResponse:
    """按草稿主键 ID 获取草稿详情。"""
    draft = db.query(EmailDraft).filter(EmailDraft.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail=f"草稿 {draft_id} 不存在")
    return _to_draft(draft)
```

### 2. 前端组件：`ChecklistAdjustModal.tsx`

```typescript
interface ChecklistAdjustModalProps {
  caseId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}
```
- 展示 8 大标准板块全集 21 项（ID 3项、Income 8项、Employment 1项、Living Expense 1项、Liability 3项、Living History 1项、Asset 7项、Solicitor 1项）；
- 已在当前案件清单中的项默认打勾；
- 支持全选本板块、一键推荐（按画像）、取消勾选；
- 点击「确认保存清单」：同步增删当前案件 initial 清单项，保存后触发 `checklist_updated` 并通知右栏刷新。

### 3. 前端组件：`PreliminaryEmailModal.tsx`

```typescript
interface PreliminaryEmailModalProps {
  caseId: string;
  isOpen: boolean;
  onClose: () => void;
}
```
- 打开时实时加载当前案件画像与当前已勾选清单，生成 Preliminary Assessment 邮件预览内容；
- 允许编辑 `To`、`Cc`、`Subject`、`body_text`；
- 底部操作：
  - `📋 一键复制全文`（带格式复制至剪贴板）；
  - `💾 存入草稿箱`（调用 `/api/drafts` 或 WO-75 端点落库）。

---

## 四、原子化实施步骤 (Atomic Task Checklist)

### Step 1：后端按 draft_id 查询端点与测试
- [ ] 在 `server/api/drafts.py` 新增 `GET /api/drafts/item/{draft_id}`；
- [ ] 在 `frontend/src/services/api/drafts.ts` 新增 `getDraftById`；
- [ ] 新建 `tests/test_api/test_drafts_query.py` 测试；
- [ ] 验证：`uv run pytest tests/test_api/test_drafts_query.py -v`。

### Step 2：草稿箱详情查看弹窗（DraftDetailModal）
- [ ] 新建 `frontend/src/components/panel/DraftDetailModal.tsx`；
- [ ] 修改 `frontend/src/pages/DraftsBox.tsx`，点击卡片即打开详情弹窗，展示完整正文并支持复制与确认；
- [ ] 验证：`cd frontend && npx tsc --noEmit`。

### Step 3：8 大板块清单全集勾选定制弹窗（ChecklistAdjustModal）
- [ ] 新建 `frontend/src/components/brain/ChecklistAdjustModal.tsx`；
- [ ] 支持 8 大板块、21 项全集复选框勾选/去勾，支持「智能推荐勾选」与「确认生效」；
- [ ] 验证：`cd frontend && npx tsc --noEmit`。

### Step 4：邮件预览微调与核对弹窗（PreliminaryEmailModal）
- [ ] 新建 `frontend/src/components/brain/PreliminaryEmailModal.tsx`；
- [ ] 支持在线微调编辑、一键复制到剪贴板、确认存入草稿箱；
- [ ] 验证：`cd frontend && npx tsc --noEmit`。

### Step 5：欢迎卡与右栏联动升级
- [ ] 修改 `frontend/src/components/brain/WelcomeCard.tsx`：
  - 修复板块预览中文标签（如 `身份证明 2`、`收入 3` 等）；
  - 点击「调整清单」打开 `ChecklistAdjustModal`；
  - 点击「生成邮件草稿」打开 `PreliminaryEmailModal`；
- [ ] 修改 `frontend/src/components/brain/ChecklistDeck.tsx`：
  - 点击「生成邮件」打开 `PreliminaryEmailModal`；
- [ ] 验证：`cd frontend && npx tsc --noEmit` + `npm run build`。

### Step 6：全量回归与门禁验收
- [ ] 后端全量测试：`uv run pytest tests/ -q` 0 failed；
- [ ] 静态代码检查：`uv run ruff check server/ tests/` 0 error；
- [ ] 前端类型与构建：`cd frontend && npx tsc --noEmit` + `npm run build` 0 error。

---

## 五、验收标准

1. **欢迎卡**：板块标签全部显示为优雅的中文分类与条数（如 `身份证明 2`、`收入 3`）；
2. **调整清单**：点击「调整清单」弹出 8 大板块 21 项勾选弹窗，可自由勾选/去勾，确认后右栏清单只保留已勾选的项；
3. **生成邮件**：点击「生成邮件」弹出微调核对框，支持在线修改、一键复制、确认存入草稿箱；
4. **草稿箱**：草稿箱列表点击任一草稿，均能流畅打开查看详情与正文。
