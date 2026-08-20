import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RefreshCw, AlertCircle, Plus, Download, Clock,
  Check, X, FileText
} from 'lucide-react';
import {
  listBrainFacts,
  lockFact,
  unlockFact,
  setFactDisclosure,
  amendFact,
  listContextEvents,
  confirmContextEvent,
  supersedeContextEvent,
  createContextEvent,
  getCaseContext,
} from '../../../services/api/cases';
import { BrainFact, ContextEvent, CaseContext } from '../../../types/api';
import { useToastStore } from '../../../stores/toastStore';
import { FactCard } from '../../brain/FactCard';
import { FactAmendModal } from '../../brain/FactAmendModal';
import { ManualNoteModal } from '../../brain/ManualNoteModal';
import { ContextPreviewModal } from '../../brain/ContextPreviewModal';

interface BrainPanelProps {
  caseId: string;
}

const CATEGORY_MAP: Record<string, { title: string; icon: string; order: number }> = {
  loan: { title: '贷款方案', icon: '🏦', order: 1 },
  property: { title: '房产信息', icon: '🏠', order: 2 },
  identity: { title: '借款人与渠道', icon: '👥', order: 3 },
  income: { title: '收入与财务', icon: '💼', order: 4 },
  employment: { title: '职业与雇主', icon: '👔', order: 5 },
  liability: { title: '负债与支出', icon: '💳', order: 6 },
  special: { title: '特殊情况与卡点', icon: '⚡', order: 7 },
  disclosure: { title: '披露与合规声明', icon: '🛡️', order: 8 },
  contact: { title: '联系方式', icon: '📞', order: 9 },
  general: { title: '综合案情事实', icon: '📌', order: 10 },
};

function resolveFactCategory(fact: BrainFact): string {
  const cat = fact.category?.toLowerCase();
  if (cat && CATEGORY_MAP[cat]) return cat;
  const key = fact.key?.toLowerCase() || '';
  if (key.startsWith('bank') || key.startsWith('loan')) return 'loan';
  if (key.startsWith('property')) return 'property';
  if (key.startsWith('identity') || key.startsWith('referral')) return 'identity';
  if (key.startsWith('contact')) return 'contact';
  if (key.startsWith('income')) return 'income';
  if (key.startsWith('employment')) return 'employment';
  if (key.startsWith('liability')) return 'liability';
  if (key.startsWith('special')) return 'special';
  if (key.startsWith('disclosure')) return 'disclosure';
  return 'general';
}

export function BrainPanel({ caseId }: BrainPanelProps) {
  const [facts, setFacts] = useState<BrainFact[]>([]);
  const [events, setEvents] = useState<ContextEvent[]>([]);
  const [context, setContext] = useState<CaseContext | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track Filter: 'all' | 'internal' | 'external'
  const [trackFilter, setTrackFilter] = useState<'all' | 'internal' | 'external'>('all');

  // Modal States
  const [amendModalOpen, setAmendModalOpen] = useState(false);
  const [amendTargetFact, setAmendTargetFact] = useState<BrainFact | null>(null);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  const showToast = useToastStore((s) => s.showToast);

  const loadData = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    setError(null);

    try {
      const [fetchedFacts, fetchedEvents, fetchedContext] = await Promise.all([
        listBrainFacts(caseId).catch(() => []),
        listContextEvents(caseId).catch(() => []),
        getCaseContext(caseId).catch(() => null),
      ]);

      setFacts(fetchedFacts);
      setEvents(fetchedEvents);
      setContext(fetchedContext);
    } catch (err: any) {
      setError(err?.message || '加载案情事实与时间线失败');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Lock / Unlock Fact
  const handleLockToggle = async (fact: BrainFact) => {
    try {
      if (fact.locked_by_user) {
        await unlockFact(caseId, fact.id);
        showToast('success', '已解除锁定，AI 可再次自动更替');
      } else {
        await lockFact(caseId, fact.id);
        showToast('success', '事实已人工锁定，防止 AI 自动覆盖');
      }
      await loadData();
    } catch (err: any) {
      showToast('error', err?.message || '锁定操作失败');
    }
  };

  // Disclosure Tri-State
  const handleDisclosureChange = async (fact: BrainFact, disclosure: 'disclosed' | 'internal_only' | null) => {
    try {
      await setFactDisclosure(caseId, fact.id, disclosure);
      showToast('success', '披露标记已更新');
      await loadData();
    } catch (err: any) {
      showToast('error', err?.message || '设置披露标记失败');
    }
  };

  // Open Amend Modal
  const handleAmendClick = (fact: BrainFact) => {
    setAmendTargetFact(fact);
    setAmendModalOpen(true);
  };

  // Submit Amend
  const handleAmendSubmit = async (newValue: string, reason: string) => {
    if (!amendTargetFact) return;
    try {
      await amendFact(caseId, amendTargetFact.id, newValue, reason);
      showToast('success', '事实修改成功，新事实已自动锁死');
      await loadData();
    } catch (err: any) {
      showToast('error', err?.message || '事实修正失败');
    }
  };

  // Submit Manual Note
  const handleNoteSubmit = async (content: string, track: 'internal' | 'external') => {
    try {
      await createContextEvent(caseId, { source_type: 'manual_note', content, track });
      showToast('success', '手动笔记记录成功');
      await loadData();
    } catch (err: any) {
      showToast('error', err?.message || '笔记记录失败');
    }
  };

  // Confirm Context Event
  const handleConfirmEvent = async (eventId: number) => {
    try {
      await confirmContextEvent(caseId, eventId);
      showToast('success', '事件已确认');
      await loadData();
    } catch (err: any) {
      showToast('error', err?.message || '事件确认失败');
    }
  };

  // Supersede/Revoke Context Event
  const handleRevokeEvent = async (eventId: number) => {
    try {
      await supersedeContextEvent(caseId, eventId, '用户手动撤销');
      showToast('success', '事件已撤销');
      await loadData();
    } catch (err: any) {
      showToast('error', err?.message || '撤销操作失败');
    }
  };

  // Filter Facts
  const filteredFacts = useMemo(() => {
    if (trackFilter === 'all') return facts;
    return facts.filter((f) => f.track === trackFilter);
  }, [facts, trackFilter]);

  // Group Filtered Facts by Category
  const groupedFacts = useMemo(() => {
    const map: Record<string, BrainFact[]> = {};
    filteredFacts.forEach((fact) => {
      const cat = resolveFactCategory(fact);
      if (!map[cat]) map[cat] = [];
      map[cat].push(fact);
    });
    return Object.entries(map).sort(([catA], [catB]) => {
      const orderA = CATEGORY_MAP[catA]?.order ?? 99;
      const orderB = CATEGORY_MAP[catB]?.order ?? 99;
      return orderA - orderB;
    });
  }, [filteredFacts]);

  // Filter Events
  const filteredEvents = useMemo(() => {
    let result = events;
    if (trackFilter !== 'all') {
      result = events.filter((e) => e.track === trackFilter);
    }
    // Reverse chronological sort
    return [...result].sort((a, b) => {
      const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tB - tA;
    });
  }, [events, trackFilter]);

  return (
    <div className="space-y-6 text-xs" id="brain-panel">
      {/* Upper Control Bar - Optimized 2-Row Layout */}
      <div
        className="p-4 rounded-2xl border flex flex-col gap-3 shadow-xs transition-all"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}
      >
        {/* Row 1: Title + Counter Badges + Main Action Buttons */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-[var(--purple-soft)] text-[var(--purple)] shrink-0 shadow-xs">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
              <h3 className="font-extrabold text-sm sm:text-base tracking-tight" style={{ color: 'var(--text-primary)' }}>
                上下文维护中心
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold font-mono bg-[var(--purple-soft)] text-[var(--purple)] border border-purple-500/20">
                事实: {facts.length}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold font-mono bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border)]">
                时间线: {events.length}
              </span>
            </div>
          </div>

          {/* Row 1 Actions */}
          <div className="flex items-center space-x-2 shrink-0">
            {/* Note Button */}
            <button
              type="button"
              onClick={() => setNoteModalOpen(true)}
              className="px-3 py-1.5 rounded-xl border flex items-center space-x-1.5 font-bold text-xs bg-[var(--purple-soft)] hover:bg-purple-500/20 text-[var(--purple)] border-purple-500/20 transition-all cursor-pointer shadow-xs"
              id="brain-panel-add-note-btn"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>记一笔</span>
            </button>

            {/* Export Context Button */}
            <button
              type="button"
              onClick={() => setPreviewModalOpen(true)}
              className="px-3 py-1.5 rounded-xl border flex items-center space-x-1.5 font-bold text-xs bg-[var(--bg-panel)] hover:bg-[var(--bg-subtle)] transition-all cursor-pointer shadow-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              id="brain-panel-export-context-btn"
            >
              <Download className="w-3.5 h-3.5" />
              <span>导出上下文</span>
            </button>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="p-1.5 rounded-xl border flex items-center justify-center text-muted hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
              title="刷新数据"
              id="brain-panel-refresh-btn"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Row 2: Subtitle / Description + Track Segment Filter */}
        <div 
          className="pt-2.5 border-t flex items-center justify-between gap-3 flex-wrap"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="text-xs text-muted">
            案情事实与时间线管理 · 包含锁定、修正、披露控制与证据链
          </p>

          {/* Track Segment Filter */}
          <div className="p-0.5 rounded-xl border flex items-center bg-[var(--bg-subtle)] shrink-0" style={{ borderColor: 'var(--border)' }}>
            <button
              type="button"
              onClick={() => setTrackFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                trackFilter === 'all'
                  ? 'bg-[var(--bg-card)] text-[var(--accent)] shadow-xs'
                  : 'text-muted hover:text-primary'
              }`}
            >
              全部 ({facts.length})
            </button>
            <button
              type="button"
              onClick={() => setTrackFilter('internal')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                trackFilter === 'internal'
                  ? 'bg-[var(--yellow-soft)] text-[var(--yellow)] shadow-xs'
                  : 'text-muted hover:text-primary'
              }`}
            >
              🟡 内部轨迹
            </button>
            <button
              type="button"
              onClick={() => setTrackFilter('external')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                trackFilter === 'external'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)] shadow-xs'
                  : 'text-muted hover:text-primary'
              }`}
            >
              🔵 递交轨迹
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-2xl border bg-[var(--red-soft)] border-[var(--red-soft)] text-[var(--red)] text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={loadData} className="underline font-bold cursor-pointer">
            重试
          </button>
        </div>
      )}

      {/* PART 1: Fact Maintenance Center (上半区: 事实分组网格) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h4 className="font-extrabold text-sm flex items-center space-x-2" style={{ color: 'var(--text-primary)' }}>
            <span>已提取案情事实</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--purple-soft)] text-[var(--purple)]">
              {filteredFacts.length} 项
            </span>
          </h4>
        </div>

        {loading ? (
          <div className="p-8 rounded-2xl border animate-pulse space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <div className="h-4 bg-[var(--bg-subtle-strong)] rounded w-1/4" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="h-20 bg-[var(--bg-subtle)] rounded-xl" />
              <div className="h-20 bg-[var(--bg-subtle)] rounded-xl" />
            </div>
          </div>
        ) : groupedFacts.length === 0 ? (
          <div
            className="p-12 text-center rounded-2xl border space-y-2"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <p className="font-extrabold text-sm" style={{ color: 'var(--text-primary)' }}>
              暂无已提取事实
            </p>
            <p className="text-xs text-muted">
              可点击上方「记一笔」手动补充事实，或在案件对话中与 VERA 聊天时记录
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {groupedFacts.map(([catKey, catFacts]) => {
              const catInfo = CATEGORY_MAP[catKey] || { title: catKey, icon: '📄', order: 99 };
              return (
                <div key={catKey} className="space-y-2.5">
                  <div className="flex items-center space-x-2 text-xs font-extrabold px-1" style={{ color: 'var(--text-primary)' }}>
                    <span>{catInfo.icon}</span>
                    <span>{catInfo.title}</span>
                    <span className="text-muted text-[11px] font-normal">({catFacts.length})</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {catFacts.map((fact) => (
                      <FactCard
                        key={fact.id}
                        fact={fact}
                        onLockToggle={handleLockToggle}
                        onDisclosureChange={handleDisclosureChange}
                        onAmendClick={handleAmendClick}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* PART 2: Timeline Events / Evidence Chain (下半区: 时间线证据链) */}
      <div className="pt-4 border-t space-y-4" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between px-1">
          <h4 className="font-extrabold text-sm flex items-center space-x-2" style={{ color: 'var(--text-primary)' }}>
            <Clock className="w-4 h-4 text-[var(--accent)]" />
            <span>时间线（证据链）</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--accent-soft)] text-[var(--accent)]">
              {filteredEvents.length} 条
            </span>
          </h4>
        </div>

        {filteredEvents.length === 0 ? (
          <div
            className="p-8 text-center rounded-2xl border text-xs text-muted"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            暂无时间线记录
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredEvents.map((event) => {
              const isInternal = event.track === 'internal';
              const isSuperseded = event.status === 'superseded';
              const isPending = event.status === 'pending';
              const isConfirmed = event.status === 'confirmed';

              return (
                <div
                  key={event.id}
                  className={`p-3.5 rounded-2xl border space-y-2 transition-all ${
                    isSuperseded ? 'opacity-50 bg-[var(--bg-subtle)]' : ''
                  }`}
                  style={{
                    backgroundColor: isSuperseded ? undefined : 'var(--bg-card)',
                    borderColor: 'var(--border)',
                  }}
                >
                  {/* Event Top Bar */}
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center space-x-2">
                      {/* Track Badge */}
                      <span
                        className={`px-1.5 py-0.2 rounded text-xs font-bold border ${
                          isInternal
                            ? 'bg-[var(--yellow-soft)] text-[var(--yellow)] border-[var(--yellow-soft)]'
                            : 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-soft)]'
                        }`}
                      >
                        {isInternal ? '🟡 内部' : '🔵 递交'}
                      </span>

                      {/* Source type */}
                      <span className="font-bold text-muted">
                        {event.source_type === 'manual_note'
                          ? '📝 手动笔记'
                          : event.source_type === 'email'
                          ? '📧 邮件来源'
                          : event.source_type === 'file'
                          ? '📁 文件识别'
                          : event.source_type}
                      </span>
                    </div>

                    {/* Status & Actions */}
                    <div className="flex items-center space-x-2">
                      {/* Status Badge */}
                      {isPending && (
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-[var(--yellow-soft)] text-[var(--yellow)] border border-[var(--yellow-soft)]">
                          待确认
                        </span>
                      )}
                      {isConfirmed && (
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-[var(--green-soft)] text-[var(--green)] border border-[var(--green-soft)]">
                          ✓ 已确认
                        </span>
                      )}
                      {isSuperseded && (
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-500/15 text-slate-500 border border-slate-500/25">
                          已废弃
                        </span>
                      )}

                      {/* Actions for Pending */}
                      {isPending && (
                        <div className="flex items-center space-x-1 pl-2 border-l" style={{ borderColor: 'var(--border)' }}>
                          <button
                            type="button"
                            onClick={() => handleConfirmEvent(event.id)}
                            className="px-2 py-0.5 rounded bg-[var(--green-soft)] hover:bg-[var(--green-soft)] text-[var(--green)] font-bold transition-colors cursor-pointer flex items-center space-x-0.5"
                          >
                            <Check className="w-3 h-3" />
                            <span>确认</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRevokeEvent(event.id)}
                            className="px-2 py-0.5 rounded bg-[var(--red-soft)] hover:bg-[var(--red-soft)] text-[var(--red)] font-bold transition-colors cursor-pointer flex items-center space-x-0.5"
                          >
                            <X className="w-3 h-3" />
                            <span>撤销</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Event Content */}
                  <p
                    className={`text-xs leading-relaxed font-medium whitespace-pre-wrap ${
                      isSuperseded ? 'line-through text-muted' : ''
                    }`}
                    style={{ color: isSuperseded ? undefined : 'var(--text-primary)' }}
                  >
                    {event.content}
                  </p>

                  {/* Timestamp */}
                  {event.created_at && (
                    <div className="text-[11px] font-mono text-muted text-right">
                      {new Date(event.created_at).toLocaleString()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      <FactAmendModal
        open={amendModalOpen}
        fact={amendTargetFact}
        onClose={() => {
          setAmendModalOpen(false);
          setAmendTargetFact(null);
        }}
        onSubmit={handleAmendSubmit}
      />

      <ManualNoteModal
        open={noteModalOpen}
        onClose={() => setNoteModalOpen(false)}
        onSubmit={handleNoteSubmit}
      />

      <ContextPreviewModal
        open={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        context={context}
        loading={loading}
      />
    </div>
  );
}
