import { motion } from 'motion/react';
import { AlertTriangle, Mail, Phone, Clock, Sparkles } from 'lucide-react';
import { TaskItem } from '../../../types';

interface OverdueDetailProps {
  task: TaskItem;
}

export function OverdueDetail({ task: _task }: OverdueDetailProps) {
  const handleGenerateFollowUpEmail = () => {
    alert("📧 已生成二次催件邮件草稿（语气已加重，附带补充说明）");
  };

  const handleMarkPhoneCalled = () => {
    alert("📞 已标记为已电话联系客户，更新时间线记录");
  };

  const handleSnooze = () => {
    alert("⏭ 已设置延后 3 天再次自动提醒");
  };

  return (
    <div className="space-y-6" id="overdue-detail-view">
      {/* 1. Red Alert Card */}
      <div 
        className="p-5 rounded-2xl border space-y-3 shadow-2xs"
        style={{ 
          backgroundColor: 'var(--red-soft)', 
          borderColor: 'rgba(239,68,68,0.3)',
          color: 'var(--text-primary)'
        }}
        id="overdue-alert-card"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 font-bold" style={{ color: 'var(--red)' }}>
            <AlertTriangle className="w-4 h-4 stroke-[2.5]" />
            <h3 className="text-xs">⏰ 催件超期预警</h3>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold" style={{ backgroundColor: 'var(--red)', color: '#fff' }}>
            超期 7 天
          </span>
        </div>

        <div className="space-y-1.5 pl-6 text-xs font-mono">
          <p className="font-bold text-sm">
            缺失文件: 近 3 个月银行流水 (Bank Statements)
          </p>
          <p style={{ color: 'var(--text-secondary)' }}>
            首次催件发件日: 2026年7月31日 · 微信状态: 客户已读但未回复
          </p>
        </div>
      </div>

      {/* 2. AI Suggestions & Action Buttons */}
      <div className="rounded-2xl p-5 border space-y-4 shadow-2xs" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
          <Sparkles className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <h4 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
            🤖 AI 推荐解决方案
          </h4>
        </div>

        <div className="space-y-2.5">
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleGenerateFollowUpEmail}
            className="w-full p-3 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all"
            style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}
            id="overdue-gen-draft-btn"
          >
            <div className="flex items-center space-x-2.5 text-xs">
              <Mail className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <div>
                <span className="font-semibold block" style={{ color: 'var(--text-primary)' }}>
                  📧 生成二次催件草稿 (AI 建议语气加强)
                </span>
                <span className="text-[11px] text-muted block">
                  自动强调 Finance Due 倒计时紧迫性，支持邮件/微信一键发送
                </span>
              </div>
            </div>
            <span className="text-xs font-bold" style={{ color: 'var(--accent)' }}>生成 ➔</span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleMarkPhoneCalled}
            className="w-full p-3 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all"
            style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}
            id="overdue-phone-btn"
          >
            <div className="flex items-center space-x-2.5 text-xs">
              <Phone className="w-4 h-4" style={{ color: 'var(--green)' }} />
              <div>
                <span className="font-semibold block" style={{ color: 'var(--text-primary)' }}>
                  📞 标记为已电话催件
                </span>
                <span className="text-[11px] text-muted block">
                  填写真实电话反馈（如：客户承诺今晚补发）
                </span>
              </div>
            </div>
            <span className="text-xs font-bold" style={{ color: 'var(--green)' }}>记录 ➔</span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleSnooze}
            className="w-full p-3 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all"
            style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}
            id="overdue-snooze-btn"
          >
            <div className="flex items-center space-x-2.5 text-xs">
              <Clock className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              <div>
                <span className="font-semibold block" style={{ color: 'var(--text-primary)' }}>
                  ⏭ 延后 3 天再提醒
                </span>
                <span className="text-[11px] text-muted block">
                  客户在休假，暂时推迟该提醒
                </span>
              </div>
            </div>
            <span className="text-xs font-bold text-muted">延后 ➔</span>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
