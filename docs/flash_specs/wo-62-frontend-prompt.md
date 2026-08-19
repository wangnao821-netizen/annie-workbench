# 前端开发任务提示词：WO-62 存量案卷拓扑导入参数贯通与界面体验修复

请作为前端资深开发工程师，严格按照 `docs/flash_specs/wo-62-legacy-topology-import-repair.md` 规范修改前端代码。

## 核心任务

1. **更新 TypeScript 类型定义**：
   - 文件：`ui/vera-工作台 (96)/src/types/api.ts`
   - 在 `BatchTopologyImportItem` 接口中追加缺失字段：
     ```typescript
     export interface BatchTopologyImportItem {
       folder_path: string;
       client_name: string;
       lender?: string;
       loan_amount?: number;
       property_address?: string;
       stage?: string;
       is_imported?: boolean;
       platform_submissions?: string[];
       // ── 新增字段 ──
       client_phone?: string;
       client_email?: string;
       employment_type?: string;
       residency?: string;
       property_value?: number;
       interest_rate?: number;
       doc_type?: string;
       loan_type?: string;
       onhold_reason?: string;
     }
     ```

2. **完善批量导入参数组装**：
   - 文件：`ui/vera-工作台 (96)/src/components/cases/FolderTopologyScanner.tsx`
   - 定位至 `handleBatchImport` 函数；
   - 在 `selectedCases.map((c) => ({ ... }))` 中，将 `c.prefilled` 提取的电话、邮箱、自雇/PAYG、居留身份、物业估值以及案卷级方案类型（`doc_type`）、用途（`loan_type`）、卡点原因（`onhold_reason`）完整映射至 `importItems`。

## 纪律红线
- 严禁修改 `types/api.ts` 和 `FolderTopologyScanner.tsx` 以外的文件；
- 严禁更改既有的样式系统与交互动效；
- 提交前确保 TypeScript 类型检查通过（`npm run build` 或 `tsc --noEmit` 零报错）。
