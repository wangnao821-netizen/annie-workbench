import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ShieldAlert, Send, RotateCcw, FileText, Sparkles } from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';

interface OsDraftColumnProps {
  initialCnDraft?: string;
  initialEnDraft?: string;
  caseName?: string;
  lender?: string;
}

export function OsDraftColumn({ initialCnDraft = '', initialEnDraft = '', caseName, lender }: OsDraftColumnProps) {
  const reduced = useReducedMotion();
  const [cnDraft, setCnDraft] = useState(initialCnDraft);
  const [enDraft, setEnDraft] = useState(initialEnDraft);
  const showToast = useToastStore((s) => s.showToast);

  const handleSubmitDraft = () => {
    if (!cnDraft.trim() && !enDraft.trim()) {
      showToast('error', '草稿内容为空，无法提交');
      return;
    }
    showToast('success', '攻坚草稿已成功保存并归入案卷！');
  };

  const handleRecallDraft = () => {
    setCnDraft('');
    setEnDraft('');
    showToast('info', '已清空草稿编辑区');
  };

  const handleAiDraft = () => {
    const defaultCn = `致 ${lender || '银行'} 审件团队：\n\n关于 ${caseName || '客户'} 贷款申请的相关补件要求，已核实并附上对应支持材料，请协助安排优先复核。如有疑问请随时联系。`;
    const defaultEn = `Dear ${lender || 'Bank'} Credit Assessment Team,\n\nRe: Outstanding Conditions for ${caseName || 'Client'}.\nWe have reviewed the requirements and attached the corresponding supporting documentation. Kindly assist in prioritizing the review.\n\nKind regards,`;
    setCnDraft(defaultCn);
    setEnDraft(defaultEn);
    showToast('success', '已生成针对本案的基础双语草稿模版');
  };

  return (
    <div className="w-full xl:flex-1 xl:min-w-[380px] flex flex-col space-y-4" id="os-draft-column">
      <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2">
          <FileText className="w-4 h-4 text-[var(--green)]" />
          <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
            双语攻坚草稿
          </h3>
        </div>
        <div className="flex items-center space-x-2">
          {(!cnDraft && !enDraft) ? (
            <button
              type="button"
              onClick={handleAiDraft}
              className="px-2 py-0.5 rounded text-[11px] font-bold bg-[var(--accent-soft)] text-[var(--accent)] hover:opacity-90 cursor-pointer flex items-center space-x-1"
            >
              <Sparkles className="w-3 h-3" />
              <span>一键起草</span>
            </button>
          ) : (
            <span className="text-xs font-mono px-2 py-0.5 rounded font-bold bg-[var(--green-soft)] text-[var(--green)]">
              编辑中
            </span>
          )}
        </div>
      </div>

      {/* Integrity Guardrail Banner */}
      <div 
        className="p-2.5 rounded-xl border flex items-start space-x-2 text-xs"
        style={{ backgroundColor: 'var(--yellow-soft)', borderColor: 'var(--yellow)' }}
        id="os-draft-guardrail"
      >
        <ShieldAlert className="w-4 h-4 text-[var(--yellow)] flex-shrink-0 mt-0.5" />
        <div className="text-[11px] leading-relaxed text-[var(--yellow)]">
          <strong className="font-bold">诚信护栏提醒：</strong>
          所有『已附上/已提供』声明必须对应案件真实文件
        </div>
      </div>

      {/* Editable Drafts */}
      <div className="flex-1 space-y-3 overflow-y-auto no-scrollbar">
        {/* CN Draft */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-muted flex items-center justify-between">
            <span>【中文版草稿 (内部备忘/客户核对)】</span>
            <span className="font-mono text-[11px]">{cnDraft.length} 字</span>
          </label>
          <textarea
            value={cnDraft}
            onChange={(e) => setCnDraft(e.target.value)}
            placeholder="在此输入中文回复要点或由 AI 一键生成..."
            rows={7}
            className="w-full p-3 rounded-xl border text-xs outline-none resize-y leading-relaxed font-sans"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            id="os-draft-cn"
          />
        </div>

        {/* EN Draft */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-muted flex items-center justify-between">
            <span>【英文版回信 (致银行 Assessor / BDM)】</span>
            <span className="font-mono text-[11px]">{enDraft ? enDraft.trim().split(/\s+/).length : 0} words</span>
          </label>
          <textarea
            value={enDraft}
            onChange={(e) => setEnDraft(e.target.value)}
            placeholder="Draft English response to lender credit assessment team..."
            rows={9}
            className="w-full p-3 rounded-xl border text-xs font-mono outline-none resize-y leading-relaxed"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            id="os-draft-en"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="pt-2 border-t flex items-center space-x-2" style={{ borderColor: 'var(--border)' }}>
        <motion.button
          whileTap={reduced ? undefined : { scale: 0.95 }}
          onClick={handleSubmitDraft}
          className="flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
          id="os-draft-submit-btn"
        >
          <Send className="w-3.5 h-3.5" />
          <span>📤 提交并保存草稿</span>
        </motion.button>

        <motion.button
          whileTap={reduced ? undefined : { scale: 0.95 }}
          onClick={handleRecallDraft}
          className="px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 border cursor-pointer hover:bg-[var(--bg-subtle)]"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          id="os-draft-recall-btn"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>清空</span>
        </motion.button>
      </div>
    </div>
  );
}
