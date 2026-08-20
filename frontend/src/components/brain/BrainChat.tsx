import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Brain, Bot, Plus, MessageSquare, AlertTriangle, ShieldAlert, X, Zap, Calculator, Mail, FolderSearch, PanelRightClose, PanelRightOpen, Wrench, CheckCircle2 } from 'lucide-react';
import { getChatHistory, sendChatStream, sendCardAction } from '../../services/api/chat';
import { listContextEvents, confirmContextEvent, supersedeContextEvent, createContextEvent } from '../../services/api/cases';
import { importCaseFile, getCaseFilePreview } from '../../services/api/fileOps';
import { ChatMessageResponse, ContextEvent, ToolCard, DraftPayload, SubmissionSuggestPayload, AttributionSuggestPayload, AssistantSettingsResponse } from '../../types/api';
import { getAssistantSettings } from '../../services/api/assistant';
import { useToastStore } from '../../stores/toastStore';
import { useCaseStore } from '../../stores/caseStore';
import { useUiStore } from '../../stores/uiStore';
import { useModeStore } from '../../stores/modeStore';
import { RecordedEventsDrawer } from './RecordedEventsDrawer';
import { CaseReminderBanner } from './CaseReminderBanner';
import { CalculatorPanel } from '../calculator/CalculatorPanel';
import { useTaskStore } from '../../stores/taskStore';
import { CoCreateDialog } from './CoCreateDialog';
import { ChatMessageList } from './chat/ChatMessageList';
import { ChatInputBar } from './chat/ChatInputBar';

interface BrainChatProps {
  caseId: string | null;
  onOpenDeck?: (tab: 'tasks' | 'checklist' | 'files') => void;
  onOpenSettings?: () => void;
}

export function BrainChat({ caseId, onOpenDeck, onOpenSettings }: BrainChatProps) {
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
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [dismissedConfirmCardMsgs, setDismissedConfirmCardMsgs] = useState<Record<string, boolean>>({});

  const showToast = useToastStore((s) => s.showToast);
  const currentCase = useCaseStore((s) => (caseId ? s.cases.find((c) => c.id === caseId) : null));
  const track = useModeStore((s) => s.track);

  // Format timestamp helper
  const formatChatTime = useCallback((isoStr?: string) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return '';
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      if (diffMs < 60000 && diffMs >= 0) return '刚刚';
      const hours = d.getHours().toString().padStart(2, '0');
      const mins = d.getMinutes().toString().padStart(2, '0');
      return `${hours}:${mins}`;
    } catch {
      return '';
    }
  }, []);

  const handleCopyMessage = useCallback((text: string, id: number | string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMsgId(id);
      showToast('已复制回复正文', 'success');
      setTimeout(() => {
        setCopiedMsgId((prev) => (prev === id ? null : prev));
      }, 2000);
    });
  }, [showToast]);

  // Load chat history & assistant profile
  const fetchChatHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getChatHistory(caseId);
      if (res && Array.isArray(res.messages)) {
        setMessages(res.messages);
      }
    } catch (e: any) {
      logger.error('Failed to load chat history', e);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  const fetchAssistantProfile = useCallback(async () => {
    try {
      const res = await getAssistantSettings();
      if (res) {
        setAssistantData(res);
        if (!caseId && !dismissedOnboarding) {
          setShowOnboarding(true);
        }
      }
    } catch (e) {
      // Non-fatal
    }
  }, [caseId, dismissedOnboarding]);

  const fetchEvents = useCallback(async () => {
    if (!caseId) {
      setPendingEvents([]);
      setConfirmedEvents([]);
      return;
    }
    try {
      const res = await listContextEvents(caseId);
      if (res && Array.isArray(res.events)) {
        setPendingEvents(res.events.filter((ev) => ev.status === 'pending'));
        setConfirmedEvents(res.events.filter((ev) => ev.status === 'confirmed'));
      }
    } catch (e) {
      // Non-fatal
    }
  }, [caseId]);

  useEffect(() => {
    fetchChatHistory();
    fetchAssistantProfile();
    fetchEvents();
  }, [fetchChatHistory, fetchAssistantProfile, fetchEvents]);

  // Scroll listeners
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distanceToBottom <= 80;
    setIsNearBottom(near);
    setShowScrollBottomBtn(distanceToBottom > 240);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
    }
  }, []);

  useEffect(() => {
    if (isNearBottom || isUserSending) {
      scrollToBottom(isUserSending ? 'auto' : 'smooth');
      if (isUserSending) setIsUserSending(false);
    }
  }, [messages, isNearBottom, isUserSending, scrollToBottom]);

  // Submit chat stream
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = prompt.trim();
    if (!query || sending) return;

    setPrompt('');
    setSending(true);
    setIsUserSending(true);
    setActiveStepStatus('running');
    setActiveStepLabel('正在分析当前案卷画像与诉求...');

    const userMsgId = Date.now();
    const assistantMsgId = userMsgId + 1;
    setStreamingMessageId(String(assistantMsgId));

    const userMsg: ChatMessageResponse = {
      id: userMsgId,
      role: 'user',
      content: query,
      created_at: new Date().toISOString(),
    };
    const initialAssistantMsg: ChatMessageResponse = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg, initialAssistantMsg]);

    try {
      await sendChatStream(
        {
          case_id: caseId || undefined,
          message: query,
          track,
        },
        (chunk: string) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, content: msg.content + chunk } : msg
            )
          );
        },
        (step: { label: string; status: 'running' | 'generating' | 'done' }) => {
          setActiveStepLabel(step.label || '');
          setActiveStepStatus(step.status || 'running');
        },
        (toolData: { tool: string; label: string }) => {
          setActiveStepLabel(toolData.label || `正在执行 ${toolData.tool}...`);
          setActiveStepStatus('running');
        },
        (cards: { tool_cards?: ToolCard[]; recorded_facts?: any[] }) => {
          if (cards.tool_cards && cards.tool_cards.length > 0) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId ? { ...msg, tool_cards: cards.tool_cards } : msg
              )
            );
          }
          if (cards.recorded_facts && cards.recorded_facts.length > 0) {
            fetchEvents();
          }
        },
        () => {
          // Stream completed
          setActiveStepStatus('done');
          setActiveStepLabel('');
          setStreamingMessageId(null);
          setSending(false);
          fetchEvents();
        }
      );
    } catch (err: any) {
      showToast(`发送失败: ${err?.message || '网络连接异常'}`, 'error');
      setActiveStepStatus('done');
      setActiveStepLabel('');
      setStreamingMessageId(null);
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // File Attachment & Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const form = new FormData();
      form.append('file', file);
      if (caseId) form.append('case_id', caseId);

      const res = await importCaseFile(form);
      if (res && res.filename) {
        setLastAttachedFile({
          name: res.filename,
          textPreview: res.text_preview || '',
        });
        showToast(`文件「${res.filename}」识别成功`, 'success');
        setPrompt((prev) => (prev ? `${prev}\n[已关联文件: ${res.filename}]` : `[已关联文件: ${res.filename}]`));
      }
    } catch (err: any) {
      showToast(`文件上传失败: ${err?.message || '未知错误'}`, 'error');
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="h-full flex flex-col relative bg-[var(--bg-card)] rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: 'var(--border)' }}>
      {/* Header Bar */}
      <div className="h-12 border-b flex items-center justify-between px-4 flex-shrink-0 bg-[var(--bg-card)]" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-[var(--purple-soft)] text-[var(--purple)]">
            <Brain className="w-4 h-4" />
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="font-bold text-xs" style={{ color: 'var(--text-primary)' }}>
              {caseId ? (currentCase?.client_name ? `${currentCase.client_name} · 案卷大脑` : '案卷大脑') : '全局 AI 助手'}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--green-soft)] text-[var(--green)] font-medium">
              0.8s 秒级流式
            </span>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center space-x-2">
          {caseId && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="text-xs px-2.5 py-1 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] flex items-center space-x-1 transition-colors cursor-pointer"
            >
              <span>事实账本</span>
              {pendingEvents.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Case Reminder Banner (If any blockers or overdue tasks exist) */}
      {caseId && currentCase && (
        <CaseReminderBanner
          caseObj={currentCase}
          onOpenDeck={onOpenDeck}
        />
      )}

      {/* Message List Area */}
      <ChatMessageList
        messages={messages}
        caseId={caseId}
        loading={loading}
        streamingMessageId={streamingMessageId}
        activeStepLabel={activeStepLabel}
        activeStepStatus={activeStepStatus}
        copiedMsgId={copiedMsgId}
        dismissedConfirmCardMsgs={dismissedConfirmCardMsgs}
        assistantData={assistantData}
        showOnboarding={showOnboarding}
        dismissedOnboarding={dismissedOnboarding}
        onDismissOnboarding={() => setDismissedOnboarding(true)}
        onOpenSettings={onOpenSettings || (() => {})}
        onCopyMessage={handleCopyMessage}
        onDismissConfirmCard={(id) => setDismissedConfirmCardMsgs((prev) => ({ ...prev, [id]: true }))}
        onOpenSubmissionConfirm={() => setShowSubmissionConfirmModal(true)}
        onOpenCoCreate={(flowKey, sessionId) => {
          setCoCreateFlowKey(flowKey);
          setCoCreateSessionId(sessionId || null);
          setCoCreateOpen(true);
        }}
        onSelectQuickAsk={(q) => {
          setPrompt(q);
        }}
        formatChatTime={formatChatTime}
        scrollContainerRef={scrollContainerRef}
        messagesEndRef={messagesEndRef}
        isNearBottom={isNearBottom}
        showScrollBottomBtn={showScrollBottomBtn}
        onScroll={handleScroll}
        onScrollToBottom={() => scrollToBottom('smooth')}
      />

      {/* Input Bar */}
      <ChatInputBar
        prompt={prompt}
        sending={sending}
        uploadingFile={uploadingFile}
        lastAttachedFile={lastAttachedFile}
        toolsMenuOpen={toolsMenuOpen}
        caseId={caseId}
        onPromptChange={setPrompt}
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDown}
        onToggleToolsMenu={() => setToolsMenuOpen((prev) => !prev)}
        onCloseToolsMenu={() => setToolsMenuOpen(false)}
        onSelectQuickAsk={(q) => setPrompt(q)}
        onRemoveAttachedFile={() => setLastAttachedFile(null)}
        onTriggerFileUpload={() => fileInputRef.current?.click()}
        onFileUpload={handleFileUpload}
        onOpenCalculator={() => setIsCalculatorOpen(true)}
        onOpenCoCreate={(flowKey) => {
          setCoCreateFlowKey(flowKey);
          setCoCreateOpen(true);
        }}
        fileInputRef={fileInputRef}
      />

      {/* Recorded Events Drawer */}
      {caseId && (
        <RecordedEventsDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          caseId={caseId}
          pendingEvents={pendingEvents}
          confirmedEvents={confirmedEvents}
          onRefresh={fetchEvents}
        />
      )}

      {/* Calculator Modal */}
      {isCalculatorOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-[90vh] bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-2xl flex flex-col overflow-hidden">
            <div className="h-12 border-b flex items-center justify-between px-4 border-[var(--border)]">
              <span className="font-bold text-sm text-[var(--text-primary)]">
                银行借贷能力测算引擎
              </span>
              <button
                type="button"
                onClick={() => setIsCalculatorOpen(false)}
                className="p-1 rounded-lg hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <CalculatorPanel caseId={caseId || undefined} />
            </div>
          </div>
        </div>
      )}

      {/* CoCreate Modal */}
      {coCreateOpen && (
        <CoCreateDialog
          open={coCreateOpen}
          onClose={() => setCoCreateOpen(false)}
          caseId={caseId || ''}
          flowKey={coCreateFlowKey}
          initialSessionId={coCreateSessionId}
        />
      )}
    </div>
  );
}
