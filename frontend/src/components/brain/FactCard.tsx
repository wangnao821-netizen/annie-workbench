import { useState } from 'react';
import {
  AlertTriangle, Lock, Unlock, Edit3, ShieldAlert, CheckCircle2, ChevronDown
} from 'lucide-react';
import { BrainFact } from '../../types/api';

interface FactCardProps {
  fact: BrainFact;
  categoryLabel?: string;
  onLockToggle?: (fact: BrainFact) => void;
  onDisclosureChange?: (fact: BrainFact, disclosure: 'disclosed' | 'internal_only' | null) => void;
  onAmendClick?: (fact: BrainFact) => void;
}

export const KEY_LABELS: Record<string, string> = {
  'bank.lender': '🏦 贷款银行',
  'loan.amount': '💰 拟贷金额',
  'loan.goal': '🎯 贷款目的与客户目标',
  'loan.purpose': '📌 贷款类型',
  'loan.rate': '📈 申请利率',
  'property.value': '🏠 房产评估值',
  'property.address': '📍 抵押房产地址',
  'stage.current': '🚦 当前阶段',
  'referral.source': '🤝 推荐人渠道',
  'identity.co_borrowers': '👥 联名借款人',
  'identity.status': '🪪 身份/居留',
  'employment.status': '👔 雇佣状态',
  'employment.employer': '🏢 雇主/企业名称',
  'income.annual': '💵 年收入',
  'income.payslip': '💼 工资单收入',
  'liability.credit_card': '💳 信用卡额度',
  'liability.other': '📉 其他负债',
  'special.circumstances': '⚡ 特殊情况与卡点',
  'special.circumstance': '⚡ 特殊情况与卡点',
  'contact.phone': '📞 联系电话',
  'contact.email': '📧 电子邮箱',
  'commitment.date': '📅 约定时间',
  'disclosure.undisclosed_rate': '🛡️ 敏感利率声明',
  'disclosure.note': '📝 披露说明',
};

// 格式化 Fact Value（若为 JSON 字符串则自动解析美化）
export function formatFactValue(raw: string): string {
  if (!raw) return '—';
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item)))
          .join('、');
      }
      return Object.entries(parsed)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · ');
    }
    return String(parsed);
  } catch {
    return raw;
  }
}

export function FactCard({
  fact,
  onLockToggle,
  onDisclosureChange,
  onAmendClick,
}: FactCardProps) {
  const [showDisclosureMenu, setShowDisclosureMenu] = useState(false);

  // Derive key label
  const rawKey = fact.key;
  const mappedKey = KEY_LABELS[rawKey] || (rawKey ? `📌 ${rawKey.split('.').pop()?.replace(/_/g, ' ')}` : '事实');
  const formattedValue = formatFactValue(fact.value);

  const isLocked = Boolean(fact.locked_by_user);
  const isInternal = fact.track === 'internal';

  return (
    <div
      className="p-3.5 rounded-2xl border flex flex-col justify-between space-y-2.5 relative group transition-all shadow-xs hover:shadow-sm"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      id={`fact-card-${fact.id}`}
    >
      <div className="space-y-2">
        {/* Top row: Label + Badges */}
        <div className="flex items-center justify-between text-[11px] gap-1 flex-wrap">
          <div className="flex items-center space-x-1.5 min-w-0">
            <span className="font-extrabold truncate text-xs" style={{ color: 'var(--text-primary)' }}>
              {mappedKey}
            </span>

            {/* Track Badge */}
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold border shrink-0 ${
                isInternal
                  ? 'bg-[var(--yellow-soft)] text-[var(--yellow)] border-[var(--yellow-soft)]'
                  : 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-soft)]'
              }`}
            >
              {isInternal ? '🟡 内部' : '🔵 递交'}
            </span>
          </div>

          {/* Badges on right: Conflict, Locked, Disclosure */}
          <div className="flex items-center space-x-1 flex-wrap gap-1">
            {/* Conflict Badge */}
            {fact.conflict && (
              <span className="flex items-center space-x-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[var(--yellow-soft)] text-[var(--yellow)] border border-[var(--yellow-soft)]">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>⚠️ 冲突</span>
              </span>
            )}

            {/* Locked Badge */}
            {isLocked && (
              <span
                className="flex items-center space-x-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[var(--purple-soft)] text-[var(--purple)] border border-[var(--purple-soft)] cursor-pointer hover:opacity-80"
                onClick={() => onLockToggle?.(fact)}
                title="点击进行解锁操作"
              >
                <Lock className="w-3 h-3 shrink-0" />
                <span>🔒 已锁定</span>
              </span>
            )}

            {/* Disclosure Badge */}
            {fact.disclosure === 'internal_only' && (
              <span className="flex items-center space-x-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[var(--red-soft)] text-[var(--red)] border border-[var(--red-soft)]">
                <ShieldAlert className="w-3 h-3 shrink-0" />
                <span>不能给银行看</span>
              </span>
            )}
            {fact.disclosure === 'disclosed' && (
              <span className="flex items-center space-x-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[var(--green-soft)] text-[var(--green)] border border-[var(--green-soft)]">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>可披露</span>
              </span>
            )}
          </div>
        </div>

        {/* Main Value Display */}
        <div 
          className="text-xs font-semibold leading-relaxed break-words whitespace-pre-wrap select-text p-2 rounded-xl border"
          style={{ 
            color: 'var(--text-primary)', 
            backgroundColor: 'var(--bg-subtle)',
            borderColor: 'var(--border)'
          }}
        >
          {formattedValue}
        </div>
      </div>

      {/* Hover/Action Bar */}
      <div className="pt-1.5 border-t flex items-center justify-between text-[11px] text-muted opacity-90 group-hover:opacity-100 transition-opacity" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2">
          {/* Amend Button */}
          <button
            type="button"
            onClick={() => onAmendClick?.(fact)}
            className="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-[var(--bg-subtle)] text-[var(--purple)] font-bold transition-colors cursor-pointer"
            title="修正此事实（新值替换 + supersede 审计链）"
          >
            <Edit3 className="w-3 h-3" />
            <span>修正</span>
          </button>

          {/* Lock/Unlock Toggle Button */}
          <button
            type="button"
            onClick={() => onLockToggle?.(fact)}
            className="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-[var(--bg-subtle)] text-muted hover:text-primary transition-colors cursor-pointer"
            title={isLocked ? '解锁该事实（AI 可再次覆盖）' : '锁定该事实（防止 AI 覆盖）'}
          >
            {isLocked ? <Unlock className="w-3 h-3 text-[var(--yellow)]" /> : <Lock className="w-3 h-3" />}
            <span>{isLocked ? '解锁' : '锁定'}</span>
          </button>
        </div>

        {/* Disclosure Selector Button / Popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowDisclosureMenu(!showDisclosureMenu)}
            className="flex items-center space-x-0.5 px-1.5 py-0.5 rounded border text-xs font-bold hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            title="设置披露标记"
          >
            <span>披露标记</span>
            <ChevronDown className="w-2.5 h-2.5" />
          </button>

          {showDisclosureMenu && (
            <div
              className="absolute right-0 bottom-full mb-1 z-20 w-36 p-1 rounded-xl border shadow-lg space-y-0.5 text-[11px] glass-panel"
              style={{ transformOrigin: 'bottom right', backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <button
                type="button"
                onClick={() => {
                  onDisclosureChange?.(fact, 'internal_only');
                  setShowDisclosureMenu(false);
                }}
                className={`w-full text-left px-2 py-1 rounded flex items-center justify-between font-bold cursor-pointer transition-colors ${
                  fact.disclosure === 'internal_only' ? 'bg-[var(--red-soft)] text-[var(--red)]' : 'hover:bg-[var(--bg-subtle)] text-[var(--red)]'
                }`}
              >
                <span>不能给银行看</span>
                {fact.disclosure === 'internal_only' && <span>✓</span>}
              </button>

              <button
                type="button"
                onClick={() => {
                  onDisclosureChange?.(fact, 'disclosed');
                  setShowDisclosureMenu(false);
                }}
                className={`w-full text-left px-2 py-1 rounded flex items-center justify-between font-bold cursor-pointer transition-colors ${
                  fact.disclosure === 'disclosed' ? 'bg-[var(--green-soft)] text-[var(--green)]' : 'hover:bg-[var(--bg-subtle)] text-[var(--green)]'
                }`}
              >
                <span>可披露</span>
                {fact.disclosure === 'disclosed' && <span>✓</span>}
              </button>

              <button
                type="button"
                onClick={() => {
                  onDisclosureChange?.(fact, null);
                  setShowDisclosureMenu(false);
                }}
                className={`w-full text-left px-2 py-1 rounded flex items-center justify-between cursor-pointer transition-colors ${
                  fact.disclosure === null ? 'bg-[var(--bg-subtle-strong)] font-bold' : 'hover:bg-[var(--bg-subtle)] text-muted'
                }`}
              >
                <span>清除标记</span>
                {fact.disclosure === null && <span>✓</span>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
