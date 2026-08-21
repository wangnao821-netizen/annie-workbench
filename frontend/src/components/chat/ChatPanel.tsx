import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Sparkles, Send, User, X } from 'lucide-react';
import { getChatHistory, sendChat } from '../../services/api/chat';
import { ChatMessageResponse } from '../../types/api';
import { useToastStore } from '../../stores/toastStore';

interface ChatPanelProps {
  caseId: string | null;
  onToggleCollapse?: () => void;
}

interface QuickPrompt {
  label: string;
  prompt: string;
}

const QUICK_PROMPTS: QuickPrompt[] = [
  { label: '🔍 还缺啥？', prompt: '当前案件还缺哪些材料？请帮我核对清单与风险。' },
  { label: '📋 帮我总结', prompt: '请帮我总结当前案件的整体情况、已知信息与当前进展。' },
  { label: '🏦 政策速览', prompt: '帮我查一下当前案件银行的政策要点（LVR、自雇收入口径与特殊要求）。' },
  { label: '✉️ 写催件信', prompt: '请帮我针对当前缺失的材料起草一份给客户的催件邮件草稿。' },
  { label: '🚨 风险自查', prompt: '帮我识别该案件当前可能面临的红线与风控卡点（如估值、流水、合规）。' },
];

const MOCK_MESSAGES: ChatMessageResponse[] = [
  {
    id: 'msg-1',
    role: 'user',
    content: '请帮我核对客户 PERSON_1 的收入和补件清单要求。',
    created_at: '10 分钟前',
  },
  {
    id: 'msg-2',
    role: 'assistant',
    content: `📌 **案件全景**
已精准对齐 NAB 最新审贷政策：客户 PAYG 净收入与自雇分红均符合 LVR 80% 贷款审批标准。

🚨 **核心卡点**
尚缺 **2025 年 ATO NOA** 及 **买卖合同签署件**。

📋 **材料缺口**
- 2025 税务局 NOA 正式核定单
- 房屋买卖合同正本 (全页签署)

💡 **我的判断**
材料准备度目前为 82%，补齐以上两项后即可触发一键递交。`,
    suggested_actions: ['发送催件邮件', '检查补充材料', '生成审批说明书'],
    created_at: '9 分钟前',
  },
];

function renderFormattedContent(content: string, isUser: boolean) {
  if (!content) return null;
  const lines = content.split('\n');

  return (
    <div className="space-y-1.5 leading-relaxed break-words">
      {lines.map((line, lineIdx) => {
        if (!line.trim()) {
          return <div key={lineIdx} className="h-1" />;
        }

        const isStructuredHeader = /^(📌|🚨|📋|💡|✉️|⚡|🏦|🔍)\s+/.test(line.trim());
        const parts = line.split(/(\*\*.*?\*\*)/g);

        return (
          <p
            key={lineIdx}
            className={`text-xs ${
              isStructuredHeader && !isUser
                ? 'font-semibold text-[var(--purple)] pt-1 pb-0.5 border-b border-purple-500/10'
                : ''
            }`}
          >
            {parts.map((part, pIdx) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                const boldText = part.slice(2, -2);
                return (
                  <strong
                    key={pIdx}
                    className={
                      isUser
                        ? 'font-extrabold text-[var(--on-accent)] underline decoration-white/30 decoration-1 underline-offset-2'
                        : 'font-bold text-[var(--purple)]'
                    }
                  >
                    {boldText}
                  </strong>
                );
              }
              return <span key={pIdx}>{part}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}

export function ChatPanel({ caseId, onToggleCollapse }: ChatPanelProps) {
  const reduced = useReducedMotion();
  const [messages, setMessages] = useState<ChatMessageResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchHistory = useCallback(async () => {
    if (!caseId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    if (import.meta.env.VITE_USE_MOCK === 'true') {
      setMessages(MOCK_MESSAGES);
      setLoading(false);
      return;
    }
    try {
      const history = await getChatHistory(caseId);
      // 顺序契约：后端已按 created_at desc, id desc + reversed 保证提问在上、回答在下，前端原样渲染不重排
      setMessages(history);
    } catch {
      useToastStore.getState().showToast('error', '加载对话历史失败');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    const handleFillChat = (e: CustomEvent<string>) => {
      if (e.detail) {
        setPrompt(e.detail);
      }
    };
    window.addEventListener('fill-chat-input' as any, handleFillChat);
    return () => {
      window.removeEventListener('fill-chat-input' as any, handleFillChat);
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  const handleSend = async (customText?: string) => {
    const text = (typeof customText === 'string' ? customText : prompt).trim();
    if (!text || sending) return;

    if (typeof customText !== 'string') {
      setPrompt('');
    }

    const userMsg: ChatMessageResponse = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: '刚刚',
    };

    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    if (import.meta.env.VITE_USE_MOCK === 'true') {
      setTimeout(() => {
        const assistantMsg: ChatMessageResponse = {
          id: `ast-${Date.now()}`,
          role: 'assistant',
          content: `📌 **解析与反馈**
已成功接收指令："${text}"。

💡 **判断与建议**
          Annie 已根据 ${caseId ? `案卷 [${caseId}]` : '全局业务知识库'} 完成最新事实校验与规则核对。

📋 **推荐跟进项**
- 核对对应银行的最新审贷指南
- 评估申请材料完整度`,
          suggested_actions: ['发送催件邮件', '生成回复草稿', '派单给团队'],
          created_at: '刚刚',
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setSending(false);
      }, 600);
      return;
    }

    try {
      const res = await sendChat({ message: text, case_id: caseId ?? undefined });
      const assistantMsg: ChatMessageResponse = {
        id: `ast-${Date.now()}`,
        role: 'assistant',
        content: res.reply,
        suggested_actions: res.suggested_actions,
        created_at: '刚刚',
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      useToastStore.getState().showToast('error', '发送消息失败，请重试');
    } finally {
      setSending(false);
    }
  };

  const handleActionClick = (action: string) => {
    if (action) {
      handleSend(action);
    }
  };

  return (
    <div
      className="h-full flex flex-col border-t xl:border-t-0 transition-colors select-none overflow-hidden"
      style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
      id="ai-chat-panel"
    >
      {/* 1. 顶部状态栏: Annie 专属微光徽标 + 状态 */}
      <div
        className="px-3.5 py-2.5 border-b flex items-center justify-between text-xs flex-shrink-0 shadow-2xs"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-panel)' }}
      >
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="relative flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 via-indigo-500 to-fuchsia-500 flex items-center justify-center text-white shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <span
              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 rounded-full animate-pulse"
              style={{ borderColor: 'var(--bg-panel)' }}
            title="Annie 在线"
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center space-x-1.5">
              <h3 className="font-extrabold text-xs tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Annie
              </h3>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-[var(--purple-soft)] text-[var(--purple)]">
                Pro
              </span>
            </div>
            <p className="text-[11px] text-muted truncate">
          {caseId ? `Annie 智能业务搭档 · 已注入案卷 [${caseId}]` : 'Annie 智能业务搭档 · 全局经验库'}
            </p>
          </div>
        </div>

        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            id="chat-collapse-btn"
            className="p-1.5 rounded-lg border text-[11px] hover:text-primary transition-colors cursor-pointer flex items-center space-x-1"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            title="收起面板"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 2. 消息展示列表 */}
      <div className="p-3.5 space-y-4 flex-1 overflow-y-auto no-scrollbar">
        {loading ? (
          <div className="space-y-3">
            <div className="h-10 rounded-2xl animate-pulse bg-slate-200 dark:bg-slate-800 w-3/4" />
            <div className="h-10 rounded-2xl animate-pulse bg-slate-200 dark:bg-slate-800 w-1/2 ml-auto" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600/20 to-fuchsia-500/20 text-[var(--purple)] flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
          欢迎与 Annie 协同工作
            </p>
            <p className="text-[11px] text-muted max-w-xs mx-auto">
              向我询问关于当前案件的材料缺口、银行政策对比、核对结果或起草邮件草稿。
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const isUser = m.role === 'user';
            return (
              <div key={m.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1.5`}>
                {/* 发送者名称与头像 */}
                <div className="flex items-center space-x-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {isUser ? (
                    <>
                      <span className="font-bold text-[var(--text-primary)]">Vera (我)</span>
                      <span>· {m.created_at}</span>
                      <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 text-[10px] shrink-0 font-bold">
                        <User className="w-3 h-3" />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-purple-600 to-fuchsia-500 flex items-center justify-center text-white text-[10px] shrink-0 shadow-2xs">
                        <Sparkles className="w-3 h-3" />
                      </div>
        <span className="font-bold text-[var(--purple)]">Annie</span>
                      <span>· {m.created_at}</span>
                    </>
                  )}
                </div>

                {/* 消息气泡 */}
                <div
                  className={`p-3.5 rounded-2xl text-xs max-w-[88%] shadow-xs transition-all ${
                    isUser
                      ? 'rounded-tr-xs text-[var(--on-accent)] font-medium'
                      : 'rounded-tl-xs border'
                  }`}
                  style={
                    isUser
                      ? { backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }
                      : { backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }
                  }
                >
                  {renderFormattedContent(m.content, isUser)}
                </div>

                {/* AI 建议动作列表 */}
                {!isUser && m.suggested_actions && m.suggested_actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1 pl-6">
                    {m.suggested_actions.map((act, idx) => (
                      <button
                        key={idx}
                        id={`chat-action-${m.id}-${idx}`}
                        onClick={() => handleActionClick(act)}
                        className="px-2.5 py-1 rounded-xl border text-[11px] font-bold cursor-pointer hover:bg-[var(--purple-soft)] hover:border-[var(--purple)] hover:text-[var(--purple)] transition-all flex items-center space-x-1 shadow-2xs"
                        style={{
                          backgroundColor: 'var(--bg-card)',
                          borderColor: 'var(--border)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <Sparkles className="w-3 h-3 text-[var(--purple)]" />
                        <span>{act}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* AI 思考中指示器 */}
        {sending && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-start space-y-1.5"
          >
            <div className="flex items-center space-x-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-purple-600 to-fuchsia-500 flex items-center justify-center text-white text-[10px] shrink-0 shadow-2xs">
                <Sparkles className="w-3 h-3 animate-spin" />
              </div>
        <span className="font-bold text-[var(--purple)]">Annie</span>
              <span>· 分析中</span>
            </div>
            <div
              className="p-3 px-3.5 rounded-2xl rounded-tl-xs text-xs border flex items-center space-x-2.5 shadow-2xs"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--purple)',
                color: 'var(--text-secondary)',
              }}
            >
              <Sparkles className="w-3.5 h-3.5 text-[var(--purple)] animate-bounce" />
              <span className="animate-pulse font-medium text-[var(--purple)]">
          Annie 正在分析案卷与上下文...
              </span>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 3. 底部快捷提问胶囊栏 (Quick Prompts Bar) */}
      <div
        className="px-3 py-1.5 border-t flex items-center space-x-1.5 overflow-x-auto no-scrollbar flex-shrink-0"
        style={{
          backgroundColor: 'var(--bg-subtle, var(--bg-panel))',
          borderColor: 'var(--border)',
        }}
        id="quick-prompts-bar"
      >
        {QUICK_PROMPTS.map((item, idx) => (
          <button
            key={idx}
            id={`quick-prompt-btn-${idx}`}
            onClick={() => handleSend(item.prompt)}
            disabled={sending}
            className="px-2.5 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap cursor-pointer transition-all hover:bg-[var(--purple-soft)] hover:border-[var(--purple)] hover:text-[var(--purple)] disabled:opacity-50 shrink-0 shadow-2xs"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)',
            }}
            title={item.prompt}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* 4. 底部输入框 */}
      <div
        className="p-3 border-t flex items-center space-x-2 flex-shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <div
          className="flex-1 flex items-center px-3 py-2 rounded-xl border space-x-2 transition-all focus-within:border-[var(--purple)] shadow-2xs"
          style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)' }}
        >
          <Sparkles className="w-4 h-4 text-[var(--purple)] flex-shrink-0" />
          <input
            id="chat-panel-input"
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="向 Annie 指派任务（例如：'请生成给客户的补件回复草稿'）..."
            className="bg-transparent border-none outline-none w-full text-xs"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
        <motion.button
          whileTap={reduced ? undefined : { scale: 0.94 }}
          onClick={() => handleSend()}
          disabled={sending || !prompt.trim()}
          className="px-3.5 py-2 rounded-xl font-bold text-xs flex items-center space-x-1 cursor-pointer shadow-xs transition-all hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
          id="chat-send-btn"
        >
          <span>发送</span>
          <Send className="w-3.5 h-3.5" />
        </motion.button>
      </div>
    </div>
  );
}
