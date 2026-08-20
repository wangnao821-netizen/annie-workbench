import React from 'react';
import { motion } from 'motion/react';
import { ShieldAlert } from 'lucide-react';
import { ChatMessageResponse, ToolCard, DraftPayload, SubmissionSuggestPayload, AttributionSuggestPayload } from '../../../types/api';
import { ConfirmCard } from '../ConfirmCard';
import { SubmissionBanner } from '../SubmissionBanner';
import { DraftCard } from '../DraftCard';
import { DeclarationCheckCard } from '../DeclarationCheckCard';
import { FlowDialogCard } from '../FlowDialogCard';
import { FolderLookupCard } from '../FolderLookupCard';
import { GapAnalysisCard } from '../GapAnalysisCard';

interface ChatCardsDispatcherProps {
  message: ChatMessageResponse;
  caseId: string | null;
  dismissedConfirmCardMsgs: Record<string, boolean>;
  onDismissConfirmCard: (id: string | number) => void;
  onOpenSubmissionConfirm: () => void;
  onOpenCoCreate: (flowKey: 'followup' | 'chaser' | 'os_reply', sessionId?: string) => void;
}

export const ChatCardsDispatcher: React.FC<ChatCardsDispatcherProps> = ({
  message: m,
  caseId,
  dismissedConfirmCardMsgs,
  onDismissConfirmCard,
  onOpenSubmissionConfirm,
  onOpenCoCreate,
}) => {
  const hasConfirmRequired =
    m.role === 'assistant' &&
    !dismissedConfirmCardMsgs[m.id] &&
    (m.content.includes('confirm_required') ||
      m.content.includes('本流程需要 Vera 确认') ||
      m.tool_cards?.some(
        (c) => (c.type as string) === 'confirm_required' || (c.payload as any)?.confirm_required
      ));

  return (
    <>
      {/* Flow Confirmation Card for confirm_required */}
      {hasConfirmRequired && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 rounded-2xl border bg-[var(--purple-soft)] border-[var(--purple-soft)] text-xs space-y-2.5 my-1.5 shadow-2xs w-full max-w-[85%]"
          id={`flow-confirm-card-${m.id}`}
        >
          <div className="flex items-center space-x-2 font-bold text-[var(--purple)]">
            <ShieldAlert className="w-4 h-4 text-[var(--purple)] flex-shrink-0" />
            <span>流程状态确认</span>
          </div>
          <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
            此操作涉及案卷状态变更，需 Vera 确认后执行
          </p>
          <div className="flex items-center justify-end space-x-2 pt-1 border-t border-[var(--purple)]/20">
            <button
              type="button"
              onClick={() => onDismissConfirmCard(m.id)}
              className="px-2.5 py-1 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] text-[11px] font-medium transition-colors cursor-pointer"
            >
              稍后处理
            </button>
            <button
              type="button"
              onClick={() => {
                onDismissConfirmCard(m.id);
                // Dispatch event or callback if needed
              }}
              className="px-3 py-1 rounded-lg bg-[var(--purple)] text-white text-[11px] font-bold shadow-xs hover:opacity-90 transition-opacity cursor-pointer flex items-center space-x-1"
            >
              <span>确认执行</span>
            </button>
          </div>
        </motion.div>
      )}

      {/* Tool Cards */}
      {m.tool_cards && m.tool_cards.length > 0 && (
        <div className="w-full max-w-[85%] space-y-2 my-1">
          {m.tool_cards.map((card: ToolCard, cIdx: number) => {
            const cardKey = `card-${m.id}-${cIdx}-${card.type}`;
            switch (card.type) {
              case 'draft':
                return (
                  <DraftCard
                    key={cardKey}
                    payload={card.payload as DraftPayload}
                    caseId={caseId || ''}
                    onOpenCoCreate={onOpenCoCreate}
                  />
                );
              case 'submission_suggest':
                return (
                  <SubmissionBanner
                    key={cardKey}
                    payload={card.payload as SubmissionSuggestPayload}
                    caseId={caseId || ''}
                    onOpenConfirmModal={onOpenSubmissionConfirm}
                  />
                );
              case 'attribution_suggest':
                return (
                  <ConfirmCard
                    key={cardKey}
                    payload={card.payload as AttributionSuggestPayload}
                    caseId={caseId || ''}
                  />
                );
              case 'declaration_check':
                return (
                  <DeclarationCheckCard
                    key={cardKey}
                    payload={card.payload as any}
                    caseId={caseId || ''}
                  />
                );
              case 'flow_dialog':
                return (
                  <FlowDialogCard
                    key={cardKey}
                    payload={card.payload as any}
                    caseId={caseId || ''}
                  />
                );
              case 'folder_lookup':
                return (
                  <FolderLookupCard
                    key={cardKey}
                    payload={card.payload as any}
                    caseId={caseId || ''}
                  />
                );
              case 'gap_analysis':
                return (
                  <GapAnalysisCard
                    key={cardKey}
                    payload={card.payload as any}
                    caseId={caseId || ''}
                  />
                );
              default:
                return null;
            }
          })}
        </div>
      )}
    </>
  );
};
