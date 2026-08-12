import { useState, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { User, RefreshCw, AlertCircle, Layers, Sparkles, PanelRightOpen, PanelRightClose } from 'lucide-react';
import { getCaseContext, createContextEvent, listBrainFacts } from '../../services/api/cases';
import { CaseContext, BrainFact } from '../../types/api';
import { useToastStore } from '../../stores/toastStore';
import { OverviewTimeline } from '../cases/overview/OverviewTimeline';
import { OverviewTools } from '../cases/overview/OverviewTools';
import { FactCard } from './FactCard';
import { CompletionHint } from './CompletionHint';

interface CasePanoramaProps {
  caseId: string | null;
  collapsed: boolean;
  onToggle: () => void;
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

const MOCK_FACTS: BrainFact[] = [
  { id: 1, case_id: 'CASE_001', key: 'bank.lender', value: 'CBA (Commonwealth Bank)', category: 'bank', track: 'internal', event_id: 1, superseded_by: null, conflict: false, valid_to: null, created_at: '10 分钟前' },
  { id: 2, case_id: 'CASE_001', key: 'stage.current', value: '补件中 (Pending Documents)', category: 'stage', track: 'internal', event_id: 1, superseded_by: null, conflict: false, valid_to: null, created_at: '10 分钟前' },
  { id: 3, case_id: 'CASE_001', key: 'loan.amount', value: '$850,000 AUD', category: 'loan', track: 'internal', event_id: 2, superseded_by: null, conflict: false, valid_to: null, created_at: '10 分钟前' },
  { id: 4, case_id: 'CASE_001', key: 'property.value', value: '$1,000,000 (LVR 85%)', category: 'property', track: 'internal', event_id: 2, superseded_by: null, conflict: false, valid_to: null, created_at: '10 分钟前' },
  { id: 5, case_id: 'CASE_001', key: 'income.annual', value: '最新申报 $120,000 / 银行初审核算 $105,000', category: 'income', track: 'internal', event_id: 3, superseded_by: null, conflict: true, valid_to: null, created_at: '5 分钟前' },
];

const CATEGORY_TITLES: Record<string, string> = {
  identity: '身份',
  income: '收入',
  employment: '就业',
  property: '房产',
  loan: '贷款',
  liability: '负债',
  bank: '银行',
  stage: '阶段',
  commitment: '承诺',
  disclosure: '披露',
  special: '特殊情况',
};

// V1 前端内置关键类集合（后续可后端化）
const CORE_CATEGORIES = ['income', 'employment', 'liability', 'identity'];

export function CasePanorama({ caseId, collapsed, onToggle }: CasePanoramaProps) {
  const [context, setContext] = useState<CaseContext | null>(null);
  const [facts, setFacts] = useState<BrainFact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  const reduced = useReducedMotion();
  const showToast = useToastStore((s) => s.showToast);

  const loadData = useCallback(async () => {
    if (!caseId) {
      setContext(null);
      setFacts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    // 递交模式联动外线视图留 F-3b（模式状态 store 就绪后接入）；V1 右栏固定内线
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      setContext(MOCK_CONTEXT);
      setFacts(MOCK_FACTS.filter((f) => f.track === 'internal'));
      setLoading(false);
      return;
    }

    try {
      const [resContext, resFacts] = await Promise.all([
        getCaseContext(caseId),
        listBrainFacts(caseId, { track: 'internal' }),
      ]);
      setContext(resContext);
      setFacts(resFacts);
    } catch (err: any) {
      setError(err?.message || '获取案件全景失败');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddNote = async (noteTrack: 'internal' | 'external') => {
    if (!noteInput.trim() || !caseId) return;
    setNoteSubmitting(true);
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      if (context) {
        const text = noteInput.trim();
        const updatedNotes = noteTrack === 'internal'
          ? (context.facts.internal_notes ? `${context.facts.internal_notes}\n• ${text}` : `• ${text}`)
          : context.facts.internal_notes;
        setContext({
          ...context,
          facts: { ...context.facts, internal_notes: updatedNotes },
          timeline: [
            { event_type: 'manual_note', title: `记一笔 (${noteTrack === 'internal' ? '内部' : '递交'})`, description: text, created_at: '刚刚' },
            ...context.timeline,
          ],
        });
      }
      showToast('success', noteTrack === 'internal' ? '已记入内部笔记' : '已记入递交事件');
      setNoteInput('');
      setNoteSubmitting(false);
      return;
    }

    try {
      await createContextEvent(caseId, { source_type: 'manual_note', content: noteInput.trim(), track: noteTrack });
      showToast('success', '记录成功');
      setNoteInput('');
      await loadData();
    } catch (err: any) {
      showToast('error', err?.message || '记录失败');
    } finally {
      setNoteSubmitting(false);
    }
  };

  // Group facts by category
  const groupedFacts = facts.reduce((acc, fact) => {
    if (!acc[fact.category]) acc[fact.category] = [];
    acc[fact.category].push(fact);
    return acc;
  }, {} as Record<string, BrainFact[]>);

  // Calculate missing core categories for completion hint
  const missingCategories = import.meta.env.VITE_USE_MOCK !== 'false'
    ? ['income', 'liability']
    : CORE_CATEGORIES.filter((cat) => !facts.some((f) => f.category === cat));

  return (
    <motion.aside
      id="case-panorama-panel"
      initial={false}
      animate={{ width: collapsed ? 28 : 360 }}
      transition={reduced ? { duration: 0.15 } : { type: 'spring', damping: 25, stiffness: 350 }}
      className="h-full flex-shrink-0 border-l select-none overflow-hidden relative flex flex-col"
      style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
    >
      {collapsed ? (
        <div className="h-full w-full flex flex-col items-center justify-between py-4 cursor-pointer" onClick={onToggle} title="点击展开客户全景">
          <motion.button whileTap={{ scale: 0.92 }} className="p-1 rounded text-muted hover:text-primary">
            <PanelRightOpen className="w-4 h-4" />
          </motion.button>
          <span className="text-[11px] font-extrabold text-muted tracking-widest whitespace-nowrap" style={{ writingMode: 'vertical-rl' }}>
            客户全景
          </span>
          <div className="w-2 h-2 rounded-full bg-purple-500" />
        </div>
      ) : (
        <div className="h-full flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-3 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center space-x-2">
              <User className="w-4 h-4 text-purple-500" />
              <span className="font-extrabold text-xs" style={{ color: 'var(--text-primary)' }}>客户全景看板</span>
            </div>
            <div className="flex items-center space-x-1">
              {caseId && (
                <button
                  type="button"
                  onClick={loadData}
                  disabled={loading}
                  className="p-1.5 rounded-lg border text-muted hover:text-primary cursor-pointer disabled:opacity-50"
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                  title="刷新全景"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              )}
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={onToggle}
                className="p-1.5 rounded-lg border text-muted hover:text-primary cursor-pointer"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                title="折叠全景栏"
                id="panorama-toggle-fold-btn"
              >
                <PanelRightClose className="w-4 h-4" />
              </motion.button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-3 text-xs">
            {!caseId ? (
              <div className="p-8 text-center text-xs text-muted space-y-2">
                <p className="font-bold">未选中案件</p>
                <p>请在左侧选择一个案件以查看该客户的材料与事实全景。</p>
              </div>
            ) : loading ? (
              <div className="p-4 space-y-3 animate-pulse">
                <div className="h-12 bg-black/10 dark:bg-white/10 rounded-xl" />
                <div className="h-32 bg-black/5 dark:bg-white/5 rounded-xl" />
              </div>
            ) : error ? (
              <div className="p-3 rounded-xl border bg-rose-500/10 border-rose-500/20 text-rose-600 text-xs flex items-center justify-between">
                <div className="flex items-center space-x-1.5"><AlertCircle className="w-4 h-4" /><span>{error}</span></div>
                <button type="button" onClick={loadData} className="underline font-bold cursor-pointer">重试</button>
              </div>
            ) : context ? (
              <>
                {/* Completion Progress Gray Hint */}
                <CompletionHint missingCategories={missingCategories} />

                {/* Summary Box */}
                {context.summary && (
                  <div className="p-2.5 rounded-xl border flex items-start space-x-2" style={{ backgroundColor: 'var(--accent-soft)', borderColor: 'rgba(99,102,241,0.25)' }}>
                    <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                    <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>{context.summary}</p>
                  </div>
                )}

                {/* Grouped Brain Fact Cards */}
                {Object.keys(groupedFacts).length > 0 && (
                  <div className="space-y-3">
                    <div className="font-extrabold text-[11px] text-muted tracking-wider uppercase flex items-center justify-between">
                      <span>核心事实 (Facts)</span>
                      <span className="text-[10px] font-normal">{facts.length} 条有效事实</span>
                    </div>

                    {Object.entries(groupedFacts).map(([cat, factList]) => (
                      <div key={cat} className="space-y-1.5" id={`fact-category-group-${cat}`}>
                        <div className="text-[11px] font-bold text-muted flex items-center justify-between px-0.5">
                          <span>{CATEGORY_TITLES[cat] || cat}</span>
                          <span className="text-[10px] opacity-60">{factList.length} 项</span>
                        </div>
                        <div className="space-y-1.5">
                          {factList.map((f) => (
                            <FactCard key={f.id} fact={f} categoryLabel={CATEGORY_TITLES[cat] || cat} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Internal Notes */}
                {context.facts.internal_notes && (
                  <div className="p-3 rounded-xl border space-y-1 bg-amber-500/10 border-amber-500/20 text-amber-900 dark:text-amber-200">
                    <span className="font-bold text-[11px] text-amber-700 dark:text-amber-400">📝 内部情况</span>
                    <p className="text-[11px] leading-relaxed whitespace-pre-wrap">{context.facts.internal_notes}</p>
                  </div>
                )}

                {/* Note input */}
                <div className="p-2.5 rounded-xl border space-y-2" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                  <input
                    type="text"
                    id="panorama-note-input"
                    placeholder="记一笔：客户沟通 / 补件进展..."
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border outline-none text-xs bg-black/5 dark:bg-white/5"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                  <div className="flex items-center justify-end space-x-1.5">
                    <button
                      type="button"
                      disabled={noteSubmitting || !noteInput.trim()}
                      onClick={() => handleAddNote('internal')}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer hover:opacity-80 disabled:opacity-50 bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
                    >
                      记入内部
                    </button>
                    <button
                      type="button"
                      disabled={noteSubmitting || !noteInput.trim()}
                      onClick={() => handleAddNote('external')}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white cursor-pointer hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: 'var(--accent)' }}
                    >
                      记入递交
                    </button>
                  </div>
                </div>

                <OverviewTimeline events={context.timeline} />
                <OverviewTools context={context} />
              </>
            ) : null}

            <div className="p-2.5 rounded-xl border bg-black/5 dark:bg-white/5 space-y-1" style={{ borderColor: 'var(--border)' }}>
              <p className="font-bold text-[11px] flex items-center space-x-1" style={{ color: 'var(--text-primary)' }}>
                <Layers className="w-3 h-3 text-purple-500" />
                <span>深度全景已同步 (内部线)</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </motion.aside>
  );
}
