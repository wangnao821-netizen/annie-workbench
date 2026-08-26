# WO-80 新建客户文件夹强制校验 + 状态统一 + 直达 AI 聊天工作流 — 施工单

> **状态**：待执行
> **关联**：`NewCaseSheet.tsx`、`BrandNewCaseForm.tsx`、`WelcomeCard.tsx`、`AppShell.tsx`、WO-76（欢迎流）
> **目标**：① 新建客户时强制要求指定文件夹目录，未选则拦截阻断并标红提示；② 修复欢迎卡硬编码 fallback 假象，保证卡片、右栏、全景三处文件夹关联状态 100% 真实统一；③ 新建案件成功后直达主工作区（`view="brain"`, `rightDeckTab="checklist"`），即刻呈现中栏 AI 聊天与欢迎流 + 右栏材料清单台账。

---

## 一、技术约束与边界 (Tech Stack & Boundary)

- **前端**：TypeScript strict / React 18 / Vite / Lucide-react / Motion；
- **状态流转**：Zustand（`useCaseStore`、`useUiStore`）；
- **样式**：严格使用主题语义化 CSS 变量（`var(--bg-*)`、`var(--border)`、`var(--accent)`、`var(--green)`、`var(--red)` 等）；
- **无破坏性变更**：不影响既有批量拓扑扫描建案通道。

---

## 二、改动范围（严禁超出）

| 序号 | 文件路径 | 操作 | 说明 |
|---|---|---|---|
| 1 | `frontend/src/components/cases/NewCaseSheet.tsx` | 修改 | ① 提交前强校验 `parentPath`，未选则拦截并标红报错；② 建案成功后切换至 `view="brain"` 并置 `rightDeckTab="checklist"` |
| 2 | `frontend/src/components/cases/newCase/BrandNewCaseForm.tsx` | 修改 | 将文件夹目录标记为必填项（带 `*` 与错误高亮传导） |
| 3 | `frontend/src/components/cases/newCase/ScaffoldDirectoryPreview.tsx` | 修改 | 支持 `hasError` 边框标红态与必选标签提示 |
| 4 | `frontend/src/components/brain/WelcomeCard.tsx` | 修改 | 修复文件夹目录 fallback，无路径时真实显示“未关联”，有路径显示目录名 |
| 5 | `frontend/src/components/layout/AppShell.tsx` | 修改 | 支持 `open-case-brain` 自定义事件或统一导航，建案后直达 AI 聊天工作区 |

---

## 三、组件交互与状态契约定义 (Strict Contracts)

### 1. 表单校验契约 (`NewCaseSheet.tsx`)
```typescript
if (!formValues.clientName.trim()) {
  setFieldErrors({ clientName: true });
  showToast('error', '请填写借款人客户姓名');
  return;
}
if (!formValues.parentPath.trim()) {
  setFieldErrors({ parentPath: true });
  showToast('error', '请先选择或指定客户案卷文件夹目录');
  return;
}
```

### 2. 成功跳转契约 (`NewCaseSheet.tsx`)
```typescript
// 4. 同步至 Store 与界面
useUiStore.getState().setWelcomeCaseId(mappedCase.caseId);
useUiStore.getState().setRightDeckTab('checklist');
setCurrentCase(mappedCase);
await fetchCases();
onCreated(mappedCase);

// 5. 立即广播跳转事件直达主工作区（中栏 AI 聊天 + 右栏清单台账）
window.dispatchEvent(
  new CustomEvent('open-case-brain', { detail: mappedCase.caseId })
);
```

### 3. 欢迎卡文件夹状态真实显示 (`WelcomeCard.tsx`)
```typescript
{caseInfo?.folderPath ? (
  <p className="font-mono text-[11px] truncate font-bold text-[var(--green)]" title={caseInfo.folderPath}>
    📁 {caseInfo.folderPath.split(/[\\/]/).filter(Boolean).pop() || caseInfo.folderPath}
  </p>
) : (
  <p className="font-bold text-xs text-[var(--amber)]">未关联 ⚠️</p>
)}
```

---

## 四、原子化实施步骤 (Atomic Task Checklist)

- [ ] **Step 1**：修改 `ScaffoldDirectoryPreview.tsx` 与 `BrandNewCaseForm.tsx`，支持必填星号与错误态高亮；
- [ ] **Step 2**：修改 `NewCaseSheet.tsx`，增加 `parentPath` 必填校验拦截，阻断空路径提交；
- [ ] **Step 3**：修改 `NewCaseSheet.tsx` 与 `AppShell.tsx`，将建案成功后的跳转由 `open-case-detail` 改为 `open-case-brain`（直达中栏 AI 聊天与右栏材料清单）；
- [ ] **Step 4**：修改 `WelcomeCard.tsx`，修复硬编码 `'已关联'` fallback，确保状态与真实路径 100% 同步；
- [ ] **Step 5**：前端类型检查与构建编译（`npx tsc --noEmit` + `npm run build`）。

---

## 五、验收标准

1. **新建客户表单**：不选文件夹直接点击确认时，系统明确标红提示并弹出 Toast，阻止空路径建案；
2. **状态一致性**：选定文件夹建案后，欢迎卡、右栏文件面板、全景概览三处均一致展示真实关联的目录名称（无空路径假象）；
3. **直达 AI 工作流**：新建案件点击确认后，立即平滑进入中栏 Annie AI 聊天界面（顶部展示欢迎流与推荐材料预览，右栏展开材料清单台账）。
