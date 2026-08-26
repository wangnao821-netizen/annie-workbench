import { motion, useReducedMotion } from 'motion/react';
import {
  CheckSquare,
  Square,
  HardDrive,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  FileText,
  Sparkles,
  Archive,
  HelpCircle,
} from 'lucide-react';
import { CaseSubfolderMeta } from '../../../types/api';

interface CaseSubfolderCardProps {
  caseItem: CaseSubfolderMeta;
  isSelected: boolean;
  onToggle: (path: string) => void;
}

export function CaseSubfolderCard({
  caseItem: c,
  isSelected,
  onToggle,
}: CaseSubfolderCardProps) {
  const reduced = useReducedMotion();

  const isWithdrawn = c.status === 'withdrawn' || c.status === 'closed';
  const isSettled = c.status === 'settled';
  const isOnhold = c.status === 'onhold';
  const isLead = c.status === 'lead';
  const isRecommended = c.is_recommended_active;

  const getLenderBadgeStyle = (lender?: string) => {
    switch (lender?.toUpperCase()) {
      case 'WESTPAC':
      case 'WBC':
        return { backgroundColor: 'var(--red-soft)', color: 'var(--red)', borderColor: 'var(--red-soft)' };
      case 'CBA':
        return { backgroundColor: 'var(--yellow-soft)', color: 'var(--yellow)', borderColor: 'var(--yellow-soft)' };
      case 'ANZ':
        return { backgroundColor: 'var(--purple-soft)', color: 'var(--purple)', borderColor: 'var(--purple-soft)' };
      case 'NAB':
        return { backgroundColor: 'var(--orange-soft)', color: 'var(--orange)', borderColor: 'var(--orange-soft)' };
      case 'MACQUARIE':
        return { backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#2563eb', borderColor: 'rgba(59, 130, 246, 0.25)' };
      default:
        return { backgroundColor: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--border)' };
    }
  };

  return (
    <motion.div
      whileTap={reduced ? undefined : { scale: 0.99 }}
      onClick={() => onToggle(c.folder_path)}
      className="p-3 rounded-xl border transition-all cursor-pointer select-none space-y-2 relative"
      style={{
        backgroundColor: isSelected
          ? 'var(--purple-soft)'
          : isRecommended
          ? 'var(--bg-card)'
          : 'var(--bg-panel)',
        borderColor: isSelected
          ? 'var(--purple)'
          : isRecommended
          ? 'rgba(168, 85, 247, 0.4)'
          : 'var(--border)',
        opacity: isWithdrawn ? 0.65 : 1,
      }}
      id={`case-card-${c.sequence || c.dir_name.replace(/[^a-zA-Z0-9]/g, '-')}`}
    >
      {/* 推荐高亮左侧发光微标 */}
      {isRecommended && (
        <div
          className="absolute -top-2 right-3 px-2 py-0.5 rounded-full text-[10px] font-black border flex items-center space-x-1 shadow-xs"
          style={{
            backgroundColor: 'var(--purple)',
            color: 'var(--on-purple)',
            borderColor: 'var(--purple)',
          }}
        >
          <Sparkles className="w-2.5 h-2.5" />
          <span>🌟 推荐在途主案</span>
        </div>
      )}

      {/* 顶行：复选框 + 序号 + 机构 + 状态徽标 */}
      <div className="flex items-start justify-between gap-2 pt-0.5">
        <div className="flex items-start space-x-2.5 min-w-0">
          <div className="pt-0.5 shrink-0" style={{ color: 'var(--purple)' }}>
            {isSelected ? (
              <CheckSquare className="w-4 h-4" style={{ color: 'var(--purple)' }} />
            ) : (
              <Square className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            )}
          </div>

          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {c.sequence !== undefined && (
                <span
                  className="px-1.5 py-0.5 rounded font-mono font-black text-[10px] border"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {c.sequence}.
                </span>
              )}

              {c.lender && (
                <span
                  className="px-2 py-0.5 rounded-lg border font-bold text-[11px]"
                  style={getLenderBadgeStyle(c.lender)}
                >
                  {c.lender}
                </span>
              )}

              {c.doc_type && (
                <span
                  className="px-2 py-0.5 rounded-lg font-bold text-[10px] border"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {c.doc_type}
                </span>
              )}

              {c.loan_type && (
                <span
                  className="px-2 py-0.5 rounded-lg text-[10px] font-semibold"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {c.loan_type}
                </span>
              )}

              {c.stage && (
                <span
                  className="px-2 py-0.5 rounded-lg text-[10px] font-black border flex items-center space-x-1"
                  style={{
                    backgroundColor: 'var(--green-soft)',
                    borderColor: 'rgba(5, 150, 105, 0.3)',
                    color: 'var(--green)',
                  }}
                  title={`预估阶段：${c.stage} (${c.progress_pct || 0}%)`}
                >
                  <span>🎯 {c.stage}</span>
                </span>
              )}

              {c.is_resub && (
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-bold border"
                  style={{
                    backgroundColor: 'var(--purple-soft)',
                    borderColor: 'rgba(56, 189, 248, 0.3)',
                    color: 'var(--purple)',
                  }}
                >
                  转案再递 (Resub)
                </span>
              )}
            </div>

            {/* 物业地址与子目录路径 */}
            <div className="space-y-0.5">
              {c.property_address && (
                <div className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                  📍 {c.property_address}
                </div>
              )}
              <div
                className="text-[11px] font-mono truncate flex items-center space-x-1"
                style={{ color: 'var(--text-muted)' }}
                title={c.dir_name}
              >
                <HardDrive className="w-3 h-3 shrink-0" />
                <span className="truncate">{c.dir_name}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 状态徽标 */}
        <div className="shrink-0 pt-0.5">
          {c.status === 'active' && (
            <span
              className="px-2 py-0.5 rounded-lg text-[11px] font-extrabold border flex items-center space-x-1 shadow-2xs"
              style={{
                backgroundColor: 'var(--green-soft)',
                borderColor: 'rgba(5, 150, 105, 0.3)',
                color: 'var(--green)',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-pulse" />
              <span>🟢 活跃在途</span>
            </span>
          )}

          {isOnhold && (
            <span
              className="px-2 py-0.5 rounded-lg text-[11px] font-bold border flex items-center space-x-1"
              style={{
                backgroundColor: 'var(--yellow-soft)',
                borderColor: 'rgba(217, 119, 6, 0.3)',
                color: 'var(--yellow)',
              }}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>🟡 暂停卡点</span>
            </span>
          )}

          {isSettled && (
            <span
              className="px-2 py-0.5 rounded-lg text-[11px] font-semibold border flex items-center space-x-1"
              style={{
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderColor: 'rgba(59, 130, 246, 0.25)',
                color: '#2563eb',
              }}
            >
              <Archive className="w-3 h-3" />
              <span>🔵 历史已结案</span>
            </span>
          )}

          {isWithdrawn && (
            <span
              className="px-2 py-0.5 rounded-lg text-[11px] font-semibold border flex items-center space-x-1"
              style={{
                backgroundColor: 'var(--bg-input)',
                borderColor: 'var(--border)',
                color: 'var(--text-muted)',
              }}
            >
              <XCircle className="w-3 h-3" />
              <span>⚪ 已终止/撤回</span>
            </span>
          )}

          {isLead && (
            <span
              className="px-2 py-0.5 rounded-lg text-[11px] font-semibold border flex items-center space-x-1"
              style={{
                backgroundColor: 'var(--purple-soft)',
                borderColor: 'rgba(168, 85, 247, 0.25)',
                color: 'var(--purple)',
              }}
            >
              <HelpCircle className="w-3 h-3" />
              <span>🟣 咨询潜客</span>
            </span>
          )}

          {c.status === 'submitted' && (
            <span
              className="px-2 py-0.5 rounded-lg text-[11px] font-bold border"
              style={{
                backgroundColor: 'var(--accent-soft)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            >
              📤 已递交银行
            </span>
          )}
        </div>
      </div>

      {/* 暂停原因提示 */}
      {isOnhold && c.onhold_reason && (
        <div
          className="p-2 rounded-lg border text-[11px] flex items-center space-x-1.5"
          style={{
            backgroundColor: 'var(--yellow-soft)',
            borderColor: 'rgba(217, 119, 6, 0.3)',
            color: 'var(--yellow)',
          }}
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>
            卡点原因：<strong className="font-semibold">{c.onhold_reason}</strong>
          </span>
        </div>
      )}

      {/* Broker Notes 与金额摘要 */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t text-[11px]"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center space-x-1.5 truncate">
          {c.has_broker_notes ? (
            <div className="flex items-center space-x-1 font-semibold truncate" style={{ color: 'var(--green)' }}>
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">✓ 已识别 Broker Notes</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1" style={{ color: 'var(--text-muted)' }}>
              <FileText className="w-3.5 h-3.5 shrink-0 opacity-60" />
              <span>未识别 Notes</span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2 justify-start sm:justify-end" style={{ color: 'var(--text-secondary)' }}>
          {c.prefilled?.loan_amount && (
            <span>
              拟贷: <strong className="font-bold" style={{ color: 'var(--text-primary)' }}>${c.prefilled.loan_amount}万</strong>
            </span>
          )}
          {c.prefilled?.property_value && (
            <span>
              估值: <strong className="font-bold" style={{ color: 'var(--text-primary)' }}>${c.prefilled.property_value}万</strong>
            </span>
          )}
          {c.file_count > 0 && (
            <span className="font-mono" style={{ color: 'var(--text-muted)' }}>
              ({c.file_count} 份材料)
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
