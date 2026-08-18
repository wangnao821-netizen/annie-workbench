# AI Studio 前端改造提示词：批次 P3（WO-55 案件动态时间线面板与审批官/卡点状态全景呈现）

## 你的角色
你是精通 React 19 + TypeScript + TailwindCSS + Lucide Icons 的前端专家，正在为 **Vera 工作台** 打造高级案件动态时间线与概览卡点呈现组件。

---

## 改造目标
在案件详情页（`CaseDetail` / `CaseOverview` / 右侧/底部面板）中：
1. **案件概览头部增强（`CaseOverview`）**：
   - 当案件存在审批官时，在 Lender 旁边以精致徽标展示：`👤 信贷审批官: Rachel Fonseka`；
   - 当案件存在银行案号时展示：`🏷️ 案号: 23174 (EX 11199)`；
   - 当案件存在活跃卡点（`active_blocker`，如估价过低阻断）时，在概览顶部展示醒目警告横幅：`⚠️ 案件暂停/阻断中：估价过低 ($1.90M vs 期望 $2.30M)，复议中`。
2. **新增「案件沟通与时序脉络（Case Timeline）」面板**：
   - 新建 `CaseTimelinePanel.tsx`，以垂直时间轴展示往来邮件与里程碑事件流；
   - 每个时间节点展示：
     - 时间戳（格式化为本地易读时间）；
     - 事件类型图标（递交 📤、审批官指派 👤、补件 ⚠️、估价阻断 🛑、申诉复议 🔄、批复 🎉）；
     - 邮件主题、发件人及正文摘要；
     - 来源文件名（如 `17.04.2026 Submission.msg`）；
   - 工具栏提供「重新扫描提取邮件」按钮（点击调用 `POST /api/cases/{case_id}/timeline/extract-emails`），带 Spinning 加载动画与 Toast 提示。
3. **视觉与交互规范**：
   - 采用精致的 Glassmorphism / Dark Mode 视觉，时间线节点连接线平滑优雅；
   - 保持所有既有 Tab 和交互完好无损。

---

## 接口契约参考

### 获取案件时间线
`GET /api/cases/{case_id}/timeline`
返回：
```typescript
interface TimelineEventItem {
  id?: string;
  event_time: string;
  event_type: string; // submission_lodged / assessor_assigned / mir_requested / valuation_shortfall / reassessment_submitted / approval_issued / note
  title: string;
  summary: string;
  sender?: string;
  assessor?: string;
  lender_ref?: string;
  source_file?: string;
  is_blocker: boolean;
  blocker_reason?: string;
}

interface CaseTimelineResponse {
  ok: boolean;
  case_id: string;
  assessor_name?: string;
  lender_ref?: string;
  active_blocker?: string;
  events: TimelineEventItem[];
}
```

### 重新扫描邮件时间线
`POST /api/cases/{case_id}/timeline/extract-emails`
返回：
```typescript
interface TimelineExtractResponse {
  ok: boolean;
  case_id: string;
  extracted_count: number;
  assessor_name?: string;
  lender_ref?: string;
  active_blocker?: string;
}
```

---

## 验收（AI Studio 侧）
1. `npx tsc --noEmit` 零错误；构建通过；
2. 案件详情页顶部能清晰看到审批官、案号及卡点横幅；
3. 动态时间线面板能完整渲染邮件流转脉络，支持一键刷新。
