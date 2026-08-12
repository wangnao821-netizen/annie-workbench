import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  User, RefreshCw, AlertCircle, Layers, Sparkles, PanelRightOpen, PanelRightClose,
  ChevronDown, ChevronUp, CheckSquare
} from 'lucide-react';
import { getCaseContext, listBrainFacts } from '../../services/api/cases';
import { listTasks } from '../../services/api/tasks';
import { CaseContext, BrainFact, TaskResponse } from '../../types/api';
import { useToastStore } from '../../stores/toastStore';
import { useUiStore } from '../../stores/uiStore';
import { useTaskStore } from '../../stores/taskStore';
import { OverviewTimeline } from '../cases/overview/OverviewTimeline';
import { FactCard } from './FactCard';
import { CompletionHint } from './CompletionHint';
import { TodoCard } from './TodoCard';
import { RiskSection } from './RiskSection';

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
    special_circumstances: '客户近期有转岗试用期记录',
    internal_notes: '客户 PERSON_1 特别关注利率，首选 5.99% 固定利率产品。',
  },
  checklist: { done: 4, total: 12, missing: ['近两期 Payslip 及雇主信', '自住房 3 个月流水 Statement'] },
  os: { pending_count: 2, items: [{ raw_text: '提供 2025 年最新 NOA 税单复印件', status: 'pending' }] },
  deadlines: { finance_due: '2026-08-18T00:00:00Z', days_left: 4 },
  risk: ['Finance Clause 临近 (4 天内)', '2 项银行补件 OS 待处理'],
  timeline: [
    { event_type: 'email_received', title: '邮件收到：补充 NOA 及工资单', description: '来自审贷团队发出的 OS 说明邮件', created_at: '10 分钟前' },
  ],
  memory: '客户 PERSON_1 申请 CBA 自住购房贷款 $850,000，当前处于补件阶段，关键在周五前补齐 NOA。',
  summary: '卡在补件阶段：缺少 2025 年 NOA 及买卖合同签署件，等待客户本周五前交齐。',
};

const MOCK_CASE_TASKS: TaskResponse[] = [
  {
    id: 101,
    type: 'FILE_MATCH',
    title: '催领 2025 年最新 NOA 税单复印件',
    case_name: 'PERSON_1',
    case_id: 'CASE_001',
    case_bank: 'CBA',
    loan_amount: 850000,
    priority: 'urgent',
    suggested_action: '联系客户上传最新 NOA 及补齐 3 个月 Statement',
    source_channel: 'email',
    created_at: '2026-08-11T10:00:00Z',
    deadline: '2026-08-10T00:00:00Z',
    delegated_to: null,
    source_msg_id: null,
  },
  {
    id: 102,
    type: 'EMAIL_DISPATCH',
    title: '确认补件与 CBA 审贷团队对接',
    case_name: 'PERSON_1',
    case_id: 'CASE_001',
    case_bank: 'CBA',
    loan_amount: 850000,
    priority: 'high',
    suggested_action: '将已核对的 Payslip 材料打成 PDF 递交补件',
    source_channel: 'wechat',
    created_at: '2026-08-12T08:00:00Z',
    deadline: '2026-08-18T00:00:00Z',
    delegated_to: null,
    source_msg_id: null,
  },
];

const MOCK_FACTS: BrainFact[] = [
  { id: 1, case_id: 'CASE_001', key: 'bank.lender', value: 'CBA (Commonwealth Bank)', category: 'bank', track: 'internal', event_id: 1, superseded_by: null, conflict: false, valid_to: null, created_at: '10 分钟前' },
  { id: 2, case_id: 'CASE_001', key: 'stage.current', value: '补件中 (Pending Documents)', category: 'stage', track: 'internal', event_id: 1, superseded_by: null, conflict: false, valid_to: null, created_at: '10 分钟前' },
  { id: 3, case_id: 'CASE_001', key: 'loan.amount', value: '$850,000 AUD', category: 'loan', track: 'internal', event_id: 2, superseded_by: null, conflict: false, valid_to: null, created_at: '10 分钟前' },
  { id: 4, case_id: 'CASE_001', key: 'property.value', value: '$1,000,000 (LVR 85%)', category: 'property', track: 'internal', event_id: 2, superseded_by: null, conflict: false, valid_to: null, created_at: '10 分钟前' },
  { id: 5, case_id: 'CASE_001', key: 'income.annual', value: '最新申报 $120,000 / 银行初审核算 $105,000', category: 'income', track: 'internal', event_id: 3, superseded_by: null, conflict: true, valid_to: null, created_at: '5 分钟前' },
  { id: 6, case_id: 'CASE_001', key: 'disclosure.undisclosed_rate', value: '客户敏感利率偏好 (5.99%)', category: 'disclosure', track: 'internal', event_id: 4, superseded_by: null, conflict: false, valid_to: null, created_at: '2 分钟前' },
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

const CORE_CATEGORIES = ['income', 'employment', 'liability', 'identity'];

export function CasePanorama({ caseId, collapsed, onToggle }: CasePanoramaProps) {
  const [context, setContext] = useState<CaseContext | null>(null);
  const [facts, setFacts] = useState<BrainFact[]>([]);
  const [caseTasks, setCaseTasks] = useState<TaskResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [factsExpanded, setFactsExpanded] = useState(false);

  const reduced = useReducedMotion();
  const openOsWorkbench = useUiStore((s) => s.openOsWorkbench);
  const selectTask = useTaskStore((s) => s.selectTask);

  const loadData = useCallback(async () => {
    if (!caseId) {
      setContext(null);
      setFacts([]);
      setCaseTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setTasksLoading(true);
    setError(null);

    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      setContext(MOCK_CONTEXT);
      setFacts(MOCK_FACTS.filter((f) => f.track === 'internal'));
      setCaseTasks(MOCK_CASE_TASKS);
      setLoading(false);
      setTasksLoading(false);
      return;
    }

    try {
      const [resContext, resFacts, allTasks] = await Promise.all([
        getCaseContext(caseId),
        listBrainFacts(caseId, { track: 'internal' }),
        listTasks('all').catch(() => []),
      ]);
      setContext(resContext);
      setFacts(resFacts);
      setCaseTasks(allTasks.filter((t) => t.case_id === caseId));
    } catch (err: any) {
      setError(err?.message || '获取案件指挥中心失败');
    } finally {
      setLoading(false);
      setTasksLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenTask = (taskId: number) => {
    selectTask(taskId);
    openOsWorkbench(taskId);
    useToastStore.getState().showToast('info', `已打开任务 #${taskId}`);
  };

  // Group facts by category
  const groupedFacts = facts.reduce((acc, fact) => {
    if (!acc[fact.category]) acc[fact.category] = [];
    acc[fact.category].push(fact);
    return acc;
  }, {} as Record<string, BrainFact[]>);

  // Missing core categories
  const missingCategories =
    import.meta.env.VITE_USE_MOCK !== 'false'
      ? ['income', 'liability']
      : CORE_CATEGORIES.filter((cat) => !facts.some((f) => f.category === cat));

  // Disclosure check
  const hasUndisclosed = facts.some(
    (f) => f.category === 'disclosure' && (f.key.includes('undisclosed') || f.value.includes('未披露') || !f.superseded_by)
  );

  return (
    <motion.aside
      id="case-panorama-panel"
      initial={false}
      animate={{ width: collapsed ? 28 : 360 }}
      transition={reduced ? { duration: 0.15 } : { type: 'spring', damping: 25, stiffness: 350 }}
      className="h-full flex-shrink-0 border-l select-none overflow-hidden relative flex flex-col glass-panel"
      style={{ borderColor: 'var(--border)' }}
    >
      {collapsed ? (
        <div
          className="h-full w-full flex flex-col items-center justify-between py-4 cursor-pointer"
          onClick={onToggle}
          title="点击展开案件指挥中心"
        >
          <motion.button whileTap={{ scale: 0.92 }} className="p-1 rounded text-muted hover:text-primary">
            <PanelRightOpen className="w-4 h-4" />
          </motion.button>
          <span
            className="text-[11px] font-extrabold text-muted tracking-widest whitespace-nowrap"
            style={{ writingMode: 'vertical-rl' }}
          >
            案件指挥中心
          </span>
          <div className="w-2 h-2 rounded-full bg-purple-500" />
        </div>
      ) : (
        <div className="h-full flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-3 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center space-x-2 truncate">
              <User className="w-4 h-4 text-purple-500 flex-shrink-0" />
              <span className="font-extrabold text-xs truncate" style={{ color: 'var(--text-primary)' }}>
                案件指挥中心
              </span>
            </div>
            <div className="flex items-center space-x-1 flex-shrink-0">
              {caseId && (
                <button
                  type="button"
                  onClick={loadData}
                  disabled={loading}
                  className="p-1.5 rounded-lg border text-muted hover:text-primary cursor-pointer disabled:opacity-50"
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                  title="刷新指挥中心"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              )}
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={onToggle}
                className="p-1.5 rounded-lg border text-muted hover:text-primary cursor-pointer"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                title="折叠右栏"
                id="panorama-toggle-fold-btn"
              >
                <PanelRightClose className="w-4 h-4" />
              </motion.button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-3.5 text-xs">
            {!caseId ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-4 my-auto">
                <div className="w-14 h-14 rounded-3xl bg-gradient-to-tr from-purple-500/20 to-pink-500/20 flex items-center justify-center border border-purple-500/20 shadow-md">
                  <User className="w-7 h-7 text-purple-500" />
                </div>
                <div className="space-y-1 max-w-xs">
                  <p className="font-extrabold text-sm tracking-tight" style={{ color: 'var(--text-primary)' }}>未选择案件</p>
                  <p className="text-xs text-muted leading-relaxed">在左侧列表中点击选择任意案件，即可实时显示全景事实、风险预警与下一步待办。</p>
                </div>
              </div>
            ) : loading ? (
              <div className="p-4 space-y-3 animate-pulse">
                <div className="h-14 bg-black/10 dark:bg-white/10 rounded-xl" />
                <div className="h-24 bg-black/5 dark:bg-white/5 rounded-xl" />
                <div className="h-20 bg-black/5 dark:bg-white/5 rounded-xl" />
              </div>
            ) : error ? (
              <div className="p-3 rounded-xl border bg-rose-500/10 border-rose-500/20 text-rose-600 text-xs flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
                <button type="button" onClick={loadData} className="underline font-bold cursor-pointer">
                  重试
                </button>
              </div>
            ) : context ? (
              <>
                {/* 1. Header: Client Name + Stage + One-sentence summary (卡在哪一步) */}
                <div className="p-3 rounded-xl border space-y-2" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-xs" style={{ color: 'var(--text-primary)' }}>
                      {context.facts.client_name} ({context.facts.lender})
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400">
                      {context.facts.stage || '推进中'}
                    </span>
                  </div>
                  {(context.summary || context.memory) && (
                    <div className="flex items-start space-x-1.5 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                      <Sparkles className="w-3.5 h-3.5 text-purple-500 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] leading-relaxed text-muted truncate flex-1" title={context.summary || context.memory}>
                        {context.summary || context.memory}
                      </p>
                    </div>
                  )}
                </div>

                {/* 2. Next Steps / Todo Section */}
                <div className="space-y-2" id="command-center-next-steps">
                  <div className="flex items-center justify-between px-0.5">
                    <div className="flex items-center space-x-1.5 font-extrabold text-[11px]" style={{ color: 'var(--text-primary)' }}>
                      <CheckSquare className="w-3.5 h-3.5 text-purple-500" />
                      <span>下一步 (待办)</span>
                    </div>
                    <span className="text-[10px] text-muted font-semibold">{caseTasks.length} 项</span>
                  </div>

                  {tasksLoading ? (
                    <div className="space-y-2 animate-pulse">
                      <div className="h-12 rounded-xl bg-black/5 dark:bg-white/5" />
                      <div className="h-12 rounded-xl bg-black/5 dark:bg-white/5" />
                    </div>
                  ) : caseTasks.length === 0 ? (
                    <div className="p-3 rounded-xl border text-center text-[11px] text-muted" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                      暂无待办
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {caseTasks.slice(0, 5).map((task) => (
                        <TodoCard key={task.id} task={task} onOpen={handleOpenTask} />
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Risks & Pitfalls Section */}
                <RiskSection
                  risks={context.risk || []}
                  specialCircumstances={context.facts.special_circumstances}
                  hasUndisclosed={hasUndisclosed}
                />

                {/* 4. Recent Timeline (Compressed) */}
                <OverviewTimeline events={context.timeline} />

                {/* 5. Completion Progress Hint */}
                <CompletionHint missingCategories={missingCategories} />

                {/* 6. "View All Facts" Collapsible Section */}
                <div className="pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => setFactsExpanded(!factsExpanded)}
                    id="toggle-facts-fold-btn"
                    className="w-full py-2 px-3 rounded-xl border text-xs font-bold cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-between"
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  >
                    <div className="flex items-center space-x-1.5">
                      <Layers className="w-3.5 h-3.5 text-purple-500" />
                      <span>查看全部事实 ({facts.length} 条)</span>
                    </div>
                    {factsExpanded ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
                  </button>

                  <AnimatePresence>
                    {factsExpanded && (
                      <motion.div
                        initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                        transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                        className="overflow-hidden pt-3 space-y-3"
                      >
                        {Object.keys(groupedFacts).length === 0 ? (
                          <p className="text-[11px] text-muted text-center py-2">暂无核实事实</p>
                        ) : (
                          Object.entries(groupedFacts).map(([cat, factList]) => (
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
                          ))
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </motion.aside>
  );
}
