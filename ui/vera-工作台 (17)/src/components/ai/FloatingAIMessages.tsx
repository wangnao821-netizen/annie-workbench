import { motion } from 'motion/react';
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
  const handleActionClick = (_action: string) => {
    // TODO: 提交建议动作
    useToastStore.getState().showToast('info', '建议动作已提交');
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
          <span>☀️ 早上好 Vera！今日业务概览：</span>
        </div>

        <ul className="space-y-1 text-[11px] font-mono leading-relaxed pl-1" style={{ color: 'var(--text-secondary)' }}>
          <li>• <strong>28 个活跃案件</strong>，其中 3 个属于紧急/超期</li>
          <li>• <strong>5 个 OS 条件</strong> 待与银行/客户沟通回复</li>
          <li>• <strong>12 封新邮件</strong> 待 AI 智能归类与调度</li>
          <li style={{ color: 'var(--green)' }}>• 💰 <strong>本月已预估实结佣金: $12,350</strong></li>
        </ul>

        <div className="p-2 rounded-xl text-[11px] font-medium border" style={{ backgroundColor: 'var(--yellow-soft)', borderColor: 'rgba(245,158,11,0.2)', color: 'var(--text-primary)' }}>
          ⚡ <strong>建议优先处理:</strong> Wang Li 的 ANZ OS 条件（Finance Due 仅剩 3 天）。
        </div>
      </div>

      {/* Dynamic Conversation Messages */}
      {messages.map((msg) => {
        const isUser = msg.sender === 'user';
        return (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-start space-x-2 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}
          >
            {/* Avatar */}
            <div 
              className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-[10px] ${
                isUser ? 'bg-gradient-to-r from-blue-500 to-indigo-600' : 'bg-gradient-to-r from-purple-500 to-pink-500'
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
