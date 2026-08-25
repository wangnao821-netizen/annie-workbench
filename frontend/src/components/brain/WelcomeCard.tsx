import { useState, useEffect, useMemo } from 'react';
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
import { getChecklist, getPolicyCheck, createPreliminaryEmailDraft } from '../../services/api/cases';
import { ChecklistItemResponse, PolicyCheckResult } from '../../types/api';

interface WelcomeCardProps {
  caseId: string;
  caseInfo?: CaseInfo | null;
  onDismiss?: () => void;
  onOpenDraft?: (draftId: string) => void;
}

export function WelcomeCard({ caseId, caseInfo, onDismiss, onOpenDraft }: WelcomeCardProps) {
  const setRightDeckTab = useUiStore((s) => s.setRightDeckTab);
  const dismissWelcomeCase = useUiStore((s) => s.dismissWelcomeCase);
  const showToast = useToastStore((s) => s.showToast);

  const [checklistItems, setChecklistItems] = useState<ChecklistItemResponse[]>([]);
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  const [policyResult, setPolicyResult] = useState<PolicyCheckResult | null>(null);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  // created draft id
  const [, setCreatedDraftId] = useState<string | null>(null);

  // 加载清单与政策概况
  useEffect(() => {
    let active = true;
    setLoadingChecklist(true);

    Promise.all([
      getChecklist(caseId).catch(() => []),
      getPolicyCheck(caseId).catch(() => null),
    ]).then(([items, policy]) => {
      if (!active) return;
      setChecklistItems(items || []);
      setPolicyResult(policy);
      setLoadingChecklist(false);
    });

    return () => {
      active = false;
    };
  }, [caseId]);

  // 按板块归类清单条目
  const categoryStats = useMemo(() => {
    const map: Record<string, number> = {};
    for (const it of checklistItems) {
      const cat = it.category || '基础材料';
      map[cat] = (map[cat] || 0) + 1;
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

  const handleAdjustChecklist = () => {
    setRightDeckTab('checklist');
    showToast('info', '已切换至材料清单视图，您可新增或移除自定义材料项');
  };

  const handleGenerateEmail = async () => {
    if (generatingDraft) return;
    setGeneratingDraft(true);
    try {
      const res = await createPreliminaryEmailDraft(caseId);
      if (res && res.ok) {
        setCreatedDraftId(res.draft_id);
        showToast('success', '已生成材料清单邮件草稿并保存至草稿箱（未发送）');
        if (onOpenDraft && res.draft_id) {
          onOpenDraft(res.draft_id);
        }
      } else {
        showToast('error', '生成材料清单邮件草稿失败，请重试');
      }
    } catch (err: any) {
      showToast('error', err?.message || '生成邮件草稿失败');
    } finally {
      setGeneratingDraft(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="p-5 rounded-2xl border shadow-lg space-y-4 mb-4 relative overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border)',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.06)',
      }}
      id="case-welcome-card"
    >
      {/* 顶部标题栏与关闭按钮 */}
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shadow-xs"
            style={{ backgroundColor: 'var(--purple-soft)', color: 'var(--purple)' }}
          >
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-extrabold text-sm tracking-tight" style={{ color: 'var(--text-primary)' }}>
                🎯 案件已建立 · Annie 信贷管家就绪
              </h3>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
                style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                Onboarding
              </span>
            </div>
            <p className="text-xs text-muted mt-0.5">
              已为您初始化案件画像与材料清单，并建立 3 条首批跟进待办。
            </p>
          </div>
        </div>

        <button
          onClick={handleClose}
          className="p-1 rounded-lg hover:opacity-75 transition-opacity cursor-pointer text-muted"
          title="稍后再看"
          id="welcome-card-dismiss-btn"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 模块 A：案件画像与政策概况 */}
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
            <span>客户姓名</span>
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
            {caseInfo?.lender || 'CBA'}
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
          <p
            className="font-mono text-[11px] truncate"
            style={{ color: 'var(--text-secondary)' }}
            title={caseInfo?.folderPath || ''}
          >
            {caseInfo?.folderPath ? caseInfo.folderPath.split('\\').pop() : '已关联'}
          </p>
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
              已预选 {checklistItems.length} 项
            </span>
          </div>

          <button
            onClick={handleViewChecklist}
            className="text-xs flex items-center space-x-1 hover:underline font-bold cursor-pointer"
            style={{ color: 'var(--accent)' }}
            id="welcome-view-checklist-link"
          >
            <span>查看完整清单</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 板块标签条 */}
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

      {/* 模块 C 预留：信息项提示占位（WO-77 联动） */}
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
            <span>查看完整</span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleAdjustChecklist}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold border flex items-center space-x-1.5 hover:opacity-85 transition-opacity cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-subtle)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
            id="welcome-card-adjust-checklist-btn"
          >
            <FileText className="w-3.5 h-3.5 text-muted" />
            <span>调整清单</span>
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
            onClick={handleGenerateEmail}
            disabled={generatingDraft}
            className="px-4 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-2 hover:opacity-90 transition-opacity cursor-pointer shadow-md disabled:opacity-50"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--on-accent)',
            }}
            id="welcome-card-generate-email-btn"
          >
            {generatingDraft ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>生成中...</span>
              </>
            ) : (
              <>
                <Mail className="w-3.5 h-3.5" />
                <span>📧 生成邮件草稿</span>
              </>
            )}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
