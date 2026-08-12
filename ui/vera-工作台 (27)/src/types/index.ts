export type TaskType =
  | "EMAIL_DISPATCH"       // 邮件派单（已匹配，需分流）
  | "FILE_MATCH"           // 文件匹配清单（新文件到达）
  | "OS_ATTACK"            // OS 攻坚（银行 Outstanding 条件）
  | "BOSS_DECISION"        // 待老板拍板
  | "NEW_CLIENT"           // 新客户邮件（未匹配已有案件）
  | "OVERDUE_REMINDER"     // 催件超期提醒
  | "SETTLEMENT"           // 结算确认（案件已批准）
  | "GENERAL_EMAIL";       // 普通已匹配邮件

export type FilterId = "all" | "email" | "file" | "os" | "brandon" | "overdue";

export type TaskPriority = "urgent" | "high" | "normal" | "low";

export interface TaskTag {
  label: string;     // "🔥 紧急" | "✨ 新" | "⏳ 等待中" | "超期 7 天" | "🎉 获批"
  color: "red" | "accent" | "yellow" | "green" | "orange";
}

export interface QuickAction {
  label: string;     // "⚡ 进入 OS 攻坚" | "📋 复制微信话术"
  primary?: boolean; // 主操作用 accent 背景
  action: string;    // 动作标识符
}

export interface TaskItem {
  id: number;
  type: TaskType;
  title: string;
  subtitle: string;
  aiSummary?: string;           // AI 摘要（显示在卡片上）
  caseName?: string;            // 客户名
  caseId?: string;
  caseBank?: string;            // 银行
  loanAmount?: number;
  priority: TaskPriority;
  tags: TaskTag[];              // 标签列表
  quickActions: QuickAction[];  // 卡片上直接显示的快捷按钮
  filterCategory: FilterId;     // 用于筛选分类
  createdAt: string;            // 显示时间
  completed?: boolean;
  meta?: string;                // 匹配说明或元数据
  sourceChannel?: string;       // 来源渠道: "email" | "file" | "wechat" | "manual"
  deadline?: string | null;     // 截止时间 ISO 字符串（无则 null）
  delegatedTo?: string | null;  // 委派对象（无则 null）
  sourceMsgId?: string | null;  // 关联邮件 ID（静音/分析用）
  matchStatus?: string | null;  // 确证状态 e.g. "confirmed"
}

export interface ChecklistItemType {
  id: string;
  label: string;
  category: "required" | "ai_suggested" | "optional";
  checked: boolean;
  reason?: string;
  fileMatched?: string;
}

export interface FileMatchResult {
  id: string;
  filename: string;
  status: "matched" | "unmatched" | "discrepancy";
  targetChecklistLabel?: string;
  extractedInfo?: string;
  aiSuggestion?: string;
  aiConfidence?: number;
  discrepancyText?: string;
}
