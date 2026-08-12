import { Brain, CheckCircle2, Activity, ShieldAlert } from 'lucide-react';
import { useCaseStore } from '../../../stores/caseStore';

interface BrainPanelProps {
  caseId: string;
}

export function BrainPanel({ caseId: _caseId }: BrainPanelProps) {
  const { currentCase } = useCaseStore();

  if (!currentCase) {
    return (
      <div className="text-center py-12 text-xs text-muted" id="brain-panel">
        请先选择案件
      </div>
    );
  }

  return (
    <div className="space-y-4" id="brain-panel">
      {/* Overview Card */}
      <div
        className="p-4 rounded-2xl border space-y-3"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center space-x-2">
          <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
              {currentCase.clientName} · 向量记忆摘要
            </h4>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {currentCase.lender} · {currentCase.stage}
            </p>
          </div>
        </div>

        <p className="text-xs leading-relaxed p-3 rounded-xl bg-slate-500/5" style={{ color: 'var(--text-secondary)' }}>
          {currentCase.summary}
        </p>

        <div className="grid grid-cols-2 gap-3 text-xs pt-1">
          <div className="p-2.5 rounded-xl border space-y-1" style={{ borderColor: 'var(--border)' }}>
            <span className="text-[10px] block" style={{ color: 'var(--text-muted)' }}>
              清单推进完成度
            </span>
            <div className="flex items-center space-x-1.5 font-bold font-mono">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>{currentCase.checklistDone} / {currentCase.checklistTotal} ({currentCase.checklistProgress}%)</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl border space-y-1" style={{ borderColor: 'var(--border)' }}>
            <span className="text-[10px] block" style={{ color: 'var(--text-muted)' }}>
              最近活动节点
            </span>
            <div className="flex items-center space-x-1.5 text-[11px] font-medium">
              <Activity className="w-3.5 h-3.5 text-blue-500" />
              <span className="truncate">{currentCase.lastActivity || '今日已同步'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* AI Strategy Note */}
      <div
        className="p-3.5 rounded-xl border border-dashed flex items-start space-x-2 text-xs"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-app)' }}
      >
        <ShieldAlert className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <p style={{ color: 'var(--text-muted)' }}>
          AI 智能风控提醒：检测到递交清单处于补件窗口期，建议优先获取 2025 年税单，避免审核延宕。
        </p>
      </div>

      {/* TODO Footer */}
      <div className="pt-2 text-[10px] font-mono text-center" style={{ color: 'var(--text-muted)' }}>
        // TODO(WO-08): 完整大脑 L2（策略/经验/时间线全量）待任务引擎实现
      </div>
    </div>
  );
}
