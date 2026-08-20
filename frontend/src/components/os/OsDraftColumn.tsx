import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ShieldAlert, Send, RotateCcw, FileText } from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';

const DEFAULT_CN_DRAFT = `尊贵的 ANZ 批复团队，

关于贵行针对 【客户姓名】 案件提出的 OS 条件 (rental income流水)，已附上 Accountant Letter 说明及 12 个月 BAS 补充材料，请协助优先复核，以便在 Finance Due 前完成条件解下。`;

const DEFAULT_EN_DRAFT = `Dear ANZ Credit Team,

Re: OS Conditions for Application 【客户姓名】.
We have provided the Accountant Letter explaining the rental income along with the 12-month BAS statements. Kindly assist in prioritizing the review prior to the Finance Due.`;

export function OsDraftColumn() {
  const reduced = useReducedMotion();
  const [cnDraft, setCnDraft] = useState(DEFAULT_CN_DRAFT);
  const [enDraft, setEnDraft] = useState(DEFAULT_EN_DRAFT);
  const showToast = useToastStore((s) => s.showToast);

  const handleSubmitDraft = () => {
    showToast('success', '草稿已成功提交并归档，进入审批排队。');
    // TODO(WO-03): POST /api/drafts/{action_id}/confirm
  };

  const handleRecallDraft = () => {
    showToast('info', '已撤回草稿修改');
    setCnDraft(DEFAULT_CN_DRAFT);
    setEnDraft(DEFAULT_EN_DRAFT);
  };

  return (
    <div className="w-full xl:w-[400px] flex-shrink-0 flex flex-col space-y-4" id="os-draft-column">
      <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2">
          <FileText className="w-4 h-4 text-[var(--green)]" />
          <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
            双语攻坚草稿
          </h3>
        </div>
        <span className="text-xs font-mono px-2 py-0.5 rounded font-bold bg-[var(--green-soft)] text-[var(--green)]">
          编辑中
        </span>
      </div>

      {/* Integrity Guardrail Banner */}
      <div 
        className="p-3 rounded-xl border flex items-start space-x-2 text-xs"
        style={{ backgroundColor: 'var(--yellow-soft)', borderColor: 'var(--yellow)' }}
        id="os-draft-guardrail"
      >
        <ShieldAlert className="w-4 h-4 text-[var(--yellow)] flex-shrink-0 mt-0.5" />
        <div className="text-[11px] leading-relaxed text-[var(--yellow)]">
          <strong className="block font-bold">诚信护栏提醒：</strong>
          所有『已附上/已提供』声明必须对应案件真实文件
        </div>
      </div>

      {/* Editable Drafts */}
      <div className="flex-1 space-y-3 overflow-y-auto no-scrollbar">
        {/* CN Draft */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-muted flex items-center justify-between">
            <span>【中文版草稿】</span>
            <span className="font-mono text-[11px]">{cnDraft.length} 字</span>
          </label>
          <textarea
            value={cnDraft}
            onChange={(e) => setCnDraft(e.target.value)}
            rows={4}
            className="w-full p-3 rounded-xl border text-xs outline-none resize-none leading-relaxed font-sans"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            id="os-draft-cn"
          />
        </div>

        {/* EN Draft */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-muted flex items-center justify-between">
            <span>【英文版草稿】</span>
            <span className="font-mono text-[11px]">{enDraft.length} words</span>
          </label>
          <textarea
            value={enDraft}
            onChange={(e) => setEnDraft(e.target.value)}
            rows={5}
            className="w-full p-3 rounded-xl border text-xs font-mono outline-none resize-none leading-relaxed"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            id="os-draft-en"
          />
        </div>
      </div>

      <p className="text-[11px] font-mono text-muted">
        TODO(WO-03): POST /api/drafts/&#123;action_id&#125;/confirm
      </p>

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
          <span>📤 提交草稿</span>
        </motion.button>

        <motion.button
          whileTap={reduced ? undefined : { scale: 0.95 }}
          onClick={handleRecallDraft}
          className="px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 border cursor-pointer"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          id="os-draft-recall-btn"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>↩️ 撤回</span>
        </motion.button>
      </div>
    </div>
  );
}
