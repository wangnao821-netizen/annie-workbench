# AI Studio 前端改造提示词：批次 P4（WO-56 新建案件全景重构 — 全新建档主入口与极简双通道）

## 你的角色
你是精通 React 19 + TypeScript + TailwindCSS + Lucide Icons 的前端专家，正在为 **Vera 工作台** 重构核心的新建案件流程（`NewCaseSheet`）。

---

## 改造目标
彻底精简与重构 `NewCaseSheet.tsx`，废除过去层层嵌套的混乱子模式与过时的“三种粒度”旧设计，呈现**极简、优雅的「双通道（Dual-Track）」新建视图**：

### 1. 双通道顶部切换（Segmented Control）
- **通道一（★ 默认激活 / 第一主入口）：全新客户 / 案件录入（Brand New Case）**
- **通道二（次级通道）：存量案卷批量迁移（Batch Legacy Migration）**

---

### 2. 通道一（全新录入）核心布局与交互
将录入分为 4 个清晰的卡片区段，快速录完核心 10 个字段：
1. **借款人基本信息 (Borrower Profile)**：
   - 客户姓名 (`client_name`, 必填)；
   - 身份状态 (`residency`: PR / Citizen / TR / 其它)；
   - 雇佣类型 (`employment_type`: 自雇 / PAYG / 公司 / 投资)；
   - 联系电话 / 邮箱（可选）。
2. **意向贷款方案 (Loan Structure)**：
   - 目标机构 (`lender`: 快捷选择 ORDE / CBA / Westpac / NAB / Latrobe 等)；
   - 贷款类型 (`loan_type`: Refinance / Purchase / Commercial / Construction)；
   - 方案类型 (`doc_type`: Alt Doc / Full Doc / Lite Doc / Low Doc)；
   - 预估借款金额 (`loan_amount`, $)；
   - 期望利率 (`interest_rate`, %) 与 LVR。
3. **抵押物业 (Security Property)**：
   - 物业地址 (`property_address`)；
   - 预估价值 (`property_value`, $)。
4. **📁 本地工作目录自动脚手架 (Directory Scaffolding)**：
   - 勾选「自动创建本地标准工作目录」（默认勾选）；
   - 根存放路径：选择父目录（如 `D:\EverStones_Clients`，提供浏览按钮并记住上次路径）；
   - 动态实时预览生成的目录路径：
     `📁 D:\EverStones_Clients\{客户名}\1. {类型} - {机构} - {地址}\`
     *(包含 Send to Lender, Approval, Valuation 等 11 个标准子文件夹)*；
5. **底栏操作**：
   - `[ 取消 ]` | `[ 立即创建并进入案件 ➔ ]`
   - 点击后调用建案接口（若开启自动建目录则联动调用 `POST /api/cases/scaffold`），成功后弹出 Toast 并直接定位进入新案件详情页！

---

### 3. 通道二（存量批量迁移）布局
- 直接嵌入已成熟的 `FolderTopologyScanner`；
- 选择客户根目录后，毫秒级呈现多房产案卷卡片；
- 支持单选主案或多选批量建档，一键完成拓扑、Broker Notes 画像、材料自动打勾与邮件时序。

---

## 接口契约参考

### 预创建/脚手架目录接口 (可选/联动)
`POST /api/cases/scaffold`
入参：
```typescript
interface CaseScaffoldRequest {
  parent_path: string;
  client_name: string;
  case_name?: string;
  create_subdirs?: boolean;
}
```
返回：
```typescript
interface CaseScaffoldResponse {
  ok: boolean;
  client_folder: string;
  case_folder: string;
  created_subdirs: string[];
  message?: string;
}
```

### 标准创建案件接口
`POST /api/cases`
入参：包含 `client_name`, `lender`, `loan_amount`, `property_address`, `folder_path` 等标准字段。

---

## 验收（AI Studio 侧）
1. `npx tsc --noEmit` 零错误；构建通过；
2. 打开「新建案件」弹窗，默认呈现清爽的「全新空白建案」表单；
3. 支持切换到「存量案卷批量迁移」并正常工作；
4. 全新建案支持自动创建本地目录脚手架并顺利完成建档跳转。
