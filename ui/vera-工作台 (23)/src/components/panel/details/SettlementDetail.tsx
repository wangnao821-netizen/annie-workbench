import { useState } from 'react';
import { motion } from 'motion/react';
import { PartyPopper, CheckCircle2, Mail, Check } from 'lucide-react';
import { TaskItem } from '../../../types';

interface SettlementDetailProps {
  task: TaskItem;
}

interface SelfCheckItem {
  id: string;
  label: string;
  checked: boolean;
}

const INITIAL_CHECKLIST: SelfCheckItem[] = [
  { id: "sc-1", label: "所有 OS 条件已清除", checked: true },
  { id: "sc-2", label: "清单 12/12 全部满足", checked: true },
  { id: "sc-3", label: "客户已收到批准通知书 (Unconditional Approval)", checked: true },
  { id: "sc-4", label: "买方律师已确认 Final Settlement 结算日", checked: false },
];

export function SettlementDetail({ task }: SettlementDetailProps) {
  const [checklist, setChecklist] = useState<SelfCheckItem[]>(INITIAL_CHECKLIST);

  const toggleCheck = (id: string) => {
    setChecklist((prev) =>
      prev.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i))
    );
  };

  const handleConfirmSettlement = () => {
    alert("确认结算 → 触发：\n✅ 合规文件归档\n✅ 经验沉淀\n✅ 佣金标记实得\n✅ 案件归入档案库");
  };

  const handleNotifyClient = () => {
    alert("📧 已生成面向客户的 Unconditional Approval & Settlement 祝贺邮件草稿");
  };

  return (
    <div className="space-y-6" id="settlement-detail-view">
      {/* 1. Green Celebration Card */}
      <div 
        className="p-6 rounded-2xl border text-center space-y-3 shadow-2xs"
        style={{ 
          backgroundColor: 'var(--green-soft)', 
          borderColor: 'rgba(34,197,94,0.3)',
        }}
        id="settlement-celebration-card"
      >
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto text-2xl" style={{ backgroundColor: 'var(--bg-card)' }}>
          <PartyPopper className="w-6 h-6 stroke-[2]" style={{ color: 'var(--green)' }} />
        </div>

        <div>
          <h3 className="text-base font-extrabold" style={{ color: 'var(--green)' }}>
            🎉 案件已正式获得 Unconditional Approval 无条件批准！
          </h3>
          <p className="text-xs font-mono font-medium mt-1" style={{ color: 'var(--text-primary)' }}>
            {task.caseBank || "CBA"} · {task.loanAmount ? `$${task.loanAmount.toLocaleString()}` : "$680,000"} · 自住房贷款
          </p>
        </div>
      </div>

      {/* 2. Commission Estimate Grid */}
      <div className="rounded-2xl p-5 border space-y-3 shadow-2xs" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <h4 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
          💰 预计佣金收益 (Commission Estimate)
        </h4>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl border text-center space-y-1" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}>
            <span className="text-[11px] font-medium text-muted block">Upfront 预付佣金 (0.65%)</span>
            <span className="text-base font-bold font-mono" style={{ color: 'var(--green)' }}>
              $5,525
            </span>
          </div>

          <div className="p-3.5 rounded-xl border text-center space-y-1" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}>
            <span className="text-[11px] font-medium text-muted block">Trail 尾随佣金 (年化)</span>
            <span className="text-base font-bold font-mono" style={{ color: 'var(--accent)' }}>
              $1,275 / 年
            </span>
          </div>
        </div>
      </div>

      {/* 3. Pre-Settlement Checklist */}
      <div className="rounded-2xl p-5 border space-y-3 shadow-2xs" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <h4 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
            📋 结算前最后自查清单 (Pre-settlement Checklist)
          </h4>
          <span className="text-[11px] font-mono text-muted">
            {checklist.filter(i => i.checked).length} / {checklist.length} 已完成
          </span>
        </div>

        <div className="space-y-2">
          {checklist.map((item) => (
            <div
              key={item.id}
              onClick={() => toggleCheck(item.id)}
              className="p-3 rounded-xl border flex items-center space-x-3 cursor-pointer select-none transition-all"
              style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}
            >
              <div 
                className={`w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0 border transition-all`}
                style={{
                  backgroundColor: item.checked ? 'var(--green)' : 'var(--bg-card)',
                  borderColor: item.checked ? 'var(--green)' : 'var(--border)',
                }}
              >
                {item.checked && <Check className="w-3 h-3 text-white stroke-[3]" />}
              </div>

              <span className={`text-xs font-semibold ${item.checked ? 'line-through text-muted' : ''}`} style={{ color: item.checked ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleConfirmSettlement}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer text-white shadow-xs"
            style={{ backgroundColor: 'var(--green)' }}
            id="settlement-confirm-btn"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>✅ 确认已结算</span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleNotifyClient}
            className="px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer border"
            style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            id="settlement-notify-client-btn"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>📧 通知客户(草稿)</span>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
