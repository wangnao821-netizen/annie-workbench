import { useState } from 'react';
import {
  Mail, TrendingUp, ListTodo, History, Check, XCircle, FileText, MessageSquare, AlertCircle
} from 'lucide-react';
import { CaseContext, ContextEvent } from '../../../types/api';

interface OverviewTimelineProps {
  events?: CaseContext['timeline'];
  contextEvents?: ContextEvent[];
  onConfirmEvent?: (event: ContextEvent) => void;
  onSupersedeEvent?: (event: ContextEvent, reason: string) => void;
}

export function OverviewTimeline({
  events,
  contextEvents,
  onConfirmEvent,
  onSupersedeEvent,
}: OverviewTimelineProps) {
  const [supersedeModalEvent, setSupersedeModalEvent] = useState<ContextEvent | null>(null);
  const [supersedeReason, setSupersedeReason] = useState('');

  const renderIcon = (type: string) => {
    switch (type) {
      case 'email':
      case 'email_received':
        return <Mail className="w-3.5 h-3.5 text-[var(--accent)]" />;
      case 'manual_note':
        return <FileText className="w-3.5 h-3.5 text-[var(--yellow)]" />;
      case 'chat_extract':
      case 'delegation':
        return <MessageSquare className="w-3.5 h-3.5 text-[var(--purple)]" />;
      case 'stage_advance':
        return <TrendingUp className="w-3.5 h-3.5 text-[var(--green)]" />;
      case 'checklist':
      case 'checklist_confirm':
        return <ListTodo className="w-3.5 h-3.5 text-[var(--yellow)]" />;
      default:
        return <History className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  // If contextEvents are passed (WO-42 real events), sort descending by created_at
  const hasRealEvents = Array.isArray(contextEvents);
  
  const sortedContextEvents = hasRealEvents
    ? [...(contextEvents || [])].sort((a, b) => {
        const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tB - tA; // descending
      })
    : [];

  const legacyEvents = events || [];

  const handleConfirmSupersede = () => {
    if (supersedeModalEvent) {
      onSupersedeEvent?.(supersedeModalEvent, supersedeReason.trim() || '人工撤销事件');
      setSupersedeModalEvent(null);
      setSupersedeReason('');
    }
  };

  return (
    <div id="overview-timeline" className="p-3.5 rounded-2xl border space-y-2.5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-xs flex items-center space-x-1.5" style={{ color: 'var(--text-primary)' }}>
          <History className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span>时间线 (事件证据链)</span>
        </h4>
        <span className="text-[11px] text-muted font-semibold">
          {hasRealEvents ? `${sortedContextEvents.length} 条记录` : '最新记录'}
        </span>
      </div>

      {hasRealEvents ? (
        sortedContextEvents.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted">暂无上下文事件记录</div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto no-scrollbar pr-1">
            {sortedContextEvents.map((evt) => {
              const isPending = evt.status === 'pending';
              const isConfirmed = evt.status === 'confirmed';
              const isSuperseded = evt.status === 'superseded';
              const isInternal = evt.track === 'internal';

              return (
                <div
                  key={evt.id}
                  className={`p-2.5 rounded-xl border flex flex-col space-y-1.5 transition-all ${
                    isSuperseded ? 'opacity-50 line-through bg-[var(--bg-subtle)]' : ''
                  }`}
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}
                >
                  {/* Event Top Bar */}
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center space-x-1.5 min-w-0">
                      <div className="p-1 rounded bg-slate-500/10 flex-shrink-0">{renderIcon(evt.source_type)}</div>
                      <span className="font-bold text-muted uppercase">{evt.source_type}</span>
                      
                      {/* Track badge */}
                      <span
                        className={`px-1.5 py-0.2 rounded font-bold border ${
                          isInternal
                            ? 'bg-[var(--yellow-soft)] text-[var(--yellow)] border-[var(--yellow-soft)]'
                            : 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-soft)]'
                        }`}
                      >
                        {isInternal ? '内线' : '递交'}
                      </span>
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center space-x-1">
                      {isPending && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-[var(--yellow-soft)] text-[var(--yellow)] border border-[var(--yellow-soft)]">
                          待确认
                        </span>
                      )}
                      {isConfirmed && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-[var(--green-soft)] text-[var(--green)] border border-[var(--green-soft)]">
                          已确认
                        </span>
                      )}
                      {isSuperseded && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-[var(--bg-subtle)]/15 text-[var(--text-secondary)] border border-[var(--border)]/25">
                          已撤销
                        </span>
                      )}
                      <span className="font-mono text-muted">{evt.created_at || '刚刚'}</span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="text-xs font-semibold leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                    {evt.content}
                  </div>

                  {/* Actions for Pending Events */}
                  {isPending && (
                    <div className="pt-1.5 border-t flex items-center justify-end space-x-2 text-[11px]" style={{ borderColor: 'var(--border)' }}>
                      <button
                        type="button"
                        onClick={() => setSupersedeModalEvent(evt)}
                        className="flex items-center space-x-1 px-2 py-0.5 rounded border border-[var(--red-soft)] bg-[var(--red-soft)] text-[var(--red)] font-bold hover:bg-[var(--red-soft)] transition-colors cursor-pointer"
                        title="撤销此事件"
                      >
                        <XCircle className="w-3 h-3" />
                        <span>撤销</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onConfirmEvent?.(evt)}
                        className="flex items-center space-x-1 px-2.5 py-0.5 rounded bg-[var(--green)] hover:bg-[var(--green)] text-white font-bold transition-colors cursor-pointer shadow-xs"
                        title="确认此事件并提取事实"
                      >
                        <Check className="w-3 h-3" />
                        <span>确认事件</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Legacy fallback for BrainPanel if contextEvents not supplied */
        legacyEvents.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted">暂无操作记录</div>
        ) : (
          <div className="space-y-1.5 text-xs max-h-60 overflow-y-auto no-scrollbar">
            {legacyEvents.map((evt, idx) => (
              <div
                key={idx}
                className="p-2 rounded-xl border flex items-center justify-between transition-colors hover:border-[var(--accent)]"
                style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                  <div className="p-1.5 rounded-lg bg-slate-500/10 flex-shrink-0">{renderIcon(evt.event_type)}</div>
                  <div className="min-w-0">
                    <p className="font-semibold text-[11px] truncate" style={{ color: 'var(--text-primary)' }}>{evt.title}</p>
                    {evt.description && <p className="text-[11px] truncate text-muted">{evt.description}</p>}
                  </div>
                </div>
                <span className="text-[11px] font-mono text-muted flex-shrink-0 ml-2">{evt.created_at || '刚刚'}</span>
              </div>
            ))}
          </div>
        )
      )}

      {/* Supersede Reason Modal */}
      {supersedeModalEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-app)]/80 backdrop-blur-xs">
          <div
            className="w-full max-w-xs p-4 rounded-2xl border shadow-xl space-y-3 glass-panel"
            style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center space-x-2 text-[var(--red)] font-bold text-xs">
              <AlertCircle className="w-4 h-4" />
              <span>确认撤销该事件？</span>
            </div>
            <p className="text-[11px] text-muted">事件撤销后，关联的事实将自动失效或归档。</p>
            <input
              type="text"
              value={supersedeReason}
              onChange={(e) => setSupersedeReason(e.target.value)}
              placeholder="请输入撤销原因（可选）"
              className="w-full px-2.5 py-1.5 rounded-xl border bg-[var(--bg-subtle)] text-xs focus:outline-none"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setSupersedeModalEvent(null)}
                className="px-3 py-1 rounded-lg border text-xs font-bold text-muted hover:text-primary cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmSupersede}
                className="px-3 py-1 rounded-lg bg-[var(--red)] hover:bg-[var(--red)] text-white font-bold text-xs cursor-pointer"
              >
                确认撤销
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
