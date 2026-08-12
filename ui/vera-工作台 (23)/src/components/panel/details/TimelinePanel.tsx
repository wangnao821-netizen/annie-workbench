import { useState, useEffect, useCallback } from 'react';
import { Mail, UserCheck, TrendingUp, History, RefreshCw, AlertCircle } from 'lucide-react';
import { getTimeline } from '../../../services/api/cases';
import { TimelineEventResponse } from '../../../types/api';

interface TimelinePanelProps {
  caseId: string;
}

const MOCK_EVENTS: TimelineEventResponse[] = [
  { id: 'tl-1', case_id: 'c1', event_type: 'email_received', title: '邮件收到：补充 NOA 及工资单', description: '来自 ANZ 审贷团队发出的 OS 补充说明邮件', created_at: '10 分钟前' },
  { id: 'tl-2', case_id: 'c1', event_type: 'delegation', title: '案件委派：分配给 Judy 协助跟进', description: 'Vera 自动路由分析结果', created_at: '2 小时前' },
  { id: 'tl-3', case_id: 'c1', event_type: 'stage_advance', title: '阶段推进：有条件批复 (Conditional)', description: 'ANZ 审贷系统更新状态', created_at: '昨天 15:30' },
  { id: 'tl-4', case_id: 'c1', event_type: 'checklist_confirm', title: '清单确认：身份证明 (护照) 已通过', description: '材料比对与校验完成', created_at: '3 天前' },
];

export function TimelinePanel({ caseId }: TimelinePanelProps) {
  const [events, setEvents] = useState<TimelineEventResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      setEvents(MOCK_EVENTS);
      setLoading(false);
      return;
    }
    try {
      const res = await getTimeline(caseId);
      setEvents(res);
    } catch {
      setError('时间线加载失败，请检查后端服务');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const renderIcon = (type: string) => {
    switch (type) {
      case 'email_received': return <Mail className="w-4 h-4 text-blue-500" />;
      case 'delegation': return <UserCheck className="w-4 h-4 text-purple-500" />;
      case 'stage_advance': return <TrendingUp className="w-4 h-4 text-emerald-500" />;
      default: return <History className="w-4 h-4 text-slate-400" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-3" id="timeline-panel">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-3.5 rounded-xl border animate-pulse space-y-2" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <div className="h-3.5 rounded w-2/3 bg-slate-200 dark:bg-slate-700" />
            <div className="h-3 rounded w-full bg-slate-200 dark:bg-slate-700" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-500 space-y-3" id="timeline-panel">
        <div className="flex items-center space-x-2 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
        <button onClick={fetchEvents} className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-xs font-medium flex items-center space-x-1 cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5" />
          <span>重试</span>
        </button>
      </div>
    );
  }

  if (events.length === 0) {
    return <div className="text-center py-12 text-xs text-muted" id="timeline-panel">暂无时间线记录</div>;
  }

  return (
    <div className="space-y-3" id="timeline-panel">
      {events.map((evt) => (
        <div key={evt.id} className="p-3.5 rounded-xl border space-y-1.5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-slate-500/10">{renderIcon(evt.event_type)}</div>
              <span className="text-xs font-extrabold" style={{ color: 'var(--text-primary)' }}>{evt.title}</span>
            </div>
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{evt.created_at}</span>
          </div>
          {evt.description && <p className="text-xs pl-8" style={{ color: 'var(--text-secondary)' }}>{evt.description}</p>}
        </div>
      ))}
    </div>
  );
}
