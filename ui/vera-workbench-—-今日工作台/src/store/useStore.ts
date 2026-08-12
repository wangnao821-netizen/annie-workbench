import { useSyncExternalStore, useRef, useCallback } from 'react';
import { 
  ActiveView, 
  AnalyticsOverview, 
  AppNotification, 
  ChatMessage, 
  MortgageCase, 
  TaskItem 
} from '../types';

// Mock Initial Cases
const INITIAL_CASES: MortgageCase[] = [
  {
    id: 'CASE-001',
    clientName: 'PERSON_1',
    bankName: 'CBA',
    loanAmount: 850000,
    stage: 'submission',
    statusText: '等待补件审理',
    urgency: 'high',
    lastUpdated: '10 分钟前',
    propertyType: '自住房 (House)',
    loanType: '浮动利率 + 冲抵账户',
    interestRate: '6.14% p.a.',
    ltv: '80%',
    clientEmail: 'person_1@example.com',
    clientPhone: '+61 412 *** 888',
    keyNotes: [
      '客户已提供最新 3 个月 Paystub',
      'CBA 审理员请求补充 HECS 贷款余额结清凭证',
      '评估报告 (Valuation) 已由 CBA 完成，估值 $1,100,000'
    ],
    documents: [
      { id: 'doc-1', name: 'Payslip_2026_07.pdf', status: 'verified', updatedAt: '2026-08-10' },
      { id: 'doc-2', name: 'PAYG_Summary_2025.pdf', status: 'verified', updatedAt: '2026-08-10' },
      { id: 'doc-3', name: 'HECS_Statement.pdf', status: 'pending', updatedAt: '2026-08-12' }
    ],
    timeline: [
      { date: '2026-08-12 10:15', title: 'CBA 银行反馈', desc: '要求补充 HECS 贷款结清证明', type: 'bank' },
      { date: '2026-08-11 14:20', title: '评估报告完成', desc: 'Property Valuation: $1,100,000 (Pass)', type: 'system' },
      { date: '2026-08-10 09:00', title: '案件预递交', desc: '预评系统自动校验收入覆盖率 1.35x', type: 'ai' }
    ]
  },
  {
    id: 'CASE-002',
    clientName: 'Sarah Zhang',
    bankName: 'Westpac',
    loanAmount: 1200000,
    stage: 'approval',
    statusText: '预批已通过 (Pre-approval Active)',
    urgency: 'medium',
    lastUpdated: '1 小时前',
    propertyType: '投资房 (Apartment)',
    loanType: '2年固定利率 5.89%',
    interestRate: '5.89% p.a.',
    ltv: '75%',
    clientEmail: 'sarah.z@example.com',
    clientPhone: '+61 433 *** 777',
    keyNotes: [
      '预批额度 $1.2M 已生效，有效期至 2026-11-15',
      '客户本周六参加拍卖，需准备预批信件副本',
      '准备下轮正式出价后的 Valuation 锁定'
    ],
    documents: [
      { id: 'doc-201', name: 'Tax_Return_2025.pdf', status: 'verified', updatedAt: '2026-08-01' },
      { id: 'doc-202', name: 'Westpac_PreApproval_Letter.pdf', status: 'verified', updatedAt: '2026-08-05' }
    ],
    timeline: [
      { date: '2026-08-05 16:00', title: 'Westpac 预批通过', desc: '核发 Pre-approval Offer Letter', type: 'bank' }
    ]
  },
  {
    id: 'CASE-003',
    clientName: 'Michael Chen',
    bankName: 'ANZ',
    loanAmount: 620000,
    stage: 'docs_collect',
    statusText: '补集自雇财务报表',
    urgency: 'high',
    lastUpdated: '今天 09:30',
    propertyType: '联排别墅 (Townhouse)',
    loanType: '本息同还 (P&I)',
    interestRate: '6.09% p.a.',
    ltv: '85%',
    clientEmail: 'm.chen@example.com',
    clientPhone: '+61 401 *** 666',
    keyNotes: [
      '自雇人士 (Self-Employed) 2024 & 2025 年会计师声明',
      'ANZ 审批人确认需要公司 2 年 BAS 季度报表'
    ],
    documents: [
      { id: 'doc-301', name: 'CPA_Letter_Draft.docx', status: 'pending', updatedAt: '2026-08-11' }
    ],
    timeline: [
      { date: '2026-08-11 11:00', title: 'Vera AI 提醒', desc: '检测到自雇资料缺少 2025 Q4 BAS 报表', type: 'ai' }
    ]
  },
  {
    id: 'CASE-004',
    clientName: 'PERSON_2',
    bankName: 'NAB',
    loanAmount: 950000,
    stage: 'settlement',
    statusText: '准备割接结清 (Settlement Ready)',
    urgency: 'medium',
    lastUpdated: '昨天',
    propertyType: '独栋大宅 (House)',
    loanType: '转贷 (Refinance) + 现金回扣',
    interestRate: '5.99% p.a.',
    ltv: '70%',
    clientEmail: 'person_2@example.com',
    keyNotes: [
      'NAB 确认卡扣账号与授权书已签署完毕',
      '预约 2026-08-18 进行 PEXA 电子割接',
      '佣金计算估计: $5,700 (Upfront)'
    ],
    documents: [
      { id: 'doc-401', name: 'NAB_Mortgage_Contract_Signed.pdf', status: 'verified', updatedAt: '2026-08-08' }
    ],
    timeline: [
      { date: '2026-08-08 15:30', title: '电子签署完成', desc: '客户已完成 DocuSign 合同签署', type: 'client' }
    ]
  },
  {
    id: 'CASE-005',
    clientName: 'David & Emma Taylor',
    bankName: 'Macquarie',
    loanAmount: 1450000,
    stage: 'consultation',
    statusText: '初审方案制定中',
    urgency: 'normal',
    lastUpdated: '2 天前',
    propertyType: '豪华公寓 (Luxury Unit)',
    loanType: '仅还利息 (IO) 3年',
    interestRate: '6.25% p.a.',
    ltv: '80%',
    keyNotes: [
      '双职工高收入，拟做 Macquarie 快速通道 (Fast-Track)',
      '已发送贷款方案比较表至客户邮箱'
    ],
    documents: [],
    timeline: [
      { date: '2026-08-09 10:00', title: '首次咨询完成', desc: '生成试算比较表与借贷额度上限模型', type: 'ai' }
    ]
  }
];

// Mock Aggregate Tasks
const INITIAL_TASKS: TaskItem[] = [
  {
    id: 'TASK-101',
    caseId: 'CASE-001',
    clientName: 'PERSON_1',
    bankName: 'CBA',
    title: '催请客户提交 HECS 贷款结清凭证与流水记录',
    priority: 'urgent',
    dueDate: '2026-08-10', // Overdue
    overdueDays: 2,
    status: 'pending',
    isAiSuggested: true,
    category: 'document',
    description: 'CBA 审批员明确此项为 Formal Approval 的前置条件，需在 24 小时内上传。'
  },
  {
    id: 'TASK-102',
    caseId: 'CASE-003',
    clientName: 'Michael Chen',
    bankName: 'ANZ',
    title: '核对会计师声明 (CPA Letter) 与 2025 BAS 报表收入一致性',
    priority: 'urgent',
    dueDate: '2026-08-11', // Overdue
    overdueDays: 1,
    status: 'pending',
    isAiSuggested: false,
    category: 'document',
    description: '自雇核算公式与 ANZ Policy 的差距须在提交前修正。'
  },
  {
    id: 'TASK-103',
    caseId: 'CASE-002',
    clientName: 'Sarah Zhang',
    bankName: 'Westpac',
    title: '发送本周六拍卖出价指南与预批信副本',
    priority: 'high',
    dueDate: '2026-08-12', // Due Today
    status: 'pending',
    isAiSuggested: true,
    category: 'client_contact',
    description: '客户周六参与拍卖，需确认首付资金到位证明与预批条款注意事项。'
  },
  {
    id: 'TASK-104',
    caseId: 'CASE-004',
    clientName: 'PERSON_2',
    bankName: 'NAB',
    title: '跟进 PEXA 电子割接状态与旧银行结清清单',
    priority: 'medium',
    dueDate: '2026-08-15',
    status: 'pending',
    isAiSuggested: false,
    category: 'settlement',
    description: '确认放款日前旧抵押权解除申请 (Discharge Form) 无延迟。'
  },
  {
    id: 'TASK-105',
    caseId: 'CASE-005',
    clientName: 'David & Emma Taylor',
    bankName: 'Macquarie',
    title: '跟踪客户对 3 方案借贷能力对比邮件的反馈',
    priority: 'low',
    dueDate: '2026-08-16',
    status: 'pending',
    isAiSuggested: true,
    category: 'bank_reply',
    description: '生成 Macquarie vs ANZ 利率与费用对比报告。'
  }
];

const INITIAL_ANALYTICS: AnalyticsOverview = {
  activeCases: 14,
  newCasesThisMonth: 5,
  submittedCases: 8,
  expectedCommission: '$85,400',
  summaryNote: '今天 3 个待办 · 2 个到期/逾期 · 1 个银行回复待处理',
  overdueCount: 2,
  dueTodayCount: 1,
  pendingBankReplies: 3
};

const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif-1',
    title: '⚠️ 案件逾期提醒',
    message: 'PERSON_1 (CBA) 补件已逾期 2 天，请速联系客户上传 HECS 证明',
    time: '25 分钟前',
    type: 'urgent',
    caseId: 'CASE-001',
    read: false
  },
  {
    id: 'notif-2',
    title: '🏦 银行审理通知',
    message: 'Westpac 已对 Sarah Zhang 案件核发正式预批信',
    time: '1 小时前',
    type: 'info',
    caseId: 'CASE-002',
    read: false
  },
  {
    id: 'notif-3',
    title: '🤖 Vera AI 决策建议',
    message: '检测到 Michael Chen 自雇收入具备转投 ANZ 优惠通道资格',
    time: '2 小时前',
    type: 'info',
    caseId: 'CASE-003',
    read: true
  }
];

interface StoreState {
  currentView: ActiveView;
  selectedCaseId: string | null;
  cases: MortgageCase[];
  tasks: TaskItem[];
  analytics: AnalyticsOverview;
  notifications: AppNotification[];
  unreadNotificationsCount: number;
  searchQuery: string;
  dueAlertBannerDismissed: boolean;
  activeTheme: 'light' | 'dark' | 'glass';
  isNewCaseModalOpen: boolean;
  isEmailComposeOpen: boolean;
  isNotificationOpen: boolean;
  isMoreMenuOpen: boolean;
  chatMessages: Record<string, ChatMessage[]>; // Keyed by caseId or 'global'
  isSendingChat: boolean;
}

interface StoreActions {
  setCurrentView: (view: ActiveView, caseId?: string) => void;
  setSelectedCaseId: (caseId: string | null) => void;
  setSearchQuery: (query: string) => void;
  toggleTaskStatus: (taskId: string) => void;
  dismissDueAlertBanner: () => void;
  toggleTheme: () => void;
  setNewCaseModalOpen: (open: boolean) => void;
  setEmailComposeOpen: (open: boolean) => void;
  setNotificationOpen: (open: boolean) => void;
  toggleNotificationOpen: () => void;
  setMoreMenuOpen: (open: boolean) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  addCase: (newCase: Omit<MortgageCase, 'id' | 'lastUpdated' | 'stage' | 'statusText'>) => void;
  addTask: (newTask: Omit<TaskItem, 'id'>) => void;
  sendChatMessage: (content: string, caseId?: string) => Promise<void>;
  fetchInitialData: () => Promise<void>;
}

export type WorkbenchStore = StoreState & StoreActions;

let state: WorkbenchStore;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function createWorkbenchStore() {
  const get = () => state;
  const set = (partial: Partial<WorkbenchStore> | ((s: WorkbenchStore) => Partial<WorkbenchStore>)) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...next };
    notify();
  };

  const initialGlobalChat: ChatMessage[] = [
    {
      id: 'msg-g1',
      sender: 'vera',
      content: '您好，Vera 已准备就绪！我是您的贷款案件智能大脑。今天有 2 个逾期待办（PERSON_1 和 Michael Chen），需要我帮您拟定催请邮件或向银行提交说明吗？',
      timestamp: '今天 09:00',
      suggestions: ['帮我给 PERSON_1 生成 HECS 补件提醒短信', '分析 ANZ 针对 Michael Chen 的自雇核算差距', '查看本周可割接放款案件']
    }
  ];

  state = {
    currentView: 'home',
    selectedCaseId: null,
    cases: INITIAL_CASES,
    tasks: INITIAL_TASKS,
    analytics: INITIAL_ANALYTICS,
    notifications: INITIAL_NOTIFICATIONS,
    unreadNotificationsCount: INITIAL_NOTIFICATIONS.filter(n => !n.read).length,
    searchQuery: '',
    dueAlertBannerDismissed: false,
    activeTheme: 'light',
    isNewCaseModalOpen: false,
    isEmailComposeOpen: false,
    isNotificationOpen: false,
    isMoreMenuOpen: false,
    chatMessages: {
      global: initialGlobalChat,
      'CASE-001': [
        {
          id: 'msg-c101',
          sender: 'vera',
          content: '已载入案件 PERSON_1 (CBA)。当前阶段：银行递交待补件。CBA 审批员要求补充 HECS 结清证明。建议通过微信或 SMS 提醒客户。',
          timestamp: '10 分钟前',
          suggestions: ['生成补充材料清单文本', '查询 CBA 最新利息优惠与评估周期']
        }
      ]
    },
    isSendingChat: false,

    setCurrentView: (view: ActiveView, caseId?: string) => {
      set({ 
        currentView: view,
        selectedCaseId: caseId !== undefined ? caseId : (view === 'case_detail' ? state.selectedCaseId : null),
        isMoreMenuOpen: false
      });
    },

    setSelectedCaseId: (caseId: string | null) => {
      set({ 
        selectedCaseId: caseId,
        currentView: caseId ? 'case_detail' : state.currentView 
      });
    },

    setSearchQuery: (query: string) => {
      set({ searchQuery: query });
    },

    toggleTaskStatus: (taskId: string) => {
      const updatedTasks = state.tasks.map(task => {
        if (task.id === taskId) {
          const newStatus = task.status === 'completed' ? 'pending' : 'completed';
          return { ...task, status: newStatus as any };
        }
        return task;
      });

      // Recalculate overview metrics
      const overdueCount = updatedTasks.filter(t => t.status !== 'completed' && t.overdueDays && t.overdueDays > 0).length;
      const dueTodayCount = updatedTasks.filter(t => t.status !== 'completed' && t.dueDate === '2026-08-12').length;

      set({ 
        tasks: updatedTasks,
        analytics: {
          ...state.analytics,
          overdueCount,
          dueTodayCount,
          summaryNote: `今天 ${updatedTasks.filter(t => t.status !== 'completed').length} 个待办 · ${overdueCount} 个逾期 · 1 个银行回复待处理`
        }
      });

      // Call API asynchronously if present
      fetch('/api/tasks/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId })
      }).catch(() => {/* Graceful fallback */});
    },

    dismissDueAlertBanner: () => {
      set({ dueAlertBannerDismissed: true });
    },

    toggleTheme: () => {
      const themes: ('light' | 'dark' | 'glass')[] = ['light', 'glass', 'dark'];
      const nextTheme = themes[(themes.indexOf(state.activeTheme) + 1) % themes.length];
      set({ activeTheme: nextTheme });
      document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    },

    setNewCaseModalOpen: (open: boolean) => set({ isNewCaseModalOpen: open }),
    setEmailComposeOpen: (open: boolean) => set({ isEmailComposeOpen: open }),
    setNotificationOpen: (open: boolean) => set({ isNotificationOpen: open }),
    toggleNotificationOpen: () => set({ isNotificationOpen: !state.isNotificationOpen }),
    setMoreMenuOpen: (open: boolean) => set({ isMoreMenuOpen: open }),

    markNotificationRead: (id: string) => {
      const updated = state.notifications.map(n => n.id === id ? { ...n, read: true } : n);
      set({
        notifications: updated,
        unreadNotificationsCount: updated.filter(n => !n.read).length
      });
    },

    markAllNotificationsRead: () => {
      const updated = state.notifications.map(n => ({ ...n, read: true }));
      set({
        notifications: updated,
        unreadNotificationsCount: 0
      });
    },

    addCase: (newCaseData) => {
      const id = `CASE-00${state.cases.length + 1}`;
      const newCaseItem: MortgageCase = {
        id,
        clientName: newCaseData.clientName,
        bankName: newCaseData.bankName || 'CBA',
        loanAmount: newCaseData.loanAmount || 500000,
        stage: 'consultation',
        statusText: '初审资料收集',
        urgency: 'normal',
        lastUpdated: '刚刚',
        propertyType: newCaseData.propertyType || '自住房',
        loanType: newCaseData.loanType || '浮动利率',
        interestRate: '6.09% p.a.',
        ltv: '80%',
        clientEmail: newCaseData.clientEmail,
        clientPhone: newCaseData.clientPhone,
        keyNotes: ['新建案件，自动触发借贷评估流程'],
        documents: [],
        timeline: [
          { date: '今天', title: '创建案件', desc: '经工作台录入新贷款咨询', type: 'system' }
        ]
      };

      set({
        cases: [newCaseItem, ...state.cases],
        analytics: {
          ...state.analytics,
          activeCases: state.analytics.activeCases + 1,
          newCasesThisMonth: state.analytics.newCasesThisMonth + 1
        },
        isNewCaseModalOpen: false,
        currentView: 'case_detail',
        selectedCaseId: id
      });

      // API call in background
      fetch('/api/cases/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCaseItem)
      }).catch(() => {});
    },

    addTask: (newTaskData) => {
      const newTask: TaskItem = {
        id: `TASK-${Date.now()}`,
        caseId: newTaskData.caseId || 'CASE-001',
        clientName: newTaskData.clientName || '客户',
        bankName: newTaskData.bankName || 'CBA',
        title: newTaskData.title,
        priority: newTaskData.priority || 'medium',
        dueDate: newTaskData.dueDate || '2026-08-12',
        status: 'pending',
        isAiSuggested: newTaskData.isAiSuggested || false,
        category: newTaskData.category || 'document',
        description: newTaskData.description || ''
      };

      set({
        tasks: [newTask, ...state.tasks]
      });
    },

    sendChatMessage: async (content: string, caseId?: string) => {
      const targetScope = caseId || state.selectedCaseId || 'global';
      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        sender: 'user',
        content,
        timestamp: '刚刚',
        caseId: targetScope
      };

      const existingMsgs = state.chatMessages[targetScope] || [];
      set({
        chatMessages: {
          ...state.chatMessages,
          [targetScope]: [...existingMsgs, userMsg]
        },
        isSendingChat: true
      });

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: content, caseId: targetScope })
        });

        if (!response.ok) throw new Error('API Error');
        const data = await response.json();

        const veraMsg: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          sender: 'vera',
          content: data.reply || '已收到您的指示，Vera 正在核算与跟进。',
          timestamp: '刚刚',
          caseId: targetScope,
          suggestions: data.suggestions || ['继续分析收入结构', '生成银行跟进草稿']
        };

        const updatedScopeMsgs = [...(get().chatMessages[targetScope] || []), veraMsg];
        set({
          chatMessages: {
            ...get().chatMessages,
            [targetScope]: updatedScopeMsgs
          },
          isSendingChat: false
        });
      } catch {
        // Fallback response on local offline / API error
        let fallbackReply = `针对您的需求：“${content}”，Vera 建议处理步骤：\n1. 检查客户近 3 个月流水与 Payslip 匹配度。\n2. 确认 ${state.cases.find(c => c.id === targetScope)?.bankName || 'CBA / Westpac'} 最新 DTI (Debt-to-Income) 上限规则（目前为 6x）。\n3. 已自动准备好应对草稿，可在快捷选项中直接生成。`;
        
        if (content.includes('补件') || content.includes('HECS')) {
          fallbackReply = `关于 HECS 结清证明：CBA 规定若个人无 HECS 负债，预扣税额可重新计入净可支配收入，预期可提升客户买房借贷额度约 $45,000。已为您生成邮件提醒模版！`;
        } else if (content.includes('佣金') || content.includes('统计')) {
          fallbackReply = `本月预计到账 upfront 佣金约 $85,400，待结算案件 2 件（NAB / CBA），结算预计于 8 月 18 日完成。`;
        }

        const veraMsg: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          sender: 'vera',
          content: fallbackReply,
          timestamp: '刚刚',
          caseId: targetScope,
          suggestions: ['一键生成补件催促邮件', '试算新贷款额度上限', '更新案件跟进节点']
        };

        const updatedScopeMsgs = [...(get().chatMessages[targetScope] || []), veraMsg];
        set({
          chatMessages: {
            ...get().chatMessages,
            [targetScope]: updatedScopeMsgs
          },
          isSendingChat: false
        });
      }
    },

    fetchInitialData: async () => {
      try {
        const [taskRes, overviewRes] = await Promise.all([
          fetch('/api/tasks').catch(() => null),
          fetch('/api/analytics/overview').catch(() => null)
        ]);

        if (taskRes && taskRes.ok) {
          const taskData = await taskRes.json();
          if (Array.isArray(taskData) && taskData.length > 0) {
            set({ tasks: taskData });
          }
        }

        if (overviewRes && overviewRes.ok) {
          const overviewData = await overviewRes.json();
          if (overviewData && overviewData.activeCases) {
            set({ analytics: { ...state.analytics, ...overviewData } });
          }
        }
      } catch {
        // Keep initial mock data
      }
    }
  };

  return state;
}

// Instantiate singleton store
const store = createWorkbenchStore();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function shallowEqual<T>(objA: T, objB: T): boolean {
  if (Object.is(objA, objB)) {
    return true;
  }

  if (
    typeof objA !== 'object' ||
    objA === null ||
    typeof objB !== 'object' ||
    objB === null
  ) {
    return false;
  }

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i];
    if (
      !Object.prototype.hasOwnProperty.call(objB, key) ||
      !Object.is((objA as any)[key], (objB as any)[key])
    ) {
      return false;
    }
  }

  return true;
}

export function useWorkbenchStore<U>(selector: (s: WorkbenchStore) => U): U {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  const lastResultRef = useRef<U | undefined>(undefined);

  const getSnapshot = useCallback(() => {
    const nextResult = selectorRef.current(store);
    if (
      lastResultRef.current !== undefined &&
      shallowEqual(lastResultRef.current, nextResult)
    ) {
      return lastResultRef.current;
    }
    lastResultRef.current = nextResult;
    return nextResult;
  }, []);

  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot
  );
}

export function getWorkbenchStore(): WorkbenchStore {
  return store;
}
