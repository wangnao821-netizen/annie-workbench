import React from 'react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { User, Bot, CheckCircle2, Wrench, Loader2, Copy, Check } from 'lucide-react';
import { ChatMessageResponse } from '../../../types/api';
import { ChatCardsDispatcher } from './ChatCardsDispatcher';

interface ChatMessageItemProps {
  message: ChatMessageResponse;
  caseId: string | null;
  isStreamingThis: boolean;
  activeStepLabel: string;
  activeStepStatus: 'running' | 'generating' | 'done';
  copiedMsgId: number | string | null;
  dismissedConfirmCardMsgs: Record<string, boolean>;
  onCopyMessage: (text: string, id: number | string) => void;
  onDismissConfirmCard: (id: string | number) => void;
  onOpenSubmissionConfirm: () => void;
  onOpenCoCreate: (flowKey: 'followup' | 'chaser' | 'os_reply', sessionId?: string) => void;
  formatChatTime: (isoStr?: string) => string;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  message: m,
  caseId,
  isStreamingThis,
  activeStepLabel,
  activeStepStatus,
  copiedMsgId,
  dismissedConfirmCardMsgs,
  onCopyMessage,
  onDismissConfirmCard,
  onOpenSubmissionConfirm,
  onOpenCoCreate,
  formatChatTime,
}) => {
  const hideEmptyBubble = isStreamingThis && !m.content.trim() && activeStepStatus === 'running';

  return (
    <div
      key={m.id}
      id={`chat-message-${m.id}`}
      className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} space-y-1.5`}
    >
      <div className="flex items-center space-x-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {m.role === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3 text-[var(--purple)]" />}
        <span>{m.role === 'user' ? '我' : 'Vera AI'}</span>
        <span>· {formatChatTime(m.created_at)}</span>
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
          ) : activeStepLabel.includes('工具') ||
            activeStepLabel.includes('检索') ||
            activeStepLabel.includes('查询') ||
            activeStepLabel.includes('政策') ? (
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
        <div
          className={`group relative p-3 rounded-2xl text-xs max-w-[85%] leading-relaxed select-text ${
            m.role === 'user' ? 'shadow-xs' : 'border'
          }`}
          style={
            m.role === 'user'
              ? { backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }
              : { backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }
          }
        >
          {/* Copy button for Assistant message */}
          {m.role === 'assistant' && !isStreamingThis && m.content && (
            <button
              type="button"
              onClick={() => onCopyMessage(m.content, m.id)}
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
                  strong: ({ children }) => (
                    <strong className="font-bold text-[var(--text-primary)]">{children}</strong>
                  ),
                  ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 my-1">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 my-1">{children}</ol>,
                  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                  table: ({ children }) => (
                    <div
                      className="overflow-x-auto my-2.5 rounded-xl border shadow-xs"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <table
                        className="min-w-full text-xs text-left divide-y"
                        style={{ borderColor: 'var(--border)' }}
                      >
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
                    <tr className="hover:bg-[var(--bg-card-hover)] transition-colors">{children}</tr>
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

      {/* Cards Dispatcher */}
      <ChatCardsDispatcher
        message={m}
        caseId={caseId}
        dismissedConfirmCardMsgs={dismissedConfirmCardMsgs}
        onDismissConfirmCard={onDismissConfirmCard}
        onOpenSubmissionConfirm={onOpenSubmissionConfirm}
        onOpenCoCreate={onOpenCoCreate}
      />
    </div>
  );
};
