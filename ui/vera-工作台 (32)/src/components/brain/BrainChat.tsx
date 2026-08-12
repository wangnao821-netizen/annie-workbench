import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Send, Brain, Bot, User, PanelRightClose, Plus } from 'lucide-react';
import { getChatHistory, sendChat } from '../../services/api/chat';
import { listContextEvents, confirmContextEvent, supersedeContextEvent } from '../../services/api/cases';
import { ChatMessageResponse, ContextEvent, ToolCard, DraftPayload, SubmissionSuggestPayload } from '../../types/api';
import { useToastStore } from '../../stores/toastStore';
import { useCaseStore } from '../../stores/caseStore';
import { useUiStore } from '../../stores/uiStore';
import { useModeStore } from '../../stores/modeStore';
import { ConfirmCard } from './ConfirmCard';
import { RecordedEventsDrawer } from './RecordedEventsDrawer';
import { SubmissionBanner } from './SubmissionBanner';
import { DraftCard } from './DraftCard';

interface BrainChatProps {
  caseId: string | null;
  onTogglePanorama?: () => void;
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

export function BrainChat({ caseId, onTogglePanorama }: BrainChatProps) {
  const [messages, setMessages] = useState<ChatMessageResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingEvents, setPendingEvents] = useState<ContextEvent[]>([]);
  const [confirmedEvents, setConfirmedEvents] = useState<ContextEvent[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { cases, currentCase } = useCaseStore();
  const setNewCaseOpen = useUiStore((s) => s.setNewCaseOpen);
  const mode = useModeStore((s) => s.mode);
  const setMode = useModeStore((s) => s.setMode);

  const activeCaseInfo = caseId ? (cases.find((c) => c.caseId === caseId) || currentCase) : null;

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
    fetchHistory();
    fetchContextEventsData();
  }, [fetchHistory, fetchContextEventsData]);

  const handleSend = async () => {
    if (!prompt.trim() || sending) return;
    const text = prompt.trim();
    setPrompt('');
    setMessages((prev) => [...prev, { id: `usr-${Date.now()}`, role: 'user', content: text, created_at: '刚刚' }]);
    setSending(true);

    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      const mockToolCards: ToolCard[] = caseId ? [
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
      ] : [];

      setMessages((prev) => [...prev, {
        id: `ast-${Date.now()}`, role: 'assistant',
        content: `已接收指令："${text}"。Vera AI 已根据 ${activeCaseInfo ? `案件 [${activeCaseInfo.clientName}] (${mode === 'external' ? '递交模式' : '内线模式'})` : '全局模式'} 分析完毕。`,
        suggested_actions: ['发送催件邮件', '生成回复草稿', '派单给团队'],
        tool_cards: mockToolCards,
        created_at: '刚刚',
      }]);
      setSending(false);
      return;
    }

    try {
      const res = await sendChat({ message: text, case_id: caseId ?? undefined, track: mode });
      setMessages((prev) => [...prev, {
        id: `ast-${Date.now()}`,
        role: 'assistant',
        content: res.reply,
        suggested_actions: res.suggested_actions,
        tool_cards: res.tool_cards,
        created_at: '刚刚',
      }]);
    } catch {
      useToastStore.getState().showToast('error', '发送消息失败，请重试');
    } finally {
      setSending(false);
    }
  };

  const handleConfirmEvent = async (eventId: number) => {
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      const target = pendingEvents.find((e) => e.id === eventId);
      if (target) {
        setPendingEvents((prev) => prev.filter((e) => e.id !== eventId));
        setConfirmedEvents((prev) => [{ ...target, status: 'confirmed' }, ...prev]);
      }
      useToastStore.getState().showToast('success', '已确认记录');
      return;
    }
    try {
      await confirmContextEvent(caseId!, eventId);
      useToastStore.getState().showToast('success', '已确认记录');
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
    <div className="flex-1 h-full flex flex-col transition-colors select-none overflow-hidden min-w-0" style={{ backgroundColor: 'var(--bg-app)' }} id="brain-chat">
      {/* 1. Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between text-xs flex-shrink-0 glass-panel" style={{ borderColor: 'var(--border)' }}>
        {activeCaseInfo ? (
          <div className="flex items-center space-x-2 truncate">
            <span className="font-extrabold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{activeCaseInfo.clientName}</span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">{activeCaseInfo.lender}</span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-black/5 dark:bg-white/10 text-muted">{activeCaseInfo.stage}</span>
            <span className="text-[11px] text-muted hidden md:inline-flex items-center ml-2">
              <Brain className="w-3.5 h-3.5 text-purple-500 mr-1" />已注入案件上下文
            </span>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <div className="p-1 rounded-lg bg-purple-500/10">
              <Sparkles className="w-4 h-4 text-purple-500" />
            </div>
            <span className="font-extrabold text-sm tracking-tight" style={{ color: 'var(--text-primary)' }}>全局咨询</span>
          </div>
        )}
        {onTogglePanorama && (
          <motion.button whileTap={{ scale: 0.94 }} onClick={onTogglePanorama} id="brain-chat-toggle-panorama-btn"
            className="p-1.5 rounded-lg border text-muted hover:text-primary transition-colors cursor-pointer flex items-center space-x-1"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }} title="展开/收起右栏客户全景">
            <PanelRightClose className="w-4 h-4" /><span className="text-[11px] font-medium hidden sm:inline">客户全景</span>
          </motion.button>
        )}
      </div>

      {/* Submission Mode Banner (Only rendered when caseId is selected) */}
      {caseId && <SubmissionBanner />}

      {/* 2. Chat Stream */}
      <div className="p-4 space-y-4 flex-1 overflow-y-auto no-scrollbar">
        {!activeCaseInfo && messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-5">
            <div className="relative">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-purple-500/20 to-indigo-500/20 flex items-center justify-center border border-purple-500/20 shadow-lg">
                <Sparkles className="w-8 h-8 text-purple-500" />
              </div>
              <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-indigo-500 text-white shadow-xs">
                <Brain className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="space-y-1.5 max-w-sm">
              <h3 className="font-extrabold text-base tracking-tight" style={{ color: 'var(--text-primary)' }}>全局咨询模式</h3>
              <p className="text-xs text-muted leading-relaxed">选择左侧案件开始深入对话，或直接向 Vera AI 询问金融业务、政策与计算方案。</p>
            </div>
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => setNewCaseOpen(true)} id="global-chat-new-case-btn"
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-white flex items-center space-x-2 cursor-pointer shadow-md hover:opacity-90 transition-opacity" style={{ backgroundColor: 'var(--accent)' }}>
              <Plus className="w-4 h-4" /><span>新建案件</span>
            </motion.button>
          </div>
        ) : loading ? (
          <div className="space-y-3"><div className="h-10 rounded-xl animate-pulse bg-black/10 dark:bg-white/10 w-2/3" /><div className="h-10 rounded-xl animate-pulse bg-black/10 dark:bg-white/10 w-1/2 ml-auto" /></div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
              <Brain className="w-6 h-6 text-purple-500" />
            </div>
            <p className="text-xs text-muted font-medium">向 Vera 提问关于此案件的任何细节或补充说明...</p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} space-y-1.5`}>
              <div className="flex items-center space-x-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {m.role === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3 text-purple-500" />}
                <span>{m.role === 'user' ? '我' : 'Vera AI'}</span><span>· {m.created_at}</span>
              </div>
              <div className={`p-3 rounded-2xl text-xs max-w-[85%] leading-relaxed ${m.role === 'user' ? 'text-white shadow-xs' : 'border'}`}
                style={m.role === 'user' ? { backgroundColor: 'var(--accent)' } : { backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                {m.content}
              </div>

              {/* Tool Cards */}
              {m.role === 'assistant' && m.tool_cards && m.tool_cards.length > 0 && caseId !== null && (
                <div className="w-full max-w-[85%] space-y-2 pt-1">
                  {m.tool_cards.map((card, idx) => {
                    if (card.type === 'submission_suggest') {
                      const suggestPayload = card.payload as unknown as SubmissionSuggestPayload;
                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-2xl border bg-amber-500/10 border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs space-y-2"
                          id={`submission-suggest-card-${idx}`}
                        >
                          <div className="flex items-center space-x-2 font-bold text-amber-800 dark:text-amber-300">
                            <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                            <span>{card.title || '建议进入递交模式'}</span>
                          </div>
                          <p className="leading-relaxed text-[11px] opacity-90">
                            {suggestPayload.message || '系统检测到对外沟通需求，建议切换至递交模式。'}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setMode('external');
                              useToastStore.getState().showToast('success', '已进入递交模式');
                            }}
                            className="px-3 py-1.5 rounded-xl font-bold text-[11px] text-white cursor-pointer hover:opacity-90 transition-opacity flex items-center space-x-1 shadow-xs"
                            style={{ backgroundColor: 'var(--accent)' }}
                            id="enter-submission-mode-btn"
                          >
                            <span>进入递交模式</span>
                          </button>
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
                    return null;
                  })}
                </div>
              )}

              {/* Suggested Actions */}
              {m.role === 'assistant' && m.suggested_actions && m.suggested_actions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {m.suggested_actions.map((act, idx) => (
                    <button key={idx} onClick={() => useToastStore.getState().showToast('info', '建议动作已提交')}
                      className="px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                      ⚡ {act}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}

        {/* Low Confidence Confirm Cards */}
        {caseId && pendingEvents.length > 0 && (
          <div className="pt-2 space-y-2">
            {pendingEvents.map((evt) => (
              <ConfirmCard key={evt.id} event={evt} onConfirm={handleConfirmEvent} onDismiss={handleDismissEvent} />
            ))}
          </div>
        )}
      </div>

      {/* Sticky Confirmed Events Indicator */}
      {caseId && confirmedEvents.length > 0 && (
        <div className="px-3 py-2 mx-3 my-1 rounded-xl border flex items-center justify-between text-xs font-semibold bg-purple-500/10 border-purple-500/20 text-purple-700 dark:text-purple-300 flex-shrink-0">
          <div className="flex items-center space-x-1.5">
            <span>📌</span>
            <span>已记录 {confirmedEvents.length} 条</span>
          </div>
          <button type="button" onClick={() => setDrawerOpen(true)} id="view-recorded-events-btn"
            className="font-bold underline cursor-pointer hover:opacity-80 text-purple-600 dark:text-purple-400">
            查看
          </button>
        </div>
      )}

      {/* 3. Input Footer */}
      <div className="p-3 border-t flex items-center space-x-2 flex-shrink-0 glass-panel" style={{ borderColor: 'var(--border)' }}>
        <div className="flex-1 flex items-center px-3 py-2 rounded-xl border space-x-2" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)' }}>
          <Sparkles className="w-4 h-4 text-purple-500 flex-shrink-0" />
          <input id="brain-chat-input" type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={activeCaseInfo ? `向 Vera AI 提问或发指令 (${activeCaseInfo.clientName})...` : "向 Vera AI 全局咨询..."}
            className="bg-transparent border-none outline-none w-full text-xs" style={{ color: 'var(--text-primary)' }} />
        </div>
        <motion.button whileTap={{ scale: 0.94 }} onClick={handleSend} disabled={sending} id="brain-chat-send-btn"
          className="px-3.5 py-2 rounded-xl font-semibold text-xs flex items-center space-x-1 cursor-pointer text-white shadow-xs" style={{ backgroundColor: 'var(--accent)' }}>
          <span>发送</span><Send className="w-3 h-3" />
        </motion.button>
      </div>

      {/* Recorded Events Drawer */}
      <RecordedEventsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} events={confirmedEvents} onRevoke={handleRevokeEvent} />
    </div>
  );
}
