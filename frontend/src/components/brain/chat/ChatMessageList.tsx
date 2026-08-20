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
        !caseId ? (
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
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[var(--purple-soft)] flex items-center justify-center border border-[var(--purple-soft)]">
              <Brain className="w-6 h-6 text-[var(--purple)]" />
            </div>
            <p className="text-xs text-muted font-medium">向 Vera 提问关于此案件的任何细节或补充说明...</p>
          </div>
        )
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
