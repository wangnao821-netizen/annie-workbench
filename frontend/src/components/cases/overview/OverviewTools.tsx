import { useState } from 'react';
import { Bot, Copy, Check, Sparkles } from 'lucide-react';
import { useToastStore } from '../../../stores/toastStore';
import { CaseContext } from '../../../types/api';

interface OverviewToolsProps {
  context: CaseContext;
}

export function OverviewTools({ context }: OverviewToolsProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const showToast = useToastStore((s) => s.showToast);

  const generateContextSummary = () => {
    const memoryPart = context.memory ? `【AI 记忆与上下文】\n${context.memory}\n\n` : '';
    const checklistPart = `【清单进度】\n完成度: ${context.checklist.done}/${context.checklist.total}\n缺失材料: ${context.checklist.missing.join(', ') || '无'}\n\n`;
    const osPart = `【OS 条件阻碍】\n待处理 OS 数: ${context.os.pending_count}\nOS 详细: ${context.os.items.map((i) => i.raw_text).join('; ') || '无'}\n\n`;
    const riskPart = `【风险提醒】\n${context.risk.join('; ') || '暂无风险'}`;

    return `${memoryPart}${checklistPart}${osPart}${riskPart}`;
  };

  const contextText = generateContextSummary();

  const handleCopy = () => {
    navigator.clipboard.writeText(contextText);
    setCopied(true);
    showToast('success', '已成功复制 AI 上下文文本');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-3.5 rounded-2xl border space-y-2.5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5 text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
          <Sparkles className="w-3.5 h-3.5 text-[var(--purple)]" />
          <span>AI 工具与上下文管理</span>
        </div>

        <button
          type="button"
          id="overview-ai-context-btn"
          onClick={() => setExpanded(!expanded)}
          className="px-2.5 py-1 rounded-xl border flex items-center space-x-1 cursor-pointer text-xs font-semibold hover:opacity-80 transition-opacity"
          style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--accent)' }}
        >
          <Bot className="w-3.5 h-3.5 text-[var(--purple)]" />
          <span>{expanded ? '收起上下文摘要' : '🤖 打包为 AI 上下文'}</span>
        </button>
      </div>

      {expanded && (
        <div id="overview-ai-context-preview" className="p-3 rounded-xl border bg-[var(--bg-subtle)] space-y-2 text-xs" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between text-[11px] font-medium text-muted">
            <span>预览即时生成的全景 Prompt 摘要:</span>
            <button
              type="button"
              onClick={handleCopy}
              className="px-2 py-0.5 rounded border bg-[var(--purple-soft)] text-[var(--purple)] flex items-center space-x-1 cursor-pointer font-bold hover:opacity-80"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? '已复制' : '复制全文'}</span>
            </button>
          </div>
          <pre className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap p-2 rounded bg-[var(--bg-subtle-strong)] dark:bg-[var(--bg-subtle-strong)] max-h-48 overflow-y-auto" style={{ color: 'var(--text-primary)' }}>
            {contextText}
          </pre>
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-muted pt-1">
        <span>💡 此摘要与 AI 对话注入的上下文同源</span>
        <span className="font-mono text-[11px]">// 统一端点: GET /api/cases/&#123;id&#125;/context</span>
      </div>
    </div>
  );
}
