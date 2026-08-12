import { Sparkles, CheckCircle, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';

interface ParseResultPreviewProps {
  isParsing: boolean;
  hasParsed: boolean;
  highlightedFields: string[];
}

const FIELD_NAMES: Record<string, string> = {
  incomeDescription: '年收入与职业描述',
  financeClauseDate: 'Finance Clause 截止日期',
  interestRate: '申请利率 %',
  clientGoal: '客户目标',
  specialCircumstances: '特殊情况',
};

export function ParseResultPreview({ isParsing, hasParsed, highlightedFields }: ParseResultPreviewProps) {
  if (isParsing) {
    return (
      <div id="parse-result-preview" className="p-3 rounded-xl border bg-purple-500/5 flex items-center space-x-2 text-xs text-purple-600 animate-pulse" style={{ borderColor: 'rgba(168,85,247,0.2)' }}>
        <Sparkles className="w-4 h-4 animate-spin" />
        <span className="font-medium">AI 正在深度智能解析聊天记录与文本数据...</span>
      </div>
    );
  }

  if (!hasParsed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      id="parse-result-preview"
      className="p-3.5 rounded-xl border space-y-2 text-xs"
      style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--accent)' }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5 font-bold text-purple-500">
          <Sparkles className="w-4 h-4" />
          <span>AI 解析预填完成</span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-md font-medium text-emerald-600 bg-emerald-500/10 flex items-center gap-1">
          <CheckCircle className="w-3 h-3" />
          字段已自动映射
        </span>
      </div>

      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        客户名、意向银行、贷款额、房产价值及用途已成功解析并提取填充。
      </p>

      {highlightedFields.length > 0 && (
        <div className="pt-2 border-t space-y-1.5" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center space-x-1 text-[11px] font-bold text-amber-500">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>AI 标注：低置信度字段（请手动复核）</span>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {highlightedFields.map((fieldKey) => (
              <span
                key={fieldKey}
                className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/30"
              >
                {FIELD_NAMES[fieldKey] || fieldKey}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] font-mono italic" style={{ color: 'var(--text-muted)' }}>
        * TODO(WO-03): 真实解析由后端 createCase raw_text 完成，此处为前端预填交互
      </p>
    </motion.div>
  );
}
