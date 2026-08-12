import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Send, Brain, Bot, User, PanelRightClose, Plus } from 'lucide-react';
import { getChatHistory, sendChat } from '../../services/api/chat';
import { ChatMessageResponse } from '../../types/api';
import { useToastStore } from '../../stores/toastStore';
import { useCaseStore } from '../../stores/caseStore';
import { useUiStore } from '../../stores/uiStore';

interface BrainChatProps {
  caseId: string | null;
  onTogglePanorama?: () => void;
}

const MOCK_MESSAGES: ChatMessageResponse[] = [
  { id: 'msg-1', role: 'user', content: '请帮我核对客户的收入和补件清单要求。', created_at: '10 分钟前' },
  { id: 'msg-2', role: 'assistant', content: '已对齐银行最新政策：客户 PAYG 净收入符合 LVR 标准，尚缺 2025 年 NOA 及买卖合同签署件。', suggested_actions: ['发送催件邮件', '提醒账户补件', '标记优先跟进'], created_at: '9 分钟前' },
];

export function BrainChat({ caseId, onTogglePanorama }: BrainChatProps) {
  const [messages, setMessages] = useState<ChatMessageResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);

  const { cases, currentCase } = useCaseStore();
  const setNewCaseOpen = useUiStore((s) => s.setNewCaseOpen);
  const activeCaseInfo = caseId ? (cases.find((c) => c.caseId === caseId) || currentCase) : null;

  const fetchHistory = useCallback(async () => {
    if (!caseId) {
      setMessages([]);
      return;
    }
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

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const handleSend = async () => {
    if (!prompt.trim() || sending) return;
    const text = prompt.trim();
    setPrompt('');
    const userMsg: ChatMessageResponse = { id: `usr-${Date.now()}`, role: 'user', content: text, created_at: '刚刚' };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      const assistantMsg: ChatMessageResponse = {
        id: `ast-${Date.now()}`,
        role: 'assistant',
        content: `已接收指令："${text}"。Vera AI 已根据 ${activeCaseInfo ? `案件 [${activeCaseInfo.clientName}]` : '全局模式'} 分析完毕。`,
        suggested_actions: ['发送催件邮件', '生成回复草稿', '派单给团队'],
        created_at: '刚刚',
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setSending(false);
      return;
    }

    try {
      const res = await sendChat({ message: text, case_id: caseId ?? undefined });
      const assistantMsg: ChatMessageResponse = {
        id: `ast-${Date.now()}`, role: 'assistant', content: res.reply,
        suggested_actions: res.suggested_actions, created_at: '刚刚',
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      useToastStore.getState().showToast('error', '发送消息失败，请重试');
    } finally {
      setSending(false);
    }
  };

  const handleActionClick = (_action: string) => {
    useToastStore.getState().showToast('info', '建议动作已提交');
  };

  return (
    <div className="flex-1 h-full flex flex-col transition-colors select-none overflow-hidden min-w-0" style={{ backgroundColor: 'var(--bg-app)' }} id="brain-chat">
      {/* 1. Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between text-xs flex-shrink-0" style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}>
        {activeCaseInfo ? (
          <div className="flex items-center space-x-2 truncate">
            <span className="font-extrabold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{activeCaseInfo.clientName}</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400">{activeCaseInfo.lender}</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-black/5 dark:bg-white/10 text-muted">{activeCaseInfo.stage}</span>
            <span className="text-[11px] text-muted hidden md:inline ml-2 flex items-center space-x-1">
              <Brain className="w-3.5 h-3.5 text-purple-500 inline mr-1" />
              已注入案件上下文
            </span>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            <span className="font-extrabold text-sm" style={{ color: 'var(--text-primary)' }}>全局咨询</span>
          </div>
        )}

        {onTogglePanorama && (
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={onTogglePanorama}
            className="p-1.5 rounded-lg border text-muted hover:text-primary transition-colors cursor-pointer flex items-center space-x-1"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
            title="展开/收起右栏客户全景"
            id="brain-chat-toggle-panorama-btn"
          >
            <PanelRightClose className="w-4 h-4" />
            <span className="text-[11px] font-medium hidden sm:inline">客户全景</span>
          </motion.button>
        )}
      </div>

      {/* 2. Chat Stream or Empty State */}
      <div className="p-4 space-y-3 flex-1 overflow-y-auto no-scrollbar">
        {!activeCaseInfo && messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="p-4 rounded-2xl bg-purple-500/10 text-purple-500">
              <Sparkles className="w-8 h-8" />
            </div>
            <div className="space-y-1 max-w-sm">
              <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>全局咨询模式</h3>
              <p className="text-xs text-muted">选择左侧案件开始深入对话，或直接向 Vera 发问。</p>
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setNewCaseOpen(true)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center space-x-1.5 cursor-pointer shadow-xs"
              style={{ backgroundColor: 'var(--accent)' }}
              id="global-chat-new-case-btn"
            >
              <Plus className="w-4 h-4" />
              <span>＋ 新建案件</span>
            </motion.button>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            <div className="h-10 rounded-xl animate-pulse bg-black/10 dark:bg-white/10 w-2/3" />
            <div className="h-10 rounded-xl animate-pulse bg-black/10 dark:bg-white/10 w-1/2 ml-auto" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted">问 Vera 关于此案件的任何问题...</div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} space-y-1.5`}>
              <div className="flex items-center space-x-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {m.role === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3 text-purple-500" />}
                <span>{m.role === 'user' ? '我' : 'Vera AI'}</span>
                <span>· {m.created_at}</span>
              </div>
              <div
                className={`p-3 rounded-2xl text-xs max-w-[85%] leading-relaxed ${m.role === 'user' ? 'text-white shadow-xs' : 'border'}`}
                style={m.role === 'user' ? { backgroundColor: 'var(--accent)' } : { backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                {m.content}
              </div>
              {m.role === 'assistant' && m.suggested_actions && m.suggested_actions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {m.suggested_actions.map((act, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleActionClick(act)}
                      className="px-2.5 py-1 rounded-lg border text-[11px] font-medium cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    >
                      ⚡ {act}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 3. Input Footer */}
      <div className="p-3 border-t flex items-center space-x-2 flex-shrink-0" style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}>
        <div className="flex-1 flex items-center px-3 py-2 rounded-xl border space-x-2" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)' }}>
          <Sparkles className="w-4 h-4 text-purple-500 flex-shrink-0" />
          <input
            id="brain-chat-input"
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={activeCaseInfo ? `向 Vera AI 提问或发指令 (${activeCaseInfo.clientName})...` : "向 Vera AI 全局咨询..."}
            className="bg-transparent border-none outline-none w-full text-xs"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={handleSend}
          disabled={sending}
          className="px-3.5 py-2 rounded-xl font-semibold text-xs flex items-center space-x-1 cursor-pointer text-white shadow-xs"
          style={{ backgroundColor: 'var(--accent)' }}
          id="brain-chat-send-btn"
        >
          <span>发送</span>
          <Send className="w-3 h-3" />
        </motion.button>
      </div>
    </div>
  );
}
