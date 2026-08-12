export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';

export type TaskStatus = 'pending' | 'completed' | 'in_progress';

export interface TaskItem {
  id: string;
  caseId: string;
  clientName: string;
  bankName: string;
  title: string;
  priority: TaskPriority;
  dueDate: string; // YYYY-MM-DD
  overdueDays?: number;
  status: TaskStatus;
  isAiSuggested?: boolean;
  category?: 'document' | 'bank_reply' | 'client_contact' | 'settlement';
  description?: string;
}

export type CaseStage = 
  | 'consultation'   // 咨询评估
  | 'docs_collect'   // 材料收集
  | 'submission'     // 银行递交
  | 'approval'       // 预批/批复
  | 'settlement';    // 结算割接

export interface MortgageCase {
  id: string;
  clientName: string;
  bankName: string;
  loanAmount: number;
  stage: CaseStage;
  statusText: string;
  urgency: 'high' | 'medium' | 'normal';
  lastUpdated: string;
  propertyType: string;
  loanType: string;
  interestRate?: string;
  ltv?: string;
  clientEmail?: string;
  clientPhone?: string;
  keyNotes?: string[];
  documents?: {
    id: string;
    name: string;
    status: 'uploaded' | 'pending' | 'verified' | 'rejected';
    updatedAt: string;
  }[];
  timeline?: {
    date: string;
    title: string;
    desc: string;
    type: 'system' | 'bank' | 'client' | 'ai';
  }[];
}

export interface AnalyticsOverview {
  activeCases: number;
  newCasesThisMonth: number;
  submittedCases: number;
  expectedCommission: string;
  summaryNote: string;
  overdueCount: number;
  dueTodayCount: number;
  pendingBankReplies: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'vera' | 'system';
  content: string;
  timestamp: string;
  caseId?: string;
  suggestions?: string[];
  actionItems?: {
    label: string;
    action: string;
  }[];
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'urgent' | 'info' | 'success';
  caseId?: string;
  read: boolean;
}

export type ActiveView = 
  | 'home'
  | 'tasks'
  | 'kanban'
  | 'analytics'
  | 'settings'
  | 'case_detail'
  | 'drafts'
  | 'archive'
  | 'import_history'
  | 'migration';
