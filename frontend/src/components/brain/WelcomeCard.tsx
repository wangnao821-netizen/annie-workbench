import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Sparkles,
  ListChecks,
  Mail,
  ShieldAlert,
  FileText,
  X,
  Building2,
  DollarSign,
  User,
  Folder,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { CaseInfo } from '../../stores/caseStore';
import { useUiStore } from '../../stores/uiStore';
import { useToastStore } from '../../stores/toastStore';
import { getChecklist, getPolicyCheck } from '../../services/api/cases';
import { ChecklistItemResponse, PolicyCheckResult } from '../../types/api';
import { ChecklistAdjustModal } from './ChecklistAdjustModal';
import { PreliminaryEmailModal } from './PreliminaryEmailModal';
import { ImportedWelcomeCard } from './ImportedWelcomeCard';

interface WelcomeCardProps {
  caseId: string;
  caseInfo?: CaseInfo | null;
  onDismiss?: () => void;
  onOpenDraft?: (draftId: string) => void;
}

const SECTION_MAP: Record<string, string> = {
  id: '身份证明',
  income: '收入证明',
  employment_history: '雇主历史',
  living_expense: '生活开支',
  liability: '负债材料',
  living_history: '居住历史',
  asset: '资产证明',
  solicitor: '律师信息',
  other: '补充材料',
};

function resolveSectionName(it: ChecklistItemResponse): string {
  const sec = it.section;
  if (sec && SECTION_MAP[sec]) return SECTION_MAP[sec];

  const mid = (it.master_id || '').toLowerCase();
  const cat = (it.category || '').toLowerCase();
  const name = (it.item_name || it.name_zh || it.name || '').toLowerCase();

  if (mid.includes('passport') || mid.includes('driver') || mid.includes('visa') || cat.includes('identity') || name.includes('护照') || name.includes('驾照') || name.includes('身份')) {
    return '身份证明';
  }
  if (mid.includes('payslip') || mid.includes('salary') || mid.includes('tax') || mid.includes('financial') || cat.includes('income') || name.includes('工资') || name.includes('收入')) {
    return '收入证明';
  }
  if (mid.includes('employment') || name.includes('雇主')) return '雇主历史';
  if (mid.includes('living_expense') || name.includes('开支')) return '生活开支';
  if (mid.includes('loan') || mid.includes('credit_card') || mid.includes('liability') || name.includes('贷款') || name.includes('负债')) return '负债材料';
  if (mid.includes('living_history') || name.includes('居住')) return '居住历史';
  if (mid.includes('asset') || mid.includes('rates') || mid.includes('contract') || mid.includes('deposit') || cat.includes('property') || name.includes('房产') || name.includes('资产')) return '资产证明';
  if (mid.includes('solicitor') || name.includes('律师')) return '律师信息';
  return '补充材料';
}

export function WelcomeCard(props: WelcomeCardProps) {
  // 如果是存量导入案件，走专属的存量案卷心智对账卡片
  if (props.caseInfo?.isImported) {
    return <ImportedWelcomeCard {...props} />;
  }

  // 否则走新建案件的标准欢迎流（首期清单 + 政策提示 + 预览生成首发邮件）
  return <NewCaseWelcomeCard {...props} />;
}

function NewCaseWelcomeCard({ caseId, caseInfo, onDismiss }: WelcomeCardProps) {
  const setRightDeckTab = useUiStore((s) => s.setRightDeckTab);
  const dismissWelcomeCase = useUiStore((s) => s.dismissWelcomeCase);
  const showToast = useToastStore((s) => s.showToast);

  const [checklistItems, setChecklistItems] = useState<ChecklistItemResponse[]>([]);
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  const [policyResult, setPolicyResult] = useState<PolicyCheckResult | null>(null);

  // 弹窗状态
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  // 加载清单与政策概览
  const fetchCardData = useCallback(() => {
    setLoadingChecklist(true);
    Promise.all([
      getChecklist(caseId).catch(() => []),
      getPolicyCheck(caseId).catch(() => null),
    ]).then(([items, policy]) => {
      setChecklistItems(items || []);
      setPolicyResult(policy);
      setLoadingChecklist(false);
    });
  }, [caseId]);

  useEffect(() => {
    fetchCardData();
  }, [fetchCardData]);

  // 监听清单更新事件
  useEffect(() => {
    const handleUpdate = () => fetchCardData();
    window.addEventListener('checklist_updated', handleUpdate);
    return () => window.removeEventListener('checklist_updated', handleUpdate);
  }, [fetchCardData]);

  // 按 8 大标准中文板块归类统计
  const categoryStats = useMemo(() => {
    const map: Record<string, number> = {};
    for (const it of checklistItems) {
      const sectionName = resolveSectionName(it);
      map[sectionName] = (map[sectionName] || 0) + 1;
    }
    return Object.entries(map).map(([name, count]) => ({ name, count }));
  }, [checklistItems]);

  const handleClose = () => {
    dismissWelcomeCase(caseId);
    if (onDismiss) onDismiss();
  };

  const handleViewChecklist = () => {
    setRightDeckTab('checklist');
    showToast('info', '已为您切换至右栏材料清单');
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.99 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="p-5 rounded-2xl border space-y-4 mb-4 relative shadow-sm"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border)',
        }}
        id="case-welcome-card"
      >
        {/* 顶栏：标题 + 徽标 + 关闭按钮 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shadow-xs"
              style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm tracking-tight flex items-center space-x-2" style={{ color: 'var(--text-primary)' }}>
                <span>🎯 案件已建立 · Annie 信贷管家就绪</span>
                <span
                  className="text-[10px] px-2 py-0.2 rounded-full font-bold uppercase"
                  style={{
                    backgroundColor: 'var(--green-soft)',
                    color: 'var(--green)',
                  }}
                >
                  新建立项
                </span>
              </h3>
              <p className="text-xs text-muted">
                已为您初始化 8 大基础材料板块与政策核验，建议先向客户发出首期材料清单。
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-1 rounded-lg hover:bg-[var(--bg-subtle)] text-muted transition-colors cursor-pointer"
            title="关闭引导"
            id="welcome-card-close-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 模块 A：案件核心画像看板 */}
        <div
          className="p-3.5 rounded-xl border grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs"
          style={{
            backgroundColor: 'var(--bg-subtle)',
            borderColor: 'var(--border)',
          }}
        >
          <div className="space-y-1">
            <span className="text-[11px] text-muted flex items-center space-x-1">
              <User className="w-3.5 h-3.5 text-muted" />
              <span>客户主体</span>
            </span>
            <p className="font-bold truncate" style={{ color: 'var(--text-primary)' }}>
              {caseInfo?.clientName || '客户'}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] text-muted flex items-center space-x-1">
              <Building2 className="w-3.5 h-3.5 text-muted" />
              <span>拟申银行</span>
            </span>
            <p className="font-bold truncate" style={{ color: 'var(--text-primary)' }}>
              {caseInfo?.lender || '待定'}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] text-muted flex items-center space-x-1">
              <DollarSign className="w-3.5 h-3.5 text-muted" />
              <span>贷款金额 / LVR</span>
            </span>
            <p className="font-bold truncate" style={{ color: 'var(--text-primary)' }}>
              ${caseInfo?.loanAmount ? (caseInfo.loanAmount / 10000).toFixed(0) + '万' : '待定'}
              {caseInfo?.lvr ? ` (${caseInfo.lvr}%)` : ''}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] text-muted flex items-center space-x-1">
              <Folder className="w-3.5 h-3.5 text-muted" />
              <span>文件夹目录</span>
            </span>
            {caseInfo?.folderPath ? (
              <p
                className="font-mono text-[11px] truncate font-bold flex items-center space-x-1"
                style={{ color: 'var(--green)' }}
                title={caseInfo.folderPath}
              >
                <span>📁 {caseInfo.folderPath.split(/[\\/]/).filter(Boolean).pop() || caseInfo.folderPath}</span>
              </p>
            ) : (
              <p className="font-bold text-xs" style={{ color: 'var(--amber)' }}>
                未关联 ⚠️
              </p>
            )}
          </div>

          {/* 政策风险快速提示 */}
          {policyResult && (
            <div
              className="col-span-2 sm:col-span-4 mt-1 pt-2 border-t flex items-start space-x-2 text-[11px]"
              style={{ borderColor: 'var(--border)' }}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-[var(--amber)] flex-shrink-0 mt-0.5" />
              <p className="text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                <strong className="text-[var(--text-primary)]">政策提示：</strong>
                {policyResult.summary || '已匹配银行最新信贷指南，无重大阻断性政策风险。'}
              </p>
            </div>
          )}
        </div>

        {/* 模块 B：首次材料清单预览与板块分布 */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
              <ListChecks className="w-4 h-4 text-[var(--accent)]" />
              <span>📋 首批材料清单预览</span>
              <span
                className="px-2 py-0.2 rounded-full text-[10px] font-mono font-bold"
                style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                已定 {checklistItems.length} 项 (共 21 项)
              </span>
            </div>

            <button
              onClick={handleViewChecklist}
              className="text-xs flex items-center space-x-1 hover:underline font-bold cursor-pointer"
              style={{ color: 'var(--accent)' }}
              id="welcome-view-checklist-link"
            >
              <span>查看右栏台账</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 板块标签条（8 大中文板块分布） */}
          {loadingChecklist ? (
            <div className="flex items-center space-x-2 text-xs text-muted py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>正在加载材料清单板块...</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {categoryStats.length > 0 ? (
                categoryStats.map((cat) => (
                  <span
                    key={cat.name}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center space-x-1.5"
                    style={{
                      backgroundColor: 'var(--bg-subtle)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                      {cat.name}
                    </span>
                    <span
                      className="w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center"
                      style={{ backgroundColor: 'var(--border)', color: 'var(--text-primary)' }}
                    >
                      {cat.count}
                    </span>
                  </span>
                ))
              ) : (
                <span className="text-xs text-muted">标准 Full Doc/Lite Doc 基础清单材料已生成</span>
              )}
            </div>
          )}
        </div>

        {/* 模块 C：信息项维护提示 */}
        <div
          className="px-3 py-2 rounded-xl text-[11px] flex items-center space-x-2 text-muted border"
          style={{
            backgroundColor: 'var(--bg-subtle)',
            borderColor: 'var(--border)',
          }}
        >
          <span className="font-bold text-[var(--accent)] flex-shrink-0">✍️ 信息项维护：</span>
          <span className="truncate">
            客户雇主历史、家庭资产与纳税情况可在右栏「全景」Fact Find 中进一步确认。
          </span>
        </div>

        {/* 底部操作按钮栏 */}
        <div className="pt-2 border-t flex flex-wrap items-center justify-between gap-2" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center space-x-2">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={handleViewChecklist}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold border flex items-center space-x-1.5 hover:opacity-85 transition-opacity cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
              id="welcome-card-view-checklist-btn"
            >
              <ListChecks className="w-3.5 h-3.5 text-muted" />
              <span>查看台账</span>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setShowAdjustModal(true)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold border flex items-center space-x-1.5 hover:opacity-85 transition-opacity cursor-pointer bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-soft)]"
              id="welcome-card-adjust-checklist-btn"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>📋 调整勾选清单 (8 大板块)</span>
            </motion.button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleClose}
              className="px-3 py-1.5 text-xs text-muted hover:text-[var(--text-primary)] cursor-pointer"
              id="welcome-card-later-btn"
            >
              稍后再看
            </button>

            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setShowEmailModal(true)}
              className="px-4 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-2 hover:opacity-90 transition-opacity cursor-pointer shadow-md"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--on-accent)',
              }}
              id="welcome-card-generate-email-btn"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>📧 预览并生成邮件</span>
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* 8 大板块清单全集勾选定制弹窗 */}
      <ChecklistAdjustModal
        caseId={caseId}
        isOpen={showAdjustModal}
        onClose={() => setShowAdjustModal(false)}
        onSaved={fetchCardData}
      />

      {/* 邮件草稿核对与微调弹窗 */}
      <PreliminaryEmailModal
        caseId={caseId}
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
      />
    </>
  );
}
