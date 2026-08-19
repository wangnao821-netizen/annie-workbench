# AI Studio 前端改造提示词：批次 P5（WO-57 档案中心批量归档历史案卷与放款事实呈现）

## 你的角色
你是精通 React 19 + TypeScript + TailwindCSS + Lucide Icons 的前端专家，正在为 **Vera 工作台** 升级「档案库 / 档案中心（Archive Hub）」。

---

## 改造目标
在档案中心界面（`src/components/archive/` 或相关视图）中：
1. **顶部操作栏增加「批量导入历史客户案卷」按钮**：
   - 按钮带 `FolderArchive` 或 `HardDriveDownload` 图标，点击后弹出 `ArchiveBatchImportModal.tsx`；
2. **`ArchiveBatchImportModal.tsx` 交互设计**：
   - **选择历史客户目录**：
     - 点击「浏览目录」直接调起系统原生选择器（如选择 `D:\EverStones_Historical_Clients` 或特定客户目录）；
     - 提供快速测试按钮 `[ ⚡ 载入测试历史客户 ]`；
   - **智能准入与放款事实卡片流**：
     - 扫描后调用 `POST /api/archive/scan`；
     - 呈现各案卷卡片，清晰展示：
       - 客户姓名、物业地址、贷款银行与金额；
       - **放款事实标签**：`📅 放款交割日: 2024-05-12`、`🏷️ 利率: 6.09% (Fixed)`；
     - **严格防冲突准入过滤提示**：
       - 若案卷被标记 `in_workbench === true`，卡片打上黄橙色警告标 `[⚠️ 当前正在工作台推进中·已自动过滤]`，且不可勾选；
       - 若案卷被标记 `already_archived === true`，打上灰标 `[已在档案库]`;
       - 仅对符合资格的已结案案卷（`eligible === true`）默认高亮并提供勾选；
   - **底栏操作**：
     - `[ 取消 ]` | `[ 立即归档选中案卷 (X) ➔ ]`
     - 点击后调用 `POST /api/archive/batch-import`，批量入库成功后弹出 Toast 提示并自动刷新档案列表！
3. **视觉与交互规范**：
   - 统一遵循 Design Tokens 与 Glassmorphism 现代风格；
   - 保持所有既有档案列表视图正常可用。

---

## 接口契约参考

### 扫描历史案卷
`POST /api/archive/scan`
入参：`{ folder_path: string }`
返回：
```typescript
interface ArchiveCaseItem {
  dir_name: string;
  folder_path: string;
  client_name: string;
  lender?: string;
  loan_amount?: number;
  property_address?: string;
  settlement_date?: string;
  interest_rate?: string;
  status: string; // settled / withdrawn
  eligible: boolean;
  in_workbench: boolean;
  already_archived: boolean;
  filter_reason?: string;
  file_count: number;
}

interface ArchiveScanResponse {
  ok: boolean;
  message?: string;
  client_name?: string;
  total_found: number;
  eligible_count: number;
  cases: ArchiveCaseItem[];
}
```

### 批量归档入库
`POST /api/archive/batch-import`
入参：
```typescript
interface ArchiveBatchImportItem {
  folder_path: string;
  client_name: string;
  lender?: string;
  loan_amount?: number;
  property_address?: string;
  settlement_date?: string;
  interest_rate?: string;
  status: string;
}

interface ArchiveBatchImportRequest {
  items: ArchiveBatchImportItem[];
}
```
返回：
```typescript
interface ArchiveBatchImportResponse {
  ok: boolean;
  imported_count: number;
  created_cases: Array<{ case_id: string; client_name: string; folder_path: string }>;
}
```

---

## 验收（AI Studio 侧）
1. `npx tsc --noEmit` 零错误；构建通过；
2. 档案中心能打开「批量导入历史客户案卷」弹窗；
3. 支持选择本地历史客户目录，清晰展示已放款事实，并准确拦截在办案卷（防冲突）；
4. 批量归档后档案列表流畅更新。
