# AI Studio 前端改造提示词：批次 P2（WO-54 材料清单标题智能匹配打勾与文件溯源）

## 你的角色
你是精通 React 19 + TypeScript + TailwindCSS 的前端专家，正在为 **Vera 工作台** 升级材料清单（Checklist）交互组件。

---

## 改造目标
在案件详情页的材料清单面板（`CaseChecklist`）中：
1. **已匹配文件溯源展示**：
   - 当清单项 `status === 'received'` 且拥有关联文件（`received_file_id` 或 `received_file_ids`）时，在材料名称下方以精致胶囊徽标展示已匹配的文件名（如 `✓ 已自动关联: ID DL.pdf`）；
   - 鼠标悬停显示完整文件名，点击该徽标可调用现有文件预览或打开能力；
2. **新增「重新匹配本地材料」操作按钮**：
   - 在材料清单面板工具栏右侧增加一个「重新匹配本地材料」按钮（带 `RefreshCw` 或 `Sparkles` 图标）；
   - 点击后调用后端最新 API `POST /api/cases/{case_id}/checklist/match-files`；
   - 匹配过程中展示加载状态（Spinning）；
   - 匹配完成后弹出 Toast 提示（如 `成功匹配并自动勾选 8 项材料！`），并自动刷新清单数据与收集进度条（`gathering_progress`）。
3. **视觉与交互规范**：
   - 遵循已定稿的 Design Tokens；
   - 保持清单项手动勾选/取消勾选等既有交互完好无损。

---

## 接口契约参考

### 重新匹配文件接口
`POST /api/cases/{case_id}/checklist/match-files`
入参：无
返回：
```typescript
interface ChecklistMatchedFileDetail {
  checklist_id: number;
  item_name: string;
  master_id?: string;
  status: string;
  matched_file_id: string;
  matched_file_name: string;
}

interface ChecklistMatchFilesResponse {
  ok: boolean;
  case_id: string;
  matched_count: number;
  gathering_progress: number;
  matched_details: ChecklistMatchedFileDetail[];
}
```

---

## 验收（AI Studio 侧）
1. `npx tsc --noEmit` 零错误；构建通过；
2. 清单面板中清晰显示已匹配文件胶囊；
3. 点击「重新匹配本地材料」能成功调起接口并平滑更新清单状态与进度条。
