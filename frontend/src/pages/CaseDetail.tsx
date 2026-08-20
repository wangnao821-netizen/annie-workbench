import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeft,
  Settings2,
  ChevronDown,
  PauseCircle,
  RefreshCw,
  Undo2,
  XCircle,
  PlayCircle,
  LockOpen,
  Trash2,
  Clock,
  UserCheck,
} from 'lucide-react';
import { useCaseStore } from '../stores/caseStore';
import { getCase, getCaseContext, listBrainFacts } from '../services/api/cases';
import { mapCaseResponse } from '../services/caseMapper';
import { CaseFolderCard } from '../components/cases/CaseFolderCard';
import { CaseActionModal, CaseActionType } from '../components/cases/CaseActionModal';
import { CaseMemoView } from '../components/cases/memo/CaseMemoView';
import { CaseTimelinePanel } from '../components/panel/details/CaseTimelinePanel';
import { BrainFact, CaseContext } from '../types/api';
import { formatMoneyWanSimple, calculateLvr } from '../components/cases/memo/memoGenerator';

interface CaseDetailProps {
  caseId: string;
  onBack: () => void;
}

export function CaseDetail({ caseId, onBack }: CaseDetailProps) {
  const reduced = useReducedMotion();
  const { currentCase, setCurrentCase, cases, fetchCases } = useCaseStore();

  const [context, setContext] = useState<CaseContext | null>(null);
  const [facts, setFacts] = useState<BrainFact[]>([]);

  // Dropdown menu state
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [activeAction, setActiveAction] = useState<CaseActionType | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Load Context & Facts
  const loadContextAndFacts = useCallback(async () => {
    if (!caseId) return;
    try {
      const [ctx, fList] = await Promise.all([
        getCaseContext(caseId).catch(() => null),
        listBrainFacts(caseId).catch(() => []),
      ]);
      setContext(ctx);
      setFacts(fList);
    } catch {
      // Non-blocking fallback
    }
  }, [caseId]);

  useEffect(() => {
    let isMounted = true;
    if (currentCase?.caseId !== caseId) {
      const found = cases.find((c) => c.caseId === caseId);
      if (found) {
        setCurrentCase(found);
      } else {
        getCase(caseId)
          .then((res) => {
            if (isMounted) {
              setCurrentCase(mapCaseResponse(res));
            }
          })
          .catch(() => {});
      }
    }
    loadContextAndFacts();
    return () => {
      isMounted = false;
    };
  }, [caseId, cases, currentCase?.caseId, setCurrentCase, loadContextAndFacts]);

  // Click outside to close actions dropdown
  useEffect(() => {
    if (!showActionMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuBtnRef.current && menuBtnRef.current.contains(e.target as Node)) return;
      const dropdownEl = document.getElementById('case-detail-ops-dropdown');
      if (dropdownEl && dropdownEl.contains(e.target as Node)) return;
      setShowActionMenu(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowActionMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showActionMenu]);

  const caseData = currentCase?.caseId === caseId ? currentCase : cases.find((c) => c.caseId === caseId) || currentCase;

  // Fact Key-Value Map
  const factMap = useMemo(() => {
    const map: Record<string, string> = {};
    facts.forEach((f) => {
      if (f.key) map[f.key] = f.value;
    });
    return map;
  }, [facts]);

  const stageStr = caseData?.stage || '';
  const isHold = stageStr.includes('暂停') || stageStr.toLowerCase().includes('hold');
  const isTerminal =
    stageStr.includes('撤回') ||
    stageStr.includes('拒绝') ||
    stageStr.includes('终止') ||
    stageStr.includes('已重递') ||
    stageStr.includes('已结算') ||
    stageStr.includes('交割完成');

  const toggleActionMenu = () => {
    if (!showActionMenu && menuBtnRef.current) {
      const rect = menuBtnRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 6, left: Math.max(8, rect.left) });
    }
    setShowActionMenu(!showActionMenu);
  };

  const handleOpenAction = (action: CaseActionType) => {
    setShowActionMenu(false);
    setActiveAction(action);
  };

  const handleActionSuccess = async () => {
    await fetchCases();
    await loadContextAndFacts();
    if (activeAction === 'delete') {
      onBack();
    }
  };

  // Extract 5 Core Business Metric Values
  const rawLoanAmount =
    context?.facts.loan_amount ??
    (typeof caseData?.loanAmount === 'number' ? caseData.loanAmount : undefined) ??
    (factMap['loan.amount'] ? parseFloat(factMap['loan.amount']) : undefined);

  const rawPropertyValue =
    context?.facts.property_value ??
    (typeof (caseData as any)?.propertyValue === 'number' ? (caseData as any).propertyValue : undefined) ??
    (factMap['property.value'] ? parseFloat(factMap['property.value']) : undefined);

  const loanAmountText = formatMoneyWanSimple(rawLoanAmount);
  const propertyValueText = formatMoneyWanSimple(rawPropertyValue);
  const lvrText = calculateLvr(rawLoanAmount, rawPropertyValue, context?.facts.lvr || caseData?.lvr);

  const lenderName = context?.facts.lender || caseData?.lender || factMap['bank.lender'] || '待定银行';
  const interestRate =
    context?.facts.interest_rate ||
    factMap['loan.rate'] ||
    (caseData as any)?.interestRate;

  const lenderAndRateText =
    interestRate ? `${lenderName} · ${interestRate}` : lenderName;

  const referralSource =
    factMap['referral.source'] ||
    (caseData as any)?.referralSource ||
    '直客 / 渠道推荐';

  const clientName = context?.facts.client_name || caseData?.clientName || '客户';

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: 20 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="flex-1 flex flex-col h-full overflow-hidden p-4 sm:p-5 space-y-3.5"
      id="case-detail-page"
    >
      {/* Top Header - Two-layer structured layout: Left Identity · Right Action */}
      <div
        className="p-4 rounded-2xl border flex flex-col gap-3 flex-shrink-0 shadow-xs transition-all"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-card)',
        }}
        id="case-detail-header"
      >
        {/* Layer 1: Left Identity (Back Arrow + Big Client Name + Stage) | Right Operations (Folder + Ops Dropdown) */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Left: Identity */}
          <div className="flex items-center space-x-3 min-w-0 flex-wrap gap-y-1.5">
            {/* Back Button */}
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={onBack}
              className="p-2 rounded-xl border flex items-center justify-center cursor-pointer transition-all hover:bg-[var(--bg-subtle)]"
              style={{
                backgroundColor: 'var(--bg-panel)',
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
              }}
              id="case-detail-back-btn"
              title="返回看板"
            >
              <ArrowLeft className="w-4 h-4" />
            </motion.button>

            {/* Big Bold Client Name */}
            <h2
              className="text-lg sm:text-xl font-extrabold tracking-tight truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {clientName}
            </h2>

            {/* Stage Badge */}
            {stageStr && (
              <span
                className={`px-2.5 py-0.5 text-xs font-bold rounded-full border ${
                  isHold
                    ? 'bg-amber-500/20 text-amber-500 border-amber-500/30'
                    : isTerminal
                    ? 'bg-red-500/20 text-red-400 border-red-500/30'
                    : 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-soft)]'
                }`}
                id="case-stage-badge"
              >
                {stageStr}
              </span>
            )}

            {/* Quick Resume Button if on Hold */}
            {isHold && (
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => handleOpenAction('resume')}
                className="px-2.5 py-0.5 rounded-full font-bold text-xs flex items-center space-x-1 text-white cursor-pointer shadow-xs hover:opacity-90 transition-opacity"
                style={{ backgroundColor: 'var(--green)' }}
                id="case-detail-quick-resume"
              >
                <PlayCircle className="w-3 h-3" />
                <span>恢复跟进</span>
              </motion.button>
            )}
          </div>

          {/* Right: Actions (Folder Card + Operations Dropdown Menu) */}
          <div className="flex items-center space-x-2 shrink-0">
            {/* Associate Folder Card */}
            <CaseFolderCard
              caseId={caseId}
              folderPath={caseData?.folderPath}
              folderMode={caseData?.folderMode}
              compact
            />

            {/* Case Operations Dropdown */}
            <div className="relative">
              <motion.button
                whileTap={{ scale: 0.96 }}
                ref={menuBtnRef}
                onClick={toggleActionMenu}
                className="px-3 py-1.5 rounded-xl border font-semibold flex items-center space-x-1.5 text-xs cursor-pointer transition-all hover:bg-[var(--bg-subtle)] shadow-xs"
                style={{
                  backgroundColor: 'var(--bg-panel)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
                id="case-detail-ops-menu-btn"
              >
                <Settings2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>案件操作</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showActionMenu ? 'rotate-180' : ''}`} />
              </motion.button>

              {showActionMenu &&
                createPortal(
                  <div
                    className="fixed w-52 rounded-2xl border shadow-2xl py-1.5 z-50 text-xs"
                    style={{
                      top: `${menuPos.top}px`,
                      left: `${menuPos.left}px`,
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--border)',
                      backdropFilter: 'blur(20px) saturate(180%)',
                    }}
                    id="case-detail-ops-dropdown"
                  >
                    {/* Resume if Hold */}
                    {isHold && (
                      <button
                        onClick={() => handleOpenAction('resume')}
                        className="w-full text-left px-3.5 py-2 flex items-center space-x-2.5 hover:bg-[var(--bg-app)] cursor-pointer font-semibold"
                        style={{ color: 'var(--green)' }}
                        id="case-op-resume"
                      >
                        <PlayCircle className="w-4 h-4 flex-shrink-0" />
                        <span>恢复案件 (Resume)</span>
                      </button>
                    )}

                    {/* Reopen if Terminal */}
                    {isTerminal && (
                      <button
                        onClick={() => handleOpenAction('reopen')}
                        className="w-full text-left px-3.5 py-2 flex items-center space-x-2.5 hover:bg-[var(--bg-app)] cursor-pointer font-semibold"
                        style={{ color: 'var(--purple)' }}
                        id="case-op-reopen"
                      >
                        <LockOpen className="w-4 h-4 flex-shrink-0" />
                        <span>解封案件 (Reopen)</span>
                      </button>
                    )}

                    {/* Standard Actions */}
                    {!isTerminal && (
                      <>
                        {!isHold && (
                          <button
                            onClick={() => handleOpenAction('hold')}
                            className="w-full text-left px-3.5 py-2 flex items-center space-x-2.5 hover:bg-[var(--bg-app)] cursor-pointer"
                            style={{ color: 'var(--text-primary)' }}
                            id="case-op-hold"
                          >
                            <PauseCircle className="w-4 h-4 flex-shrink-0 text-[var(--yellow)]" />
                            <span>暂停案件 (Hold)</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleOpenAction('resubmit')}
                          className="w-full text-left px-3.5 py-2 flex items-center space-x-2.5 hover:bg-[var(--bg-app)] cursor-pointer"
                          style={{ color: 'var(--text-primary)' }}
                          id="case-op-resubmit"
                        >
                          <RefreshCw className="w-4 h-4 flex-shrink-0 text-[var(--accent)]" />
                          <span>换银行重递 (Resubmit)</span>
                        </button>

                        <button
                          onClick={() => handleOpenAction('withdraw')}
                          className="w-full text-left px-3.5 py-2 flex items-center space-x-2.5 hover:bg-[var(--bg-app)] cursor-pointer"
                          style={{ color: 'var(--text-primary)' }}
                          id="case-op-withdraw"
                        >
                          <Undo2 className="w-4 h-4 flex-shrink-0 text-[var(--orange)]" />
                          <span>客户撤回 (Withdraw)</span>
                        </button>

                        <button
                          onClick={() => handleOpenAction('decline')}
                          className="w-full text-left px-3.5 py-2 flex items-center space-x-2.5 hover:bg-[var(--bg-app)] cursor-pointer"
                          style={{ color: 'var(--text-primary)' }}
                          id="case-op-decline"
                        >
                          <XCircle className="w-4 h-4 flex-shrink-0 text-[var(--red)]" />
                          <span>终止案件 (Decline)</span>
                        </button>
                      </>
                    )}

                    {/* Separator and Delete action */}
                    <div className="my-1.5 border-t" style={{ borderColor: 'var(--border)' }} />

                    <button
                      onClick={() => handleOpenAction('delete')}
                      className="w-full text-left px-3.5 py-2 flex items-center space-x-2.5 hover:bg-red-500/10 cursor-pointer font-semibold"
                      style={{ color: 'var(--red)' }}
                      id="case-op-delete"
                    >
                      <Trash2 className="w-4 h-4 flex-shrink-0" />
                      <span>删除案件</span>
                    </button>
                  </div>,
                  document.body
                )}
            </div>
          </div>
        </div>

        {/* Layer 2: Compact 5 Core Business Metric Capsules */}
        <div
          className="pt-2.5 border-t flex items-center justify-between gap-x-3 gap-y-2 flex-wrap text-xs font-mono"
          style={{ borderColor: 'var(--border)' }}
        >
          {/* 5 Core Metrics */}
          <div className="flex items-center space-x-2.5 flex-wrap gap-y-1.5">
            {/* Metric 1: 拟贷金额 */}
            <div
              className="px-2.5 py-1 rounded-xl border flex items-center space-x-1.5 bg-[var(--bg-subtle)]"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="text-muted font-sans font-medium">💰 拟贷:</span>
              <strong className="text-[var(--green)] font-bold">{loanAmountText}</strong>
            </div>

            {/* Metric 2: 物业估值 */}
            <div
              className="px-2.5 py-1 rounded-xl border flex items-center space-x-1.5 bg-[var(--bg-subtle)]"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="text-muted font-sans font-medium">🏠 估值:</span>
              <strong className="text-primary font-bold">{propertyValueText}</strong>
            </div>

            {/* Metric 3: LVR 比例 */}
            <div
              className="px-2.5 py-1 rounded-xl border flex items-center space-x-1.5 bg-[var(--bg-subtle)]"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="text-muted font-sans font-medium">⚖️ LVR:</span>
              <strong className="text-[var(--accent)] font-bold">{lvrText}</strong>
            </div>

            {/* Metric 4: 目标银行与利率 */}
            <div
              className="px-2.5 py-1 rounded-xl border flex items-center space-x-1.5 bg-[var(--purple-soft)] text-[var(--purple)]"
              style={{ borderColor: 'var(--purple-soft)' }}
            >
              <span className="font-sans font-medium">🏦</span>
              <strong className="font-bold">{lenderAndRateText}</strong>
            </div>

            {/* Metric 5: 推荐人渠道 */}
            <div
              className="px-2.5 py-1 rounded-xl border flex items-center space-x-1.5 bg-[var(--bg-subtle)]"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="text-muted font-sans font-medium">🤝 渠道:</span>
              <span className="text-secondary font-medium font-sans truncate max-w-[140px]">{referralSource}</span>
            </div>
          </div>

          {/* Right Extras: Stage stay days / Assessor */}
          <div className="flex items-center space-x-3 text-xs text-muted flex-wrap gap-y-1">
            {caseData?.stageDays !== undefined && (
              <span className="flex items-center space-x-1">
                <Clock className="w-3 h-3 text-[var(--accent)]" />
                <span>停留 <strong className="text-primary font-bold">{caseData.stageDays}</strong> 天</span>
              </span>
            )}

            {caseData?.assessorName && (
              <span className="flex items-center space-x-1 text-[var(--purple)] font-sans">
                <UserCheck className="w-3 h-3" />
                <span>审批官: <strong>{caseData.assessorName}</strong></span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area: 「左文右轨 · 黄金双翼工作台」 (60% Left : 40% Right) */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 overflow-hidden min-h-0">
        {/* 👈 Left Column (60% width): 【案卷全景备忘录 (Markdown 活文档)】 */}
        <div className="lg:w-[60%] w-full h-full min-h-0 overflow-hidden flex flex-col">
          <CaseMemoView
            caseId={caseId}
            clientName={clientName}
            caseData={caseData}
            context={context}
            facts={facts}
            onRefresh={loadContextAndFacts}
          />
        </div>

        {/* 👉 Right Column (40% width): 【沟通与全量时序证据链 (Timeline)】 */}
        <div className="lg:w-[40%] w-full h-full min-h-0 overflow-hidden flex flex-col">
          <CaseTimelinePanel caseId={caseId} />
        </div>
      </div>

      {/* Case Action Modal */}
      {activeAction && caseData && (
        <CaseActionModal
          caseData={caseData}
          actionType={activeAction}
          onClose={() => setActiveAction(null)}
          onSuccess={handleActionSuccess}
        />
      )}
    </motion.div>
  );
}
