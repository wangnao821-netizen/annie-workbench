import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  ArrowLeft, 
  Send, 
  Bot, 
  User, 
  Building2, 
  FileText, 
  CheckCircle2, 
  Clock, 
  Paperclip, 
  Download, 
  AlertCircle,
  ChevronRight,
  ShieldAlert,
  Sparkles,
  Phone,
  Mail
} from 'lucide-react';
import { useWorkbenchStore } from '../store/useStore';

export const CaseDetailView: React.FC = () => {
  const { 
    selectedCaseId, 
    cases, 
    setCurrentView, 
    chatMessages, 
    sendChatMessage, 
    isSendingChat 
  } = useWorkbenchStore((s) => ({
    selectedCaseId: s.selectedCaseId,
    cases: s.cases,
    setCurrentView: s.setCurrentView,
    chatMessages: s.chatMessages,
    sendChatMessage: s.sendChatMessage,
    isSendingChat: s.isSendingChat
  }));

  const [inputVal, setInputVal] = useState('');

  const currentCase = cases.find(c => c.id === selectedCaseId) || cases[0];
  const msgs = chatMessages[currentCase.id] || chatMessages['global'] || [];

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim() || isSendingChat) return;
    const q = inputVal;
    setInputVal('');
    sendChatMessage(q, currentCase.id);
  };

  return (
    <div id="case-detail-view" className="h-full flex flex-col md:flex-row overflow-hidden bg-[var(--bg-app)]">
      {/* Left / Center Column: Dialogue & Action Log */}
      <div className="flex-1 flex flex-col h-full border-r border-[var(--border)] overflow-hidden">
        {/* Case Header */}
        <div className="p-4 border-b border-[var(--border)] bg-[var(--bg-panel)] flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center space-x-3">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setCurrentView('home')}
              className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] transition-colors"
              title="返回今日工作台"
              aria-label="返回首页"
            >
              <ArrowLeft className="w-4 h-4" />
            </motion.button>

            <div>
              <div className="flex items-center space-x-2">
                <h2 className="font-extrabold text-base text-[var(--text-primary)]">
                  {currentCase.clientName}
                </h2>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                  {currentCase.bankName}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  ${(currentCase.loanAmount / 1000).toFixed(0)}k
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                阶段：<span className="font-semibold text-[var(--accent)]">{currentCase.statusText}</span> · 最近更新：{currentCase.lastUpdated}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold border border-emerald-200">
              LTV: {currentCase.ltv || '80%'}
            </span>
          </div>
        </div>

        {/* Chat History Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4" id="chat-messages-container">
          {msgs.map((m) => {
            const isVera = m.sender === 'vera';
            return (
              <div
                key={m.id}
                className={`flex items-start space-x-2.5 ${isVera ? '' : 'flex-row-reverse space-x-reverse'}`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0 ${isVera ? 'bg-gradient-to-tr from-indigo-600 to-blue-600' : 'bg-slate-800'}`}>
                  {isVera ? <Bot className="w-4 h-4" /> : 'V'}
                </div>

                <div className={`max-w-[80%] space-y-2`}>
                  <div className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                    isVera
                      ? 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] shadow-2xs'
                      : 'bg-[var(--accent)] text-white shadow-xs'
                  }`}>
                    <div className="flex items-center justify-between text-[10px] opacity-70 mb-1">
                      <span>{isVera ? 'Vera AI 助手' : '经纪人 Vera'}</span>
                      <span>{m.timestamp}</span>
                    </div>
                    <div className="whitespace-pre-wrap font-sans">{m.content}</div>
                  </div>

                  {/* Vera Suggestions */}
                  {isVera && m.suggestions && m.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {m.suggestions.map((s, idx) => (
                        <button
                          key={idx}
                          onClick={() => sendChatMessage(s, currentCase.id)}
                          className="text-[10px] px-2 py-1 rounded-lg bg-[var(--bg-panel)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all"
                        >
                          ⚡ {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Input Area */}
        <div className="p-3 border-t border-[var(--border)] bg-[var(--bg-panel)] shrink-0">
          <form onSubmit={handleSend} className="flex items-center space-x-2">
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder={`针对 ${currentCase.clientName} 案件给 Vera 提问或发指令...`}
              className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] shadow-inner"
              aria-label="针对该案件对话"
            />
            <motion.button
              type="submit"
              whileTap={{ scale: 0.95 }}
              disabled={isSendingChat || !inputVal.trim()}
              className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-bold hover:brightness-110 disabled:opacity-50 flex items-center space-x-1.5 shrink-0 transition-all shadow-xs"
            >
              <Send className="w-3.5 h-3.5" />
              <span>发送</span>
            </motion.button>
          </form>
        </div>
      </div>

      {/* Right Column: Client 360 Panoramic View (客户全景) */}
      <div className="w-full md:w-80 border-t md:border-t-0 border-[var(--border)] bg-[var(--bg-panel)] p-4 overflow-y-auto space-y-4 shrink-0">
        <div className="flex items-center space-x-2 pb-2 border-b border-[var(--border-subtle)]">
          <User className="w-4 h-4 text-[var(--accent)]" />
          <h3 className="font-bold text-xs text-[var(--text-primary)] uppercase tracking-wider">
            客户全景 (360 View)
          </h3>
        </div>

        {/* Client Profile Summary */}
        <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[var(--text-primary)]">{currentCase.clientName}</span>
            <span className="text-[10px] text-[var(--text-muted)]">{currentCase.id}</span>
          </div>

          <div className="space-y-1 text-[11px] text-[var(--text-secondary)]">
            <div className="flex items-center space-x-2">
              <Mail className="w-3 h-3 text-[var(--text-muted)]" />
              <span>{currentCase.clientEmail || 'person_1@example.com'}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Phone className="w-3 h-3 text-[var(--text-muted)]" />
              <span>{currentCase.clientPhone || '+61 412 *** 888'}</span>
            </div>
          </div>
        </div>

        {/* Financial Metrics */}
        <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] space-y-2 text-xs">
          <div className="font-bold text-[var(--text-primary)] text-[11px] border-b border-[var(--border-subtle)] pb-1">
            贷款意向与关键结构
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <p className="text-[10px] text-[var(--text-muted)]">贷款金额</p>
              <p className="font-bold text-[var(--text-primary)]">${currentCase.loanAmount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--text-muted)]">意向银行</p>
              <p className="font-bold text-[var(--text-primary)]">{currentCase.bankName}</p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--text-muted)]">物业类型</p>
              <p className="font-medium text-[var(--text-secondary)]">{currentCase.propertyType}</p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--text-muted)]">利率类型</p>
              <p className="font-medium text-[var(--text-secondary)]">{currentCase.interestRate || '6.14% p.a.'}</p>
            </div>
          </div>
        </div>

        {/* Documents Checklist */}
        <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] space-y-2 text-xs">
          <div className="flex items-center justify-between font-bold text-[var(--text-primary)] text-[11px] border-b border-[var(--border-subtle)] pb-1">
            <span>核心材料清单 (Documents)</span>
            <span className="text-[10px] text-[var(--accent)] font-semibold">
              {currentCase.documents?.filter(d => d.status === 'verified').length || 0}/{currentCase.documents?.length || 0}
            </span>
          </div>

          <div className="space-y-1.5">
            {currentCase.documents && currentCase.documents.length > 0 ? (
              currentCase.documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between text-[11px] p-1.5 rounded-lg bg-[var(--bg-app)]">
                  <div className="flex items-center space-x-1.5 truncate">
                    <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="truncate">{doc.name}</span>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold shrink-0 ${
                    doc.status === 'verified' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {doc.status === 'verified' ? '已核验' : '待补件'}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-[10px] text-[var(--text-muted)] text-center py-2">暂无已挂载材料</p>
            )}
          </div>
        </div>

        {/* Timeline */}
        <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] space-y-2 text-xs">
          <div className="font-bold text-[var(--text-primary)] text-[11px] border-b border-[var(--border-subtle)] pb-1">
            案件跟进节点 (Timeline)
          </div>

          <div className="space-y-2 pl-1 border-l-2 border-blue-500/30">
            {currentCase.timeline?.map((item, idx) => (
              <div key={idx} className="pl-2 space-y-0.5 text-[11px]">
                <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                  <span className="font-bold text-[var(--text-primary)]">{item.title}</span>
                  <span>{item.date}</span>
                </div>
                <p className="text-[10px] text-[var(--text-secondary)]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
