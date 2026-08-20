import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  X, Plus, ListChecks, CheckCircle2, Circle, RotateCcw, AlertCircle, Building2, RefreshCw, AlertTriangle, Sparkles, FileCheck, ExternalLink
} from 'lucide-react';
import { useUiStore } from '../../stores/uiStore';
import { useToastStore } from '../../stores/toastStore';
import { ChecklistItemResponse } from '../../types/api';
import { getChecklist, confirmChecklistItem, revokeChecklistItem, addChecklistItem, regenerateChecklist, matchChecklistFiles } from '../../services/api/cases';
import { FilePreviewPanel } from '../panel/details/FilePreviewPanel';

interface ChecklistDrawerProps {
  caseId: string | null;
}

const MASTER_CATEGORIES = [
  '身份',
  '收入（PAYG）',
  '收入（自雇）',
  '银行特定',
  '特殊情况',
  '房产',
  '结算',
  '其他',
] as const;

// 中文分类 → 后端枚举（WO-43 ChecklistAddRequest.category 白名单）
const CATEGORY_TO_EN: Record<string, string> = {
  '身份': 'identity',
  '收入（PAYG）': 'income_payg',
  '收入（自雇）': 'income_self_employed',
  '银行特定': 'bank_specific',
  '特殊情况': 'special',
  '房产': 'property',
  '结算': 'settlement',
};

// 表单下拉选项（无“其他”，符合后端 7 个枚举）
const SELECTABLE_CATEGORIES = [
  '身份',
  '收入（PAYG）',
  '收入（自雇）',
  '银行特定',
  '特殊情况',
  '房产',
  '结算',
] as const;

const AUSTRALIAN_BANKS = [
  'CBA (Commonwealth Bank)',
  'Westpac',
  'ANZ',
  'NAB',
  'Macquarie Bank',
  'St George',
  'Bankwest',
  'Suncorp',
  'Bendigo Bank',
  'AMP Bank',
  'HSBC Australia',
  'Citi Australia',
  'BOQ (Bank of Queensland)',
  'ING Australia',
  'Virgin Money',
  'Bank of Sydney',
  'Teachers Mutual',
  'Pepper Money',
  'Liberty Financial',
  'La Trobe Financial',
  'Bluestone',
  '通用 / 不限银行',
];

export function ChecklistDrawer({ caseId }: ChecklistDrawerProps) {
  const reduced = useReducedMotion();
  const open = useUiStore((s) => s.checklistDrawerOpen);
  const setOpen = useUiStore((s) => s.setChecklistDrawerOpen);

  const [items, setItems] = useState<ChecklistItemResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmRegen, setShowConfirmRegen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ fileId?: string; filename: string } | null>(null);

  // Form states
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<string>('身份');
  const [newBank, setNewBank] = useState<string>('');
  const [newCondition, setNewCondition] = useState<string>('');
  const [newRequired, setNewRequired] = useState<boolean>(true);

  const fetchChecklistData = useCallback(async () => {
    if (!caseId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const data = await getChecklist(caseId);
      setItems(data);
    } catch {
      useToastStore.getState().showToast('error', '获取清单列表失败');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  const handleMatchFiles = async () => {
    if (!caseId) {
      useToastStore.getState().showToast('error', '未关联案件 ID，无法匹配本地材料');
      return;
    }
    setIsMatching(true);
    try {
      const res = await matchChecklistFiles(caseId);
      useToastStore.getState().showToast('success', `成功匹配并自动勾选 ${res.matched_count} 项材料！`);
      await fetchChecklistData();
      window.dispatchEvent(
        new CustomEvent('checklist_updated', {
          detail: { caseId, gathering_progress: res.gathering_progress },
        })
      );
    } catch (err: any) {
      useToastStore.getState().showToast('error', `匹配失败: ${err?.message || '未知错误'}`);
    } finally {
      setIsMatching(false);
    }
  };

  const handleConfirmRegenerate = async () => {
    if (!caseId) {
      useToastStore.getState().showToast('error', '未关联案件 ID，无法重新生成');
      return;
    }
    setIsRegenerating(true);
    try {
      const regenerated = await regenerateChecklist(caseId);
      setItems(regenerated);
      useToastStore.getState().showToast('success', '清单已重新生成');
      setShowConfirmRegen(false);
      window.dispatchEvent(new CustomEvent('checklist_updated'));
    } catch (err: any) {
      useToastStore.getState().showToast('error', err?.message || '清单重新生成失败');
    } finally {
      setIsRegenerating(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchChecklistData();
    }
  }, [open, fetchChecklistData]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, setOpen]);

  if (!open) return null;

  // Map item to one of master categories
  const getMasterCategory = (item: ChecklistItemResponse): string => {
    if (item.master_category && MASTER_CATEGORIES.includes(item.master_category as any)) {
      return item.master_category;
    }
    const cat = (item.category || '').toLowerCase();
    const name = (item.item_name || item.name || item.name_zh || '').toLowerCase();

    if (cat.includes('identity') || cat.includes('身份') || name.includes('护照') || name.includes('驾照') || name.includes('签证')) {
      return '身份';
    }
    if (cat.includes('self_employed') || cat.includes('自雇') || name.includes('noa') || name.includes('税单') || name.includes('bas')) {
      return '收入（自雇）';
    }
    if (cat.includes('payg') || cat.includes('income') || cat.includes('收入') || name.includes('payslip') || name.includes('工资单') || name.includes('雇主')) {
      return '收入（PAYG）';
    }
    if (cat.includes('bank') || cat.includes('银行') || item.bank_specific || name.includes('cba') || name.includes('westpac')) {
      return '银行特定';
    }
    if (cat.includes('special') || cat.includes('特殊') || name.includes('赠予') || name.includes('gift')) {
      return '特殊情况';
    }
    if (cat.includes('property') || cat.includes('房产') || name.includes('合同') || name.includes('contract')) {
      return '房产';
    }
    if (cat.includes('settlement') || cat.includes('结算') || name.includes('尾款')) {
      return '结算';
    }
    return '其他';
  };

  // Group items by master category
  const grouped = MASTER_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = items.filter((item) => getMasterCategory(item) === cat);
    return acc;
  }, {} as Record<string, ChecklistItemResponse[]>);

  // Toggle Confirm / Revoke
  const handleToggleStatus = async (item: ChecklistItemResponse) => {
    if (!caseId) return;
    const isDone = item.status === 'received' || item.status === 'confirmed';
    try {
      if (isDone) {
        await revokeChecklistItem(caseId, item.id);
        useToastStore.getState().showToast('success', '已撤销勾选');
      } else {
        await confirmChecklistItem(caseId, item.id);
        useToastStore.getState().showToast('success', '已确认材料补齐');
      }
      await fetchChecklistData();
      window.dispatchEvent(new CustomEvent('checklist_updated'));
    } catch {
      useToastStore.getState().showToast('error', '操作失败，请重试');
    }
  };

  const handleRevokeMatch = async (item: ChecklistItemResponse, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!caseId) return;
    try {
      await revokeChecklistItem(caseId, item.id);
      useToastStore.getState().showToast('success', '已撤销文件自动匹配');
      await fetchChecklistData();
      window.dispatchEvent(new CustomEvent('checklist_updated'));
    } catch {
      useToastStore.getState().showToast('error', '撤销匹配失败');
    }
  };

  const handleAddItem = async () => {
    if (!newName.trim()) {
      useToastStore.getState().showToast('error', '请输入材料名称');
      return;
    }
    if (!caseId) {
      useToastStore.getState().showToast('error', '未关联案件');
      return;
    }
    setSubmitting(true);
    try {
      await addChecklistItem(caseId, {
        name_zh: newName.trim(),
        category: CATEGORY_TO_EN[newCategory] ?? 'special',
        bank_specific: newBank || undefined,
        applicable_when: newCondition || undefined,
        is_required: newRequired,
      });
      useToastStore.getState().showToast('success', '已加入清单并沉淀到清单总库');
      setNewName('');
      setNewBank('');
      setNewCondition('');
      setShowAddForm(false);
      await fetchChecklistData();
      window.dispatchEvent(new CustomEvent('checklist_updated'));
    } catch {
      useToastStore.getState().showToast('error', '添加清单项失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0  }}
        animate={{ opacity: 1 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0  }}
        className="absolute inset-0 bg-[var(--bg-subtle-strong)] dark:bg-[var(--bg-app)]/60 z-30 backdrop-blur-xs flex items-center justify-center p-4"
        onClick={() => setOpen(false)}
        id="checklist-drawer-overlay"
      >
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-[480px] max-w-[92%] h-[min(760px,90%)] rounded-2xl border shadow-2xl bg-[var(--bg-panel)] flex flex-col overflow-hidden relative select-none"
          style={{ borderColor: 'var(--border)' }}
          onClick={(e) => e.stopPropagation()}
          id="checklist-drawer-panel"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0 glass-panel" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-[var(--green-soft)] text-[var(--green)]">
                <ListChecks className="w-4 h-4" />
              </div>
              <span className="font-extrabold text-sm" style={{ color: 'var(--text-primary)' }}>
                材料清单台账 ({items.length})
              </span>
            </div>
            <div className="flex items-center space-x-1 flex-wrap gap-1">
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={handleMatchFiles}
                disabled={isMatching}
                className="px-2.5 py-1 rounded-lg border text-xs font-bold border-[var(--green-soft)] bg-[var(--green-soft)] text-[var(--green)] hover:opacity-85 cursor-pointer flex items-center space-x-1 disabled:opacity-50"
                id="checklist-drawer-match-btn"
                title="根据材料名称重新扫描匹配本地案卷文件"
              >
                {isMatching ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>匹配中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>重新匹配</span>
                  </>
                )}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => setShowConfirmRegen(true)}
                disabled={isRegenerating}
                className="px-2.5 py-1 rounded-lg border text-xs font-bold border-[var(--purple-soft)] bg-[var(--purple-soft)] text-[var(--purple)] hover:opacity-85 cursor-pointer flex items-center space-x-1 disabled:opacity-50"
                id="checklist-regenerate-header-btn"
                title="重新生成清单（覆盖现有项）"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                <span>{isRegenerating ? '生成中...' : '重生成'}</span>
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => setShowAddForm(!showAddForm)}
                className="px-2.5 py-1 rounded-lg border text-xs font-bold text-[var(--green)] border-[var(--green-soft)] bg-[var(--green-soft)] hover:bg-[var(--green-soft)] cursor-pointer flex items-center space-x-1"
                id="checklist-add-header-btn"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新增</span>
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg border text-muted hover:text-primary cursor-pointer transition-colors"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                id="checklist-drawer-close-btn"
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>
          </div>

          {/* Add Item Form (Top Expandable Form) */}
          <AnimatePresence>
            {showAddForm && (
              <motion.div
                initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                className="p-3 border-b bg-[var(--bg-card)] space-y-2.5 overflow-hidden flex-shrink-0"
                style={{ borderColor: 'var(--border)' }}
                id="add-checklist-form"
              >
                <div className="flex items-center justify-between text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                  <span>＋ 新增清单材料项</span>
                  <button type="button" onClick={() => setShowAddForm(false)} className="text-muted hover:text-primary">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <label className="block text-xs font-bold text-muted mb-1">材料名称 *</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="如：2025 财年 ATO Notice of Assessment"
                      className="w-full p-2 rounded-lg border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none focus:border-[var(--green)]"
                      id="new-checklist-name-input"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-muted mb-1">业务分类 *</label>
                      <select
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        className="w-full p-1.5 rounded-lg border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none"
                        id="new-checklist-cat-select"
                      >
                        {SELECTABLE_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-muted mb-1">要求类型</label>
                      <select
                        value={newRequired ? 'required' : 'optional'}
                        onChange={(e) => setNewRequired(e.target.value === 'required')}
                        className="w-full p-1.5 rounded-lg border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none"
                        id="new-checklist-req-select"
                      >
                        <option value="required">🔴 必须提交</option>
                        <option value="optional">⚪ 可选/补充</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-muted mb-1">指定银行（可选 22 家）</label>
                    <select
                      value={newBank}
                      onChange={(e) => setNewBank(e.target.value)}
                      className="w-full p-1.5 rounded-lg border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none"
                      id="new-checklist-bank-select"
                    >
                      <option value="">通用 / 不限银行</option>
                      {AUSTRALIAN_BANKS.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-muted mb-1">适用条件规则（可选）</label>
                    <input
                      type="text"
                      value={newCondition}
                      onChange={(e) => setNewCondition(e.target.value)}
                      placeholder='如：{"employment":"self_employed"} 或 文本规则'
                      className="w-full p-1.5 rounded-lg border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none"
                      id="new-checklist-condition-input"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted hover:text-primary cursor-pointer"
                  >
                    取消
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.94 }}
                    onClick={handleAddItem}
                    disabled={submitting}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-[var(--green)] hover:bg-[var(--green)] cursor-pointer shadow-xs disabled:opacity-50"
                    id="submit-new-checklist-btn"
                  >
                    {submitting ? '加入中...' : '沉淀到清单总库'}
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Checklist Items Grouped by Master Category */}
          <div className="flex-1 overflow-y-auto p-3 space-y-4 no-scrollbar">
            {loading ? (
              <div className="p-4 space-y-3 animate-pulse">
                <div className="h-10 bg-[var(--bg-subtle)] rounded-xl" />
                <div className="h-10 bg-[var(--bg-subtle)] rounded-xl" />
              </div>
            ) : items.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-center space-y-2 text-muted my-auto">
                <AlertCircle className="w-6 h-6 text-muted" />
                <p className="text-xs font-medium">暂无清单材料，可点击右上角"新增"</p>
              </div>
            ) : (
              MASTER_CATEGORIES.map((cat) => {
                const groupItems = grouped[cat] || [];
                if (groupItems.length === 0) return null;

                // Sort: required first, optional second
                const sortedItems = [...groupItems].sort((a, b) => {
                  const reqA = a.is_required || a.category === 'required' ? 1 : 0;
                  const reqB = b.is_required || b.category === 'required' ? 1 : 0;
                  return reqB - reqA;
                });

                const receivedCount = groupItems.filter(
                  (i) => i.status === 'received' || i.status === 'confirmed'
                ).length;

                return (
                  <div key={cat} className="space-y-2" id={`checklist-group-${cat}`}>
                    {/* Category Header */}
                    <div className="flex items-center justify-between px-1 text-xs font-extrabold" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-[var(--green)]" />
                        <span>{cat}</span>
                      </div>
                      <span className="text-[11px] font-mono text-muted bg-[var(--bg-subtle)] px-2 py-0.5 rounded-full">
                        {receivedCount} / {groupItems.length}
                      </span>
                    </div>

                    {/* Group Items */}
                    <div className="space-y-1.5">
                      {sortedItems.map((item) => {
                        const isDone = item.status === 'received' || item.status === 'confirmed';
                        const isRequired = item.is_required || item.category === 'required';
                        const isAiSuggested = item.category === 'ai_suggested';
                        const hasMatchedFile =
                          Boolean(item.matched_file_id) ||
                          Boolean(item.matched_file_name) ||
                          (item.file_ids && item.file_ids.length > 0);

                        return (
                          <div
                            key={item.id}
                            onClick={() => handleToggleStatus(item)}
                            className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-start space-x-2.5 ${
                              isDone
                                ? 'bg-[var(--green-soft)] border-[var(--green-soft)] text-muted'
                                : 'bg-[var(--bg-card)] border-[var(--border)] hover:border-[var(--green-soft)] text-[var(--text-primary)]'
                            }`}
                            id={`checklist-item-${item.id}`}
                          >
                            {/* Checkbox */}
                            <button
                              type="button"
                              className="mt-0.5 flex-shrink-0 focus:outline-none"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleStatus(item);
                              }}
                              id={`checklist-check-${item.id}`}
                            >
                              {isDone ? (
                                <CheckCircle2 className="w-4 h-4 text-[var(--green)]" />
                              ) : (
                                <Circle className="w-4 h-4 text-muted hover:text-[var(--green)]" />
                              )}
                            </button>

                            {/* Main Info */}
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center justify-between space-x-2">
                                <span className={`text-xs font-medium truncate ${isDone ? 'line-through text-muted' : 'font-semibold'}`}>
                                  {item.item_name || item.name_zh || item.name}
                                </span>

                                {/* Badges */}
                                <div className="flex items-center space-x-1 flex-shrink-0 text-[11px]">
                                  {isRequired ? (
                                    <span className="px-1.5 py-0.2 rounded bg-[var(--red-soft)] text-[var(--red)] font-bold border border-[var(--red-soft)]">
                                      必选
                                    </span>
                                  ) : isAiSuggested ? (
                                    <span className="px-1.5 py-0.2 rounded bg-[var(--purple-soft)] text-[var(--purple)] font-semibold border border-[var(--purple-soft)]">
                                      AI 建议
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.2 rounded bg-[var(--bg-subtle)] text-[var(--text-secondary)] font-medium border border-[var(--border)]/20">
                                      可选
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Sub Info / Bank / Condition */}
                              {(item.bank_specific || item.applicable_when || item.reason || item.ai_suggestion) && (
                                <div className="text-[11px] text-muted space-y-0.5 opacity-90">
                                  {item.bank_specific && (
                                    <div className="flex items-center space-x-1">
                                      <Building2 className="w-3 h-3 text-[var(--green)] flex-shrink-0" />
                                      <span>限定银行: {item.bank_specific}</span>
                                    </div>
                                  )}
                                  {(item.ai_suggestion || item.reason) && <p className="italic">理由: {item.ai_suggestion || item.reason}</p>}
                                </div>
                              )}

                              {/* Matched File Row & Revoke Match Button */}
                              {hasMatchedFile && (
                                <div className="flex items-center justify-between mt-1 pt-1 border-t border-[var(--border)]/40 flex-wrap gap-1.5">
                                  <motion.button
                                    type="button"
                                    whileTap={{ scale: 0.96 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const filename = item.matched_file_name || (item.file_ids && item.file_ids[0]) || '附件';
                                      const fileId = item.matched_file_id || (item.file_ids && item.file_ids[0]);
                                      setPreviewFile({ fileId, filename });
                                    }}
                                    title={`点击查看已匹配文件: ${item.matched_file_name || (item.file_ids ? `${item.file_ids.length} 个附件` : '已匹配')}`}
                                    className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[var(--green-soft)] text-[var(--green)] border border-[var(--green-soft)] hover:border-[var(--green)] hover:shadow-xs transition-all cursor-pointer max-w-[240px] truncate"
                                    id={`drawer-matched-file-${item.id}`}
                                  >
                                    <FileCheck className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate">✓ 已自动关联: {item.matched_file_name || (item.file_ids ? `${item.file_ids.length} 个附件` : '已核匹配')}</span>
                                    <ExternalLink className="w-2.5 h-2.5 opacity-70 flex-shrink-0 ml-0.5" />
                                  </motion.button>
                                  <motion.button
                                    type="button"
                                    whileTap={{ scale: 0.94 }}
                                    onClick={(e) => handleRevokeMatch(item, e)}
                                    className="px-2 py-0.5 rounded-md text-xs bg-[var(--red-soft)] text-[var(--red)] hover:bg-[var(--red-soft)] cursor-pointer flex items-center space-x-1 font-bold flex-shrink-0 ml-auto"
                                    title="撤销文件自动匹配"
                                    id={`revoke-match-btn-${item.id}`}
                                  >
                                    <RotateCcw className="w-2.5 h-2.5" />
                                    <span>撤销</span>
                                  </motion.button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>

        {/* Regenerate Confirmation Modal */}
        <AnimatePresence>
          {showConfirmRegen && (
            <div 
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-app)]/60 backdrop-blur-xs"
              onClick={(e) => { e.stopPropagation(); setShowConfirmRegen(false); }}
            >
              <motion.div
                initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="w-full max-w-sm rounded-2xl border p-5 shadow-2xl space-y-4"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                onClick={(e) => e.stopPropagation()}
                id="drawer-regenerate-checklist-confirm-modal"
              >
                <div className="flex items-start space-x-3">
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 flex-shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>重新生成材料清单？</h3>
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
                    id="drawer-cancel-regenerate-checklist-btn"
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
                    id="drawer-confirm-regenerate-checklist-btn"
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
        {/* File Preview Modal */}
        {previewFile && (
          <FilePreviewPanel
            fileId={previewFile.fileId}
            filename={previewFile.filename}
            docType="材料清单附件"
            onClose={() => setPreviewFile(null)}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}
