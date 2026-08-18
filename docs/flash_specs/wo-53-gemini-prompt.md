# AI Studio 前端改造提示词：批次 P1（WO-53 客户目录多案卷智能识别与导入）

## 你的角色
你是精通 React 19 + TypeScript + TailwindCSS 的前端专家，正在为 **Vera 工作台** 升级存量客户导入组件。

---

## 改造目标
当用户在“存量导入”中选择一个客户根目录（例如包含多个历史轮次或多个房产的文件夹）时：
1. 调用最新后端 API `POST /api/cases/folder-topology/scan`；
2. 弹窗顶部突出显示识别出的 **客户主体姓名（如 `Yingkun CHEN`）** 与扫描到的案卷总数；
3. 列表区域按 **房产地址（Property Address）** 分组展示所有识别到的案卷卡片：
   - 展现案卷序号（如 `8.`）、机构徽章（如 `ORDE` / `Zank Financial`）、方案标签（如 `Alt Doc` / `Lite Doc`）；
   - 展现案件状态标签：
     - 🟢 **活跃推荐**（`is_recommended_active: true`）——默认高亮并默认勾选；
     - 🟡 **暂停中**（`status: 'onhold'`）——显示黄色警示标签及原因（如 `估价过低阻断，复议中`）；
     - ⚪ **已撤回**（`status: 'withdrawn'`）——灰度展示。
   - 展现 Broker Notes 识别状态（如 `✓ 已识别 Broker Notes (可自动预填画像)`）。
4. 底部支持：
   - 「导入选中案卷（支持单选或批量多选）」➔ 调用 `POST /api/cases/topology-import/batch`；
   - 导入成功后自动刷新案件列表，并跳转到最新创建的活跃案件详情页。

---

## 接口契约参考

### 1. 扫描拓扑接口
`POST /api/cases/folder-topology/scan`
入参：`{ folder_path: string }`
返回：
```typescript
interface CaseSubfolderMeta {
  dir_name: string;
  folder_path: string;
  sequence?: number;
  is_resub: boolean;
  loan_type: string;
  lender?: string;
  property_address?: string;
  doc_type?: string;
  status: 'active' | 'withdrawn' | 'onhold' | 'submitted';
  onhold_reason?: string;
  is_recommended_active: boolean;
  has_broker_notes: boolean;
  broker_notes_name?: string;
  file_count: number;
  prefilled: Record<string, any>;
  submitted_platforms: string[];
}

interface FolderTopologyScanResponse {
  ok: boolean;
  message?: string;
  client_name?: string;
  client_root?: string;
  cases: CaseSubfolderMeta[];
}
```

### 2. 批量导入建档接口
`POST /api/cases/topology-import/batch`
入参：
```typescript
interface BatchTopologyImportRequest {
  items: Array<{
    folder_path: string;
    client_name: string;
    lender?: string;
    loan_amount?: number;
    property_address?: string;
    stage?: string;
    is_imported?: boolean;
    platform_submissions?: string[];
  }>;
}
```

---

## 视觉与交互规范
1. **配色规范**：遵循已定稿的深色/浅色 Design Tokens（`--bg-card` / `--text-primary` / `--color-primary` / `--color-warning` 等），严禁硬编码随意颜色。
2. **操作流畅度**：选定文件夹后展示扫描 Loading Skeleton，解析完成后以平滑动画展开案卷卡片列表。
3. **零破坏性**：保持原有单案卷直接建档功能的兼容性。
