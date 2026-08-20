import { motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  TrendingUp,
  Percent,
  HeartHandshake,
  Copy,
  MessageSquare,
  Landmark,
  MapPin,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { RetentionOpportunityItem } from '../../types/api';
import { useToastStore } from '../../stores/toastStore';

interface RetentionOpportunityCardProps {
  item: RetentionOpportunityItem;
  onContact: (item: RetentionOpportunityItem) => void;
}

export function RetentionOpportunityCard({ item, onContact }: RetentionOpportunityCardProps) {
  const reduced = useReducedMotion();
  const showToast = useToastStore((s) => s.showToast);

  const getLevelConfig = () => {
    switch (item.level) {
      case 'red':
        return {
          icon: AlertCircle,
          badgeBg: 'var(--red-soft, rgba(239, 68, 68, 0.12))',
          badgeBorder: 'var(--red, #ef4444)',
          badgeColor: 'var(--red, #ef4444)',
          levelLabel: '固定利率临期预警',
          highlightBorder: 'rgba(239, 68, 68, 0.4)',
        };
      case 'yellow':
        return {
          icon: Percent,
          badgeBg: 'var(--amber-soft, rgba(245, 158, 11, 0.12))',
          badgeBorder: 'var(--amber, #f59e0b)',
          badgeColor: 'var(--amber, #f59e0b)',
          levelLabel: '满年降息体检',
          highlightBorder: 'rgba(245, 158, 11, 0.4)',
        };
      case 'green':
        return {
          icon: TrendingUp,
          badgeBg: 'var(--green-soft, rgba(34, 197, 94, 0.12))',
          badgeBorder: 'var(--green, #22c55e)',
          badgeColor: 'var(--green, #22c55e)',
          levelLabel: '增值套现/再置业',
          highlightBorder: 'rgba(34, 197, 94, 0.4)',
        };
      case 'blue':
      default:
        return {
          icon: HeartHandshake,
          badgeBg: 'var(--accent-soft)',
          badgeBorder: 'var(--accent)',
          badgeColor: 'var(--accent)',
          levelLabel: '放款关怀与账单核对',
          highlightBorder: 'var(--accent)',
        };
    }
  };

  const config = getLevelConfig();
  const IconComponent = config.icon;

  const handleCopyDraft = (e: React.MouseEvent) => {
    e.stopPropagation();
    const draftText =
      item.draft_template ||
      `【${item.title}】针对客户 ${item.client_name}（${item.lender || '银行'} $${(
        item.loan_amount || 0
      ).toLocaleString()}）：${item.action_suggest}`;

    navigator.clipboard
      ?.writeText(draftText)
      .then(() => {
        showToast('success', '已成功复制跟进话术建议至剪贴板！');
      })
      .catch(() => {
        showToast('error', '复制失败，请手动选择复制');
      });
  };

  const formattedAmount =
    item.loan_amount && item.loan_amount > 0
      ? item.loan_amount >= 10000
        ? `$${(item.loan_amount / 10000).toFixed(0)}万`
        : `$${item.loan_amount.toLocaleString()}`
      : '$0';

  return (
    <motion.div
      whileTap={reduced ? undefined : { scale: 0.995 }}
      className="p-4 sm:p-5 rounded-2xl border transition-all space-y-3.5"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow-card)',
      }}
      id={`retention-card-${item.case_id}`}
    >
      {/* 头部信息 */}
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4
              className="text-sm font-extrabold tracking-tight truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {item.client_name}
            </h4>

            {/* 商机级别胶囊标签 */}
            <span
              className="px-2.5 py-0.5 rounded-full text-[11px] font-bold border flex items-center space-x-1"
              style={{
                backgroundColor: config.badgeBg,
                borderColor: config.badgeBorder,
                color: config.badgeColor,
              }}
            >
              <IconComponent className="w-3 h-3 shrink-0" />
              <span>{config.levelLabel}</span>
            </span>

            <span className="text-[11px] font-mono text-muted px-1.5 py-0.5 rounded bg-[var(--bg-subtle)]">
              {item.case_id}
            </span>
          </div>

          {/* 房产地址 */}
          {item.property_address && (
            <p
              className="text-xs font-medium flex items-center space-x-1 truncate"
              style={{ color: 'var(--text-secondary)' }}
            >
              <MapPin className="w-3 h-3 shrink-0 text-[var(--accent)]" />
              <span className="truncate">{item.property_address}</span>
            </p>
          )}

          {/* 贷款事实 */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono text-muted">
            <span className="flex items-center space-x-1 font-semibold text-primary">
              <Landmark className="w-3 h-3 text-[var(--accent)]" />
              <span>{item.lender || '银行'}</span>
              <span>{formattedAmount}</span>
            </span>

            {item.interest_rate && (
              <>
                <span>•</span>
                <span className="flex items-center space-x-1 text-[var(--text-secondary)] font-medium">
                  <Percent className="w-3 h-3" />
                  <span>获批利率: {item.interest_rate}</span>
                </span>
              </>
            )}

            {item.settlement_date && (
              <>
                <span>•</span>
                <span className="flex items-center space-x-1">
                  <Calendar className="w-3 h-3" />
                  <span>交割: {item.settlement_date}</span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* 关键行动按钮组 */}
        <div className="flex items-center space-x-2 shrink-0">
          <motion.button
            type="button"
            whileTap={reduced ? undefined : { scale: 0.96 }}
            onClick={handleCopyDraft}
            className="px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 cursor-pointer transition-colors hover:opacity-90 shadow-2xs"
            style={{
              backgroundColor: 'var(--bg-panel)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
            title="复制专属跟进建议话术"
            id={`copy-draft-btn-${item.case_id}`}
          >
            <Copy className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span className="hidden sm:inline">复制建议草稿</span>
            <span className="sm:hidden">复制</span>
          </motion.button>

          <motion.button
            type="button"
            whileTap={reduced ? undefined : { scale: 0.96 }}
            onClick={() => onContact(item)}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-xs transition-all hover:opacity-90"
            style={{
              backgroundColor: config.badgeColor,
              color: '#ffffff',
            }}
            id={`contact-client-btn-${item.case_id}`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>一键联系问候</span>
          </motion.button>
        </div>
      </div>

      {/* 商机核心建议卡片 */}
      <div
        className="p-3 rounded-xl border flex items-start space-x-2.5 text-xs"
        style={{
          backgroundColor: 'var(--bg-subtle)',
          borderColor: 'var(--border)',
        }}
      >
        <Sparkles className="w-4 h-4 shrink-0 mt-0.5" style={{ color: config.badgeColor }} />
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center space-x-2 font-bold" style={{ color: 'var(--text-primary)' }}>
            <span>{item.title}</span>
            <span
              className="px-2 py-0.2 rounded-full text-[10px] font-mono font-medium"
              style={{
                backgroundColor: config.badgeBg,
                color: config.badgeColor,
              }}
            >
              {item.level === 'red' ? `剩余 ${item.days_relevant} 天` : `已满 ${item.days_relevant} 天`}
            </span>
          </div>
          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {item.action_suggest}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
