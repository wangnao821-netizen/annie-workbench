import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FileText,
  Edit3,
  Save,
  RotateCcw,
  Eye,
  Lock,
  ShieldCheck,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  X,
} from 'lucide-react';
import { BrainFact, CaseContext, CaseBriefResponse } from '../../../types/api';
import { CaseInfo } from '../../../stores/caseStore';
import {
  generateCaseMemo,
  filterMemoForBankView,
} from './memoGenerator';
import { useToastStore } from '../../../stores/toastStore';
import { getCaseBrief, updateCaseBrief, createContextEvent } from '../../../services/api/cases';

interface CaseMemoViewProps {
  caseId: string;
  clientName: string;
  caseData: Partial<CaseInfo> | null;
  context: CaseContext | null;
  facts: BrainFact[];
  onRefresh?: () => void;
}

export function CaseMemoView({
  caseId,
  clientName,
  caseData,
  context,
  facts,
  onRefresh,
}: CaseMemoViewProps) {
  const reduced = useReducedMotion();
  const showToast = useToastStore((s) => s.showToast);

  const [isEditing, setIsEditing] = useState(false);
  const [isBankView, setIsBankView] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingBrief, setIsLoadingBrief] = useState(false);
  const [copied, setCopied] = useState(false);

  // Backend brief data
  const [serverBrief, setServerBrief] = useState<CaseBriefResponse | null>(null);

  // Stored custom markdown memo (local persistence fallback)
  const storageKey = `vera_case_memo_${caseId}`;
  const [customMemo, setCustomMemo] = useState<string | null>(() => {
    return localStorage.getItem(storageKey);
  });

  // Current active markdown in edit mode
  const [editingContent, setEditingContent] = useState('');

  // Default generated memo from facts
  const defaultMemo = useMemo(() => {
    return generateCaseMemo(clientName, caseData, context, facts, false);
  }, [clientName, caseData, context, facts]);

  // Load Brief from Backend API
  const fetchBrief = useCallback(async () => {
    if (!caseId) return;
    setIsLoadingBrief(true);
    try {
      const res = await getCaseBrief(caseId);
      if (res && res.brief_markdown) {
        setServerBrief(res);
      }
    } catch {
      // Graceful fallback to client memo generator
    } finally {
      setIsLoadingBrief(false);
    }
  }, [caseId]);

  useEffect(() => {
    fetchBrief();
  }, [fetchBrief]);

  // Base raw memo: Server brief > Local Custom > Default generated
  const activeRawMemo = serverBrief?.brief_markdown || customMemo || defaultMemo;

  // Rendered memo respecting bank view
  const displayMemo = useMemo(() => {
    if (isBankView) {
      if (serverBrief?.external_clean_markdown) {
        return serverBrief.external_clean_markdown;
      }
      return filterMemoForBankView(activeRawMemo);
    }
    return activeRawMemo;
  }, [activeRawMemo, isBankView, serverBrief]);

  const memoContainerRef = useRef<HTMLDivElement>(null);

  // Sync edit content when entering edit mode
  const handleStartEdit = () => {
    setEditingContent(activeRawMemo);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingContent('');
  };

  const handleSaveMemo = async () => {
    setIsSaving(true);
    try {
      // 1. Persist to Backend API
      try {
        const updateRes = await updateCaseBrief(caseId, editingContent);
        if (updateRes) {
          setServerBrief(updateRes);
        }
      } catch {
        // Non-blocking if offline/mock
      }

      // 2. Local persistence
      localStorage.setItem(storageKey, editingContent);
      setCustomMemo(editingContent);
      setIsEditing(false);

      // 3. Record a manual context event note for audit trace
      await createContextEvent(caseId, {
        source_type: 'manual_note',
        content: `更新了《案卷全景备忘录》内容（${new Date().toLocaleTimeString()}）`,
        track: 'internal',
      }).catch(() => {});

      showToast('success', '备忘录已保存，并同步写入案件上下文证据链！');
    } catch {
      showToast('error', '保存备忘录失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDefault = () => {
    if (window.confirm('确定要重置为系统根据事实自动推导的初始备忘录吗？')) {
      localStorage.removeItem(storageKey);
      setCustomMemo(null);
      setServerBrief(null);
      setEditingContent(defaultMemo);
      showToast('info', '已重置为系统事实推导备忘录');
    }
  };

  const handleCopyMemo = async () => {
    try {
      await navigator.clipboard.writeText(displayMemo);
      setCopied(true);
      showToast('success', isBankView ? '已复制银行纯净版备忘录！' : '已复制完整备忘录文本！');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('error', '复制到剪贴板失败');
    }
  };

  const handleRefreshAll = () => {
    fetchBrief();
    if (onRefresh) onRefresh();
    showToast('info', '已刷新案卷最新全景事实与备忘录');
  };

  // Quick insert helper for editor
  const handleInsertSnippet = (snippet: string) => {
    setEditingContent((prev) => prev + '\n\n' + snippet);
  };

  return (
    <div
      className="flex flex-col h-full rounded-2xl border overflow-hidden transition-all shadow-xs"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow-card)',
      }}
      id="case-memo-view-container"
    >
      {/* Top Action Header Bar */}
      <div
        className="px-4 py-2.5 min-h-[52px] border-b flex items-center justify-between gap-3 flex-shrink-0"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--bg-panel)',
        }}
        id="case-memo-view-header"
      >
        {/* Left Title & Status (Two-line Layout) */}
        <div className="flex items-center space-x-2.5 min-w-0">
          <div
            className="w-7 h-7 rounded-xl border flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: 'var(--purple-soft)',
              borderColor: 'var(--purple-soft)',
              color: 'var(--purple)',
            }}
          >
            <FileText className="w-4 h-4" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center space-x-2">
              <h3
                className="text-xs sm:text-sm font-extrabold tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                案卷全景备忘录
              </h3>
              {serverBrief || customMemo ? (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-soft)] shrink-0">
                  人工已定稿
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--green-soft)] text-[var(--green)] border border-[var(--green-soft)] shrink-0">
                  AI 实时活文档
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted">
              {isBankView ? '👁️ 当前：银行视角（脱敏保密项）' : '🔒 当前：内部操盘全景视角'}
            </p>
          </div>
        </div>

        {/* Right Toolbar Actions (Unified 8px radius, 11px font, compact) */}
        <div className="flex items-center space-x-1.5 flex-wrap">
          {/* Bank View vs Internal View Toggle */}
          {!isEditing && (
            <motion.button
              whileTap={reduced ? undefined : { scale: 0.97 }}
              onClick={() => setIsBankView(!isBankView)}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold border flex items-center space-x-1 cursor-pointer transition-all ${
                isBankView
                  ? 'bg-[var(--green-soft)] text-[var(--green)] border-[var(--green)]'
                  : 'bg-[var(--bg-card)] text-secondary hover:text-primary hover:bg-[var(--bg-subtle)] border-[var(--border)]'
              }`}
              id="memo-toggle-bank-view-btn"
              title={
                isBankView
                  ? '切换回内部操盘视角（显示全部保密事实）'
                  : '切换为银行视角（隐藏保密与红框内容）'
              }
            >
              {isBankView ? (
                <>
                  <ShieldCheck className="w-3 h-3" />
                  <span>银行视角</span>
                </>
              ) : (
                <>
                  <Eye className="w-3 h-3" />
                  <span>银行视角预览</span>
                </>
              )}
            </motion.button>
          )}

          {/* Copy Button */}
          {!isEditing && (
            <motion.button
              whileTap={reduced ? undefined : { scale: 0.97 }}
              onClick={handleCopyMemo}
              className="px-2 py-1 rounded-lg text-[11px] font-semibold border flex items-center space-x-1 cursor-pointer transition-all hover:bg-[var(--bg-subtle)]"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
              }}
              id="memo-copy-btn"
              title="复制当前视角备忘录 Markdown"
            >
              {copied ? <Check className="w-3 h-3 text-[var(--green)]" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? '已复制' : '复制'}</span>
            </motion.button>
          )}

          {/* Refresh / Re-derive */}
          {!isEditing && (
            <motion.button
              whileTap={reduced ? undefined : { scale: 0.97 }}
              onClick={handleRefreshAll}
              disabled={isLoadingBrief}
              className="p-1 rounded-lg border flex items-center justify-center cursor-pointer transition-all hover:bg-[var(--bg-subtle)] disabled:opacity-50"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
              }}
              id="memo-refresh-btn"
              title="刷新并重新拉取最新案情事实与备忘录"
            >
              <RefreshCw className={`w-3 h-3 ${isLoadingBrief ? 'animate-spin' : ''}`} />
            </motion.button>
          )}

          {/* Edit / Save Actions */}
          {!isEditing ? (
            <motion.button
              whileTap={reduced ? undefined : { scale: 0.97 }}
              onClick={handleStartEdit}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center space-x-1 cursor-pointer transition-all shadow-2xs"
              style={{
                backgroundColor: 'var(--accent)',
                borderColor: 'var(--accent)',
                color: '#ffffff',
              }}
              id="memo-start-edit-btn"
            >
              <Edit3 className="w-3 h-3" />
              <span>编辑备忘录</span>
            </motion.button>
          ) : (
            <div className="flex items-center space-x-1">
              <motion.button
                whileTap={reduced ? undefined : { scale: 0.97 }}
                onClick={handleCancelEdit}
                className="px-2 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer hover:bg-[var(--bg-subtle)] flex items-center space-x-1"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-secondary)',
                }}
                id="memo-cancel-edit-btn"
              >
                <X className="w-3 h-3" />
                <span>取消</span>
              </motion.button>

              <motion.button
                whileTap={reduced ? undefined : { scale: 0.97 }}
                onClick={handleResetToDefault}
                className="px-1.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer hover:bg-[var(--bg-subtle)] text-[var(--orange)]"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border)',
                }}
                id="memo-reset-default-btn"
                title="重置为系统推导内容"
              >
                <RotateCcw className="w-3 h-3" />
              </motion.button>

              <motion.button
                whileTap={reduced ? undefined : { scale: 0.97 }}
                onClick={handleSaveMemo}
                disabled={isSaving}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center space-x-1 cursor-pointer shadow-2xs disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--green)',
                  borderColor: 'var(--green)',
                  color: '#ffffff',
                }}
                id="memo-save-btn"
              >
                <Save className="w-3 h-3" />
                <span>{isSaving ? '保存中...' : '保存备忘录'}</span>
              </motion.button>
            </div>
          )}
        </div>
      </div>

      {/* Bank View Banner Alert */}
      {isBankView && !isEditing && (
        <div
          className="px-4 py-2 bg-[var(--green-soft)] border-b flex items-center justify-between text-xs font-medium"
          style={{ borderColor: 'var(--green-soft)', color: 'var(--green)' }}
        >
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 flex-shrink-0" />
            <span>
              <strong>纯净银行视角模式：</strong>已脱敏所有内部保密声明与 [!CAUTION] 标红内容，纯净呈现放款行审批标准。
            </span>
          </div>
          <button
            onClick={() => setIsBankView(false)}
            className="underline font-bold cursor-pointer hover:opacity-80 ml-2"
          >
            退出银行视角
          </button>
        </div>
      )}

      {/* Main Document Body */}
      <div
        ref={memoContainerRef}
        className="flex-1 overflow-y-auto p-3.5 sm:p-4 no-scrollbar space-y-3"
        style={{ backgroundColor: 'var(--bg-card)' }}
      >
        {!isEditing ? (
          /* Rendered Markdown Document */
          <div className="max-w-3xl mx-auto space-y-2.5">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <div className="pb-2 border-b mb-2.5 flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                    <h1
                      className="text-base sm:text-lg font-extrabold tracking-tight"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {children}
                    </h1>
                  </div>
                ),
                h2: ({ children }) => {
                  const text = String(children);
                  let anchorId = 'memo-section-general';
                  if (text.includes('核心诉求') || text.includes('Client Goal')) {
                    anchorId = 'memo-section-goal';
                  } else if (text.includes('核心卡点') || text.includes('Special Circumstances')) {
                    anchorId = 'memo-section-blocker';
                  } else if (text.includes('借款人') || text.includes('财务画像')) {
                    anchorId = 'memo-section-profile';
                  } else if (text.includes('保密事实') || text.includes('CAUTION')) {
                    anchorId = 'memo-section-caution';
                  }

                  return (
                    <div id={anchorId} className="pt-2 pb-0.5 flex items-center space-x-1.5">
                      <h2
                        className="text-xs sm:text-sm font-extrabold tracking-tight flex items-center space-x-1.5"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <span>{children}</span>
                      </h2>
                    </div>
                  );
                },
                p: ({ children }) => (
                  <p
                    className="text-[12px] sm:text-[13px] leading-relaxed text-secondary"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {children}
                  </p>
                ),
                ul: ({ children }) => (
                  <ul className="space-y-1 my-1 pl-2 sm:pl-3 text-[12px] sm:text-[13px] text-secondary">
                    {children}
                  </ul>
                ),
                li: ({ children }) => (
                  <li className="flex items-start space-x-1.5 leading-relaxed">
                    <span className="text-[var(--accent)] font-bold shrink-0 mt-0.5">•</span>
                    <span className="flex-1 min-w-0">{children}</span>
                  </li>
                ),
                strong: ({ children }) => (
                  <strong className="font-bold" style={{ color: 'var(--text-primary)' }}>
                    {children}
                  </strong>
                ),
                blockquote: ({ children }) => {
                  const str = String(children);
                  const isCaution = str.includes('CAUTION') || str.includes('保密事实') || str.includes('严禁披露给银行') || str.includes('不能给银行看');
                  const isWarning = str.includes('WARNING') || str.includes('警示') || str.includes('风险提示');

                  if (isCaution) {
                    return (
                      <div
                        className="my-2 p-2.5 sm:p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-[11px] sm:text-xs space-y-1.5 shadow-xs transition-all"
                        id="memo-caution-box"
                      >
                        <div className="flex items-center space-x-1.5 font-bold text-red-400">
                          <Lock className="w-3.5 h-3.5 flex-shrink-0 text-red-500 animate-pulse" />
                          <span>🔒 内部保密事实（严禁披露给银行）</span>
                        </div>
                        <div className="text-red-300 leading-relaxed pl-1 space-y-1">
                          {children}
                        </div>
                      </div>
                    );
                  }

                  if (isWarning) {
                    return (
                      <div
                        className="my-2 p-2.5 sm:p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-[11px] sm:text-xs space-y-1.5 shadow-xs transition-all"
                        id="memo-warning-box"
                      >
                        <div className="flex items-center space-x-1.5 font-bold text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-amber-500" />
                          <span>⚠️ 信贷风控重点与在途核查预警</span>
                        </div>
                        <div className="text-amber-200 leading-relaxed pl-1 space-y-1">
                          {children}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <blockquote
                      className="my-2 p-2.5 rounded-xl border-l-4 bg-[var(--bg-subtle)] text-[12px] sm:text-[13px] italic"
                      style={{
                        borderColor: 'var(--accent)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {children}
                    </blockquote>
                  );
                },
              }}
            >
              {displayMemo}
            </ReactMarkdown>
          </div>
        ) : (
          /* Markdown Editor View */
          <div className="h-full flex flex-col space-y-2.5">
            {/* Quick Snippet Insert Bar */}
            <div className="flex items-center space-x-2 text-xs flex-wrap gap-y-1 pb-1 border-b" style={{ borderColor: 'var(--border)' }}>
              <span className="text-[11px] text-muted font-bold">快捷插入小节：</span>
              <button
                type="button"
                onClick={() => handleInsertSnippet('## 🎯 客户核心诉求与目标 (Client Goal)\n')}
                className="px-2 py-0.5 rounded-lg border text-[11px] font-semibold bg-[var(--bg-subtle)] hover:bg-[var(--bg-app)] cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
              >
                + 🎯 核心诉求
              </button>
              <button
                type="button"
                onClick={() => handleInsertSnippet('## 🚨 当前核心卡点与在途攻坚 (Special Circumstances)\n')}
                className="px-2 py-0.5 rounded-lg border text-[11px] font-semibold bg-[var(--bg-subtle)] hover:bg-[var(--bg-app)] cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
              >
                + 🚨 核心卡点
              </button>
              <button
                type="button"
                onClick={() => handleInsertSnippet('## 🪪 借款人与财务画像\n- **借款主体**：\n- **身份/居留**：\n- **雇佣与职业**：\n')}
                className="px-2 py-0.5 rounded-lg border text-[11px] font-semibold bg-[var(--bg-subtle)] hover:bg-[var(--bg-app)] cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
              >
                + 🪪 财务画像
              </button>
              <button
                type="button"
                onClick={() => handleInsertSnippet('## 🔒 内部保密事实声明\n> [!CAUTION] 🔒 内部保密事实（严禁披露给银行）\n> - **保密事项**：\n')}
                className="px-2 py-0.5 rounded-lg border text-[11px] font-semibold bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20 cursor-pointer"
              >
                + 🔒 内部保密声明
              </button>
            </div>

            {/* Editor Textarea */}
            <div className="flex-1 flex flex-col min-h-[360px]">
              <textarea
                value={editingContent}
                onChange={(e) => setEditingContent(e.target.value)}
                className="w-full flex-1 p-3 rounded-xl font-mono text-[12px] sm:text-xs border resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent)] leading-relaxed"
                style={{
                  backgroundColor: 'var(--bg-app)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
                placeholder="编写或修改案卷全景备忘录 Markdown 文档..."
                id="memo-markdown-editor"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
