import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Mail, Sparkles, Send, Check } from 'lucide-react';
import { useWorkbenchStore } from '../store/useStore';

export const EmailComposeModal: React.FC = () => {
  const { isEmailComposeOpen, setEmailComposeOpen, cases } = useWorkbenchStore((s) => ({
    isEmailComposeOpen: s.isEmailComposeOpen,
    setEmailComposeOpen: s.setEmailComposeOpen,
    cases: s.cases
  }));

  const [recipient, setRecipient] = useState('person_1@example.com');
  const [subject, setSubject] = useState('【重要提示】请尽快提交 CBA 贷款补件凭证 (HECS Statement)');
  const [body, setBody] = useState(
`尊敬的 PERSON_1：

您好！我是您的贷款经纪人 Vera。

关于您在 CBA 申请的 $850,000 房屋贷款案件，银行审批员目前已完成大部分评估，但需要您补充提交一份【HECS 贷款结清凭证与最近流水】。

此文件为 Formal Approval 的必备要件。请您在今天内回复此邮件或直接上传至客户端。如有任何疑问，请随时与我联系！

顺祝商祺，
Vera Workbench Team`
  );
  const [sentSuccess, setSentSuccess] = useState(false);

  if (!isEmailComposeOpen) return null;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    setSentSuccess(true);
    setTimeout(() => {
      setSentSuccess(false);
      setEmailComposeOpen(false);
    }, 1500);
  };

  const generateAiDraft = () => {
    setSubject('【Vera 提醒】本周六房产拍卖预批注意事项');
    setBody(
`尊敬的 Sarah Zhang：

您好！祝贺您的 Westpac 预批信正式生效！

针对本周六您计划参加的房产拍卖，请注意：
1. 拍卖叫价切勿超出最高预批上限 $1.2M；
2. 确认 10% 首付支票或 Bank Cheque 已准备妥当；
3. 竞拍成功后请第一时间联系我锁死 Valuation。

预祝周六竞拍顺利！

Vera Mortgage Broker`
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-xl bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-[var(--shadow-overlay)] overflow-hidden"
      >
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg-app)]">
          <div className="flex items-center space-x-2">
            <Mail className="w-5 h-5 text-blue-600" />
            <h2 className="text-sm font-bold text-[var(--text-primary)]">快捷撰写邮件 (Draft Email)</h2>
          </div>
          <button
            onClick={() => setEmailComposeOpen(false)}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {sentSuccess ? (
          <div className="p-8 text-center space-y-2 text-emerald-600">
            <Check className="w-12 h-12 mx-auto animate-bounce" />
            <p className="font-extrabold text-sm">邮件已发送成功！</p>
          </div>
        ) : (
          <form onSubmit={handleSend} className="p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-bold text-[var(--text-primary)]">
                收件人邮箱 (Recipient)
              </label>
              <button
                type="button"
                onClick={generateAiDraft}
                className="text-[10px] text-indigo-600 hover:underline font-bold flex items-center space-x-1"
              >
                <Sparkles className="w-3 h-3" />
                <span>生成 Sarah Zhang 预批通知草稿</span>
              </button>
            </div>

            <input
              type="text"
              required
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] text-[var(--text-primary)]"
            />

            <div>
              <label className="block text-[11px] font-bold text-[var(--text-primary)] mb-1">
                邮件主题 (Subject)
              </label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] text-[var(--text-primary)] font-semibold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[var(--text-primary)] mb-1">
                正文内容 (Body)
              </label>
              <textarea
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] text-[var(--text-primary)] font-sans"
              />
            </div>

            <div className="pt-2 flex justify-end space-x-2 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setEmailComposeOpen(false)}
                className="px-4 py-2 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] font-semibold"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-xs flex items-center space-x-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>立即发送</span>
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
};
