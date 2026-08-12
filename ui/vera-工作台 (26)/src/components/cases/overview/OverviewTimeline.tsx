import { Mail, UserCheck, TrendingUp, ListTodo, History } from 'lucide-react';
import { CaseContext } from '../../../types/api';

interface OverviewTimelineProps {
  events: CaseContext['timeline'];
}

export function OverviewTimeline({ events }: OverviewTimelineProps) {
  const renderIcon = (type: string) => {
    switch (type) {
      case 'email_received': return <Mail className="w-3.5 h-3.5 text-blue-500" />;
      case 'delegation': return <UserCheck className="w-3.5 h-3.5 text-purple-500" />;
      case 'stage_advance': return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />;
      case 'checklist': case 'checklist_confirm': return <ListTodo className="w-3.5 h-3.5 text-amber-500" />;
      default: return <History className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const list = (events || []).slice(0, 5);

  return (
    <div id="overview-timeline" className="p-3.5 rounded-2xl border space-y-2.5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-xs flex items-center space-x-1.5" style={{ color: 'var(--text-primary)' }}>
          <History className="w-3.5 h-3.5 text-blue-500" />
          <span>最近决定与操作日志</span>
        </h4>
        <span className="text-[10px] text-muted">显示最新 5 条</span>
      </div>

      {list.length === 0 ? (
        <div className="p-4 text-center text-xs text-muted">暂无操作记录</div>
      ) : (
        <div className="space-y-1.5 text-xs">
          {list.map((evt, idx) => (
            <div
              key={idx}
              className="p-2 rounded-xl border flex items-center justify-between transition-colors hover:border-[var(--accent)]"
              style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                <div className="p-1.5 rounded-lg bg-slate-500/10 flex-shrink-0">{renderIcon(evt.event_type)}</div>
                <div className="min-w-0">
                  <p className="font-semibold text-[11px] truncate" style={{ color: 'var(--text-primary)' }}>{evt.title}</p>
                  {evt.description && <p className="text-[10px] truncate text-muted">{evt.description}</p>}
                </div>
              </div>
              <span className="text-[10px] font-mono text-muted flex-shrink-0 ml-2">{evt.created_at || '刚刚'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
