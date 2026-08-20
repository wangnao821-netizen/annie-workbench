import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Brain, ArrowDown } from 'lucide-react';
import { ChatMessageResponse, AssistantSettingsResponse } from '../../../types/api';
import { ChatMessageItem } from './ChatMessageItem';
import { AssistantOnboardingCard } from '../AssistantOnboardingCard';

interface ChatMessageListProps {
  messages: ChatMessageResponse[];
  caseId: string | null;
  loading: boolean;
  streamingMessageId: string | null;
  activeStepLabel: string;
  activeStepStatus: 'running' | 'generating' | 'done';
  copiedMsgId: number | string | null;
  dismissedConfirmCardMsgs: Record<string, boolean>;
  assistantData: AssistantSettingsResponse | null;
  showOnboarding: boolean;
  dismissedOnboarding: boolean;
  onDismissOnboarding: () => void;
  onOpenSettings: () => void;
  onCopyMessage: (text: string, id: number | string) => void;
  onDismissConfirmCard: (id: string | number) => void;
  onOpenSubmissionConfirm: () => void;
  onOpenCoCreate: (flowKey: 'followup' | 'chaser' | 'os_reply', sessionId?: string) => void;
  onSelectQuickAsk: (text: string) => void;
  formatChatTime: (isoStr?: string) => string;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  isNearBottom: boolean;
  showScrollBottomBtn: boolean;
  onScroll: () => void;
  onScrollToBottom: () => void;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  messages,
  caseId,
  loading,
  streamingMessageId,
  activeStepLabel,
  activeStepStatus,
  copiedMsgId,
  dismissedConfirmCardMsgs,
  assistantData,
  showOnboarding,
  dismissedOnboarding,
  onDismissOnboarding,
  onOpenSettings,
  onCopyMessage,
  onDismissConfirmCard,
  onOpenSubmissionConfirm,
  onOpenCoCreate,
  onSelectQuickAsk,
  formatChatTime,
  scrollContainerRef,
  messagesEndRef,
  showScrollBottomBtn,
  onScroll,
  onScrollToBottom,
}) => {
  return (
    <div
      ref={scrollContainerRef}
      onScroll={onScroll}
      className="flex-1 overflow-y-auto p-4 space-y-4 relative"
    >
      {/* Assistant Onboarding Greeting / Persona Badge */}
      {showOnboarding && !dismissedOnboarding && assistantData && (
        <AssistantOnboardingCard
          data={assistantData}
          onDismiss={onDismissOnboarding}
          onOpenSettings={onOpenSettings}
        />
      )}

      {/* Empty State */}
      {messages.length === 0 && !loading && (
        <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 text-xs opacity-75">
          <div className="p-3 rounded-full bg-[var(--purple-soft)] text-[var(--purple)]">
            <Brain className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
              {caseId ? '案卷智能决策大脑已就绪' : '全局 AI 助手已就绪'}
            </h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              {caseId
                ? '支持秒级借贷能力精算、银行政策对比、材料缺口拆解与破局建言'
                : '我是你的信贷智能智囊，随时支持案卷策略研判与业务提效'}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5 pt-2 max-w-md">
            {[
              '查一下 ORDE 的政策与利率',
              '当前案件下一步做什么？',
              '这个案件缺什么材料？',
              '帮我算一下借贷能力能不能通过？',
            ].map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectQuickAsk(s)}
                className="px-2.5 py-1 rounded-lg border text-[11px] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {messages.map((m) => (
        <ChatMessageItem
          key={m.id}
          message={m}
          caseId={caseId}
          isStreamingThis={m.id === streamingMessageId}
          activeStepLabel={activeStepLabel}
          activeStepStatus={activeStepStatus}
          copiedMsgId={copiedMsgId}
          dismissedConfirmCardMsgs={dismissedConfirmCardMsgs}
          onCopyMessage={onCopyMessage}
          onDismissConfirmCard={onDismissConfirmCard}
          onOpenSubmissionConfirm={onOpenSubmissionConfirm}
          onOpenCoCreate={onOpenCoCreate}
          formatChatTime={formatChatTime}
        />
      ))}

      <div ref={messagesEndRef} />

      {/* Floating Scroll to Bottom Button */}
      <AnimatePresence>
        {showScrollBottomBtn && (
          <motion.button
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            type="button"
            onClick={onScrollToBottom}
            className="fixed bottom-24 right-8 z-20 flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-[var(--bg-card)] border border-[var(--border)] shadow-lg hover:border-[var(--accent)] text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer backdrop-blur-md"
          >
            <ArrowDown className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>回到底部</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};
