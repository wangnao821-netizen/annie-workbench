import { useState } from 'react';
import { motion } from 'motion/react';
import { UserCheck, Copy, CheckCircle, AlertCircle, MessageSquare } from 'lucide-react';
import { TaskItem } from '../../../types';
import { useTaskStore } from '../../../stores/taskStore';

interface BossDecisionDetailProps {
  task: TaskItem;
}

export function BossDecisionDetail({ task }: BossDecisionDetailProps) {
  const { bossReplyAction } = useTaskStore();
  const [decision, setDecision] = useState<'approve' | 'reject' | 'defer'>('approve');
  const [note, setNote] = useState('');

  const wechatScript = `Brandon, Zhang Fang 的 ANZ 贷款被拒了。
主要原因是自雇 ABN 只有 18 个月 (ANZ 要求满 24 个月)。

建议换 CBA，理由：
① CBA 接受 18 个月 ABN + 会计师补充信
② 客户 LVR 75%，存款充足，其他条件优异
③ CBA 目前自雇利率具竞争优势

你看换 CBA 还是尝试其他银行？`;

  const handleCopyScript = () => {
    navigator.clipboard.writeText(wechatScript);
    alert("✅ 已复制微信话术到剪贴板！");
  };

  const handleRecordReply = (e: React.FormEvent) => {
    e.preventDefault();
    bossReplyAction(task.id, {
      decision,
      note: note.trim() || undefined,
    });
  };

  return (
    <div className="space-y-6" id="boss-decision-detail">
      {/* 1. Case Rejection Summary Card */}
      <div className="rounded-2xl p-5 border space-y-4 shadow-2xs" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center space-x-2">
            <UserCheck className="w-4 h-4" style={{ color: 'var(--yellow)' }} />
            <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
              👔 待老板 (Brandon) 拍板决策
            </h3>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold" style={{ backgroundColor: 'var(--yellow-soft)', color: 'var(--yellow)' }}>
            需要 Owner 批准
          </span>
        </div>

        {/* Case Analysis details */}
        <div className="p-4 rounded-xl border space-y-2.5 text-xs" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}>
          <div className="flex items-center space-x-2 font-bold" style={{ color: 'var(--red)' }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>ANZ 拒绝了 Zhang Fang 的贷款申请</span>
          </div>

          <ul className="space-y-1.5 text-xs font-mono pl-6" style={{ color: 'var(--text-secondary)' }}>
            <li>• <strong>拒绝原因:</strong> 自雇 ABN 注册仅 18 个月 (ANZ 硬性门槛 24 个月)</li>
            <li>• <strong>贷款金额:</strong> $920,000 · LVR: 75%</li>
            <li>• <strong>年收入:</strong> $180,000 (自雇 IT 顾问)</li>
            <li style={{ color: 'var(--accent)' }}>• <strong>Vera 建议:</strong> 立即转批 CBA (接受 18 个月 ABN + 会计师验证信)</li>
          </ul>
        </div>
      </div>

      {/* 2. WeChat Copy Card */}
      <div className="rounded-2xl p-5 border space-y-4 shadow-2xs" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <MessageSquare className="w-4 h-4" style={{ color: 'var(--green)' }} />
          <h4 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
            📋 AI 拟定微信汇报话术 (一键发送老板)
          </h4>
        </div>

        <div className="p-4 rounded-xl font-mono text-xs leading-relaxed border whitespace-pre-wrap select-all" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
          {wechatScript}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2 pt-1">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleCopyScript}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer text-white shadow-xs"
            style={{ backgroundColor: 'var(--accent)' }}
            id="boss-copy-wechat-btn"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>📋 复制微信话术</span>
          </motion.button>
        </div>
      </div>

      {/* 3. Record Boss Response Card */}
      <div className="rounded-2xl p-5 border space-y-3.5 shadow-2xs" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <CheckCircle className="w-4 h-4 text-emerald-500" />
          <h4 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
            ✅ 记录老板回复
          </h4>
        </div>

        <form onSubmit={handleRecordReply} className="space-y-3 text-xs">
          <div className="space-y-1.5">
            <label className="block font-medium" style={{ color: 'var(--text-secondary)' }}>
              老板决策
            </label>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setDecision('approve')}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                  decision === 'approve'
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                    : 'border-gray-200 dark:border-gray-700 hover:opacity-80'
                }`}
              >
                同意 (转批 CBA)
              </button>
              <button
                type="button"
                onClick={() => setDecision('reject')}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                  decision === 'reject'
                    ? 'bg-red-500/10 border-red-500 text-red-600 dark:text-red-400'
                    : 'border-gray-200 dark:border-gray-700 hover:opacity-80'
                }`}
              >
                拒绝
              </button>
              <button
                type="button"
                onClick={() => setDecision('defer')}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                  decision === 'defer'
                    ? 'bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400'
                    : 'border-gray-200 dark:border-gray-700 hover:opacity-80'
                }`}
              >
                暂缓
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block font-medium" style={{ color: 'var(--text-secondary)' }}>
              回复备注
            </label>
            <textarea
              id="boss-note-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="请输入老板指示或备注..."
              className="w-full p-3 rounded-xl border bg-transparent outline-none resize-none font-mono"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          <motion.button
            whileTap={{ scale: 0.95 }}
            type="submit"
            id="boss-reply-submit-btn"
            className="px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 text-white shadow-xs"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            <span>提交老板回复</span>
          </motion.button>
        </form>
      </div>
    </div>
  );
}
