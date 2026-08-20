import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, useReducedMotion, AnimatePresence } from 'motion/react';
import { Sparkles, Send, Brain, Bot, User, Plus, MessageSquare, AlertTriangle, ShieldAlert, X, Paperclip, Loader2, Zap, Calculator, Mail, PlusCircle, FolderSearch, PanelRightClose, PanelRightOpen, ArrowDown, Wrench, CheckCircle2, Copy, Check } from 'lucide-react';
import { getChatHistory, sendChatStream, sendCardAction } from '../../services/api/chat';
import { listContextEvents, confirmContextEvent, supersedeContextEvent, createContextEvent } from '../../services/api/cases';
import { importCaseFile, getCaseFilePreview } from '../../services/api/fileOps';
import { ChatMessageResponse, ContextEvent, ToolCard, DraftPayload, SubmissionSuggestPayload, AttributionSuggestPayload, AssistantSettingsResponse } from '../../types/api';
import { getAssistantSettings } from '../../services/api/assistant';
import { useToastStore } from '../../stores/toastStore';
import { useCaseStore } from '../../stores/caseStore';
import { useUiStore } from '../../stores/uiStore';
import { useModeStore } from '../../stores/modeStore';
import { ConfirmCard } from './ConfirmCard';
import { RecordedEventsDrawer } from './RecordedEventsDrawer';
import { SubmissionBanner } from './SubmissionBanner';
import { DraftCard } from './DraftCard';
import { DeclarationCheckCard } from './DeclarationCheckCard';
import { FlowDialogCard } from './FlowDialogCard';
import { FolderLookupCard } from './FolderLookupCard';
import { GapAnalysisCard } from './GapAnalysisCard';
import { CaseReminderBanner } from './CaseReminderBanner';
import { AssistantOnboardingCard } from './AssistantOnboardingCard';
import { CalculatorPanel } from '../calculator/CalculatorPanel';
import { useTaskStore } from '../../stores/taskStore';
import { CoCreateDialog } from './CoCreateDialog';

type QuickAsk = { label: string; action: 'ask' };

const CASE_QUICK_ASKS: QuickAsk[] = [
  { label: '这个案件缺什么材料？', action: 'ask' },
  { label: '检查申报一致性', action: 'ask' },
  { label: '当前案件下一步做什么？', action: 'ask' },
  { label: '查一下银行政策', action: 'ask' },
  { label: '材料缺口主动预判', action: 'ask' },
];

const GLOBAL_QUICK_ASKS: QuickAsk[] = [
  { label: '今天有哪些到期/逾期？', action: 'ask' },
  { label: '查一下 CBA 的政策', action: 'ask' },
  { label: '有多少案件在审贷中？', action: 'ask' },
  { label: '生成这周周报', action: 'ask' },
  { label: '最近业务怎么样？', action: 'ask' },
];


interface BrainChatProps {
  caseId: string | null;
  onTogglePanorama?: () => void;
  onToggleRightDeck?: () => void;
  isRightDeckCollapsed?: boolean;
}

const MOCK_MESSAGES: ChatMessageResponse[] = [
  { id: 'msg-1', role: 'user', content: '请帮我核对客户的收入和补件清单要求。', created_at: '10 分钟前' },
  {
    id: 'msg-2',
    role: 'assistant',
    content: '已对齐银行最新政策：客户 PAYG 净收入符合 LVR 标准，尚缺 2025 年 NOA 及买卖合同签署件。',
    suggested_actions: ['发送催件邮件', '提醒账户补件', '标记优先跟进'],
    tool_cards: [
      {
        type: 'submission_suggest',
        title: '进入递交模式建议',
        payload: { message: '已为您整理补件回复摘要，建议进入递交模式生成对外邮件草稿。' },
      },
      {
        type: 'draft',
        title: '对外补件邮件草稿',
        payload: {
          subject: 'Re: CBA 贷款补件材料递交 - PERSON_1',
          body: '尊敬的审贷团队：\n\n您好！针对贵行关于客户 PERSON_1 的自住购房贷款补件要求，现提供以下补充材料：\n1. 最新两期 PAYG 工资单及雇主推荐信；\n2. 2025 年 NOA 税单复印件。\n\n请查收，如有任何疑问请随时联系。',
          disclosure: {
            needs_review: true,
            items: [
              { fact_key: 'income.payslip', text: '近两期 Payslip 收入', disclosed: true },
              { fact_key: 'internal_notes.rate_pref', text: '客户敏感利率偏好 (5.99%)', disclosed: false },
            ],
          },
        },
      },
    ],
    created_at: '9 分钟前',
  },
];

const MOCK_PENDING_EVENTS: ContextEvent[] = [
  { id: 101, case_id: 'CASE_001', source_type: 'chat_extract', content: '客户承诺于本周五前补齐最新两期 PAYG 工资单及雇主推荐信。', track: 'internal', status: 'pending', superseded_by: null, supersede_reason: null, created_at: '5 分钟前' },
  { id: 102, case_id: 'CASE_001', source_type: 'email_ocr', content: '银行补件意见：自住房贷款需要提供 3 个月完整存款 Statement。', track: 'external', status: 'pending', superseded_by: null, supersede_reason: null, created_at: '2 分钟前' },
];

const MOCK_CONFIRMED_EVENTS: ContextEvent[] = [
  { id: 201, case_id: 'CASE_001', source_type: 'manual_note', content: '客户 PERSON_1 确认自住房屋评估价值为 $1,000,000。', track: 'internal', status: 'confirmed', superseded_by: null, supersede_reason: null, created_at: '1 小时前' },
  { id: 202, case_id: 'CASE_001', source_type: 'email', content: '银行已接收初审递交材料，等待 LVR 85% 预审通过。', track: 'external', status: 'confirmed', superseded_by: null, supersede_reason: null, created_at: '2 小时前' },
  { id: 203, case_id: 'CASE_001', source_type: 'system', content: 'Finance Clause 截止日期设置为 2026-08-18。', track: 'internal', status: 'confirmed', superseded_by: null, supersede_reason: null, created_at: '昨天' },
];

function formatChatTime(rawTime?: string): string {
  if (!rawTime) return '刚刚';
  if (rawTime === '刚刚' || rawTime === '昨天' || !rawTime.includes('T')) {
    return rawTime;
  }
  try {
    const d = new Date(rawTime);
    if (isNaN(d.getTime())) return rawTime;

    const now = new Date();
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();

    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');

    if (isToday) {
      return `${hours}:${minutes}`;
    } else {
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${month}-${day} ${hours}:${minutes}`;
    }
  } catch {
    return rawTime;
  }
}

export function BrainChat({ caseId, onToggleRightDeck, isRightDeckCollapsed }: BrainChatProps) {
  const reduced = useReducedMotion();
  const [messages, setMessages] = useState<ChatMessageResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingEvents, setPendingEvents] = useState<ContextEvent[]>([]);
  const [confirmedEvents, setConfirmedEvents] = useState<ContextEvent[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [coCreateOpen, setCoCreateOpen] = useState(false);
  const [coCreateFlowKey, setCoCreateFlowKey] = useState<'followup' | 'chaser' | 'os_reply'>('followup');
  const [coCreateSessionId, setCoCreateSessionId] = useState<string | null>(null);
  const [assistantData, setAssistantData] = useState<AssistantSettingsResponse | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [dismissedOnboarding, setDismissedOnboarding] = useState(false);
  const [showSubmissionConfirmModal, setShowSubmissionConfirmModal] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [lastAttachedFile, setLastAttachedFile] = useState<{ name: string; textPreview: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Smart sticky scroll & Codex turn rail state
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const [isUserSending, setIsUserSending] = useState(false);

  // Streaming steps & state
  const [activeStepLabel, setActiveStepLabel] = useState<string>('');
  const [activeStepStatus, setActiveStepStatus] = useState<'running' | 'generating' | 'done'>('done');
  const [copiedMsgId, setCopiedMsgId] = useState<number | string | null>(null);

  const handleCopyMessage = useCallback((text: string, id: number | string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMsgId(id);
      setTimeout(() => {
        setCopiedMsgId((prev) => (prev === id ? null : prev));
      }, 2000);
    });
  }, []);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [dismissedConfirmCardMsgs, setDismissedConfirmCardMsgs] = useState<Record<string, boolean>>({});

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const userTurns = useMemo(() => {
    return messages
      .map((m, idx) => ({ ...m, globalIdx: idx }))
      .filter((m) => m.role === 'user' && m.content.trim().length > 0);
  }, [messages]);

  useEffect(() => {
    if (isNearBottom || isUserSending) {
      scrollToBottom('smooth');
      if (isUserSending) {
        setIsUserSending(false);
      }
    }
  }, [messages, isNearBottom, isUserSending, scrollToBottom]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollHeight, scrollTop, clientHeight } = scrollContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const nearBottom = distanceFromBottom <= 120;
    setIsNearBottom(nearBottom);
    setShowScrollBottomBtn(distanceFromBottom > 120);
  };

  const { cases, currentCase } = useCaseStore();
  const setNewCaseOpen = useUiStore((s) => s.setNewCaseOpen);
  const setRightDeckTab = useUiStore((s) => s.setRightDeckTab);
  const pendingChatPrompt = useUiStore((s) => s.pendingChatPrompt);
  const setPendingChatPrompt = useUiStore((s) => s.setPendingChatPrompt);
  const mode = useModeStore((s) => s.mode);
  const setMode = useModeStore((s) => s.setMode);

  useEffect(() => {
    if (pendingChatPrompt) {
      setPrompt(pendingChatPrompt);
      setPendingChatPrompt(null);
    }
  }, [pendingChatPrompt, setPendingChatPrompt]);

  useEffect(() => {
    const handleFillChat = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        setPrompt(customEvent.detail);
      }
    };
    window.addEventListener('fill_chat_input', handleFillChat);
    return () => {
      window.removeEventListener('fill_chat_input', handleFillChat);
    };
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !caseId) return;

    setUploadingFile(true);
    try {
      let importRes;
      try {
        importRes = await importCaseFile(caseId, file, '');
      } catch (err: any) {
        if (err?.status === 409 || err?.message?.includes('同名文件') || err?.message?.includes('409')) {
          useToastStore.getState().showToast('error', `同名文件 "${file.name}" 已存在，请重命名后上传`);
        } else {
          useToastStore.getState().showToast('error', `导入文件失败: ${err?.message || '未知错误'}`);
        }
        setUploadingFile(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      const relPath = importRes.target || file.name;

      let textPreview = '';
      try {
        const previewRes = await getCaseFilePreview(caseId, relPath);
        if (previewRes.parse_error) {
          useToastStore.getState().showToast('info', `文件导入成功，解析提示: ${previewRes.parse_error}`);
          textPreview = previewRes.text_preview || '（未能提取到文本内容）';
        } else {
          textPreview = previewRes.text_preview || '（未能提取到文本内容）';
        }
      } catch {
        textPreview = '（未能提取到文本内容）';
      }

      const truncatedPreview = textPreview.length > 800 ? textPreview.slice(0, 800) + '...' : textPreview;

      const fileMessage: ChatMessageResponse = {
        id: `msg-ocr-${Date.now()}`,
        role: 'assistant',
        content: `📄 【文件识别】已识别文件《${file.name}》：\n${truncatedPreview}`,
        created_at: '刚刚',
      };

      setMessages((prev) => [...prev, fileMessage]);
      setLastAttachedFile({ name: file.name, textPreview: truncatedPreview });
      useToastStore.getState().showToast('success', `文件《${file.name}》已识别并放入对话上下文`);
      window.dispatchEvent(new CustomEvent('files_updated'));
    } catch (err: any) {
      useToastStore.getState().showToast('error', `处理文件失败: ${err?.message || '未知错误'}`);
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const dismissCard = (messageIdx: number, cardIdx: number) => {
    setMessages((prevMsgs) =>
      prevMsgs.map((m, mIndex) => {
        if (mIndex === messageIdx) {
          const newCards = (m.tool_cards || []).filter((_, cIdx) => cIdx !== cardIdx);
          return { ...m, tool_cards: newCards };
        }
        return m;
      })
    );
  };

  const handleSwitchCaseFromCard = (
    messageIdx: number,
    cardIdx: number,
    matchedCaseId: string,
    matchedClient: string,
    matchedLender?: string
  ) => {
    const allCases = useCaseStore.getState().cases;
    const targetCase = allCases.find((c) => c.caseId === matchedCaseId) || {
      caseId: matchedCaseId,
      clientName: matchedClient,
      lender: matchedLender || 'NAB',
      loanAmount: 850000,
      stage: '申请准备中',
      checklistDone: 0,
      checklistTotal: 10,
      checklistProgress: 0,
      summary: '切换自防串案建议卡',
      deadline: '暂无截止',
    };

    useCaseStore.getState().setCurrentCase(targetCase);
    const lenderText = matchedLender ? `（${matchedLender}）` : '';
    useToastStore.getState().showToast('success', `已切换到 ${matchedClient}${lenderText}`);
    dismissCard(messageIdx, cardIdx);
  };

  const handleForceRecordToCurrentCase = async (
    messageIdx: number,
    cardIdx: number,
    content: string,
    track?: string
  ) => {
    const targetCaseId = caseId || activeCaseInfo?.caseId;
    if (!targetCaseId) {
      useToastStore.getState().showToast('error', '未选择当前案件，无法记录');
      return;
    }

    try {
      if (import.meta.env.VITE_USE_MOCK !== 'false') {
        useToastStore.getState().showToast('success', '已记录到当前案件');
        dismissCard(messageIdx, cardIdx);
        return;
      }

      await createContextEvent(targetCaseId, {
        source_type: 'manual_note',
        content,
        track: track || 'internal',
        status: 'confirmed',
      });
      useToastStore.getState().showToast('success', '已记录到当前案件');
      dismissCard(messageIdx, cardIdx);
      fetchContextEventsData();
      window.dispatchEvent(new CustomEvent('facts_updated'));
    } catch (err: any) {
      useToastStore.getState().showToast('error', `记录失败: ${err?.message || '未知错误'}`);
    }
  };

  const activeCaseInfo = caseId ? (cases.find((c) => c.caseId === caseId) || currentCase) : null;
  const quickAsks = caseId ? CASE_QUICK_ASKS : GLOBAL_QUICK_ASKS;
  const tasks = useTaskStore((s) => s.tasks);

  const openEmailCoCreate = () => {
    if (!activeCaseInfo) {
      useToastStore.getState().showToast('info', '请先选择案件，再写补件邮件');
      return;
    }
    // A 类：用户主动/明确要写邮件 → 直接进共创弹窗
    setCoCreateFlowKey('followup');
    setCoCreateSessionId('session-' + Date.now());
    setCoCreateOpen(true);
  };

  const suggestEmailCoCreate = (clientName?: string, lender?: string) => {
    const name = clientName || activeCaseInfo?.clientName || '客户';
    const bank = lender || activeCaseInfo?.lender || '';
    const sessionId = 'session-' + Date.now();
    setMessages((prev) => [
      ...prev,
      {
        id: `co-suggest-${Date.now()}`,
        role: 'assistant',
        content: `建议进入补件跟进邮件共创（${name}${bank ? ` · ${bank}` : ''}）。进入后可在弹窗中澄清意图、生成 V1-V3 多版本并确认，确认后存入草稿箱（绝不自动发送）。`,
        created_at: '刚刚',
        tool_cards: [
          {
            type: 'co_create_confirm',
            title: '进入补件跟进邮件共创',
            payload: { flow_key: 'followup', session_id: sessionId },
          },
        ],
      },
    ]);
  };

  const handleCoCreateConfirmed = (info: {
    flow_key: string;
    subject?: string;
    body?: string;
    version?: string;
    session_id?: string | null;
  }) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `co-record-${Date.now()}`,
        role: 'assistant',
        content: `已确认【${info.flow_key === 'followup' ? '补件跟进邮件' : info.flow_key}】${info.version || 'V1'} 并存入草稿箱`,
        created_at: '刚刚',
        tool_cards: [{ type: 'co_create_record', title: '邮件共创记录', payload: info }],
      },
    ]);
  };

  useEffect(() => {
    const h = () => openEmailCoCreate();
    window.addEventListener('open-email-co-create', h);
    const hSuggest = (e: Event) => {
      const ce = e as CustomEvent<{ clientName?: string; lender?: string }>;
      suggestEmailCoCreate(ce.detail?.clientName, ce.detail?.lender);
    };
    window.addEventListener('suggest-email-co-create', hSuggest);
    return () => {
      window.removeEventListener('open-email-co-create', h);
      window.removeEventListener('suggest-email-co-create', hSuggest);
    };
  }, [activeCaseInfo]);

  // Filter tasks for active case & compute overdue / dueToday
  const matchingCaseTasks = caseId
    ? tasks.filter((t) => {
        if (t.completed) return false;
        if (t.caseId === caseId) return true;
        if (
          activeCaseInfo &&
          t.caseName &&
          (activeCaseInfo.clientName.toLowerCase().includes(t.caseName.toLowerCase()) ||
            t.caseName.toLowerCase().includes(activeCaseInfo.clientName.toLowerCase().split(' ')[0]))
        ) {
          return true;
        }
        return false;
      })
    : [];

  let overdueCount = 0;
  let dueTodayCount = 0;
  let topOverdueTitle = '';

  matchingCaseTasks.forEach((t) => {
    const isOverdue =
      t.type === 'OVERDUE_REMINDER' ||
      t.tags.some((tag) => tag.label.includes('超期') || tag.label.includes('逾期')) ||
      (t.deadline ? new Date(t.deadline).getTime() < Date.now() : false);

    if (isOverdue) {
      overdueCount++;
      if (!topOverdueTitle) topOverdueTitle = t.title || t.subtitle;
    } else {
      const isDueToday =
        t.priority === 'urgent' ||
        t.tags.some((tag) => tag.label.includes('今日') || tag.label.includes('到期') || tag.label.includes('紧急')) ||
        (t.meta ? t.meta.includes('今日') : false);
      if (isDueToday) {
        dueTodayCount++;
      }
    }
  });

  const fetchContextEventsData = useCallback(async () => {
    if (!caseId) { setPendingEvents([]); setConfirmedEvents([]); return; }
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      setPendingEvents(MOCK_PENDING_EVENTS);
      setConfirmedEvents(MOCK_CONFIRMED_EVENTS);
      return;
    }
    try {
      const [pending, confirmed] = await Promise.all([
        listContextEvents(caseId, { status: 'pending' }),
        listContextEvents(caseId, { status: 'confirmed' }),
      ]);
      setPendingEvents(pending);
      setConfirmedEvents(confirmed);
    } catch {
      useToastStore.getState().showToast('error', '获取记录失败');
    }
  }, [caseId]);

  const fetchHistory = useCallback(async () => {
    if (!caseId) { setMessages([]); return; }
    setLoading(true);
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      setMessages(MOCK_MESSAGES);
      setLoading(false);
      return;
    }
    try {
      const history = await getChatHistory(caseId);
      setMessages(history);
    } catch {
      useToastStore.getState().showToast('error', '加载对话历史失败');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    setMode('internal');
    fetchHistory();
    fetchContextEventsData();
  }, [caseId, fetchHistory, fetchContextEventsData, setMode]);

  useEffect(() => {
    getAssistantSettings()
      .then((data) => {
        setAssistantData(data);
        if (data.onboarding_needed && !dismissedOnboarding) {
          setShowOnboarding(true);
        } else {
          setShowOnboarding(false);
        }
      })
      .catch(() => {
        // ignore
      });
  }, [dismissedOnboarding]);

  const handleOnboardingSaveSuccess = (savedData: AssistantSettingsResponse) => {
    setAssistantData(savedData);
    setShowOnboarding(false);
    // Insert local AI welcome message
    const aiName = savedData.ai_name || '小V';
    const userAddr = savedData.user_address || 'Vera';
    const welcomeMsg: ChatMessageResponse = {
      id: `msg-welcome-${Date.now()}`,
      role: 'assistant',
      content: `你好，${userAddr}！我是${aiName}，以后就这样叫我。`,
      created_at: '刚刚',
    };
    setMessages((prev) => [welcomeMsg, ...prev]);
  };

  const handleSend = async (overrideText?: string) => {
    const rawText = overrideText || prompt;
    if (!rawText.trim() || sending) return;
    let text = rawText.trim();
    if (!overrideText) setPrompt('');

    if (lastAttachedFile) {
      text = `已识别文件《${lastAttachedFile.name}》，请基于以上内容处理：${text}`;
      setLastAttachedFile(null);
    }

    setIsUserSending(true);
    setMessages((prev) => [...prev, { id: `usr-${Date.now()}`, role: 'user', content: text, created_at: '刚刚' }]);
    setSending(true);

    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      const isDeclarationRequest = text.includes('一致性') || text.includes('申报') || text.includes('检查');
      const isFollowup = text.includes('跟进') || text.includes('followup');
      const isChaser = text.includes('催') || text.includes('chaser');
      const isOsReply = text.includes('OS') || text.includes('回复');
      const isFolderLookup = text.includes('打开文件') || text.includes('文件') || text.includes('预览文件') || text.includes('案件文件夹') || text.includes('文件夹找') || text.includes('folder_lookup') || text.includes('找材料');

      if (isFolderLookup) {
        setRightDeckTab('files');
      }
      const isGapAnalysis = text.includes('缺口') || text.includes('缺什么') || text.includes('主动预判') || text.includes('gap_analysis');
      const isAttributionSuggest = text.includes('李四') || text.includes('转贷') || text.includes('其他客户');

      const mockToolCards: ToolCard[] = [];

      if (isAttributionSuggest) {
        mockToolCards.push({
          type: 'attribution_suggest',
          title: '⚠️ 这条信息看起来属于其他客户',
          payload: {
            content: text,
            matched_client: '李四',
            matched_lender: 'NAB',
            matched_case_id: 'CASE_002',
            track: 'internal',
          },
        });
      }

      if (isFolderLookup) {
        mockToolCards.push({
          type: 'flow_folder_lookup',
          title: '案件文件夹检索结果',
          payload: {
            files: [
              {
                rel_path: '_Inbox/bank_statement_3m.pdf',
                size: 2450000,
                mtime: '2026-08-12 14:30',
                doc_type: 'bank_statement',
              },
              {
                rel_path: 'Send to Lender/payslip_2026_01.pdf',
                size: 1120000,
                mtime: '2026-08-11 09:15',
                doc_type: 'payslip',
              },
              {
                rel_path: '_Inbox/notice_of_assessment_2025.pdf',
                size: 890000,
                mtime: '2026-08-10 16:45',
                doc_type: 'noa',
              },
            ],
            query: text,
          },
        });
      }

      if (isGapAnalysis) {
        mockToolCards.push({
          type: 'flow_gap_analysis',
          title: '材料缺口主动预判',
          payload: {
            summary: '针对 CBA Full Doc 住房贷款标准，对当前已上传文件夹材料进行自动化勾稽匹配后发现以下缺口与建议：',
            missing: [
              {
                master_id: 'chk-01',
                name: '2025 财年 ATO Notice of Assessment (NOA)',
                item: '2025 财年 ATO Notice of Assessment (NOA)',
                reason: '审查自雇/投资收入必须校验 ATO 税单原件，当前仅有草稿算数表。',
                priority: 'high',
              },
              {
                master_id: 'chk-02',
                name: '购房合同 (Contract of Sale) 最终签署版',
                item: '购房合同 (Contract of Sale) 最终签署版',
                reason: '银行需确认购买地址与签署日以核定估值 (Valuation) 触发时机。',
                priority: 'medium',
              },
            ],
            matched: [
              { master_id: 'chk-03', name: '最新 2 期工资单 (Payslips)', item: '最新 2 期工资单 (Payslips)', file: 'payslip_2026_01.pdf' },
              { master_id: 'chk-04', name: '最近 3 个月主账户流水', item: '最近 3 个月主账户流水', file: 'bank_statement_3m.pdf' },
              { master_id: 'chk-05', name: '身份证明 (护照扫描件)', item: '身份证明 (护照扫描件)', file: 'passport_scan.pdf' },
            ],
            suggestions: [
              {
                type: 'chaser',
                title: '补件提醒邮件给客户',
                description: '建议通过系统草稿向 PERSON_1 发送明确补件指引，重点列出 2025 NOA 及签署版合同。',
                item: '补件提醒邮件给客户',
                suggestion: '建议通过系统草稿向 PERSON_1 发送明确补件指引，重点列出 2025 NOA 及签署版合同。',
                action_type: 'draft_email',
                status: 'draft',
                item_name: '补件提醒邮件',
              },
              {
                type: 'gift_letter',
                title: '大额划入备注说明',
                description: '流水显示 7 月 15 日划入 $50,000，建议预配 Gift Letter 声明草稿以应对 Lender 补充问询。',
                item: '大额划入备注说明',
                suggestion: '流水显示 7 月 15 日划入 $50,000，建议预配 Gift Letter 声明草稿以应对 Lender 补充问询。',
                action_type: 'draft_memo',
                status: 'draft',
                item_name: '大额资金声明',
              },
            ],
          },
        });
      }

      if (isFollowup || isChaser || isOsReply) {
        const fk = isChaser ? 'chaser' : isOsReply ? 'os_reply' : 'followup';
        const sid = `session-${Date.now()}`;
        setCoCreateFlowKey(fk);
        setCoCreateSessionId(sid);
        setCoCreateOpen(true);

        mockToolCards.push({
          type: 'co_create_session' as any,
          title: fk === 'chaser' ? '催件跟进共创' : fk === 'os_reply' ? 'OS 审贷回复共创' : '补件跟进邮件共创',
          payload: {
            flow_key: fk,
            session_id: sid,
          },
        });
      }

      if (isDeclarationRequest) {
        mockToolCards.push({
          type: 'declaration_check',
          title: '申报一致性交叉比对',
          payload: {},
        });
      }

      if (caseId && mockToolCards.length === 0) {
        mockToolCards.push(
          {
            type: 'submission_suggest',
            title: '进入递交模式建议',
            payload: { message: '已为您整理补件回复摘要，建议进入递交模式生成对外邮件草稿。' },
          },
          {
            type: 'draft',
            title: '对外补件邮件草稿',
            payload: {
              subject: `Re: ${activeCaseInfo?.lender || 'CBA'} 贷款补件材料递交 - ${activeCaseInfo?.clientName || 'PERSON_1'}`,
              body: `尊敬的审贷团队：\n\n您好！针对贵行关于客户 ${activeCaseInfo?.clientName || 'PERSON_1'} 的自住购房贷款补件要求，现提供以下补充材料：\n1. 最新两期 PAYG 工资单及雇主推荐信；\n2. 2025 年 NOA 税单复印件。\n\n请查收，如有任何疑问请随时联系。`,
              disclosure: {
                needs_review: true,
                items: [
                  { fact_key: 'income.payslip', text: '近两期 Payslip 收入', disclosed: true },
                  { fact_key: 'internal_notes.rate_pref', text: '客户敏感利率偏好 (5.99%)', disclosed: false },
                ],
              },
            },
          }
        );
      }

      setMessages((prev) => [...prev, {
        id: `ast-${Date.now()}`, role: 'assistant',
        content: isDeclarationRequest 
          ? `已触发【申报一致性比对】功能卡。请在下方卡片中选择核查材料或贴入路径，开始交叉比对。`
          : (isFollowup || isChaser || isOsReply)
          ? `已成功响应指令："${text}"。共创 Dialog 功能卡片已就绪，可点开弹窗深谈或生成多版本。`
          : `已接收指令："${text}"。Vera AI 已根据 ${activeCaseInfo ? `案件 [${activeCaseInfo.clientName}] (${mode === 'external' ? '递交模式' : '内线模式'})` : '全局模式'} 分析完毕。`,
        suggested_actions: isDeclarationRequest ? ['开始申报一致性检查', '生成解释信草稿', '生成回复草稿'] : ['跟进邮件', '发送催件邮件', 'OS回复', '检查申报一致性'],
        tool_cards: mockToolCards,
        created_at: '刚刚',
      }]);
      setSending(false);
      return;
    }

    const astId = `ast-${Date.now()}`;
    setStreamingMessageId(astId);
    setMessages((prev) => [
      ...prev,
      {
        id: astId,
        role: 'assistant',
        content: '',
        suggested_actions: [],
        tool_cards: [],
        created_at: '刚刚',
      },
    ]);

    try {
      await sendChatStream(
        { message: text, case_id: caseId ?? undefined, track: mode },
        {
          onStep: (label, status) => {
            if (label) setActiveStepLabel(label);
            if (status) setActiveStepStatus(status as any);
          },
          onToolStart: (tool, label) => {
            setActiveStepLabel(label || `正在调用工具 ${tool}...`);
            setActiveStepStatus('running');
          },
          onTextChunk: (chunk) => {
            setActiveStepStatus('generating');
            setMessages((prev) =>
              prev.map((m) =>
                m.id === astId ? { ...m, content: m.content + chunk } : m
              )
            );
            scrollToBottom('smooth');
          },
          onDone: (res) => {
            setActiveStepStatus('done');
            setActiveStepLabel('');
            setStreamingMessageId(null);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === astId
                  ? {
                      ...m,
                      content: res.reply || m.content,
                      suggested_actions: res.suggested_actions && res.suggested_actions.length > 0 ? res.suggested_actions : m.suggested_actions,
                      tool_cards: res.tool_cards && res.tool_cards.length > 0 ? res.tool_cards : m.tool_cards,
                    }
                  : m
              )
            );
            setSending(false);
          },
          onError: (err) => {
            setActiveStepStatus('done');
            setActiveStepLabel('');
            setStreamingMessageId(null);
            useToastStore.getState().showToast('error', err.message || '发送消息失败，请重试');
            setMessages((prev) =>
              prev.map((m) =>
                m.id === astId
                  ? {
                      ...m,
                      content: `❌ 发送失败：${err.message || '系统繁忙，请稍后重试'}`,
                    }
                  : m
              )
            );
            setSending(false);
          },
        }
      );
    } catch {
      setActiveStepStatus('done');
      setActiveStepLabel('');
      setStreamingMessageId(null);
      setSending(false);
    }
  };

  const handleQuickAsk = (item: QuickAsk) => {
    if (item.action === 'ask') {
      handleSend(item.label);
    }
  };

  const handleSuggestedAction = (act: string) => {
    const a = act || '';
    if (/邮件|草稿|拟写|写信/.test(a)) {
      openEmailCoCreate(); // 明确写邮件
    } else if (/催件|催/.test(a)) {
      setCoCreateFlowKey('chaser');
      setCoCreateSessionId('session-' + Date.now());
      setCoCreateOpen(true);
    } else if (/OS|审贷/.test(a)) {
      setCoCreateFlowKey('os_reply');
      setCoCreateSessionId('session-' + Date.now());
      setCoCreateOpen(true);
    } else if (/申报|一致性/.test(a)) {
      handleSend('检查申报一致性');
    } else if (/建案|新建/.test(a)) {
      setNewCaseOpen(true);
    } else {
      handleSend(a); // 补件提醒/标记优先跟进/其他 → 继续对话，不跳共创
    }
  };

  const handleConfirmEvent = async (eventId: number) => {
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      const target = pendingEvents.find((e) => e.id === eventId);
      if (target) {
        setPendingEvents((prev) => prev.filter((e) => e.id !== eventId));
        setConfirmedEvents((prev) => [{ ...target, status: 'confirmed' }, ...prev]);
      }
      return;
    }
    try {
      await confirmContextEvent(caseId!, eventId);
      await fetchContextEventsData();
    } catch {
      useToastStore.getState().showToast('error', '确认记录失败');
    }
  };

  const handleDismissEvent = (eventId: number) => {
    setPendingEvents((prev) => prev.filter((e) => e.id !== eventId));
  };

  const handleRevokeEvent = async (eventId: number) => {
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      setConfirmedEvents((prev) => prev.filter((e) => e.id !== eventId));
      useToastStore.getState().showToast('success', '已撤销');
      return;
    }
    try {
      await supersedeContextEvent(caseId!, eventId, '用户手动撤销');
      useToastStore.getState().showToast('success', '已撤销');
      await fetchContextEventsData();
    } catch {
      useToastStore.getState().showToast('error', '撤销记录失败');
    }
  };

  return (
    <div className="relative flex-1 h-full flex flex-col transition-colors select-none overflow-hidden min-w-0" style={{ backgroundColor: 'var(--bg-app)' }} id="brain-chat">
      {/* 1. Header */}
      <div className="px-4 py-2.5 border-b flex items-center justify-between text-xs flex-shrink-0 w-full" style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}>
        {activeCaseInfo ? (
          <div className="flex items-center space-x-2 min-w-0 flex-1 truncate">
            <span className="font-extrabold text-sm min-w-0 flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{activeCaseInfo.clientName}</span>
          </div>
        ) : (
          <div className="flex items-center space-x-2 min-w-0 flex-1 truncate">
            <div className="p-1 rounded-lg bg-[var(--purple-soft)] flex-shrink-0">
              <MessageSquare className="w-4 h-4 text-[var(--purple)]" />
            </div>
            <span className="font-extrabold text-sm tracking-tight min-w-0 flex-1 truncate" style={{ color: 'var(--text-primary)' }}>全局咨询</span>
          </div>
        )}
        <div className="flex items-center space-x-1.5 ml-auto flex-shrink-0">
          {/* Submission Mode Pill for Selected Case */}
          {activeCaseInfo && (
            <div className="flex items-center space-x-1.5">
              {/* Submission Mode Pill */}
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => {
                  if (mode === 'internal') {
                    setShowSubmissionConfirmModal(true);
                  } else {
                    setMode('internal');
                  }
                }}
                id="header-mode-toggle-btn"
                title={mode === 'internal' ? '点击进入递交模式' : '递交模式：AI 只引用已披露/外线内容，点击退出'}
                className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center space-x-1 cursor-pointer transition-colors ${
                  mode === 'internal'
                    ? 'bg-[var(--bg-card)] text-[var(--text-primary)] border-[var(--border)] hover:bg-[var(--bg-card-hover)]'
                    : 'bg-[var(--yellow-soft)] text-[var(--yellow)] border-[var(--yellow-soft)] hover:opacity-90'
                }`}
              >
                <span>{mode === 'internal' ? '🔒 内线' : '📤 递交'}</span>
              </motion.button>
            </div>
          )}

          {/* 折叠/展开右栏按钮（位于中栏内线右侧） */}
          {onToggleRightDeck && (
            <motion.button
              whileTap={reduced ? undefined : { scale: 0.92 }}
              onClick={onToggleRightDeck}
              className="p-1.5 rounded-lg border text-muted hover:text-primary cursor-pointer transition-colors shrink-0"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
              title={isRightDeckCollapsed ? "展开右栏工作台" : "折叠右栏工作台"}
              id="collapse-right-deck-btn"
            >
              {isRightDeckCollapsed ? (
                <PanelRightOpen className="w-4 h-4" />
              ) : (
                <PanelRightClose className="w-4 h-4" />
              )}
            </motion.button>
          )}
        </div>
      </div>

      {/* Submission Mode Banner (Only rendered when caseId is selected) */}
      {caseId && <SubmissionBanner />}

      {/* Case Reminder Banner (WO-21 / #11) */}
      {caseId && (overdueCount > 0 || dueTodayCount > 0) && (
        <div className="px-4 pt-2 flex-shrink-0">
          <CaseReminderBanner
            caseId={caseId}
            overdue={overdueCount}
            dueToday={dueTodayCount}
            onViewTodos={() => {
              setRightDeckTab('tasks');
            }}
          />
        </div>
      )}

      {/* 2. Chat Stream */}
      <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Scrollable Message List */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="p-4 space-y-4 flex-1 overflow-y-auto no-scrollbar relative"
        >
          {/* Assistant Onboarding Card (Whenever onboarding_needed = true) */}
          {showOnboarding && !dismissedOnboarding && (
            <AssistantOnboardingCard
              initialAiName={assistantData?.ai_name}
              initialUserAddress={assistantData?.user_address}
              initialPersonaKey={assistantData?.persona_key}
              defaultPersonaKey={assistantData?.default_persona || 'a'}
              personas={assistantData?.personas || []}
              onSaveSuccess={handleOnboardingSaveSuccess}
              onDismiss={() => setDismissedOnboarding(true)}
            />
          )}

          {!activeCaseInfo && messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-5 max-w-lg mx-auto">
              <div className="relative">
                <div className="w-16 h-16 rounded-3xl bg-[var(--purple-soft)] flex items-center justify-center border border-[var(--purple-soft)] shadow-lg">
                  <Sparkles className="w-8 h-8 text-[var(--purple)]" />
                </div>
                <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-[var(--purple)] text-[var(--on-purple)] shadow-xs">
                  <Brain className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="space-y-1.5 max-w-sm">
                <h3 className="font-extrabold text-base tracking-tight" style={{ color: 'var(--text-primary)' }}>全局咨询模式</h3>
                <p className="text-xs text-muted leading-relaxed">选择左侧案件开始深入对话，或直接向 Vera AI 询问金融业务、政策与计算方案。</p>
              </div>

              <motion.button whileTap={{ scale: 0.95 }} onClick={() => setNewCaseOpen(true)} id="global-chat-new-case-btn"
                className="px-4 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-2 cursor-pointer shadow-md hover:opacity-90 transition-opacity" style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}>
                <Plus className="w-4 h-4" /><span>新建案件</span>
              </motion.button>
            </div>
          ) : loading ? (
            <div className="space-y-3"><div className="h-10 rounded-xl animate-pulse bg-[var(--bg-subtle)] w-2/3" /><div className="h-10 rounded-xl animate-pulse bg-[var(--bg-subtle)] w-1/2 ml-auto" /></div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[var(--purple-soft)] flex items-center justify-center border border-[var(--purple-soft)]">
                <Brain className="w-6 h-6 text-[var(--purple)]" />
              </div>
              <p className="text-xs text-muted font-medium">向 Vera 提问关于此案件的任何细节或补充说明...</p>
            </div>
          ) : (
            <>
              {/* AI Natural Overdue Reminder Bubble (#11 / WO-21) */}
              {caseId && overdueCount > 0 && (
                <motion.div
                  initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="p-3.5 rounded-2xl border bg-[var(--red-soft)] border-[var(--red-soft)] text-[var(--red)] text-xs flex items-start space-x-3 shadow-2xs mb-2"
                  id="natural-reminder-bubble"
                >
                  <div className="p-1.5 rounded-xl bg-[var(--red-soft)] text-[var(--red)] flex-shrink-0 mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="font-extrabold flex items-center justify-between">
                      <span className="text-[var(--red)] font-bold flex items-center">
                        Vera AI 智能提醒
                      </span>
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-[var(--red-soft)] text-[var(--red)] font-bold">
                        {overdueCount} 项已逾期
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                      记得先处理 <strong>{activeCaseInfo?.clientName?.split(' ')[0] || '客户'}</strong> 的逾期补件或承诺事项（如：{topOverdueTitle || '银行流水催件超期 7 天'}）。
                    </p>
                  </div>
                </motion.div>
              )}

              {messages.map((m, messageIdx) => {
                const isStreamingThis = m.id === streamingMessageId;
                const hideEmptyBubble = isStreamingThis && !m.content.trim() && activeStepStatus === 'running';
                const hasConfirmRequired =
                  m.role === 'assistant' &&
                  !dismissedConfirmCardMsgs[m.id] &&
                  (m.content.includes('confirm_required') ||
                    m.content.includes('本流程需要 Vera 确认') ||
                    m.tool_cards?.some(
                      (c) => (c.type as string) === 'confirm_required' || (c.payload as any)?.confirm_required
                    ));

                return (
                  <div key={m.id} id={`chat-message-${m.id}`} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} space-y-1.5`}>
                    <div className="flex items-center space-x-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {m.role === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3 text-[var(--purple)]" />}
                      <span>{m.role === 'user' ? '我' : 'Vera AI'}</span><span>· {formatChatTime(m.created_at)}</span>
                    </div>

                    {/* Step Capsule for streaming assistant message */}
                    {m.role === 'assistant' && isStreamingThis && (activeStepLabel || activeStepStatus !== 'done') && (
                      <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-medium border flex items-center space-x-2 w-fit mb-1 shadow-2xs transition-all duration-300 ${
                          activeStepStatus === 'generating'
                            ? 'bg-[var(--green-soft)] border-[var(--green)]/30 text-[var(--green)]'
                            : 'bg-[var(--purple-soft)] border-[var(--purple)]/30 text-[var(--purple)] shadow-[0_0_12px_rgba(147,51,234,0.12)]'
                        }`}
                      >
                        {activeStepStatus === 'generating' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--green)] shrink-0" />
                        ) : activeStepLabel.includes('工具') || activeStepLabel.includes('检索') || activeStepLabel.includes('查询') || activeStepLabel.includes('政策') ? (
                          <Wrench className="w-3.5 h-3.5 animate-spin text-[var(--purple)] shrink-0" />
                        ) : (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--purple)] shrink-0" />
                        )}
                        <span className="font-semibold">
                          {activeStepStatus === 'generating'
                            ? '✓ 已完成分析，正在输出...'
                            : activeStepLabel || 'Vera AI 正在分析...'}
                        </span>
                      </motion.div>
                    )}

                    {/* Message Bubble (Hidden when tool is running with empty content) */}
                    {!hideEmptyBubble && (
                      <div className={`group relative p-3 rounded-2xl text-xs max-w-[85%] leading-relaxed select-text ${m.role === 'user' ? 'shadow-xs' : 'border'}`}
                        style={m.role === 'user' ? { backgroundColor: 'var(--accent)', color: 'var(--on-accent)' } : { backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                        
                        {/* Copy button for Assistant message */}
                        {m.role === 'assistant' && !isStreamingThis && m.content && (
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(m.content, m.id)}
                            title="复制回复正文"
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-[var(--bg-card-hover)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] shadow-2xs cursor-pointer flex items-center space-x-1 text-[10px]"
                          >
                            {copiedMsgId === m.id ? (
                              <>
                                <Check className="w-3 h-3 text-[var(--green)]" />
                                <span className="text-[var(--green)] font-medium">已复制</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>复制</span>
                              </>
                            )}
                          </button>
                        )}

                        {m.content.includes('📄 【文件识别】') ? (
                          <div className="space-y-1.5">
                            <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-[var(--green-soft)] text-[var(--green)] border border-[var(--green-soft)] font-bold text-[11px]">
                              <span>📄 文件识别</span>
                            </div>
                            <div className="whitespace-pre-wrap select-text">{m.content.replace('📄 【文件识别】', '')}</div>
                          </div>
                        ) : m.role === 'user' ? (
                          <div className="whitespace-pre-wrap select-text">{m.content}</div>
                        ) : (
                          <div className="markdown-body text-xs leading-relaxed space-y-1.5 prose dark:prose-invert max-w-none select-text">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
                                strong: ({ children }) => <strong className="font-bold text-[var(--text-primary)]">{children}</strong>,
                                ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 my-1">{children}</ul>,
                                ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 my-1">{children}</ol>,
                                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                                table: ({ children }) => (
                                  <div className="overflow-x-auto my-2.5 rounded-xl border shadow-xs" style={{ borderColor: 'var(--border)' }}>
                                    <table className="min-w-full text-xs text-left divide-y" style={{ borderColor: 'var(--border)' }}>
                                      {children}
                                    </table>
                                  </div>
                                ),
                                thead: ({ children }) => (
                                  <thead style={{ backgroundColor: 'var(--bg-card-hover)', color: 'var(--text-primary)' }}>
                                    {children}
                                  </thead>
                                ),
                                tbody: ({ children }) => (
                                  <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                                    {children}
                                  </tbody>
                                ),
                                tr: ({ children }) => (
                                  <tr className="hover:bg-[var(--bg-card-hover)] transition-colors">
                                    {children}
                                  </tr>
                                ),
                                th: ({ children }) => (
                                  <th className="px-3 py-2 text-[11px] font-bold text-[var(--text-primary)] whitespace-nowrap">
                                    {children}
                                  </th>
                                ),
                                td: ({ children }) => (
                                  <td className="px-3 py-2 text-[11px] text-[var(--text-secondary)] whitespace-nowrap">
                                    {children}
                                  </td>
                                ),
                              }}
                            >
                              {m.content || ' '}
                            </ReactMarkdown>
                            {isStreamingThis && (
                              <motion.span
                                animate={{ opacity: [1, 0.2, 1] }}
                                transition={{ repeat: Infinity, duration: 0.8 }}
                                className="inline-block w-1.5 h-3.5 ml-1 bg-[var(--accent)] rounded-xs align-middle"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Flow Confirmation Card for confirm_required */}
                    {hasConfirmRequired && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-3.5 rounded-2xl border bg-[var(--purple-soft)] border-[var(--purple-soft)] text-xs space-y-2.5 my-1.5 shadow-2xs w-full max-w-[85%]"
                        id={`flow-confirm-card-${m.id}`}
                      >
                        <div className="flex items-center space-x-2 font-bold text-[var(--purple)]">
                          <ShieldAlert className="w-4 h-4 text-[var(--purple)] flex-shrink-0" />
                          <span>流程状态确认</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                          此操作涉及案卷状态变更，需 Vera 确认后执行
                        </p>
                        <div className="flex items-center justify-end space-x-2 pt-1 border-t border-[var(--purple)]/20">
                          <button
                            type="button"
                            onClick={() => {
                              setDismissedConfirmCardMsgs((prev) => ({ ...prev, [m.id]: true }));
                            }}
                            className="px-3 py-1.5 rounded-xl font-semibold text-[11px] border cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                            id={`cancel-flow-confirm-btn-${m.id}`}
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDismissedConfirmCardMsgs((prev) => ({ ...prev, [m.id]: true }));
                              handleSend('确认执行');
                            }}
                            className="px-3.5 py-1.5 rounded-xl font-bold text-[11px] text-white cursor-pointer shadow-xs btn-primary flex items-center space-x-1"
                            id={`execute-flow-confirm-btn-${m.id}`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>确认并执行</span>
                          </button>
                        </div>
                      </motion.div>
                    )}

              {/* Tool Cards */}
              {m.role === 'assistant' && m.tool_cards && m.tool_cards.length > 0 && (
                <div className="w-full max-w-[85%] space-y-2 pt-1">
                  {m.tool_cards.map((card, idx) => {
                    if (card.type === 'attribution_suggest') {
                      const attrPayload = card.payload as unknown as AttributionSuggestPayload;
                      const rawContent = attrPayload.content || '';
                      const truncatedContent = rawContent.length > 80 ? rawContent.slice(0, 80) + '...' : rawContent;
                      const clientLenderLabel = `${attrPayload.matched_client || '未知客户'}${
                        attrPayload.matched_lender ? `（${attrPayload.matched_lender}）` : ''
                      }`;

                      return (
                        <div
                          key={idx}
                          className="p-3.5 rounded-2xl border bg-[var(--red-soft)] border-[var(--red-soft)] text-[var(--red)] text-xs space-y-2.5 shadow-2xs"
                          id={`attribution-suggest-card-${idx}`}
                        >
                          <div className="flex items-center space-x-2 font-extrabold text-[var(--red)] text-xs">
                            <AlertTriangle className="w-4 h-4 text-[var(--red)] flex-shrink-0" />
                            <span>{card.title || '⚠️ 这条信息看起来属于其他客户'}</span>
                          </div>

                          <div className="text-[11px] leading-relaxed space-y-1 text-[var(--text-secondary)]">
                            <p>
                              匹配目标：<strong className="font-extrabold">{clientLenderLabel}</strong>
                            </p>
                            <div
                              className="p-2.5 rounded-xl border bg-[var(--bg-subtle)] font-mono text-[11px] leading-relaxed opacity-95"
                              style={{ borderColor: 'var(--border)' }}
                            >
                              "{truncatedContent}"
                            </div>
                          </div>

                          <div className="flex items-center space-x-2 pt-1 flex-wrap gap-y-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleSwitchCaseFromCard(
                                  messageIdx,
                                  idx,
                                  attrPayload.matched_case_id,
                                  attrPayload.matched_client,
                                  attrPayload.matched_lender
                                )
                              }
                              className="px-3 py-1.5 rounded-xl font-bold text-[11px] bg-[var(--red)] hover:opacity-90 text-white cursor-pointer transition-colors shadow-xs"
                              id={`switch-case-btn-${idx}`}
                            >
                              切换到 {attrPayload.matched_client || '目标客户'}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleForceRecordToCurrentCase(
                                  messageIdx,
                                  idx,
                                  attrPayload.content,
                                  attrPayload.track
                                )
                              }
                              className="px-3 py-1.5 rounded-xl font-bold text-[11px] border border-[var(--red-soft)] bg-[var(--red-soft)] text-[var(--red)] hover:opacity-90 cursor-pointer transition-colors"
                              id={`force-record-current-btn-${idx}`}
                            >
                              仍记录到当前案件
                            </button>

                            <button
                              type="button"
                              onClick={() => dismissCard(messageIdx, idx)}
                              className="px-3 py-1.5 rounded-xl font-bold text-[11px] border border-[var(--border)] text-muted hover:text-primary cursor-pointer transition-colors"
                              id={`cancel-attribution-btn-${idx}`}
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      );
                    }
                    if (card.type === 'submission_suggest') {
                      const suggestPayload = card.payload as unknown as SubmissionSuggestPayload;
                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-2xl border bg-[var(--yellow-soft)] border-[var(--yellow-soft)] text-[var(--yellow)] text-xs space-y-2"
                          id={`submission-suggest-card-${idx}`}
                        >
                          <div className="flex items-center space-x-2 font-bold text-[var(--yellow)]">
                            <Sparkles className="w-4 h-4 text-[var(--yellow)] flex-shrink-0" />
                            <span>{card.title || '建议进入递交模式'}</span>
                          </div>
                          <p className="leading-relaxed text-[11px] opacity-90">
                            {suggestPayload.message || '系统检测到对外沟通需求，建议切换至递交模式。'}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setShowSubmissionConfirmModal(true);
                            }}
                            className="px-3 py-1.5 rounded-xl font-bold text-[11px] cursor-pointer hover:opacity-90 transition-opacity flex items-center space-x-1 shadow-xs"
                            style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
                            id="enter-submission-mode-btn"
                          >
                            <span>进入递交模式</span>
                          </button>
                        </div>
                      );
                    }
                    if (
                      card.type === 'flow' ||
                      card.type === 'flow_followup' ||
                      card.type === 'flow_chaser' ||
                      card.type === 'flow_os_reply' ||
                      card.payload?.presentation === 'dialog'
                    ) {
                      return (
                        <FlowDialogCard
                          key={idx}
                          card={card}
                          clientName={activeCaseInfo?.clientName || '客户'}
                          lender={activeCaseInfo?.lender || ''}
                          onActionSubmit={async ({ action, parent_message_id, branch_label, subject, body }) => {
                            const flowKey = card.type.replace(/^flow_/, '');
                            try {
                              const res = await sendCardAction({
                                flow_key: flowKey === 'flow' ? 'followup' : flowKey,
                                case_id: caseId || undefined,
                                action,
                                parent_message_id,
                                branch_label,
                                extra: { subject, body },
                              });

                              if (res.tool_cards && res.tool_cards.length > 0) {
                                const updatedCard = res.tool_cards[0];
                                setMessages((prevMsgs) =>
                                  prevMsgs.map((m, mIndex) => {
                                    if (mIndex === messageIdx) {
                                      const newCards = [...(m.tool_cards || [])];
                                      newCards[idx] = updatedCard;
                                      return { ...m, tool_cards: newCards };
                                    }
                                    return m;
                                  })
                                );
                              }

                              if (action === 'confirm') {
                                useToastStore
                                  .getState()
                                  .showToast('success', `已存入草稿箱: ${subject || '沟通草稿'} (只出草稿，绝不发送)`);
                                window.dispatchEvent(new CustomEvent('drafts_updated'));
                              } else if (action === 'version') {
                                useToastStore.getState().showToast('success', '已生成新版本，共创对话已同步');
                              } else if (action === 'branch') {
                                useToastStore.getState().showToast('success', '已生成方案对比 Branch B 分支卡片');
                              }
                            } catch (err: any) {
                              useToastStore.getState().showToast('error', `卡片动作提交失败: ${err?.message || '未知错误'}`);
                            }
                          }}
                        />
                      );
                    }
                    if (card.type === 'co_create_confirm') {
                      const p = card.payload as any;
                      return (
                        <div
                          key={idx}
                          className="p-3.5 rounded-2xl border bg-[var(--purple-soft)] border-[var(--purple-soft)] space-y-2 text-xs my-2"
                          id={`co-create-confirm-${idx}`}
                        >
                          <div className="flex items-center space-x-2 font-bold text-[var(--purple)]">
                            <Sparkles className="w-4 h-4 text-[var(--purple)] flex-shrink-0" />
                            <span>{card.title || '进入补件跟进邮件共创'}</span>
                          </div>
                          <p className="text-[11px] text-muted leading-relaxed">
                            进入后将拉起案件全景，支持澄清意图、V1-V3 版本链与 A/B 分支对比；确认后存入草稿箱（绝不自动发送）。
                          </p>
                          <div className="flex items-center justify-end space-x-2 pt-1">
                            <button
                              type="button"
                              onClick={() => dismissCard(messageIdx, idx)}
                              className="px-3 py-1.5 rounded-xl font-bold text-[11px] border cursor-pointer"
                              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCoCreateFlowKey((p?.flow_key || 'followup') as any);
                                setCoCreateSessionId(p?.session_id || null);
                                setCoCreateOpen(true);
                                dismissCard(messageIdx, idx);
                              }}
                              className="px-3.5 py-1.5 rounded-xl font-bold text-[11px] text-white cursor-pointer shadow-xs btn-primary"
                            >
                              进入共创
                            </button>
                          </div>
                        </div>
                      );
                    }
                    if ((card.type as string) === 'co_create_session') {
                      const payload = card.payload as any;
                      const fk = (payload?.flow_key || 'followup') as 'followup' | 'chaser' | 'os_reply';
                      const sid = payload?.session_id || null;
                      const flowName = fk === 'chaser' ? '催件跟进' : fk === 'os_reply' ? 'OS 审贷回复' : '补件跟进邮件';
                      return (
                        <div
                          key={idx}
                          className="p-3.5 rounded-2xl border bg-[var(--purple-soft)] border-[var(--purple-soft)] space-y-2 text-xs my-2"
                          id={`co-create-session-card-${idx}`}
                        >
                          <div className="flex items-center space-x-2 font-bold text-[var(--purple)]">
                            <Sparkles className="w-4 h-4 text-[var(--purple)] flex-shrink-0" />
                            <span>已进入【{flowName}】共创弹窗</span>
                          </div>
                          <p className="text-[11px] text-muted leading-relaxed">
                            已加载案件全景数据，支持对话澄清、离线草稿优化与版本链对比。
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setCoCreateFlowKey(fk);
                              setCoCreateSessionId(sid);
                              setCoCreateOpen(true);
                            }}
                            className="px-3.5 py-1.5 rounded-xl font-extrabold text-[11px] text-white cursor-pointer hover:opacity-90 flex items-center space-x-1 shadow-xs btn-primary"
                            id={`reopen-co-create-btn-${idx}`}
                          >
                            <span>继续共创</span>
                          </button>
                        </div>
                      );
                    }
                    if (card.type === 'co_create_record') {
                      const rec = card.payload as any;
                      return (
                        <div
                          key={idx}
                          className="p-3.5 rounded-2xl border bg-[var(--bg-card)] border-[var(--border)] space-y-2 text-xs my-2"
                          id={`co-record-${idx}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs" style={{ color: 'var(--text-primary)' }}>
                              ✉️ {rec?.subject || '补件邮件'} <span className="text-muted">({rec?.version || 'V1'})</span>
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--yellow-soft)] text-[var(--yellow)]">
                              草稿 · 已存入草稿箱
                            </span>
                          </div>
                          <div
                            className="rounded-xl border bg-[var(--bg-subtle)] p-2.5 text-[11px] whitespace-pre-wrap max-h-40 overflow-auto font-mono"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                          >
                            {rec?.body || '（无邮件正文）'}
                          </div>
                          <div className="flex items-center justify-end space-x-2 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setCoCreateFlowKey((rec?.flow_key || 'followup') as any);
                                setCoCreateSessionId(rec?.session_id || null);
                                setCoCreateOpen(true);
                              }}
                              className="px-3 py-1.5 rounded-xl font-bold text-[11px] text-white cursor-pointer shadow-xs btn-primary"
                              id={`reopen-record-cocreate-${idx}`}
                            >
                              重新打开共创
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (rec?.body) {
                                  navigator.clipboard.writeText(rec.body);
                                  useToastStore.getState().showToast('success', '邮件正文已复制');
                                }
                              }}
                              className="px-3 py-1.5 rounded-xl font-bold text-[11px] border cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors"
                              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                              id={`copy-record-body-${idx}`}
                            >
                              复制正文
                            </button>
                          </div>
                        </div>
                      );
                    }
                    if (card.type === 'draft') {
                      return (
                        <DraftCard
                          key={idx}
                          draft={card.payload as unknown as DraftPayload}
                          clientName={activeCaseInfo?.clientName || '客户'}
                          lender={activeCaseInfo?.lender || ''}
                        />
                      );
                    }
                    if (card.type === 'declaration_check' || card.type === 'declaration') {
                      return (
                        <DeclarationCheckCard
                          key={idx}
                          caseId={caseId}
                        />
                      );
                    }
                    if (card.type === 'flow_folder_lookup' || card.type === 'folder_lookup') {
                      return (
                        <FolderLookupCard
                          key={idx}
                          payload={card.payload as unknown as any}
                          caseId={caseId}
                        />
                      );
                    }
                    if (card.type === 'flow_gap_analysis' || card.type === 'gap_analysis') {
                      return (
                        <GapAnalysisCard
                          key={idx}
                          payload={card.payload as unknown as any}
                          caseId={caseId}
                        />
                      );
                    }
                    return null;
                  })}
                </div>
              )}

              {/* Suggested Actions */}
              {m.role === 'assistant' && m.suggested_actions && m.suggested_actions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {m.suggested_actions.map((act, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSuggestedAction(act)}
                      className="px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    >
                      ⚡ {act}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}</>
        )}

        {/* Low Confidence Confirm Cards */}
        {caseId && pendingEvents.length > 0 && (
          <div className="pt-2 space-y-2">
            {pendingEvents.map((evt) => (
              <ConfirmCard key={evt.id} event={evt} onConfirm={handleConfirmEvent} onDismiss={handleDismissEvent} />
            ))}
          </div>
        )}

        {/* AI 深度思考中的动态交互气泡 */}
        {sending && (!streamingMessageId || !messages.some((m) => m.id === streamingMessageId)) && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-start space-y-1.5 pt-1"
          >
            <div className="flex items-center space-x-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <Bot className="w-3 h-3 text-[var(--purple)] animate-pulse" />
              <span>Vera AI</span>
              <span>· 正在分析</span>
            </div>
            <div 
              className="p-3 rounded-2xl text-xs max-w-[85%] border flex items-center space-x-2.5 bg-[var(--bg-card)] shadow-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              {activeStepLabel.includes('工具') || activeStepLabel.includes('检索') || activeStepLabel.includes('查询') ? (
                <Wrench className="w-4 h-4 animate-spin text-[var(--purple)] shrink-0" />
              ) : (
                <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)] shrink-0" />
              )}
              <span className="animate-pulse font-medium">
                {activeStepLabel || 'Vera AI 正在全面检索案卷大脑并组织建议...'}
              </span>
            </div>
          </motion.div>
        )}

        {/* Scroll Anchor */}
        <div ref={messagesEndRef} className="h-2 shrink-0" />
      </div>

      {/* Floating "↓ 最新消息" Button */}
      <AnimatePresence>
        {showScrollBottomBtn && (
          <motion.button
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            onClick={() => scrollToBottom('smooth')}
            id="scroll-to-bottom-btn"
            className="absolute right-6 bottom-4 z-20 px-3 py-1.5 rounded-full bg-[var(--accent)] text-[var(--on-accent)] font-bold text-xs shadow-lg flex items-center gap-1.5 hover:opacity-90 transition-all cursor-pointer"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            <span>↓ 最新消息</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Codex Turn Rail Minimap (提问节点侧边导航条) */}
      {userTurns.length > 1 && (
        <div 
          className="absolute right-1.5 top-1/2 -translate-y-1/2 z-20 flex flex-col items-end gap-3 py-3 px-1 pointer-events-auto"
          id="chat-turn-minimap"
        >
          {userTurns.map((turn, turnIdx) => (
            <button
              key={turn.id || turnIdx}
              type="button"
              onClick={() => {
                const el = document.getElementById(`chat-message-${turn.id}`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="group relative flex items-center justify-end py-1 focus:outline-none cursor-pointer"
            >
              {/* 悬停精巧气泡 */}
              <div className="absolute right-4 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-lg bg-[var(--bg-panel)]/90 backdrop-blur-md border border-[var(--border)] text-[10px] text-[var(--text-secondary)] shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 translate-x-1 group-hover:translate-x-0 z-30">
                <span className="font-semibold text-[var(--accent)] mr-1">#{turnIdx + 1}</span>
                {turn.content.slice(0, 16)}...
              </div>
              {/* 优雅刻度短横线：常态极淡(6px)，悬停微加长(12px) */}
              <div className="w-1.5 h-[2px] rounded-full bg-[var(--text-muted)] opacity-30 group-hover:opacity-100 group-hover:w-3.5 group-hover:bg-[var(--accent)] group-hover:h-[3px] transition-all duration-200 ease-out" />
            </button>
          ))}
        </div>
      )}
    </div>

      {/* Hidden File Attachment Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".pdf,.doc,.docx,.xlsx,.xls,.msg,.txt,.jpg,.jpeg,.png,.csv"
        className="hidden"
        id="brain-chat-file-input"
      />

      {/* 快捷提问（按场景选组，常驻） */}
      <div className="px-3 pb-1 flex items-center gap-1.5 flex-wrap flex-shrink-0"
           style={{ backgroundColor: 'var(--bg-panel)' }}>
        {quickAsks.map((item, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => {
              if (item.label === '查一下银行政策' && activeCaseInfo?.lender) {
                handleSend(`查一下 ${activeCaseInfo.lender} 的政策`);
              } else if (item.label === '生成这周周报') {
                handleSend('生成这周的周报，总结都推进了哪些案件');
              } else {
                handleQuickAsk(item);
              }
            }}
            id={`quick-ask-chip-${idx}`}
            className="px-2.5 py-1 rounded-full border text-[11px] font-medium cursor-pointer transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--bg-card-hover)]"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* 3. Input Footer */}
      <div className="p-3 border-t flex items-center space-x-2 flex-shrink-0 relative" style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}>
        {/* Recorded Events Capsule Pill */}
        {caseId && confirmedEvents.length > 0 && (
          <motion.button
            whileTap={{ scale: 0.94 }}
            type="button"
            onClick={() => setDrawerOpen(true)}
            id="recorded-events-pill"
            title={pendingEvents.length > 0 ? `有 ${pendingEvents.length} 条待确认记录` : `已记录 ${confirmedEvents.length} 条`}
            className="relative px-2.5 py-1.5 rounded-xl border flex items-center space-x-1 font-bold text-xs bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] text-[var(--text-primary)] border-[var(--border)] transition-all cursor-pointer flex-shrink-0"
          >
            <span>📌</span>
            <span>{confirmedEvents.length}</span>
            {pendingEvents.length > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[var(--red)] animate-pulse ring-2 ring-[var(--bg-card)]" title={`有 ${pendingEvents.length} 条待确认记录`} />
            )}
          </motion.button>
        )}

        {/* Tools Popover Button */}
        <div className="relative flex-shrink-0">
          <motion.button
            whileTap={{ scale: 0.94 }}
            type="button"
            onClick={() => setToolsMenuOpen(!toolsMenuOpen)}
            id="brain-tools-btn"
            title="快捷工具与提问菜单"
            className="px-2.5 py-1.5 rounded-xl border flex items-center space-x-1 font-bold text-xs bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] text-[var(--text-primary)] border-[var(--border)] transition-all cursor-pointer flex-shrink-0"
          >
            <Zap className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
            <span>工具</span>
          </motion.button>

          <AnimatePresence>
            {toolsMenuOpen && (
              <motion.div
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.96  }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.96  }}
                className="absolute bottom-full mb-2 left-0 w-64 p-2 rounded-2xl border shadow-xl glass-panel z-40 space-y-2 text-xs"
                style={{ transformOrigin: 'bottom left', backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
                id="brain-tools-popover"
              >
                {/* Tool Actions Section */}
                <div>
                  <div className="px-2 py-1 text-xs font-extrabold text-muted uppercase tracking-wider">
                    工具动作
                  </div>
                  <div className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCalculatorOpen(true);
                        setToolsMenuOpen(false);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-xl flex items-center space-x-2 text-left hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer group"
                      id="tool-opt-calculator"
                    >
                      <Calculator className="w-3.5 h-3.5 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]" />
                      <span>服务能力计算器</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        openEmailCoCreate();
                        setToolsMenuOpen(false);
                      }}
                      className={`w-full px-2.5 py-1.5 rounded-xl flex items-center space-x-2 text-left transition-colors cursor-pointer group ${
                        activeCaseInfo ? 'hover:bg-[var(--bg-card-hover)]' : 'opacity-50 cursor-not-allowed'
                      }`}
                      id="tool-opt-email"
                    >
                      <Mail className="w-3.5 h-3.5 text-[var(--purple)] group-hover:text-[var(--text-primary)]" />
                      <span>写补件邮件 (共创深谈)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setNewCaseOpen(true);
                        setToolsMenuOpen(false);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-xl flex items-center space-x-2 text-left hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer group"
                      id="tool-opt-newcase"
                    >
                      <PlusCircle className="w-3.5 h-3.5 text-[var(--accent)] group-hover:text-[var(--text-primary)]" />
                      <span>帮我建一个案件</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (!activeCaseInfo) {
                          useToastStore.getState().showToast('info', '请先选择案件');
                          return;
                        }
                        handleSend('去案件文件夹找材料');
                        setToolsMenuOpen(false);
                      }}
                      className={`w-full px-2.5 py-1.5 rounded-xl flex items-center space-x-2 text-left transition-colors cursor-pointer group ${
                        activeCaseInfo ? 'hover:bg-[var(--bg-card-hover)]' : 'opacity-50 cursor-not-allowed'
                      }`}
                      id="tool-opt-folder"
                    >
                      <FolderSearch className="w-3.5 h-3.5 text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]" />
                      <span>去案件文件夹找材料</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex-1 flex items-center px-2.5 py-1.5 rounded-xl border space-x-1.5 transition-colors focus-within:border-[var(--border-active)]" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)' }}>
          <motion.button
            whileTap={{ scale: 0.92 }}
            type="button"
            onClick={() => {
              if (!activeCaseInfo) {
                useToastStore.getState().showToast('info', '请先选择左侧案件，再发送附件给 Vera');
                return;
              }
              fileInputRef.current?.click();
            }}
            disabled={uploadingFile}
            id="brain-chat-attach-btn"
            title="发文件/图片给 VERA 识别 (OCR: 工资单/流水/证件)"
            className="p-1 rounded-lg hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50"
          >
            {uploadingFile ? (
              <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
            ) : (
              <Paperclip className="w-4 h-4" />
            )}
          </motion.button>
          <input id="brain-chat-input" type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={activeCaseInfo ? `向 Vera AI 提问或发指令 (${activeCaseInfo.clientName})...` : "向 Vera AI 全局咨询..."}
            className="bg-transparent border-none outline-none focus:outline-none focus:ring-0 w-full text-xs" style={{ color: 'var(--text-primary)' }} />
        </div>
        <motion.button whileTap={{ scale: 0.94 }} onClick={() => handleSend()} disabled={sending} id="brain-chat-send-btn"
          className="px-3.5 py-2 rounded-xl font-semibold text-xs flex items-center space-x-1 cursor-pointer text-white shadow-xs btn-primary">
          <span>发送</span><Send className="w-3 h-3" />
        </motion.button>
      </div>

      {/* Recorded Events Drawer */}
      <RecordedEventsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} events={confirmedEvents} onRevoke={handleRevokeEvent} />

      {/* Calculator Modal Tool Panel */}
      <CalculatorPanel
        isOpen={isCalculatorOpen}
        caseId={currentCase?.caseId}
        onClose={() => setIsCalculatorOpen(false)}
      />

      {/* Submission Mode Secondary Confirmation Modal */}
      <AnimatePresence>
        {showSubmissionConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-app)]/80 backdrop-blur-xs">
            <motion.div
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md p-5 rounded-2xl border shadow-2xl space-y-4 glass-panel"
              style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center space-x-2">
                  <div className="p-2 rounded-xl bg-[var(--yellow-soft)] text-[var(--yellow)]">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm" style={{ color: 'var(--text-primary)' }}>进入递交模式？</h3>
                    <p className="text-[11px] text-muted">包含外线与披露内容合规生成过滤</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSubmissionConfirmModal(false)}
                  className="p-1.5 rounded-lg text-muted hover:text-primary transition-colors cursor-pointer"
                  id="close-submission-confirm-modal-btn"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                递交模式下 AI 只引用已披露/外线内容生成对外草稿，内线信息不会出现在外线内容中；草稿仍需你确认后发送。
              </p>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <button
                  type="button"
                  onClick={() => setShowSubmissionConfirmModal(false)}
                  className="px-3.5 py-1.5 rounded-xl border font-bold text-xs text-muted hover:text-primary transition-colors cursor-pointer"
                  style={{ borderColor: 'var(--border)' }}
                  id="cancel-submission-confirm-btn"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('external');
                    useToastStore.getState().showToast('success', '已进入递交模式');
                    setShowSubmissionConfirmModal(false);
                  }}
                  className="px-4 py-1.5 rounded-xl bg-[var(--yellow)] hover:bg-[var(--yellow)] text-white font-bold text-xs transition-all cursor-pointer shadow-md"
                  id="confirm-enter-submission-btn"
                >
                  进入递交
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Co-Creation Centered Dialog */}
      <CoCreateDialog
        open={coCreateOpen}
        onClose={() => setCoCreateOpen(false)}
        caseId={caseId}
        flowKey={coCreateFlowKey}
        sessionId={coCreateSessionId}
        clientName={activeCaseInfo?.clientName || '客户'}
        lender={activeCaseInfo?.lender || '银行'}
        onConfirmed={handleCoCreateConfirmed}
      />

    </div>
  );
}
