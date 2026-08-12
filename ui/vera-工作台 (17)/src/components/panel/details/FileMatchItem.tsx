import { useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, HelpCircle, AlertTriangle, FileText, X } from 'lucide-react';
import { FileMatchResult } from '../../../types';

interface FileMatchItemProps {
  item: FileMatchResult;
  checklistOptions: string[];
  onManualMatch?: (fileId: string, checklistLabel: string) => void;
  onMarkIrrelevant?: (fileId: string) => void;
  onReclassify?: (fileId: string, newDocType: string) => void;
  onPreviewClick?: (filename: string) => void;
}

const RECLASSIFY_OPTIONS = [
  'Passport',
  'Payslip',
  'TaxReturn',
  'BankStatement',
  'ContractOfSale',
  'EmploymentLetter',
  'ValuationReport',
];

export function FileMatchItem({ 
  item, 
  checklistOptions, 
  onManualMatch, 
  onMarkIrrelevant,
  onReclassify,
  onPreviewClick
}: FileMatchItemProps) {
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [reclassifyType, setReclassifyType] = useState<string>('');

  if (item.status === 'discrepancy') {
    return (
      <div 
        className="p-3.5 rounded-2xl border space-y-2 text-xs shadow-2xs"
        style={{ 
          backgroundColor: 'var(--yellow-soft)', 
          borderColor: 'rgba(245,158,11,0.3)',
          color: 'var(--text-primary)'
        }}
        id={`file-match-item-${item.id}`}
      >
        <div className="flex items-center space-x-2 font-bold" style={{ color: 'var(--yellow)' }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0 stroke-[2.5]" />
          <span>⚠️ 字段数据交叉核对异常</span>
        </div>
        <p className="text-xs leading-relaxed font-mono pl-6" style={{ color: 'var(--text-primary)' }}>
          {item.discrepancyText || "Payslip 税后 $7,450 vs 申请表 $7,500 — 差异 $50 (需要理清是否有未申报的扣减或预提税)"}
        </p>
      </div>
    );
  }

  if (item.status === 'matched') {
    return (
      <div 
        className="p-3.5 rounded-2xl border space-y-2 text-xs shadow-2xs transition-all"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
        id={`file-match-item-${item.id}`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-2 min-w-0">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--green)' }} />
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              清单「{item.targetChecklistLabel}」已满足
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => onPreviewClick?.(item.filename)}
              className="flex items-center space-x-1.5 font-mono text-[11px] hover:underline cursor-pointer"
              style={{ color: 'var(--accent)' }}
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="font-medium">{item.filename}</span>
            </button>

            <select
              value={reclassifyType}
              onChange={(e) => {
                setReclassifyType(e.target.value);
                if (e.target.value && onReclassify) {
                  onReclassify(item.id, e.target.value);
                }
              }}
              className="px-2 py-1 rounded-lg border text-[11px] font-mono outline-none cursor-pointer bg-transparent"
              style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              id={`reclassify-select-${item.id}`}
            >
              <option value="">重新分类 ▾</option>
              {RECLASSIFY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        </div>

        {item.extractedInfo && (
          <div 
            className="p-2 rounded-xl text-[11px] font-mono leading-relaxed"
            style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-secondary)' }}
          >
            ← {item.extractedInfo}
          </div>
        )}
      </div>
    );
  }

  // Unmatched state
  return (
    <div 
      className="p-3.5 rounded-2xl border space-y-2.5 text-xs shadow-2xs"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      id={`file-match-item-${item.id}`}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center space-x-2">
          <HelpCircle className="w-4 h-4" style={{ color: 'var(--yellow)' }} />
          <button
            onClick={() => onPreviewClick?.(item.filename)}
            className="font-bold font-mono hover:underline cursor-pointer text-left"
            style={{ color: 'var(--text-primary)' }}
          >
            {item.filename} 未匹配到清单项
          </button>
        </div>

        {item.aiConfidence && (
          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--yellow-soft)', color: 'var(--yellow)' }}>
            AI 置信度: {item.aiConfidence}%
          </span>
        )}
      </div>

      {item.aiSuggestion && (
        <p className="text-[11px] pl-6" style={{ color: 'var(--text-secondary)' }}>
          AI 建议匹配: <strong style={{ color: 'var(--accent)' }}>「{item.aiSuggestion}」</strong>
        </p>
      )}

      {/* Selector & Actions */}
      <div className="flex items-center space-x-2 pt-1 pl-6 flex-wrap gap-2">
        <select
          value={selectedOption}
          onChange={(e) => {
            setSelectedOption(e.target.value);
            if (e.target.value && onManualMatch) {
              onManualMatch(item.id, e.target.value);
            }
          }}
          className="px-2.5 py-1.5 rounded-xl border text-xs bg-transparent outline-none font-medium cursor-pointer"
          style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <option value="">选择清单项 ▾</option>
          {checklistOptions.map((opt, i) => (
            <option key={i} value={opt}>{opt}</option>
          ))}
        </select>

        <select
          value={reclassifyType}
          onChange={(e) => {
            setReclassifyType(e.target.value);
            if (e.target.value && onReclassify) {
              onReclassify(item.id, e.target.value);
            }
          }}
          className="px-2.5 py-1.5 rounded-xl border text-xs bg-transparent outline-none font-medium cursor-pointer"
          style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          id={`reclassify-select-${item.id}`}
        >
          <option value="">重新分类 ▾</option>
          {RECLASSIFY_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => onMarkIrrelevant && onMarkIrrelevant(item.id)}
          className="px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center space-x-1 cursor-pointer"
          style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          <X className="w-3.5 h-3.5" />
          <span>标记为无关文件</span>
        </motion.button>
      </div>
    </div>
  );
}
