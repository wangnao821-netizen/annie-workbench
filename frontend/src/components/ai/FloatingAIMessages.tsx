import { motion, useReducedMotion } from 'motion/react';
import { Bot, User, Sparkles } from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';

export interface AIMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  suggestedActions?: string[];
}

interface FloatingAIMessagesProps {
  messages: AIMessage[];
}

export function FloatingAIMessages({ messages }: FloatingAIMessagesProps) {
  const reduced = useReducedMotion();
  const handleActionClick = (action: string) => {
    useToastStore.getState().showToast('info', `已触发动作：${action}`);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3.5 no-scrollbar" id="floating-ai-messages-list">
      {/* Default Greeting Banner */}
      <div 
        className="p-3.5 rounded-2xl border space-y-2 text-xs shadow-2xs"
        style={{ 
          backgroundColor: 'var(--bg-app)', 
          borderColor: 'var(--border)',
          color: 'var(--text-primary)'
        }}
      >
        <div className="flex items-center space-x-1.5 font-bold" style={{ color: 'var(--accent)' }}>
          <Sparkles className="w-4 h-4" />
          <span>早上好 Vera！今日业务概览：</span>
        </div>

        <ul className="space-y-1 text-[11px] leading-relaxed pl-1" style={{ color: 'var(--text-secondary)' }}>
          <li>• 活跃案件与紧急事项请查看今日工作台</li>
          <li>• OS 条件与邮件进度请在对应页面查看</li>
        </ul>

        <div className="p-2 rounded-xl text-[11px] font-medium border" style={{ backgroundColor: 'var(--yellow-soft)', borderColor: 'rgba(245,158,11,0.2)', color: 'var(--text-primary)' }}>
          ⚡ <strong>建议优先处理：</strong>请在今日工作台查看最新逾期/紧急待办。
        </div>
      </div>

      {/* Dynamic Conversation Messages */}
      {messages.map((msg) => {
        const isUser = msg.sender === 'user';
        return (
          <motion.div
            key={msg.id}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8  }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-start space-x-2 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}
          >
            {/* Avatar */}
            <div 
              className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-[11px] ${
                isUser ? 'bg-[var(--accent)]' : 'bg-[var(--purple)]'
              }`}
            >
              {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
            </div>

            {/* Bubble Container */}
            <div className="max-w-[80%] space-y-1.5">
              <div 
                className={`p-2.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap shadow-2xs ${
                  isUser ? 'rounded-tr-none' : 'rounded-tl-none border'
                }`}
                style={{
                  backgroundColor: isUser ? 'var(--accent)' : 'var(--bg-card)',
                  color: isUser ? '#ffffff' : 'var(--text-primary)',
                  borderColor: isUser ? 'transparent' : 'var(--border)'
                }}
              >
                {msg.text}
              </div>

              {/* Suggested Actions Buttons */}
              {!isUser && msg.suggestedActions && msg.suggestedActions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {msg.suggestedActions.map((act, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleActionClick(act)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium border hover:opacity-80 transition-opacity cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-app)',
                        borderColor: 'var(--border)',
                        color: 'var(--accent)'
                      }}
                    >
                      ⚡ {act}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
