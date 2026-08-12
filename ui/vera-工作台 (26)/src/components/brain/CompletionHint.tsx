import { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface CompletionHintProps {
  missingCategories: string[];
}

const CATEGORY_NAMES: Record<string, string> = {
  income: '收入',
  identity: '签证/身份',
  employment: '就业',
  liability: '负债',
  property: '房产',
  loan: '贷款',
  bank: '银行',
  stage: '阶段',
  commitment: '承诺',
  disclosure: '披露',
  special: '特殊情况',
};

export function CompletionHint({ missingCategories }: CompletionHintProps) {
  const [expanded, setExpanded] = useState(false);

  if (!missingCategories || missingCategories.length === 0) {
    return null;
  }

  const missingNames = missingCategories.map((c) => CATEGORY_NAMES[c] || c).join('、');

  return (
    <div
      className="p-2 rounded-xl border text-[11px] space-y-1.5 transition-colors"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      id="completion-hint-panel"
    >
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between text-muted cursor-pointer hover:text-primary transition-colors"
      >
        <div className="flex items-center space-x-1.5 truncate">
          <HelpCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">
            <strong className="font-semibold">补全进度：</strong>还缺 {missingNames}
          </span>
        </div>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />}
      </div>

      {expanded && (
        <div className="pt-1.5 border-t text-[10px] text-muted leading-relaxed space-y-1" style={{ borderColor: 'var(--border)' }}>
          <p>当前案件关键四要素 (收入、签证/身份、就业、负债) 尚未完全收齐。</p>
          <p className="text-[10px] opacity-80">补充后 AI 将自动提取并更新客户全景事实卡。</p>
        </div>
      )}
    </div>
  );
}
