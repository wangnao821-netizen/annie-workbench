import { useState, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Clock,
  Sparkles,
  RefreshCw,
  AlertCircle,
  AlertOctagon,
  UserCheck,
  UploadCloud,
  FileQuestion,
  RotateCcw,
  PartyPopper,
  FileText,
  Mail,
  ExternalLink,
  History,
  FileSearch,
} from 'lucide-react';
import { getCaseTimeline, extractTimelineEmails } from '../../../services/api/cases';
import { CaseTimelineResponse } from '../../../types/api';
import { useToastStore } from '../../../stores/toastStore';
import { useCaseStore } from '../../../stores/caseStore';
import { FilePreviewPanel } from './FilePreviewPanel';
import { MailPreviewModal } from './MailPreviewModal';

interface CaseTimelinePanelProps {
  caseId: string;
}

type TimelineFilter = 'all' | 'blockers' | 'emails';

export function CaseTimelinePanel({ caseId }: CaseTimelinePanelProps) {
  const reduced = useReducedMotion();
  const showToast = useToastStore((s) => s.showToast);
  const { currentCase, fetchCases } = useCaseStore();

  const [timelineData, setTimelineData] = useState<CaseTimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TimelineFilter>('all');

  // File Preview Modal State
  const [previewFile, setPreviewFile] = useState<{ filename: string; fileId?: string } | null>(null);
  const [previewMailFilename, setPreviewMailFilename] = useState<string | null>(null);

  const fetchTimeline = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCaseTimeline(caseId);
      setTimelineData(res);

      // Sync assessor/lender_ref/blocker back to currentCase if matched
      const caseInStore = useCaseStore.getState().currentCase;
      if (caseInStore && caseInStore.caseId === caseId) {
        if (
          res.assessor_name !== caseInStore.assessorName ||
          res.lender_ref !== caseInStore.lenderRef ||
          res.active_blocker !== caseInStore.activeBlocker
        ) {
          useCaseStore.getState().setCurrentCase({
            ...caseInStore,
            assessorName: res.assessor_name || caseInStore.assessorName,
            lenderRef: res.lender_ref || caseInStore.lenderRef,
            activeBlocker: res.active_blocker !== undefined ? res.active_blocker : caseInStore.activeBlocker,
          });
        }
      }
    } catch {
      setError('时序脉络加载失败，请检查网络或后端服务');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  const handleExtractEmails = async () => {
    if (extracting) return;
    setExtracting(true);
    try {
      const res = await extractTimelineEmails(caseId);
      if (res.ok) {
        showToast('success', `成功扫描并提取 ${res.extracted_count} 封邮件往来，时序脉络已更新！`);
        await fetchTimeline();
        await fetchCases();
      } else {
        showToast('error', '扫描邮件失败，请重试');
      }
    } catch {
      showToast('error', '扫描邮件请求异常，请检查服务');
    } finally {
      setExtracting(false);
    }
  };

  const getEventIcon = (eventType: string, isBlocker: boolean) => {
    if (isBlocker) {
      return <AlertOctagon className="w-4 h-4 text-red-500" />;
    }
    switch (eventType) {
      case 'submission_lodged':
      case 'submission':
        return <UploadCloud className="w-4 h-4 text-[var(--accent)]" />;
      case 'assessor_assigned':
      case 'assessor':
        return <UserCheck className="w-4 h-4 text-[var(--purple)]" />;
      case 'mir_requested':
      case 'condition':
        return <FileQuestion className="w-4 h-4 text-amber-500" />;
      case 'valuation_shortfall':
      case 'valuation':
        return <AlertOctagon className="w-4 h-4 text-red-500" />;
      case 'reassessment_submitted':
      case 'reassessment':
        return <RotateCcw className="w-4 h-4 text-[var(--accent)]" />;
      case 'approval_issued':
      case 'approval':
        return <PartyPopper className="w-4 h-4 text-[var(--green)]" />;
      case 'note':
      case 'manual_note':
        return <FileText className="w-4 h-4 text-slate-400" />;
      default:
        return <Mail className="w-4 h-4 text-[var(--accent)]" />;
    }
  };

  const formatEventTime = (timeStr: string) => {
    if (!timeStr) return '';
    try {
      const date = new Date(timeStr);
      if (isNaN(date.getTime())) return timeStr;
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const hh = String(date.getHours()).padStart(2, '0');
      const mm = String(date.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${d} ${hh}:${mm}`;
    } catch {
      return timeStr;
    }
  };

  // Filter events
  const allEvents = timelineData?.events || [];
  const filteredEvents = allEvents.filter((evt) => {
    if (filter === 'blockers') return evt.is_blocker;
    if (filter === 'emails') return !!evt.sender || (evt.source_file && evt.source_file.endsWith('.msg'));
    return true;
  });

  const activeBlocker = timelineData?.active_blocker || currentCase?.activeBlocker;
  const blockerCount = allEvents.filter((e) => e.is_blocker).length;

  return (
    <div
      className="flex flex-col h-full rounded-2xl border overflow-hidden transition-all shadow-xs"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow-card)',
      }}
      id="case-timeline-panel"
    >
      {/* Top Action Header Bar - Height & Style Aligned with CaseMemoView */}
      <div
        className="px-4 py-2.5 min-h-[52px] border-b flex items-center justify-between gap-3 flex-shrink-0"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--bg-panel)',
        }}
        id="case-timeline-header-card"
      >
        {/* Left Title & Status (Two-line Layout matching Left Memo) */}
        <div className="flex items-center space-x-2.5 min-w-0">
          <div
            className="w-7 h-7 rounded-xl border flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: 'var(--purple-soft)',
              borderColor: 'var(--purple-soft)',
              color: 'var(--purple)',
            }}
          >
            <Clock className="w-4 h-4" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center space-x-1.5 min-w-0">
              <h3
                className="text-xs sm:text-sm font-extrabold tracking-tight truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                沟通与时序证据链
              </h3>
              {blockerCount > 0 ? (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/30 shrink-0">
                  {blockerCount} 卡点
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--green-soft)] text-[var(--green)] border border-[var(--green-soft)] shrink-0">
                  进程正常
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted truncate">
              共 {allEvents.length} 条全流程交互存证 · 审计回溯
            </p>
          </div>
        </div>

        {/* Right Toolbar Actions */}
        <div className="flex items-center space-x-1.5 flex-shrink-0">
          {/* Extract / Scan Button (Icon Only to save horizontal space) */}
          <motion.button
            whileTap={reduced ? undefined : { scale: 0.94 }}
            type="button"
            onClick={handleExtractEmails}
            disabled={extracting}
            className="w-8 h-8 rounded-lg text-white flex items-center justify-center cursor-pointer shadow-2xs disabled:opacity-50 transition-all shrink-0 hover:opacity-90"
            style={{ backgroundColor: 'var(--accent)' }}
            id="extract-timeline-emails-btn"
            title="扫描并提取最新邮件动态"
            aria-label="扫描并提取最新邮件动态"
          >
            {extracting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
          </motion.button>
        </div>
      </div>

      {/* Sub-bar: Filter Pills below Title Bar */}
      <div
        className="px-4 py-2 border-b flex items-center justify-between gap-2 flex-shrink-0"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--bg-app)',
        }}
        id="case-timeline-filter-bar"
      >
        <div className="flex items-center space-x-1 p-0.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)]">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-all ${
              filter === 'all'
                ? 'bg-[var(--bg-card)] text-primary shadow-2xs'
                : 'text-muted hover:text-primary'
            }`}
            id="filter-timeline-all"
          >
            全部 ({allEvents.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('blockers')}
            className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-all ${
              filter === 'blockers'
                ? 'bg-red-500 text-white shadow-2xs'
                : 'text-muted hover:text-primary'
            }`}
            id="filter-timeline-blockers"
          >
            卡点{blockerCount > 0 ? ` (${blockerCount})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setFilter('emails')}
            className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-all ${
              filter === 'emails'
                ? 'bg-[var(--bg-card)] text-primary shadow-2xs'
                : 'text-muted hover:text-primary'
            }`}
            id="filter-timeline-emails"
          >
            邮件
          </button>
        </div>

        <span className="text-[11px] text-muted font-medium">
          显示 {filteredEvents.length} 条记录
        </span>
      </div>

      {/* Active Blocker Warning Banner (If Present) */}
      {activeBlocker && (
        <div className="px-3 pt-2 flex-shrink-0">
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-3 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 flex items-start space-x-2 shadow-xs"
            id="timeline-active-blocker-banner"
          >
            <AlertOctagon className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5 animate-pulse" />
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-[11px] text-red-500">案件暂停/阻断中</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-red-500/20 text-red-400 font-bold">需人工介入</span>
              </div>
              <p className="text-[11px] font-medium text-red-300 leading-relaxed">
                {activeBlocker}
              </p>
            </div>
          </motion.div>
        </div>
      )}

      {/* Scrollable Timeline Stream Body */}
      <div
        className="flex-1 overflow-y-auto p-4 no-scrollbar space-y-4"
        style={{ backgroundColor: 'var(--bg-card)' }}
      >
        {loading ? (
          <div className="space-y-3 pt-2" id="timeline-skeleton">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-3.5 rounded-xl border animate-pulse space-y-2"
                style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}
              >
                <div className="h-3.5 rounded-md w-1/3 bg-slate-200 dark:bg-slate-700" />
                <div className="h-3 rounded-md w-3/4 bg-slate-200 dark:bg-slate-700" />
                <div className="h-2.5 rounded-md w-1/2 bg-slate-200 dark:bg-slate-700" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div
            className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 space-y-2.5"
            id="timeline-error-box"
          >
            <div className="flex items-center space-x-2 text-xs font-bold">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={fetchTimeline}
              className="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-[11px] font-bold text-red-300 flex items-center space-x-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>重试加载</span>
            </button>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div
            className="p-8 text-center rounded-xl border space-y-2"
            style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}
            id="timeline-empty-box"
          >
            <div className="w-9 h-9 mx-auto rounded-full bg-slate-500/10 flex items-center justify-center text-muted">
              <History className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-primary">暂无匹配的时序记录</p>
              <p className="text-[11px] text-muted">点击上方「重新扫描提取邮件」获取本地或邮件夹中的最新案卷动态</p>
            </div>
          </div>
        ) : (
          <div className="relative pl-8 space-y-3 before:absolute before:left-3.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-[var(--border)]" id="timeline-stream-container">
            {filteredEvents.map((evt, idx) => {
              const isBlocker = evt.is_blocker;
              return (
                <motion.div
                  key={evt.id || `evt-${idx}`}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, delay: idx * 0.03 }}
                  className="relative group"
                  id={`timeline-event-${evt.id || idx}`}
                >
                  {/* Node Point - Centered on the vertical line */}
                  <div
                    className={`absolute -left-5 top-4 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full border-2 flex items-center justify-center bg-[var(--bg-card)] shadow-xs transition-transform group-hover:scale-110 z-10 ${
                      isBlocker
                        ? 'border-red-500 text-red-500 bg-red-500/10'
                        : 'border-[var(--accent)] text-[var(--accent)]'
                    }`}
                  >
                    <div className="scale-65">
                      {getEventIcon(evt.event_type, isBlocker)}
                    </div>
                  </div>

                  {/* Event Card */}
                  <div
                    className={`p-3 rounded-xl border space-y-2 transition-all duration-150 hover:shadow-xs ${
                      isBlocker
                        ? 'border-red-500/40 bg-red-500/5'
                        : 'hover:border-[var(--accent)]/40'
                    }`}
                    style={{
                      backgroundColor: isBlocker ? undefined : 'var(--bg-card)',
                      borderColor: isBlocker ? undefined : 'var(--border)',
                    }}
                  >
                    {/* Top: Title, Time, Blocker Badge */}
                    <div className="flex items-start justify-between flex-wrap gap-1.5">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center space-x-1.5 flex-wrap">
                          <span className="text-xs font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                            {evt.title}
                          </span>
                          {isBlocker && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-500 text-white flex items-center space-x-0.5 shadow-2xs">
                              <AlertOctagon className="w-2.5 h-2.5" />
                              <span>阻断卡点</span>
                            </span>
                          )}
                        </div>
                        {(evt.sender || evt.assessor) && (
                          <p className="text-[10px] text-muted space-x-1.5 truncate">
                            {evt.sender && <span>发件人: <strong className="text-secondary font-mono">{evt.sender}</strong></span>}
                            {evt.assessor && <span>· 审批官: <strong className="text-secondary">{evt.assessor}</strong></span>}
                          </p>
                        )}
                      </div>

                      <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-[var(--bg-app)] border text-muted shrink-0" style={{ borderColor: 'var(--border)' }}>
                        {formatEventTime(evt.event_time)}
                      </span>
                    </div>

                    {/* Summary / Body */}
                    <p className="text-[11px] text-secondary leading-relaxed whitespace-pre-wrap">
                      {evt.summary}
                    </p>

                    {/* Blocker Reason Box */}
                    {isBlocker && evt.blocker_reason && (
                      <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-medium flex items-center space-x-1.5">
                        <AlertOctagon className="w-3 h-3 flex-shrink-0 text-red-500" />
                        <span>卡点原因: {evt.blocker_reason}</span>
                      </div>
                    )}

                    {/* Footer Meta: Source File Capsule */}
                    {(evt.source_file || evt.lender_ref) && (
                      <div className="flex items-center justify-between pt-1.5 border-t flex-wrap gap-1.5 text-[11px]" style={{ borderColor: 'var(--border)' }}>
                        {evt.source_file && (
                          <motion.button
                            type="button"
                            whileTap={reduced ? undefined : { scale: 0.96 }}
                            onClick={() => {
                              if (evt.source_file?.toLowerCase().endsWith('.msg')) {
                                setPreviewMailFilename(evt.source_file);
                              } else {
                                setPreviewFile({ filename: evt.source_file! });
                              }
                            }}
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[var(--accent-soft)] text-[var(--accent)] border border-indigo-500/20 hover:border-[var(--accent)] transition-all cursor-pointer truncate max-w-xs"
                            title={`点击预览证据文件: ${evt.source_file}`}
                          >
                            <FileSearch className="w-2.5 h-2.5 flex-shrink-0" />
                            <span className="truncate">📎 证据: {evt.source_file}</span>
                            <ExternalLink className="w-2 h-2 opacity-70 flex-shrink-0 ml-0.5" />
                          </motion.button>
                        )}

                        {evt.lender_ref && (
                          <span className="text-[10px] text-muted font-mono ml-auto">
                            案号: {evt.lender_ref}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* File Preview Modal */}
      {previewFile && (
        <FilePreviewPanel
          fileId={previewFile.fileId}
          filename={previewFile.filename}
          docType="时序脉络证据文件"
          onClose={() => setPreviewFile(null)}
        />
      )}

      {/* Native Mail Preview Modal */}
      {previewMailFilename && (
        <MailPreviewModal
          caseId={caseId}
          filename={previewMailFilename}
          onClose={() => setPreviewMailFilename(null)}
        />
      )}
    </div>
  );
}
