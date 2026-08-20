import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  ListChecks,
  Plus,
  ChevronDown,
  RefreshCw,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { ChecklistItemType } from '../../../types';
import { ChecklistItem } from './ChecklistItem';
import { useCaseStore } from '../../../stores/caseStore';
import { useToastStore } from '../../../stores/toastStore';
import { useChecklistStore } from '../../../stores/checklistStore';
import { FilePreviewPanel } from './FilePreviewPanel';

interface ChecklistPanelProps {
  items: ChecklistItemType[];
  caseId?: string;
  onToggleItem: (id: string) => void;
  onRevokeItem?: (id: string, fileId?: string) => void;
  onAddItem: (label: string, category: 'required' | 'ai_suggested' | 'optional') => void;
  onRegenerate?: () => Promise<void>;
  lender?: string;
  productType?: string;
  title?: string;
}

export function ChecklistPanel({
  items,
  caseId,
  onToggleItem,
  onRevokeItem,
  onAddItem,
  onRegenerate,
  lender,
  productType,
  title,
}: ChecklistPanelProps) {
  const reduced = useReducedMotion();
  const currentCase = useCaseStore((s) => s.currentCase);
  const { matchFiles, isMatching, gatheringProgress } = useChecklistStore();

  const [showConfirmRegen, setShowConfirmRegen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ fileId?: string; filename: string } | null>(null);

  const effectiveCaseId = caseId || currentCase?.caseId;
  const effectiveLender = lender || currentCase?.lender;
  const effectiveProduct = productType;

  const headerTitle = (() => {
    if (title) return title;
    const parts = [effectiveLender, effectiveProduct].filter(Boolean);
    if (parts.length > 0) {
      return `${parts.join(' ')} 递交清单`;
    }
    return '递交材料清单';
  })();

  const requiredItems = items.filter((i) => i.category === 'required');
  const aiSuggestedItems = items.filter((i) => i.category !== 'required');

  const checkedCount = items.filter((i) => i.checked || i.status === 'received' || i.status === 'confirmed').length;
  const totalCount = items.length;
  const progressPct = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : gatheringProgress || 0;

  const handleShowMoreOptions = () => {
    useToastStore
      .getState()
      .showToast('info', '标准全集选项：VEVO签证确认、3个月流水、负债还款明细。可点击"新增自定义项"按需添加。');
  };

  const handleAddCustom = () => {
    const customName = prompt('请输入新增自定义清单项名称:', '自住房水电气账单 (Rates)');
    if (customName && customName.trim()) {
      onAddItem(customName.trim(), 'ai_suggested');
    }
  };

  const handleConfirmRegenerate = async () => {
    if (!effectiveCaseId) {
      useToastStore.getState().showToast('error', '未关联案件 ID，无法重新生成');
      return;
    }
    setIsRegenerating(true);
    try {
      if (onRegenerate) {
        await onRegenerate();
      } else {
        await useChecklistStore.getState().regenerateChecklist(effectiveCaseId);
      }
      setShowConfirmRegen(false);
    } catch {
      // Error toast handled in store
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleMatchFiles = async () => {
    if (!effectiveCaseId) {
      useToastStore.getState().showToast('error', '未关联案件 ID，无法匹配本地材料');
      return;
    }
    try {
      await matchFiles(effectiveCaseId);
    } catch {
      // Handled in store
    }
  };

  const handlePreviewFile = (fileId?: string, filename?: string) => {
    if (filename) {
      setPreviewFile({ fileId, filename });
    }
  };

  return (
    <div
      className="rounded-2xl p-4 sm:p-5 border space-y-4 relative"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      id="checklist-panel-container"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b flex-wrap gap-2.5" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] flex-shrink-0">
            <ListChecks className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>
              {headerTitle}
            </h4>
            <div className="flex items-center space-x-2 text-[11px] text-muted">
              <span>收集进度: {progressPct}%</span>
              <span>•</span>
              <span>已齐备 {checkedCount} / {totalCount} 项</span>
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center space-x-2 flex-wrap gap-1">
          {effectiveCaseId && (
            <>
              {/* Re-match Local Materials Button */}
              <motion.button
                whileTap={reduced ? undefined : { scale: 0.96 }}
                onClick={handleMatchFiles}
                disabled={isMatching}
                className="px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center space-x-1.5 cursor-pointer transition-all disabled:opacity-50 shadow-xs"
                style={{
                  borderColor: 'var(--green-soft)',
                  backgroundColor: 'var(--green-soft)',
                  color: 'var(--green)',
                }}
                id="checklist-match-files-btn"
                title="扫描客户案卷本地文件夹，根据材料名称与标题智能匹配打勾"
              >
                {isMatching ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>正在匹配...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>重新匹配本地材料</span>
                  </>
                )}
              </motion.button>

              {/* Regenerate Checklist Button */}
              <motion.button
                whileTap={reduced ? undefined : { scale: 0.96 }}
                onClick={() => setShowConfirmRegen(true)}
                disabled={isRegenerating}
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold border flex items-center space-x-1 cursor-pointer transition-colors disabled:opacity-50"
                style={{
                  borderColor: 'var(--purple-soft)',
                  backgroundColor: 'var(--purple-soft)',
                  color: 'var(--purple)',
                }}
                id="checklist-panel-regenerate-btn"
                title="根据最新案情与银行政策重新推导材料清单"
              >
                <RefreshCw className={`w-3 h-3 ${isRegenerating ? 'animate-spin' : ''}`} />
                <span>{isRegenerating ? '生成中...' : '重新生成'}</span>
              </motion.button>
            </>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="w-full bg-[var(--bg-subtle)] h-2 rounded-full overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className={`h-full rounded-full ${progressPct === 100 ? 'bg-[var(--green)]' : 'bg-[var(--accent)]'}`}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span>材料齐备率</span>
          <span className="font-mono font-bold" style={{ color: progressPct === 100 ? 'var(--green)' : 'var(--accent)' }}>
            {progressPct}% ({checkedCount}/{totalCount})
          </span>
        </div>
      </div>

      {/* Group 1: Required */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-bold" style={{ color: 'var(--green)' }}>
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--green)' }} />
            <span>🟢 必选（银行要求） ({requiredItems.length})</span>
          </div>
          <span className="text-[11px] font-mono text-muted">
            {requiredItems.filter((i) => i.checked || i.status === 'received').length}/{requiredItems.length}
          </span>
        </div>
        {requiredItems.length === 0 ? (
          <p className="text-[11px] text-muted italic px-2">暂无必选清单项</p>
        ) : (
          <div className="space-y-2">
            {requiredItems.map((item) => (
              <ChecklistItem
                key={item.id}
                item={item}
                onToggle={onToggleItem}
                onRevoke={onRevokeItem}
                onPreviewFile={handlePreviewFile}
              />
            ))}
          </div>
        )}
      </div>

      {/* Group 2: AI Suggested / Non-required */}
      <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between text-xs font-bold" style={{ color: 'var(--yellow)' }}>
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--yellow)' }} />
            <span>🟡 AI 建议（可根据需要去勾） ({aiSuggestedItems.length})</span>
          </div>
          <span className="text-[11px] font-mono text-muted">
            {aiSuggestedItems.filter((i) => i.checked || i.status === 'received').length}/{aiSuggestedItems.length}
          </span>
        </div>
        {aiSuggestedItems.length === 0 ? (
          <p className="text-[11px] text-muted italic px-2">暂无建议清单项</p>
        ) : (
          <div className="space-y-2">
            {aiSuggestedItems.map((item) => (
              <ChecklistItem
                key={item.id}
                item={item}
                onToggle={onToggleItem}
                onRevoke={onRevokeItem}
                onPreviewFile={handlePreviewFile}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Item Action Buttons */}
      <div className="flex items-center space-x-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <motion.button
          whileTap={reduced ? undefined : { scale: 0.95 }}
          onClick={handleShowMoreOptions}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-dashed flex items-center space-x-1.5 cursor-pointer"
          style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          id="checklist-more-options-btn"
        >
          <span>⬜ 更多可选（从全集添加）</span>
          <ChevronDown className="w-3.5 h-3.5" />
        </motion.button>

        <motion.button
          whileTap={reduced ? undefined : { scale: 0.95 }}
          onClick={handleAddCustom}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center space-x-1 cursor-pointer"
          style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--accent)' }}
          id="checklist-add-custom-btn"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>新增自定义项</span>
        </motion.button>
      </div>

      {/* File Preview Modal */}
      {previewFile && (
        <FilePreviewPanel
          fileId={previewFile.fileId}
          filename={previewFile.filename}
          docType="材料清单附件"
          onClose={() => setPreviewFile(null)}
        />
      )}

      {/* Regenerate Confirmation Modal */}
      <AnimatePresence>
        {showConfirmRegen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-app)]/60 backdrop-blur-xs">
            <motion.div
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-sm rounded-2xl border p-5 shadow-2xl space-y-4"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
              id="regenerate-checklist-confirm-modal"
            >
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 flex-shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-primary">重新生成材料清单？</h3>
                  <p className="text-xs text-muted leading-relaxed">
                    将替换当前全部清单项，是否继续？
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <button
                  type="button"
                  onClick={() => setShowConfirmRegen(false)}
                  disabled={isRegenerating}
                  className="px-3.5 py-1.5 rounded-xl border text-xs font-semibold text-secondary hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                  style={{ borderColor: 'var(--border)' }}
                  id="cancel-regenerate-checklist-btn"
                >
                  取消
                </button>
                <motion.button
                  whileTap={reduced ? undefined : { scale: 0.96 }}
                  type="button"
                  onClick={handleConfirmRegenerate}
                  disabled={isRegenerating}
                  className="px-4 py-1.5 rounded-xl text-xs font-bold text-white flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 transition-opacity shadow-xs"
                  style={{ backgroundColor: 'var(--purple)' }}
                  id="confirm-regenerate-checklist-btn"
                >
                  {isRegenerating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>正在替换...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>确认替换</span>
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
