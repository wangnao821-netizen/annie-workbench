import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Send, Brain, Bot, User } from 'lucide-react';
import { getChatHistory, sendChat } from '../../services/api/chat';
import { ChatMessageResponse } from '../../types/api';
import { useToastStore } from '../../stores/toastStore';

interface ChatPanelProps {
  caseId: string | null;
  onToggleCollapse?: () => void;
}

const MOCK_MESSAGES: ChatMessageResponse[] = [
  { id: 'msg-1', role: 'user', content: '请帮我核对 PERSON_1 的收入和补件清单要求。', created_at: '10 分钟前' },
  { id: 'msg-2', role: 'assistant', content: '已对齐 NAB 最新政策：客户 PAYG 净收入符合 LVR 80% 贷款标准，尚缺 2025 年 NOA 及买卖合同签署件。', suggested_actions: ['发送催件邮件', '提醒账户补件', '标记优先跟进'], created_at: '9 分钟前' },
];

export function ChatPanel({ caseId, onToggleCollapse }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessageResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);

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
        id: `ast-${Date.now()}`, role: 'assistant',
        content: `已接收指令："${text}"。Vera 已根据 ${caseId ? `案件 [${caseId}]` : '全局模式'} 的最新材料分析完毕。`,
        suggested_actions: ['发送催件邮件', '生成回复草稿', '派单给团队'], created_at: '刚刚',
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
    // TODO(WO-03): 动作端点就绪后执行
  };

  return (
    <div className="h-full flex flex-col border-t xl:border-t-0 transition-colors select-none overflow-hidden" style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }} id="ai-chat-panel">
      <div className="px-4 py-2 border-b flex items-center justify-between text-[11px] flex-shrink-0" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
        <div className="flex items-center space-x-2">
          <Brain className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
          <span>{caseId ? `已注入案件上下文: ${caseId}` : '全局 AI 模式（无案件上下文）'}</span>
        </div>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            id="chat-collapse-btn"
            className="flex items-center space-x-1 text-[11px] hover:text-primary transition-colors cursor-pointer"
            title="收起对话框"
          >
            <span>⏷ 收起</span>
          </button>
        )}
      </div>

      <div className="p-4 space-y-3 flex-1 overflow-y-auto no-scrollbar">
        {loading ? (
          <div className="space-y-2">
            <div className="h-8 rounded-xl animate-pulse bg-slate-200 dark:bg-slate-800 w-2/3" />
            <div className="h-8 rounded-xl animate-pulse bg-slate-200 dark:bg-slate-800 w-1/2 ml-auto" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-4 text-xs text-muted">问 AI 关于当前案件的问题...</div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} space-y-1.5`}>
              <div className="flex items-center space-x-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {m.role === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3 text-purple-500" />}
                <span>{m.role === 'user' ? '我' : 'Vera AI'}</span>
                <span>· {m.created_at}</span>
              </div>
              <div
                className={`p-3 rounded-2xl text-xs max-w-[85%] leading-relaxed ${m.role === 'user' ? 'text-white' : 'border'}`}
                style={m.role === 'user' ? { backgroundColor: 'var(--accent)' } : { backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                {m.content}
              </div>
              {m.role === 'assistant' && m.suggested_actions && m.suggested_actions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1 pl-1">
                  {m.suggested_actions.map((act, idx) => (
                    <button
                      key={idx} id={`chat-action-${idx}`} onClick={() => handleActionClick(act)}
                      className="px-2 py-1 rounded-lg border text-[11px] font-medium cursor-pointer hover:opacity-80 transition-opacity"
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

      <div className="p-3 border-t flex items-center space-x-2 flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="flex-1 flex items-center px-3 py-2 rounded-xl border space-x-2" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)' }}>
          <Sparkles className="w-4 h-4 text-purple-500 flex-shrink-0" />
          <input
            id="chat-panel-input" type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="向 Vera 指令（例如：'请生成给客户的补件回复草稿'）..."
            className="bg-transparent border-none outline-none w-full text-xs" style={{ color: 'var(--text-primary)' }}
          />
        </div>
        <motion.button
          whileTap={{ scale: 0.94 }} onClick={handleSend} disabled={sending}
          className="px-3.5 py-2 rounded-xl font-semibold text-xs flex items-center space-x-1 cursor-pointer text-white shadow-xs"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          <span>发送</span>
          <Send className="w-3.5 h-3.5" />
        </motion.button>
      </div>
    </div>
  );
}
