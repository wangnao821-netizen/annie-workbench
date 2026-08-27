import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  User, AlertCircle, PanelRightOpen, PanelRightClose,
  Clock, FileText, Sparkles, ClipboardList,
  MapPin, Building2, Target, DollarSign, Percent, Users,
  AlertTriangle, ShieldAlert, Landmark, AlertOctagon,
  ChevronDown, Check, Loader2
} from 'lucide-react';
import {
  getCaseContext, listBrainFacts, getPolicyCheck, updateCaseStage
} from '../../services/api/cases';
import { listTasks } from '../../services/api/tasks';
import {
  CaseContext, BrainFact, TaskResponse, PolicyCheckResult
} from '../../types/api';
import { useUiStore } from '../../stores/uiStore';
import { useCaseStore } from '../../stores/caseStore';
import { useToastStore } from '../../stores/toastStore';
import { PolicyHintCard } from './PolicyHintCard';
import { ReadOnlyFactFindSummary } from './FactFindSection';
import { RecommendedPrecedentsRadar } from '../cases/RecommendedPrecedentsRadar';
import { formatFactValue } from './FactCard';

const STAGE_OPTIONS = [
  { label: '初步咨询', pct: 10 },
  { label: '收集资料', pct: 20 },
  { label: '待递交', pct: 30 },
  { label: '已递交(等银行)', pct: 45 },
  { label: '银行补件', pct: 50 },
  { label: '估值中', pct: 55 },
  { label: '已批准', pct: 70 },
  { label: '结算中', pct: 85 },
  { label: '已结算', pct: 100 },
];

interface CasePanoramaProps {
  caseId: string | null;
  collapsed: boolean;
  onToggle: () => void;
  hideOuterHeader?: boolean;
}

function formatMoneyWan(val: number | string | undefined | null): string {
  if (val === undefined || val === null || val === '') return '—';
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.]/g, ''));
  if (isNaN(num) || num <= 0) return typeof val === 'string' && val ? val : '—';
  if (num >= 10000) {
    return `$${(num / 10000).toFixed(2)} 万`;
  }
  return `$${num.toFixed(2)} 万`;
}

function formatLvrDisplay(lvr: number | string | undefined | null, loanAmount?: number, propertyValue?: number): string {
  if (lvr !== undefined && lvr !== null && lvr !== '') {
    const num = typeof lvr === 'number' ? lvr : parseFloat(String(lvr).replace(/[^0-9.]/g, ''));
    if (!isNaN(num) && num > 0) {
      return num <= 1 ? `${(num * 100).toFixed(1)}%` : `${num.toFixed(1)}%`;
    }
  }
  if (loanAmount && propertyValue && propertyValue > 0) {
    return `${((loanAmount / propertyValue) * 100).toFixed(1)}%`;
  }
  return '—';
}

export function CasePanorama({ caseId, collapsed, onToggle, hideOuterHeader }: CasePanoramaProps) {
  const [context, setContext] = useState<CaseContext | null>(null);
  const [facts, setFacts] = useState<BrainFact[]>([]);
  const [caseTasks, setCaseTasks] = useState<TaskResponse[]>([]);
  const [policyResult, setPolicyResult] = useState<PolicyCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isChangingStage, setIsChangingStage] = useState(false);
  const [showStageMenu, setShowStageMenu] = useState(false);

  const reduced = useReducedMotion();
  const setTaskDrawerOpen = useUiStore((s) => s.setTaskDrawerOpen);
  const caseInfo = useCaseStore((s) =>
    caseId ? s.cases.find((c) => c.caseId === caseId) : undefined
  );
  // WO-66：阶段变更版本号，拖拽落库成功后触发本组件重载 context
  const stageVersion = useCaseStore((s) => s.stageVersion);

  const loadData = useCallback(async () => {
    if (!caseId) {
      setContext(null);
      setFacts([]);
      setCaseTasks([]);
      setPolicyResult(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const [resContext, resFacts, allTasks, resPolicy] = await Promise.all([
        getCaseContext(caseId).catch(() => null),
        listBrainFacts(caseId).catch(() => []),
        listTasks('all').catch(() => []),
        getPolicyCheck(caseId).catch(() => null),
      ]);

      setContext(resContext);
      setFacts(resFacts);
      setCaseTasks(allTasks.filter((t) => t.case_id === caseId));
      setPolicyResult(resPolicy);
    } catch (err: any) {
      setError(err?.message || '获取客户全景与态势信息失败');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadData();
  }, [loadData, stageVersion]);

  // Navigate to CaseDetail (Memo Board)
  const handleGoToMaintenance = () => {
    if (caseId) {
      window.dispatchEvent(new CustomEvent('open-case-detail', { detail: caseId }));
    }
  };

  // Facts lookup helper
  const factMap = useMemo(() => {
    const map: Record<string, string> = {};
    facts.forEach((f) => {
      if (f.key) map[f.key] = f.value;
    });
    return map;
  }, [facts]);

  // Key borrower & financial variables derived from facts / context / caseInfo
  const borrowerName = context?.facts.client_name || caseInfo?.clientName || '客户';
  const coBorrowers = factMap['identity.co_borrowers'] ? formatFactValue(factMap['identity.co_borrowers']) : null;
  const referralSource = factMap['referral.source'] || (caseInfo as any)?.referralSource;
  const propertyAddress = factMap['property.address'] || (caseInfo as any)?.propertyAddress || (context as any)?.facts?.property_address || '';
  
  const rawLoanAmount = context?.facts.loan_amount ?? (typeof caseInfo?.loanAmount === 'number' ? caseInfo.loanAmount : undefined) ?? (factMap['loan.amount'] ? parseFloat(factMap['loan.amount']) : undefined);
  const rawPropertyValue = context?.facts.property_value ?? (typeof (caseInfo as any)?.propertyValue === 'number' ? (caseInfo as any).propertyValue : undefined) ?? (factMap['property.value'] ? parseFloat(factMap['property.value']) : undefined);
  
  const loanAmountText = formatMoneyWan(rawLoanAmount);
  const propertyValueText = formatMoneyWan(rawPropertyValue);
  const lvrText = formatLvrDisplay(context?.facts.lvr, rawLoanAmount, rawPropertyValue);

  const lenderName = context?.facts.lender || caseInfo?.lender || factMap['bank.lender'] || '—';
  const rateText = context?.facts.interest_rate || factMap['loan.rate'] || (caseInfo as any)?.interestRate;
  const lenderAndRateText = lenderName !== '—' && rateText ? `${lenderName} · ${rateText}` : lenderName !== '—' ? lenderName : rateText ? rateText : '—';

  const clientGoalText = context?.facts.client_goal || factMap['loan.goal'] || context?.summary || context?.memory || '';
  const specialCircumstancesText = context?.facts.special_circumstances || factMap['special.circumstances'] || factMap['special.circumstance'] || '';

  // 1. Key Deadlines (关键截止 ≤ 3条)
  const keyDeadlines = useMemo(() => {
    if (!context) return [];
    const list: { name: string; deadline: string }[] = [];
    if (context.deadlines?.finance_due) {
      list.push({ name: 'Finance Clause 批贷截止', deadline: context.deadlines.finance_due });
    }
    caseTasks.forEach((t) => {
      if (t.deadline) {
        list.push({ name: t.title, deadline: t.deadline });
      }
    });

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    return list
      .map((item) => {
        const d = new Date(item.deadline);
        const isInvalid = isNaN(d.getTime());
        const diffDays = isInvalid ? 999 : Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return { ...item, diffDays };
      })
      .sort((a, b) => a.diffDays - b.diffDays)
      .slice(0, 3);
  }, [context, caseTasks]);

  const undisclosedFactCount = facts.filter((f) => f.disclosure === 'internal_only').length;
  const activeBlocker = caseInfo?.activeBlocker || (context?.facts as any)?.active_blocker || (context?.facts as any)?.activeBlocker || factMap['active.blocker'] || null;
  const hasBlockerOrRisk = !!activeBlocker || (context?.risk && context.risk.length > 0) || (specialCircumstancesText && specialCircumstancesText.trim() !== '无') || undisclosedFactCount > 0;

  const contentArea = (
    <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-3 text-xs">
      {!caseId ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-4 my-auto">
                <div className="w-14 h-14 rounded-3xl bg-[var(--accent-soft)] flex items-center justify-center border border-[var(--purple-soft)] shadow-md">
                  <User className="w-7 h-7 text-[var(--purple)]" />
                </div>
                <div className="space-y-1 max-w-xs">
                  <p className="font-extrabold text-sm tracking-tight" style={{ color: 'var(--text-primary)' }}>未选择案件</p>
                  <p className="text-xs text-muted leading-relaxed">在左侧列表中点击选择任意案件，查看态势与参谋情报。</p>
                </div>
              </div>
            ) : loading ? (
              <div className="p-4 space-y-3 animate-pulse">
                <div className="h-12 bg-[var(--bg-subtle-strong)] rounded-xl" />
                <div className="h-32 bg-[var(--bg-subtle)] rounded-xl" />
                <div className="h-28 bg-[var(--bg-subtle)] rounded-xl" />
              </div>
            ) : error ? (
              <div className="p-3 rounded-xl border bg-[var(--red-soft)] border-[var(--red-soft)] text-[var(--red)] text-xs flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
                <button type="button" onClick={loadData} className="underline font-bold cursor-pointer">
                  重试
                </button>
              </div>
            ) : (
              <>
                {/* 1. 核心案情概览卡片 (Core Case Panorama Card) */}
                <div 
                  className="p-3.5 rounded-2xl border space-y-3 shadow-xs transition-all" 
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                  id="panorama-core-card"
                >
                  {/* Top: 借款人 + 联名借款人 + 阶段 + 推荐人渠道 */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center space-x-1.5 min-w-0">
                        <span className="font-extrabold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                          {borrowerName}
                        </span>
                        {coBorrowers && (
                          <span className="text-[11px] font-semibold text-muted truncate flex items-center space-x-0.5">
                            <Users className="w-3 h-3 shrink-0" />
                            <span>& {coBorrowers}</span>
                          </span>
                        )}
                      </div>

                      {/* 交互式阶段下拉切换选择器 (WO-91: Apple 统一弹出设计) */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowStageMenu(!showStageMenu)}
                          disabled={isChangingStage || !caseId}
                          className="px-2.5 py-1 rounded-xl text-[11px] font-black border flex items-center space-x-1 hover:opacity-85 transition-opacity cursor-pointer shadow-2xs"
                          style={{
                            backgroundColor: 'var(--bg-subtle)',
                            borderColor: 'var(--border)',
                            color: 'var(--text-primary)',
                          }}
                          title="点击快速微调阶段"
                        >
                          {isChangingStage ? (
                            <Loader2 className="w-3 h-3 animate-spin text-[var(--accent)]" />
                          ) : (
                            <Target className="w-3 h-3 text-[var(--accent)]" />
                          )}
                          <span>{context?.facts.stage || caseInfo?.stage || '收集资料'}</span>
                          <ChevronDown className="w-3 h-3 text-muted" />
                        </button>

                        <AnimatePresence>
                          {showStageMenu && (
                            <motion.div
                              initial={{ opacity: 0, y: 4, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ duration: 0.15 }}
                              className="absolute right-0 top-full mt-1.5 w-44 rounded-xl border shadow-xl p-1 z-50 overflow-hidden"
                              style={{
                                backgroundColor: 'var(--bg-card)',
                                borderColor: 'var(--border)',
                                backdropFilter: 'blur(20px)',
                              }}
                            >
                              <div className="text-[10px] font-bold px-2 py-1 text-muted border-b mb-0.5" style={{ borderColor: 'var(--border)' }}>
                                切换所处阶段
                              </div>
                              <div className="max-h-48 overflow-y-auto no-scrollbar space-y-0.5">
                                {STAGE_OPTIONS.map((opt) => {
                                  const currentStageVal = context?.facts.stage || caseInfo?.stage || '收集资料';
                                  const isSelected = opt.label === currentStageVal || currentStageVal.includes(opt.label);
                                  return (
                                    <button
                                      key={opt.label}
                                      type="button"
                                      onClick={async () => {
                                        if (!caseId) return;
                                        setShowStageMenu(false);
                                        setIsChangingStage(true);
                                        try {
                                          await updateCaseStage(caseId, opt.label);
                                          useToastStore.getState().showToast('success', `阶段已更新为：${opt.label}`);
                                          useCaseStore.getState().bumpStageVersion();
                                          await useCaseStore.getState().fetchCases();
                                          await loadData();
                                        } catch (err: any) {
                                          useToastStore.getState().showToast('error', `更新阶段失败: ${err?.message}`);
                                        } finally {
                                          setIsChangingStage(false);
                                        }
                                      }}
                                      className="w-full px-2 py-1 rounded-lg text-left text-xs font-semibold flex items-center justify-between hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                                      style={{
                                        color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                                        backgroundColor: isSelected ? 'var(--accent-soft)' : 'transparent',
                                      }}
                                    >
                                      <span>{opt.label}</span>
                                      <span className="text-[10px] font-mono text-muted flex items-center space-x-1">
                                        <span>{opt.pct}%</span>
                                        {isSelected && <Check className="w-3 h-3 text-[var(--accent)]" />}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    {/* 推荐人 / 渠道徽章 */}
                    {referralSource && (
                      <div className="flex items-center">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-soft)] truncate">
                          🤝 推荐人: {formatFactValue(referralSource)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 4 宫格核心业务指标看板 */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                    {/* 拟贷金额 */}
                    <div className="p-2 rounded-xl border bg-[var(--bg-subtle)] space-y-0.5" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex items-center space-x-1 text-[10px] text-muted font-bold">
                        <DollarSign className="w-3 h-3 text-[var(--accent)]" />
                        <span>拟贷金额</span>
                      </div>
                      <div className="font-extrabold text-xs tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>
                        {loanAmountText}
                      </div>
                    </div>

                    {/* 物业估值 */}
                    <div className="p-2 rounded-xl border bg-[var(--bg-subtle)] space-y-0.5" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex items-center space-x-1 text-[10px] text-muted font-bold">
                        <Building2 className="w-3 h-3 text-[var(--purple)]" />
                        <span>物业估值</span>
                      </div>
                      <div className="font-extrabold text-xs tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>
                        {propertyValueText}
                      </div>
                    </div>

                    {/* LVR 杠杆率 */}
                    <div className="p-2 rounded-xl border bg-[var(--bg-subtle)] space-y-0.5" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex items-center space-x-1 text-[10px] text-muted font-bold">
                        <Percent className="w-3 h-3 text-[var(--yellow)]" />
                        <span>LVR 杠杆率</span>
                      </div>
                      <div className="font-extrabold text-xs tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>
                        {lvrText}
                      </div>
                    </div>

                    {/* 目标银行与利率 */}
                    <div className="p-2 rounded-xl border bg-[var(--bg-subtle)] space-y-0.5" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex items-center space-x-1 text-[10px] text-muted font-bold">
                        <Landmark className="w-3 h-3 text-[var(--green)]" />
                        <span>贷款银行 · 利率</span>
                      </div>
                      <div className="font-extrabold text-xs tracking-tight truncate" style={{ color: 'var(--text-primary)' }} title={lenderAndRateText}>
                        {lenderAndRateText}
                      </div>
                    </div>
                  </div>

                  {/* 抵押物业地址 */}
                  {propertyAddress ? (
                    <div className="p-2 rounded-xl border bg-[var(--bg-subtle)] flex items-start space-x-1.5 text-[11px]" style={{ borderColor: 'var(--border)' }}>
                      <MapPin className="w-3.5 h-3.5 text-[var(--red)] shrink-0 mt-0.5" />
                      <span className="font-medium leading-tight select-text" style={{ color: 'var(--text-primary)' }}>
                        {propertyAddress}
                      </span>
                    </div>
                  ) : null}

                  {/* 客户核心目标 (Client Goal) */}
                  {clientGoalText ? (
                    <div 
                      className="p-2.5 rounded-xl border space-y-1 text-[11px]" 
                      style={{ 
                        backgroundColor: 'var(--bg-subtle)', 
                        borderColor: 'var(--border)' 
                      }}
                    >
                      <div className="flex items-center space-x-1 text-[10px] font-extrabold text-[var(--accent)]">
                        <Target className="w-3.5 h-3.5" />
                        <span>🎯 客户贷款目的与核心目标</span>
                      </div>
                      <p className="leading-relaxed font-medium whitespace-pre-wrap select-text" style={{ color: 'var(--text-primary)' }}>
                        {formatFactValue(clientGoalText)}
                      </p>
                    </div>
                  ) : null}
                </div>

                {/* 2. Key Deadlines (关键截止 1–3条) */}
                <div className="p-3 rounded-2xl border bg-[var(--bg-subtle)] space-y-2 text-xs" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center space-x-1 font-bold text-[11px]" style={{ color: 'var(--text-primary)' }}>
                    <Clock className="w-3.5 h-3.5 text-[var(--yellow)]" />
                    <span>关键截止倒计时</span>
                  </div>
                  {keyDeadlines.length > 0 ? (
                    <div className="space-y-1.5">
                      {keyDeadlines.map((kd, idx) => (
                        <div key={idx} className="flex items-center justify-between text-[11px] p-2 rounded-xl bg-[var(--bg-card)] border shadow-2xs" style={{ borderColor: 'var(--border)' }}>
                          <span className="truncate text-muted flex-1 mr-2 font-medium" style={{ color: 'var(--text-primary)' }}>{kd.name}</span>
                          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                            kd.diffDays < 0
                              ? 'bg-[var(--red-soft)] text-[var(--red)]'
                              : kd.diffDays <= 3
                              ? 'bg-[var(--yellow-soft)] text-[var(--yellow)]'
                              : 'bg-[var(--green-soft)] text-[var(--green)]'
                          }`}>
                            {kd.diffDays < 0 ? `逾期 ${Math.abs(kd.diffDays)}天` : kd.diffDays === 0 ? '今天到期' : `剩 ${kd.diffDays}天`}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted py-0.5">暂无临近截止事项</p>
                  )}
                </div>

                {/* 3. Next Tasks (单行极简在途待办胶囊) */}
                <div 
                  className="p-2.5 rounded-xl border bg-[var(--bg-subtle)] flex items-center justify-between text-xs" 
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <ClipboardList className="w-3.5 h-3.5 text-[var(--purple)] shrink-0" />
                    <span className="font-bold text-[11px] truncate" style={{ color: 'var(--text-primary)' }}>
                      📌 {caseTasks.length} 项在途待办
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTaskDrawerOpen(true)}
                    className="text-[11px] font-bold text-[var(--purple)] hover:underline flex items-center space-x-0.5 cursor-pointer shrink-0"
                    id="panorama-open-all-tasks-btn"
                  >
                    <span>查看全量待办</span>
                    <span>→</span>
                  </button>
                </div>

                {/* 4. 🔥 三位一体 · AI 实战参谋情报区 (Unified Single Combat Staff Intelligence Card) */}
                <div
                  className="p-3.5 rounded-2xl border space-y-3 shadow-xs transition-all"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border)',
                  }}
                  id="panorama-combat-intelligence-card"
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between pb-1 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center space-x-1.5 min-w-0">
                      <div className="w-5 h-5 rounded-lg bg-[var(--purple-soft)] flex items-center justify-center text-[var(--purple)] shrink-0">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-extrabold tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>
                        三位一体 · AI 实战参谋情报区
                      </span>
                    </div>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[var(--accent-soft)] text-[var(--accent)] shrink-0 border border-[var(--accent-soft)]">
                      卡点 · 政策 · 先例
                    </span>
                  </div>

                  {/* 🚨 1. 核心卡点与阻断攻坚卡片 (Core Blocker Card: activeBlocker / 特殊阻断 / 风险) */}
                  {hasBlockerOrRisk ? (
                    <div 
                      className="p-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs space-y-2"
                      id="panorama-blocker-card"
                    >
                      <div className="flex items-center space-x-1.5 font-bold text-red-500">
                        <AlertOctagon className="w-3.5 h-3.5 shrink-0 animate-pulse" />
                        <span>🚨 核心卡点与风险攻坚</span>
                      </div>

                      {activeBlocker && (
                        <div className="text-[11px] font-bold text-red-300 leading-relaxed bg-[var(--bg-card)] p-2 rounded-lg border border-red-500/30 flex items-start space-x-1.5 shadow-2xs">
                          <span className="text-red-400 shrink-0 font-extrabold">⚠️</span>
                          <span>{activeBlocker}</span>
                        </div>
                      )}

                      {specialCircumstancesText && specialCircumstancesText.trim() !== '无' && specialCircumstancesText !== activeBlocker && (
                        <div className="text-[11px] text-red-300 font-medium leading-relaxed bg-[var(--bg-card)] p-2 rounded-lg border border-red-500/20">
                          {specialCircumstancesText}
                        </div>
                      )}

                      {context?.risk && context.risk.length > 0 && (
                        <div className="space-y-1">
                          {context.risk.map((r, idx) => (
                            <div key={idx} className="flex items-start space-x-1.5 text-[11px] text-red-400 leading-snug">
                              <AlertTriangle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                              <span>{r}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {undisclosedFactCount > 0 && (
                        <div className="text-[10px] font-bold text-red-400 flex items-center space-x-1 pt-0.5">
                          <span>🔒 存在 {undisclosedFactCount} 项内部保密事实（严禁披露给银行）</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 flex items-center space-x-1.5 text-xs font-semibold">
                      <ShieldAlert className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>🟢 当前案卷暂无阻断卡点，推进正常</span>
                    </div>
                  )}

                  {/* 🟡 2. 银行政策风控提示 (单行折叠胶囊 36px) */}
                  {policyResult && (
                    <PolicyHintCard 
                      result={policyResult} 
                      defaultCollapsed={true} 
                      onClose={() => setPolicyResult(null)} 
                    />
                  )}

                  {/* 💡 3. 历史相似破局先例 (Compact Mode, 一键带入对话) */}
                  <RecommendedPrecedentsRadar caseId={caseId} compact={true} />
                </div>

                {/* 已确认的 Fact Find 结构化只读摘要 */}
                {caseId && <ReadOnlyFactFindSummary caseId={caseId} />}

                {/* 5. 底部极简跳转看板按钮 */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleGoToMaintenance}
                    className="w-full py-2.5 px-3 rounded-xl border font-bold text-xs flex items-center justify-center space-x-1.5 cursor-pointer transition-all hover:bg-[var(--purple-soft)] hover:border-[var(--purple)] shadow-2xs"
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--border)',
                      color: 'var(--purple)',
                    }}
                    id="panorama-go-memo-board-btn"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>📄 进入看板查看/编辑案卷备忘录 →</span>
                  </button>
                </div>
              </>
            )}
    </div>
  );

  if (hideOuterHeader) {
    return (
      <div className="w-full h-full flex flex-col overflow-hidden" id="case-panorama-panel" style={{ backgroundColor: 'var(--bg-panel)' }}>
        {contentArea}
      </div>
    );
  }

  return (
    <motion.aside
      id="case-panorama-panel"
      initial={false}
      animate={{ width: collapsed ? 28 : 380 }}
      transition={reduced ? { duration: 0.15 } : { type: 'spring', damping: 25, stiffness: 300 }}
      className="h-full shrink-0 border-l select-none overflow-hidden relative flex flex-col"
      style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}
    >
      {collapsed ? (
        <div
          className="h-full w-full flex flex-col items-center justify-between py-4 cursor-pointer"
          onClick={onToggle}
          title="点击展开客户全景"
        >
          <motion.button whileTap={{ scale: 0.92 }} className="p-1 rounded text-muted hover:text-primary">
            <PanelRightOpen className="w-4 h-4" />
          </motion.button>
          <span
            className="text-[11px] font-extrabold text-muted tracking-widest whitespace-nowrap"
            style={{ writingMode: 'vertical-rl' }}
          >
            客户全景
          </span>
          <div className="w-2 h-2 rounded-full bg-[var(--purple)]" />
        </div>
      ) : (
        <div className="h-full flex flex-col overflow-hidden">
          {/* Header: Title + Collapse Button */}
          <div className="px-3.5 py-2.5 border-b flex items-center justify-between text-xs shrink-0 w-full" style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}>
            <div className="flex items-center space-x-1.5 min-w-0 flex-1 truncate">
              <User className="w-4 h-4 text-[var(--purple)] shrink-0" />
              <span className="font-extrabold text-sm min-w-0 flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
                客户全景
              </span>
            </div>

            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={onToggle}
              className="p-1 rounded-lg border text-muted hover:text-primary cursor-pointer transition-colors ml-auto shrink-0"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
              title="折叠右栏"
              id="panorama-toggle-fold-btn"
            >
              <PanelRightClose className="w-4 h-4" />
            </motion.button>
          </div>

          {contentArea}
        </div>
      )}
    </motion.aside>
  );
}
