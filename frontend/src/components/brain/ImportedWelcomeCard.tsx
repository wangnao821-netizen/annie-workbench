import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  ListChecks,
  X,
  Send,
  Target,
  ChevronDown,
  MessageSquareQuote,
  Loader2,
  Check,
  Building2,
  DollarSign,
  FolderCheck,
  User,
  Home,
  Clock,
  Percent,
  FileText,
} from 'lucide-react';
import { CaseInfo, useCaseStore } from '../../stores/caseStore';
import { useUiStore } from '../../stores/uiStore';
import { useToastStore } from '../../stores/toastStore';
import { getChecklist, getCaseContext, createContextEvent, updateCaseStage } from '../../services/api/cases';
import { ChecklistItemResponse, CaseContext } from '../../types/api';
import { ChecklistAdjustModal } from './ChecklistAdjustModal';

interface ImportedWelcomeCardProps {
  caseId: string;
  caseInfo?: CaseInfo | null;
  onDismiss?: () => void;
  onOpenDraft?: (draftId: string) => void;
}

const STAGE_STEPS = [
  { key: 'lead', label: '初步咨询', short: '咨询', pct: 10 },
  { key: 'gathering', label: '收集资料', short: '资料', pct: 20 },
  { key: 'to_submit', label: '待递交', short: '待递', pct: 30 },
  { key: 'submitted', label: '已递交(等银行)', short: '递交', pct: 45 },
  { key: 'os_requested', label: '银行补件', short: '补件', pct: 50 },
  { key: 'valuing', label: '估值中', short: '估值', pct: 55 },
  { key: 'approved', label: '已批准', short: '获批', pct: 70 },
  { key: 'settling', label: '结算中', short: '签约', pct: 85 },
  { key: 'settled', label: '已结算', short: '交割', pct: 100 },
];

function getStagePct(stageName?: string | null): number {
  if (!stageName) return 20;
  const match = STAGE_STEPS.find((s) => s.label === stageName || stageName.includes(s.label) || stageName.includes(s.short));
  return match ? match.pct : 20;
}

function formatMoney(amount?: number | null): string {
  if (!amount) return '待定';
  if (amount >= 10000) {
    return `$${(amount / 10000).toFixed(0)}万`;
  }
  return `$${amount.toLocaleString()}`;
}

export function ImportedWelcomeCard({ caseId, caseInfo, onDismiss }: ImportedWelcomeCardProps) {
  const setRightDeckTab = useUiStore((s) => s.setRightDeckTab);
  const dismissWelcomeCase = useUiStore((s) => s.dismissWelcomeCase);
  const showToast = useToastStore((s) => s.showToast);

  const [context, setContext] = useState<CaseContext | null>(null);
  const [checklistItems, setChecklistItems] = useState<ChecklistItemResponse[]>([]);
  const [currentStageState, setCurrentStageState] = useState<string>(caseInfo?.stage || '收集资料');
  const [showStageMenu, setShowStageMenu] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [memoText, setMemoText] = useState('');
  const [isSavingMemo, setIsSavingMemo] = useState(false);
  const [isUpdatingStage, setIsUpdatingStage] = useState(false);

  const fetchCardData = useCallback(() => {
    Promise.all([
      getChecklist(caseId).catch(() => []),
      getCaseContext(caseId).catch(() => null),
    ]).then(([items, ctx]) => {
      setChecklistItems(items || []);
      if (ctx) {
        setContext(ctx);
        if (ctx.facts.stage) {
          setCurrentStageState(ctx.facts.stage);
        }
      }
    });
  }, [caseId]);

  useEffect(() => {
    fetchCardData();
  }, [fetchCardData]);

  useEffect(() => {
    if (caseInfo?.stage) {
      setCurrentStageState(caseInfo.stage);
    }
  }, [caseInfo?.stage]);

  const totalProvided = useMemo(() => {
    return checklistItems.filter(
      (i) => i.status === 'received' || i.status === 'confirmed' || Boolean(i.matched_file_id || i.received_file_id)
    ).length;
  }, [checklistItems]);

  const handleClose = () => {
    dismissWelcomeCase(caseId);
    if (onDismiss) onDismiss();
  };

  const handleViewChecklist = () => {
    setRightDeckTab('checklist');
    showToast('info', '已为您切换至右栏材料清单');
  };

  const handleSelectStage = async (stageLabel: string) => {
    setIsUpdatingStage(true);
    setShowStageMenu(false);
    setCurrentStageState(stageLabel); // 即时乐观更新
    try {
      await updateCaseStage(caseId, stageLabel);
      showToast('success', `阶段已更新为：${stageLabel}`);
      useCaseStore.getState().bumpStageVersion();
      await useCaseStore.getState().fetchCases();
      fetchCardData();
    } catch (err: any) {
      showToast('error', `更新阶段失败: ${err?.message}`);
      if (caseInfo?.stage) setCurrentStageState(caseInfo.stage);
    } finally {
      setIsUpdatingStage(false);
    }
  };

  const handleSaveBrainMemo = async () => {
    if (!memoText.trim()) return;
    setIsSavingMemo(true);
    try {
      await createContextEvent(caseId, {
        content: memoText.trim(),
        track: 'internal',
        source_type: 'manual_note',
      });
      showToast('success', '✨ 已为您记录内线备忘并蒸馏入案件大脑');
      setMemoText('');
    } catch (err: any) {
      showToast('error', `记录失败: ${err?.message}`);
    } finally {
      setIsSavingMemo(false);
    }
  };

  const currentStageIdx = STAGE_STEPS.findIndex(
    (s) => s.label === currentStageState || currentStageState.includes(s.label) || currentStageState.includes(s.short)
  );
  const activePct = getStagePct(currentStageState);

  // 核心画像数据汇总
  const facts = context?.facts;
  const deadlines = context?.deadlines;
  const clientName = facts?.client_name || caseInfo?.clientName || '客户';
  const coBorrowers = facts?.co_borrowers && facts.co_borrowers.length > 0 ? facts.co_borrowers.join(' & ') : null;
  const lender = facts?.lender || caseInfo?.lender || '待定';
  const loanAmount = facts?.loan_amount || caseInfo?.loanAmount;
  const propertyValue = facts?.property_value;
  const lvr = facts?.lvr || caseInfo?.lvr;
  const rate = facts?.interest_rate;
  const purpose = facts?.purpose || '自住购房';
  const propertyAddress = facts?.property_address;
  const assessorName = caseInfo?.assessorName;
  const lenderRef = caseInfo?.lenderRef;

  const folderName = caseInfo?.folderPath
    ? caseInfo.folderPath.split(/[\\/]/).filter(Boolean).pop() || caseInfo.folderPath
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.99 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="p-5 rounded-3xl border space-y-4 mb-4 relative shadow-sm"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border)',
      }}
      id="case-imported-welcome-card"
    >
      {/* 1. 顶栏：标题 + 阶段微调胶囊 + 关闭按钮 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center space-x-3 min-w-0">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-xs"
            style={{ backgroundColor: 'var(--purple-soft)', color: 'var(--purple)' }}
          >
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-extrabold text-sm tracking-tight flex items-center space-x-2" style={{ color: 'var(--text-primary)' }}>
              <span>🌟 存量案卷接入 · 心智对账简报</span>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
                style={{
                  backgroundColor: 'var(--purple-soft)',
                  color: 'var(--purple)',
                }}
              >
                存量导入
              </span>
            </h3>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          {/* 阶段快速切换按钮与下拉菜单 */}
          <div className="relative">
            <button
              onClick={() => setShowStageMenu(!showStageMenu)}
              disabled={isUpdatingStage}
              className="px-3 py-1.5 rounded-xl text-xs font-black border flex items-center space-x-1.5 hover:opacity-85 transition-opacity cursor-pointer shadow-xs"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
              title="点击快速微调阶段"
            >
              {isUpdatingStage ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
              ) : (
                <Target className="w-3.5 h-3.5 text-[var(--accent)]" />
              )}
              <span>{currentStageState}</span>
              <span className="text-[var(--accent)] font-mono font-bold text-[11px]">({activePct}%)</span>
              <ChevronDown className="w-3.5 h-3.5 text-muted" />
            </button>

            {/* 9 级阶段点选弹出菜单 */}
            <AnimatePresence>
              {showStageMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-1.5 w-48 rounded-2xl border shadow-2xl p-1.5 z-50 overflow-hidden"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border)',
                    backdropFilter: 'blur(20px)',
                  }}
                >
                  <div className="text-[10px] font-bold px-2 py-1 text-muted border-b mb-1" style={{ borderColor: 'var(--border)' }}>
                    切换所处阶段
                  </div>
                  <div className="max-h-52 overflow-y-auto no-scrollbar space-y-0.5">
                    {STAGE_STEPS.map((opt) => {
                      const isSelected = opt.label === currentStageState || currentStageState.includes(opt.label);
                      return (
                        <button
                          key={opt.label}
                          onClick={() => handleSelectStage(opt.label)}
                          className="w-full px-2.5 py-1.5 rounded-xl text-left text-xs font-semibold flex items-center justify-between hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                          style={{
                            color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                            backgroundColor: isSelected ? 'var(--accent-soft)' : 'transparent',
                          }}
                        >
                          <span>{opt.label}</span>
                          <span className="text-[10px] font-mono text-muted flex items-center space-x-1">
                            <span>{opt.pct}%</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={handleClose}
            className="p-1 rounded-lg hover:bg-[var(--bg-subtle)] text-muted transition-colors cursor-pointer"
            title="关闭卡片"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Apple Segmented Milestone Capsule (分段胶囊流转条 · 纯正 Apple 设计) */}
      <div
        className="p-3 rounded-2xl border space-y-2.5"
        style={{
          backgroundColor: 'var(--bg-subtle)',
          borderColor: 'var(--border)',
        }}
      >
        {/* 阶段大标题与推进度 */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: 'var(--accent)' }}
            />
            <span className="font-bold text-muted">当前阶段：</span>
            <span className="font-extrabold text-primary text-sm">{currentStageState}</span>
          </div>
          <div className="font-mono text-xs font-bold text-muted flex items-center space-x-1">
            <span>里程碑进度</span>
            <span className="text-[var(--accent)] font-extrabold">{activePct}%</span>
          </div>
        </div>

        {/* 9 节点分段流转胶囊条 */}
        <div className="grid grid-cols-9 gap-1.5 w-full">
          {STAGE_STEPS.map((step, idx) => {
            const isPassed = currentStageIdx >= 0 && idx < currentStageIdx;
            const isCurrent = idx === currentStageIdx;

            return (
              <button
                key={step.key}
                type="button"
                onClick={() => handleSelectStage(step.label)}
                className="group flex flex-col items-center space-y-1.5 cursor-pointer outline-none transition-all hover:opacity-90"
                title={`${step.label} (${step.pct}%) - 点击切换`}
              >
                {/* 胶囊条分段 */}
                <div
                  className="w-full h-2 rounded-full transition-all duration-300 relative overflow-hidden"
                  style={{
                    backgroundColor: isCurrent
                      ? 'var(--accent)'
                      : isPassed
                      ? 'var(--accent)'
                      : 'var(--border)',
                    opacity: isCurrent ? 1 : isPassed ? 0.75 : 0.4,
                    boxShadow: isCurrent ? '0 0 8px var(--accent-soft)' : 'none',
                  }}
                />

                {/* 阶段名称与百分比 */}
                <div className="text-center select-none w-full">
                  <span
                    className={`text-[10px] block truncate transition-colors ${
                      isCurrent ? 'font-black' : isPassed ? 'font-bold' : 'font-medium'
                    }`}
                    style={{
                      color: isCurrent
                        ? 'var(--accent)'
                        : isPassed
                        ? 'var(--text-primary)'
                        : 'var(--text-muted)',
                    }}
                  >
                    {step.short}
                  </span>
                  <span
                    className="text-[9px] font-mono block leading-none mt-0.5 opacity-60"
                    style={{
                      color: isCurrent ? 'var(--accent)' : 'var(--text-muted)',
                    }}
                  >
                    {step.pct}%
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. 核心画像与交易结构信息看板（Apple Widget 风格分块） */}
      <div
        className="p-4 rounded-2xl border grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs"
        style={{
          backgroundColor: 'var(--bg-subtle)',
          borderColor: 'var(--border)',
        }}
      >
        {/* 借款人 */}
        <div className="space-y-1">
          <span className="text-[11px] text-muted flex items-center space-x-1.5">
            <User className="w-3.5 h-3.5 text-muted" />
            <span>借款人主体</span>
          </span>
          <p className="font-bold truncate text-primary text-xs" title={coBorrowers ? `${clientName} & ${coBorrowers}` : clientName}>
            {clientName} {coBorrowers ? <span className="text-muted font-normal">(& {coBorrowers})</span> : null}
          </p>
        </div>

        {/* 拟申银行与方案 */}
        <div className="space-y-1">
          <span className="text-[11px] text-muted flex items-center space-x-1.5">
            <Building2 className="w-3.5 h-3.5 text-muted" />
            <span>拟申银行 · 方案</span>
          </span>
          <p className="font-bold truncate text-primary text-xs">
            {lender} <span className="text-muted font-normal">({purpose})</span>
          </p>
        </div>

        {/* 贷款金额与 LVR */}
        <div className="space-y-1">
          <span className="text-[11px] text-muted flex items-center space-x-1.5">
            <DollarSign className="w-3.5 h-3.5 text-muted" />
            <span>贷款金额 · LVR</span>
          </span>
          <p className="font-bold font-mono text-primary text-xs">
            {formatMoney(loanAmount)} {lvr ? <span className="text-[var(--accent)] font-semibold">({lvr}%)</span> : ''}
          </p>
        </div>

        {/* 物理材料归集度 */}
        <div className="space-y-1">
          <span className="text-[11px] text-muted flex items-center space-x-1.5">
            <FolderCheck className="w-3.5 h-3.5 text-[var(--green)]" />
            <span>物理材料穿透</span>
          </span>
          <p className="font-bold text-[var(--green)] truncate flex items-center space-x-1 text-xs" title={folderName ? `关联路径: ${folderName}` : ''}>
            <span>已归集 {totalProvided}/{checklistItems.length || 18} 份 ✅</span>
          </p>
        </div>

        {/* 抵押房产地址 */}
        {propertyAddress && (
          <div className="col-span-2 space-y-1 pt-2 border-t border-[var(--border)]">
            <span className="text-[11px] text-muted flex items-center space-x-1.5">
              <Home className="w-3.5 h-3.5 text-muted" />
              <span>抵押物业地址</span>
            </span>
            <p className="font-medium text-primary truncate text-xs" title={propertyAddress}>
              {propertyAddress} {propertyValue ? <span className="font-mono text-muted">(估值: {formatMoney(propertyValue)})</span> : ''}
            </p>
          </div>
        )}

        {/* 申请利率 & 关键日期 */}
        <div className={`${propertyAddress ? 'col-span-2' : 'col-span-4'} flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border)]`}>
          {rate && (
            <div className="space-y-1">
              <span className="text-[11px] text-muted flex items-center space-x-1">
                <Percent className="w-3.5 h-3.5 text-muted" />
                <span>申请利率</span>
              </span>
              <p className="font-mono font-bold text-primary text-xs">{rate}</p>
            </div>
          )}

          {deadlines?.finance_due && (
            <div className="space-y-1">
              <span className="text-[11px] text-muted flex items-center space-x-1">
                <Clock className="w-3.5 h-3.5 text-[var(--amber)]" />
                <span>Finance Clause 截止</span>
              </span>
              <p className="font-mono font-bold text-[var(--amber)] text-xs">
                {deadlines.finance_due.split('T')[0]} {deadlines.days_left !== undefined ? `(余 ${deadlines.days_left} 天)` : ''}
              </p>
            </div>
          )}

          {assessorName && (
            <div className="space-y-1">
              <span className="text-[11px] text-muted">审贷官 / 案号</span>
              <p className="font-bold text-primary truncate text-xs">
                {assessorName} {lenderRef ? `· ${lenderRef}` : ''}
              </p>
            </div>
          )}

          {folderName && (
            <div className="space-y-1">
              <span className="text-[11px] text-muted">本地关联案卷</span>
              <p className="font-mono text-[11px] text-[var(--accent)] font-semibold truncate text-xs" title={caseInfo?.folderPath || ''}>
                📁 {folderName}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 4. 口述内线隐患与备忘录 (Brain Dump) */}
      <div
        className="p-3.5 rounded-2xl border space-y-2"
        style={{
          backgroundColor: 'var(--bg-subtle)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="flex items-center space-x-2 text-xs font-bold text-primary">
          <MessageSquareQuote className="w-4 h-4 text-[var(--accent)]" />
          <span>🧠 内线隐患与口述备忘录（卸载脑力记忆）：</span>
        </div>
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={memoText}
            onChange={(e) => setMemoText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isSavingMemo) handleSaveBrainMemo();
            }}
            placeholder="脑子里还有什么历史隐患或特殊情况要交代 Annie 记住？(输入回车直接存入)..."
            className="flex-1 px-3.5 py-2 rounded-xl border text-xs bg-[var(--bg-card)] outline-none focus:border-[var(--accent)] text-primary transition-colors"
            style={{ borderColor: 'var(--border)' }}
            disabled={isSavingMemo}
          />
          <button
            type="button"
            onClick={handleSaveBrainMemo}
            disabled={!memoText.trim() || isSavingMemo}
            className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center space-x-1.5 shadow-xs text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {isSavingMemo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span>存入</span>
          </button>
        </div>
      </div>

      {/* 5. 底部操作栏 */}
      <div className="flex items-center justify-between pt-1 text-xs">
        <div className="flex items-center space-x-2">
          <button
            onClick={handleViewChecklist}
            className="px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center space-x-1.5 cursor-pointer hover:opacity-85 transition-opacity bg-[var(--bg-subtle)] text-primary"
            style={{ borderColor: 'var(--border)' }}
          >
            <ListChecks className="w-3.5 h-3.5 text-muted" />
            <span>查看材料柜 ({totalProvided}/{checklistItems.length})</span>
          </button>

          <button
            onClick={() => setShowAdjustModal(true)}
            className="px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center space-x-1.5 cursor-pointer hover:opacity-85 transition-opacity bg-[var(--bg-subtle)] text-primary"
            style={{ borderColor: 'var(--border)' }}
          >
            <FileText className="w-3.5 h-3.5 text-muted" />
            <span>调整清单勾选</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleClose}
            className="px-3.5 py-2 text-xs text-muted hover:text-primary cursor-pointer font-medium"
          >
            稍后再看
          </button>
        </div>
      </div>

      {/* 调整清单勾选弹窗 */}
      <ChecklistAdjustModal
        caseId={caseId}
        isOpen={showAdjustModal}
        onClose={() => setShowAdjustModal(false)}
        onSaved={fetchCardData}
      />
    </motion.div>
  );
}
