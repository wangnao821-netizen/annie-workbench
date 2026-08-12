import { useState, useEffect, useCallback } from 'react';
import { User, RefreshCw, AlertCircle, Layers, Sparkles } from 'lucide-react';
import { getCaseContext, createContextEvent } from '../../../services/api/cases';
import { CaseContext } from '../../../types/api';
import { useToastStore } from '../../../stores/toastStore';
import { OverviewFacts } from '../../cases/overview/OverviewFacts';
import { OverviewTimeline } from '../../cases/overview/OverviewTimeline';
import { OverviewTools } from '../../cases/overview/OverviewTools';

interface BrainPanelProps {
  caseId: string;
}

const MOCK_CONTEXT: CaseContext = {
  case_id: 'CASE_001',
  facts: {
    client_name: 'PERSON_1',
    lender: 'CBA',
    loan_amount: 850000,
    property_value: 1000000,
    lvr: 85,
    purpose: '自住购房',
    interest_rate: '5.99%',
    stage: '补件中',
    client_goal: '获得自住房敏捷贷款批复',
    special_circumstances: '无',
    internal_notes: '客户 PERSON_1 特别关注利率，首选 5.99% 固定利率产品。',
  },
  checklist: { done: 4, total: 12, missing: ['近两期 Payslip 及雇主信', '自住房 3 个月流水 Statement'] },
  os: { pending_count: 2, items: [{ raw_text: '提供 2025 年最新 NOA 税单复印件', status: 'pending' }] },
  deadlines: { finance_due: '2026-08-18T00:00:00Z', days_left: 4 },
  risk: ['Finance Clause 临近 (4 天内)', '2 项银行补件 OS 待处理'],
  timeline: [
    { event_type: 'email_received', title: '邮件收到：补充 NOA 及工资单', description: '来自审贷团队发出的 OS 说明邮件', created_at: '10 分钟前' },
  ],
  memory: '客户 PERSON_1 申请 CBA 自住购房贷款 $850,000，当前处于补件阶段。',
  summary: '客户 PERSON_1 申请 CBA 贷款 $85万，处于补件阶段，需处理 2 项银行 OS 条件。',
};

export function BrainPanel({ caseId }: BrainPanelProps) {
  const [context, setContext] = useState<CaseContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const showToast = useToastStore((s) => s.showToast);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const useMock = import.meta.env.VITE_USE_MOCK !== 'false';
    if (useMock) {
      setContext(MOCK_CONTEXT);
      setLoading(false);
      return;
    }
    try {
      const res = await getCaseContext(caseId);
      setContext(res);
    } catch (err: any) {
      setError(err?.message || '获取案件全景上下文失败');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddNote = async (track: 'internal' | 'external') => {
    if (!noteInput.trim()) return;
    setNoteSubmitting(true);
    const useMock = import.meta.env.VITE_USE_MOCK !== 'false';
    if (useMock) {
      if (context) {
        const text = noteInput.trim();
        const updatedNotes = track === 'internal'
          ? (context.facts.internal_notes ? `${context.facts.internal_notes}\n• ${text}` : `• ${text}`)
          : context.facts.internal_notes;
        setContext({
          ...context,
          facts: { ...context.facts, internal_notes: updatedNotes },
          timeline: [
            { event_type: 'manual_note', title: `记一笔 (${track === 'internal' ? '内部' : '递交'})`, description: text, created_at: '刚刚' },
            ...context.timeline,
          ],
        });
      }
      showToast('success', track === 'internal' ? '已记入内部笔记' : '已记入递交事件');
      setNoteInput('');
      setNoteSubmitting(false);
      return;
    }

    try {
      await createContextEvent(caseId, { source_type: 'manual_note', content: noteInput.trim(), track });
      showToast('success', '记录成功');
      setNoteInput('');
      await loadData();
    } catch (err: any) {
      showToast('error', err?.message || '记录失败，请重试');
    } finally {
      setNoteSubmitting(false);
    }
  };

  const clientName = context?.facts.client_name || 'PERSON_1';
  const lender = context?.facts.lender || 'CBA';
  const stage = context?.facts.stage || '补件中';

  return (
    <div className="space-y-4 text-xs" id="brain-panel">
      {/* 1) 头部：客户名 + 刷新 */}
      <div className="p-3.5 rounded-2xl border flex items-center justify-between" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500"><User className="w-4 h-4" /></div>
          <div>
            <h4 className="font-extrabold text-sm" style={{ color: 'var(--text-primary)' }}>{clientName} · 客户全景概览</h4>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{lender} · {stage}</p>
          </div>
        </div>
        <button
          type="button"
          id="overview-refresh-btn"
          onClick={loadData}
          disabled={loading}
          className="px-2.5 py-1 rounded-xl border flex items-center space-x-1 cursor-pointer hover:opacity-80 disabled:opacity-50 text-[11px] font-semibold"
          style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          <span>刷新全景</span>
        </button>
      </div>

      {/* 2) 「记一笔」输入区 */}
      <div className="p-3 rounded-2xl border space-y-2" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <input
          type="text"
          id="overview-note-input"
          placeholder="记一笔：客户说了什么 / 我做了什么决定..."
          value={noteInput}
          onChange={(e) => setNoteInput(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border outline-none text-xs bg-black/5 dark:bg-white/5"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
        <div className="flex items-center justify-end space-x-2">
          <button
            type="button"
            id="note-internal-btn"
            disabled={noteSubmitting || !noteInput.trim()}
            onClick={() => handleAddNote('internal')}
            className="px-3 py-1 rounded-xl text-xs font-semibold border cursor-pointer hover:opacity-80 disabled:opacity-50 bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
          >
            记入内部
          </button>
          <button
            type="button"
            id="note-external-btn"
            disabled={noteSubmitting || !noteInput.trim()}
            onClick={() => handleAddNote('external')}
            className="px-3 py-1 rounded-xl text-xs font-semibold text-white cursor-pointer hover:opacity-90 disabled:opacity-50 shadow-xs"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            记入递交
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-2xl border bg-rose-500/10 border-rose-500/20 text-rose-600 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2"><AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span></div>
          <button type="button" onClick={loadData} className="underline font-bold cursor-pointer">重试</button>
        </div>
      )}

      {loading ? (
        <div className="p-8 rounded-2xl border animate-pulse space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="h-4 bg-black/10 dark:bg-white/10 rounded w-1/3" />
          <div className="h-20 bg-black/5 dark:bg-white/5 rounded" />
        </div>
      ) : context ? (
        <>
          {context.summary && (
            <div id="overview-summary" className="px-4 py-2.5 rounded-2xl border flex items-start space-x-2" style={{ backgroundColor: 'var(--accent-soft)', borderColor: 'rgba(99,102,241,0.25)' }}>
              <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>{context.summary}</p>
            </div>
          )}

          <OverviewFacts context={context} />

          {/* 3) 内部情况 (内线笔记) */}
          {context.facts.internal_notes && (
            <div id="overview-internal-notes" className="p-3.5 rounded-2xl border space-y-1 bg-amber-500/10 border-amber-500/20 text-amber-900 dark:text-amber-200">
              <div className="flex items-center space-x-1.5 font-bold text-xs text-amber-700 dark:text-amber-400">
                <span>📝 内部情况</span>
              </div>
              <p className="text-xs leading-relaxed whitespace-pre-wrap font-medium">{context.facts.internal_notes}</p>
            </div>
          )}

          <OverviewTimeline events={context.timeline} />
          <OverviewTools context={context} />
        </>
      ) : (
        <div className="p-8 text-center text-xs text-muted border rounded-2xl" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>未找到案件全景数据</div>
      )}

      <div className="p-3 rounded-2xl border bg-black/5 dark:bg-white/5 space-y-1.5" style={{ borderColor: 'var(--border)' }}>
        <p className="font-bold text-xs flex items-center space-x-1" style={{ color: 'var(--text-primary)' }}>
          <Layers className="w-3.5 h-3.5 text-purple-500" />
          <span>深度档案扩展模块 (准备就绪)</span>
        </p>
      </div>
    </div>
  );
}

