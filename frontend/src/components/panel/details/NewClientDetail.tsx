import { motion, useReducedMotion } from 'motion/react';
import { Mail, Sparkles, UserPlus, Link2, VolumeX } from 'lucide-react';
import { TaskItem } from '../../../types';

interface NewClientDetailProps {
  task: TaskItem;
}

export function NewClientDetail({ task: _task }: NewClientDetailProps) {
  const reduced = useReducedMotion();
  const handleAction = (type: string) => {
    switch (type) {
      case 'create':
        alert("🆕 已为客户 Tom Xu 创建全新按揭贷款案件 CASE-2026-0810 并归入跟进队列");
        break;
      case 'link':
        alert("🔗 请选择已有案件进行归并匹配");
        break;
      case 'ignore':
        alert("🔇 已忽略该新客户询盘邮件");
        break;
    }
  };

  return (
    <div className="space-y-6" id="new-client-detail">
      {/* 1. New Client Email Preview */}
      <div className="rounded-2xl p-5 border space-y-3 shadow-2xs" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between pb-3 border-b text-xs" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center space-x-2">
            <Mail className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              From: tom.xu@gmail.com
            </span>
            <span style={{ color: 'var(--text-muted)' }}>· 28 分钟前</span>
          </div>
          <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}>
            未归档新邮件
          </span>
        </div>

        <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          Loan Enquiry — Investment Property Purchase in Sydney
        </h3>

        <div className="p-4 rounded-xl text-xs leading-relaxed font-mono border space-y-2" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
          <p>Hi Vera & Broker Team,</p>
          <p>
            I am looking to buy an investment property in Epping (approx $950,000). 
            My wife and I hold Permanent Residency (PR). I work as a Senior Consultant at PwC with annual base package $165,000.
          </p>
          <p>
            We want to borrow around $760,000 (80% LVR). Could you help calculate our borrowing capacity and recommend best bank options?
          </p>
        </div>
      </div>

      {/* 2. AI Extracted Fields Grid (8 Fields) */}
      <div className="rounded-2xl p-5 border space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4" style={{ color: 'var(--purple)' }} />
            <h4 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
              🤖 Vera AI 结构化字段自动提取
            </h4>
          </div>
          <span className="text-[11px] font-mono" style={{ color: 'var(--green)' }}>
            提取置信度: 98.4%
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="p-2.5 rounded-xl border space-y-1" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>客户名</span>
            <span className="font-bold block" style={{ color: 'var(--text-primary)' }}>Tom Xu</span>
          </div>

          <div className="p-2.5 rounded-xl border space-y-1" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>拟购房价</span>
            <span className="font-bold font-mono block" style={{ color: 'var(--text-primary)' }}>$950,000</span>
          </div>

          <div className="p-2.5 rounded-xl border space-y-1" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>拟申请贷款额</span>
            <span className="font-bold font-mono block" style={{ color: 'var(--accent)' }}>$760,000</span>
          </div>

          <div className="p-2.5 rounded-xl border space-y-1" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>估算 LVR</span>
            <span className="font-bold font-mono block" style={{ color: 'var(--green)' }}>80%</span>
          </div>

          <div className="p-2.5 rounded-xl border space-y-1" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>职业/雇主</span>
            <span className="font-bold block truncate" style={{ color: 'var(--text-primary)' }}>PwC Senior</span>
          </div>

          <div className="p-2.5 rounded-xl border space-y-1" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>年收入</span>
            <span className="font-bold font-mono block" style={{ color: 'var(--text-primary)' }}>$165,000/yr</span>
          </div>

          <div className="p-2.5 rounded-xl border space-y-1" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>澳洲身份</span>
            <span className="font-bold block" style={{ color: 'var(--green)' }}>永居 (PR)</span>
          </div>

          <div className="p-2.5 rounded-xl border space-y-1" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>购房用途</span>
            <span className="font-bold block" style={{ color: 'var(--text-primary)' }}>投资房 (INV)</span>
          </div>
        </div>
      </div>

      {/* 3. Action Buttons */}
      <div className="rounded-2xl p-4 border space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-1.5 text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
          <span>🚀 新客户建案决策</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <motion.button
            whileTap={reduced ? undefined : { scale: 0.95 }}
            onClick={() => handleAction('create')}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 cursor-pointer text-white shadow-xs"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <UserPlus className="w-4 h-4 stroke-[2]" />
            <span>🆕 建案并归入</span>
          </motion.button>

          <motion.button
            whileTap={reduced ? undefined : { scale: 0.95 }}
            onClick={() => handleAction('link')}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 cursor-pointer border"
            style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <Link2 className="w-4 h-4 stroke-[2]" />
            <span>🔗 关联已有案件</span>
          </motion.button>

          <motion.button
            whileTap={reduced ? undefined : { scale: 0.95 }}
            onClick={() => handleAction('ignore')}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 cursor-pointer border"
            style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            <VolumeX className="w-4 h-4 stroke-[2]" />
            <span>🔇 忽略</span>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
