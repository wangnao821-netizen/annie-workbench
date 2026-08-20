import { TaskResponse } from '../types/api';
import { TaskItem, TaskTag, QuickAction, FilterId, TaskType, TaskPriority } from '../types';

function formatRelativeTime(isoStr: string): string {
  if (!isoStr) return '';
  const date = new Date(isoStr);
  if (isNaN(date.getTime())) return isoStr;
  
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return '刚刚';
  
  const diffMin = Math.floor(diffMs / (1000 * 60));
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} 天前`;
  
  return date.toLocaleDateString('zh-CN');
}

export function mapTaskResponse(t: TaskResponse): TaskItem {
  const taskType = t.type as TaskType;
  const taskPriority = (t.priority || 'normal') as TaskPriority;

  // Derive filterCategory
  let filterCategory: FilterId = 'email';
  if (t.escalated_to_boss || taskType === 'BOSS_DECISION') {
    filterCategory = 'brandon';
  } else if (['EMAIL_DISPATCH', 'GENERAL_EMAIL', 'NEW_CLIENT'].includes(taskType)) {
    filterCategory = 'email';
  } else if (['FILE_MATCH', 'SETTLEMENT'].includes(taskType)) {
    filterCategory = 'file';
  } else if (taskType === 'OS_ATTACK') {
    filterCategory = 'os';
  } else if (taskType === 'OVERDUE_REMINDER') {
    filterCategory = 'overdue';
  }

  // Derive subtitle
  const bankAndId = [t.case_bank, t.case_id].filter(Boolean).join(' · ');
  const subtitle = bankAndId || t.case_name || '';

  // Derive tags
  const tags: TaskTag[] = [];
  if (taskPriority === 'urgent') {
    tags.push({ label: '🔥 紧急', color: 'red' });
  } else if (taskPriority === 'high') {
    tags.push({ label: '✨ 高优先', color: 'orange' });
  }
  if (t.delegated_to) {
    tags.push({ label: '👤 已委派', color: 'yellow' });
  }

  // Derive quickActions
  let quickActions: QuickAction[] = [];
  if (taskType === 'OS_ATTACK') {
    quickActions = [
      { label: '⚡ 进入 OS 攻坚', primary: true, action: 'enter_os' },
      { label: '⏭ 稍后', action: 'snooze' },
    ];
  } else if (taskType === 'BOSS_DECISION') {
    quickActions = [
      { label: '📋 复制微信话术', action: 'copy_wechat' },
      { label: '✅ 记录老板回复', action: 'record_reply' },
    ];
  } else if (taskType === 'NEW_CLIENT') {
    quickActions = [
      { label: '🆕 建案并归入', primary: true, action: 'create_case' },
      { label: '🔗 关联已有', action: 'link_case' },
      { label: '🔇 忽略', action: 'ignore' },
    ];
  } else if (taskType === 'SETTLEMENT') {
    quickActions = [
      { label: '📋 结算前自查', action: 'settlement_check' },
      { label: '📧 通知客户', action: 'notify_client' },
    ];
  }

  return {
    id: t.id,
    type: taskType,
    title: t.title,
    subtitle,
    aiSummary: t.suggested_action,
    caseName: t.case_name,
    caseId: t.case_id,
    caseBank: t.case_bank,
    loanAmount: t.loan_amount,
    priority: taskPriority,
    tags,
    quickActions,
    filterCategory,
    createdAt: formatRelativeTime(t.created_at),
    completed: false,
    meta: t.source_channel ? `来源: ${t.source_channel}` : undefined,
    sourceChannel: t.source_channel,
    deadline: t.deadline,
    delegatedTo: t.delegated_to,
    sourceMsgId: t.source_msg_id,
    matchStatus: t.match_status,
    escalatedToBoss: t.escalated_to_boss ?? false,
    bossDecision: t.boss_decision ?? null,
    status: t.status || (t.delegated_to === 'vera' ? 'in_progress' : undefined),
    assignee: t.assignee || t.delegated_to || null,
  };
}

export function isTaskResponse(data: unknown): data is TaskResponse {
  if (typeof data !== 'object' || data === null) return false;
  const t = data as Record<string, unknown>;
  return typeof t.id === 'number' && typeof t.title === 'string' && typeof t.type === 'string';
}
