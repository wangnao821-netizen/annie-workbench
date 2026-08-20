import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  X,
  Sparkles,
  Send,
  CheckCircle2,
  Copy,
  Languages,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';
import { sendCoCreateChat } from '../../services/api/coCreate';
import { createManualDraft } from '../../services/api/drafts';
import { CoCreateDraft } from '../../types/api';

export interface CoCreateDialogProps {
  open: boolean;
  onClose: () => void;
  caseId: string | null;
  flowKey: 'followup' | 'chaser' | 'os_reply';
  sessionId?: string | null;
  clientName?: string;
  lender?: string;
  onConfirmed?: (info: {
    flow_key: string;
    subject?: string;
    body?: string;
    version?: string;
    session_id?: string | null;
  }) => void;
}

interface DraftVersion {
  version: string; // "V1", "V2", "V3"
  branch: 'A' | 'B';
  subject: string;
  body: string;
  bodyCn: string;
  message_id?: string;
  needsReview?: boolean;
  undisclosedItems?: { fact_key: string; text: string }[];
}

interface CoChatMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  time: string;
}

const FLOW_TITLES: Record<string, string> = {
  followup: '补件跟进邮件共创',
  chaser: '催件跟进共创',
  os_reply: 'OS 审贷回复共创',
};

const QUICK_INTENT_CHIPS = [
  '语气正式一点',
  '精简篇幅',
  '强调流水已核验',
  '加入评估报告说明',
  '措辞更加委婉',
];

export function CoCreateDialog({
  open,
  onClose,
  caseId,
  flowKey,
  sessionId,
  clientName = '客户',
  lender = '',
  onConfirmed,
}: CoCreateDialogProps) {
  const reduced = useReducedMotion();
  const showToast = useToastStore((s) => s.showToast);
  const [promptInput, setPromptInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCnTranslation, setShowCnTranslation] = useState(false);
  const [activeBranch, setActiveBranch] = useState<'A' | 'B'>('A');
  const [createTodo, setCreateTodo] = useState(false);

  // Co-creation Chat Messages Stream
  const [messages, setMessages] = useState<CoChatMessage[]>([]);
  // Versions chain
  const [versions, setVersions] = useState<DraftVersion[]>([]);
  const [activeVersionIdx, setActiveVersionIdx] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Helper to map backend CoCreateDraft[] to frontend DraftVersion[]
  const mapBackendDrafts = (rawDrafts: CoCreateDraft[]): DraftVersion[] => {
    return rawDrafts.map((d, i) => ({
      version: d.version || `V${i + 1}`,
      branch: (d.branch_label as 'A' | 'B') || 'A',
      subject: d.subject || '',
      body: d.body || '',
      bodyCn: '',
      message_id: d.message_id,
    }));
  };

  // Initialize dialog content on open or flowKey/caseId change
  useEffect(() => {
    if (open) {
      setCreateTodo(false);
      setShowCnTranslation(false);

      if (import.meta.env.VITE_USE_MOCK !== 'false') {
        const clientStr = clientName || '客户';
        const lenderStr = lender || '机构';
        const flowName = FLOW_TITLES[flowKey] || '共创沟通';

        // 1. Initial VERA Message with Case Panorama Summary & Clarification
        const initialVeraMsg: CoChatMessage = {
          id: `msg-${Date.now()}-0`,
          role: 'assistant',
          content: `👋 您好！已为您开启【${flowName}】专项共创子会话。\n\n📌 **案件全景摘要（全量注入）**：\n• 目标客户：${clientStr}\n• 拟申请机构：${lenderStr}\n• 案件阶段：审贷阶段 / 补件与跟进中\n• 已准备文件：PAYG 工资单、NOA 税单、近 3 个月银行流水\n\n❓ **沟通意图澄清**：\n1. 您希望重点强调哪一项补件材料？\n2. 语气需要偏向正式严谨还是礼貌催促？\n3. 是否有尚未在主系统中记录的特殊背景（如礼金信、租金稳定性说明）？`,
          time: '刚刚',
        };

        setMessages([initialVeraMsg]);

        // 2. Default Initial Draft Version (V1 Branch A)
        let initSubject = '';
        let initBody = '';
        let initBodyCn = '';

        if (flowKey === 'followup') {
          initSubject = `[${lenderStr || 'Lender'}] Outstanding Document Submission - ${clientStr}`;
          initBody = `Dear Assessment Team,\n\nRe: Home Loan Application for ${clientStr}\n\nFollowing up on our recent communication, please find attached the requested supplementary documents:\n1. Latest 2 consecutive PAYG Payslips\n2. ATO Notice of Assessment (NOA)\n3. 3-Month Main Account Bank Statements\n\nAll documents have been verified against the application details. Please confirm receipt and let us know if any further clarification is required.\n\nKind regards,\nEverstones Financial Services`;
          initBodyCn = `尊敬的审贷团队：\n\n关于 ${clientStr} 的住房贷款申请，现附上要求的补充文件：\n1. 最新连续两期 PAYG 工资单；\n2. ATO 评税通知书 (NOA)；\n3. 3 个月主账户银行流水。\n\n所有材料已核对无误。请确认查收，如需进一步说明请随时联系。\n\n此致，\nEverstones 金融服务团队`;
        } else if (flowKey === 'chaser') {
          initSubject = `[Urgent Follow-up] Application Assessment Status - ${clientStr} (${lenderStr || 'Lender'})`;
          initBody = `Dear Credit Assessor,\n\nWe are writing to politely inquire about the assessment progress for ${clientStr}.\n\nAs the finance clause deadline is approaching shortly, we would be grateful if you could provide a quick update or assist in escalating this review.\n\nThank you very much for your time and assistance.\n\nKind regards,\nEverstones Brokerage`;
          initBodyCn = `尊贵的审贷团队：\n\n我们特此礼貌跟进 ${clientStr} 贷款申请的审核进度。\n\n由于财务条款截止日期即将临近，如有可能，恳请提供最新审核状态或协助加急处理。\n\n非常感谢您的支持与协助。\n\n此致，\nEverstones 金融团队`;
        } else {
          // os_reply
          initSubject = `Re: Response to Credit Condition #1 - ${clientStr} (${lenderStr || 'Lender'})`;
          initBody = `Dear Credit Risk Officer,\n\nRegarding Condition #1 (Rental Income Verification) for ${clientStr}:\nWe have attached the executed residential lease agreement along with a 6-month bank statement verifying consistent rental credits of $2,800/month.\n\nPlease review the attached proof and update the loan status to Unconditional Approval.\n\nBest regards,\nEverstones Financial Services`;
          initBodyCn = `尊贵的风控审贷员：\n\n针对关于 ${clientStr} 租金收入核验的第 1 条审贷条件：\n我们已附上签署生效的租赁协议及 6 个月银行流水，确认每月稳定收入 $2,800。\n\n请审查附件凭证，并将贷款状态更新为无条件批复。\n\n此致，\nEverstones 金融服务团队`;
        }

        const v1: DraftVersion = {
          version: 'V1',
          branch: 'A',
          subject: initSubject,
          body: initBody,
          bodyCn: initBodyCn,
          needsReview: false,
          undisclosedItems: [],
        };

        setVersions([v1]);
        setActiveVersionIdx(0);
        setActiveBranch('A');
      } else {
        // Real Backend Initialization (action = 'clarify')
        setLoading(true);
        sendCoCreateChat({
          case_id: caseId || '',
          flow_key: flowKey,
          action: 'clarify',
          session_id: sessionId,
        })
          .then((res) => {
            const initialVeraMsg: CoChatMessage = {
              id: `msg-${Date.now()}-0`,
              role: 'assistant',
              content: res.reply || '已开启共创会话。',
              time: '刚刚',
            };
            setMessages([initialVeraMsg]);

            if (res.status === 'blocked' && res.reason) {
              showToast('error', `共创流程阻断: ${res.reason}`);
            }

            const rawDrafts: CoCreateDraft[] = res.versions && res.versions.length > 0
              ? res.versions
              : res.draft
              ? [res.draft]
              : [];

            if (rawDrafts.length > 0) {
              const mapped = mapBackendDrafts(rawDrafts);
              setVersions(mapped);
              setActiveVersionIdx(0);
              setActiveBranch(mapped[0].branch);
            } else {
              // Fallback if no draft returned yet
              const defaultVer: DraftVersion = {
                version: 'V1',
                branch: 'A',
                subject: `[${lender || 'Lender'}] Follow-up - ${clientName || 'Client'}`,
                body: '草稿生成中...',
                bodyCn: '',
              };
              setVersions([defaultVer]);
              setActiveVersionIdx(0);
              setActiveBranch('A');
            }
          })
          .catch((err: any) => {
            showToast('error', `初始化共创服务失败: ${err?.detail || err?.message || '网络异常'}`);
          })
          .finally(() => {
            setLoading(false);
          });
      }
    }
  }, [open, flowKey, caseId, clientName, lender, sessionId]);

  // Scroll messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  if (!open) return null;

  const currentVersion = versions[activeVersionIdx] || versions[0];

  // Submit user prompt to refine draft
  const handleSendPrompt = (textToSend?: string) => {
    const text = (textToSend || promptInput).trim();
    if (!text || loading) return;

    setPromptInput('');
    const userMsg: CoChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: text,
      time: '刚刚',
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      setTimeout(() => {
        const nextVerNum = versions.length + 1;
        const nextVerName = `V${nextVerNum}`;
        const isShorten = text.includes('精简') || text.includes('简短');
        const isFormal = text.includes('正式');
        const isGift = text.includes('礼金');

        let updatedBody = currentVersion?.body || '';
        let updatedBodyCn = currentVersion?.bodyCn || '';

        if (isShorten) {
          updatedBody = `Dear Assessor,\n\nRe: ${clientName} (${lender || 'Lender'}).\n\nPlease find the attached verified PAYG payslips & bank statements as requested. Kindly update application status at your earliest convenience.\n\nRegards,\nEverstones Team`;
          updatedBodyCn = `尊贵的审贷员：\n\n关于 ${clientName} (${lender || '机构'}) 的申请：\n现附上经核验的工资单与流水账单。请在方便时更新申请状态。\n\n此致，\nEverstones 团队`;
        } else if (isGift) {
          updatedBody += `\n\nNote: A signed Statutory Declaration and Statutory Gift Letter from immediate family have also been attached for equity deposit verification.`;
          updatedBodyCn += `\n\n注：同时附上了直系亲属签署的法定赠与声明书 (Gift Letter)，用于首期购房款来源核验。`;
        } else if (isFormal) {
          updatedBody = updatedBody.replace('Kind regards', 'Yours sincerely');
        } else {
          updatedBody += `\n\n[Additional Note]: ${text}`;
          updatedBodyCn += `\n\n[补充说明]: ${text}`;
        }

        const newVer: DraftVersion = {
          version: nextVerName,
          branch: activeBranch,
          subject: currentVersion?.subject || '',
          body: updatedBody,
          bodyCn: updatedBodyCn,
          needsReview: isGift,
          undisclosedItems: isGift ? [{ fact_key: 'deposit.gift_letter', text: '未在系统主表登记的亲属赠与声明' }] : [],
        };

        setVersions((prev) => [...prev, newVer]);
        setActiveVersionIdx(versions.length);

        const veraResponseMsg: CoChatMessage = {
          id: `ast-${Date.now()}`,
          role: 'assistant',
          content: `✨ 已根据您的要求（"${text}"）为您微调并生成了 **${nextVerName}** 版本草稿。\n已自动更新右侧预览区，您可以随时在顶部切换对比历史版本。`,
          time: '刚刚',
        };

        setMessages((prev) => [...prev, veraResponseMsg]);
        setLoading(false);
      }, 600);
    } else {
      // Real API Mode
      const parentMsgId = currentVersion?.message_id || null;
      const actionType = parentMsgId ? 'version' : 'generate';

      sendCoCreateChat({
        case_id: caseId || '',
        flow_key: flowKey,
        action: actionType,
        message: text,
        session_id: sessionId,
        parent_message_id: parentMsgId,
      })
        .then((res) => {
          const assistantMsg: CoChatMessage = {
            id: `ast-${Date.now()}`,
            role: 'assistant',
            content: res.reply || '草稿更新完成。',
            time: '刚刚',
          };
          setMessages((prev) => [...prev, assistantMsg]);

          const rawDrafts: CoCreateDraft[] = res.versions && res.versions.length > 0
            ? res.versions
            : res.draft
            ? [res.draft]
            : [];

          if (rawDrafts.length > 0) {
            const mapped = mapBackendDrafts(rawDrafts);
            setVersions(mapped);
            setActiveVersionIdx(mapped.length - 1);
            setActiveBranch(mapped[mapped.length - 1].branch);
          }
        })
        .catch((err: any) => {
          showToast('error', `草稿生成失败: ${err?.detail || err?.message || '未知错误'}`);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  };

  // Branch Switch
  const handleBranchSwitch = (branch: 'A' | 'B') => {
    setActiveBranch(branch);
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      if (branch === 'B' && !versions.some((v) => v.branch === 'B')) {
        const branchB: DraftVersion = {
          version: 'V1-B',
          branch: 'B',
          subject: `[Branch B Option] ${currentVersion?.subject || ''}`,
          body: `Dear Assessor,\n\nWriting on behalf of ${clientName}.\n\nWe have compiled all outstanding credit items for expedited review. Please see attached files.\n\nKind regards,\nEverstones Brokerage`,
          bodyCn: `尊贵的审贷员：\n\n代表客户 ${clientName} 致信。\n\n我们已汇总所有待核对材料以供加急审阅，请查阅附件。\n\n此致，\nEverstones 金融团队`,
          needsReview: false,
          undisclosedItems: [],
        };
        setVersions((prev) => [...prev, branchB]);
        setActiveVersionIdx(versions.length);
        showToast('success', '已生成 Branch B 备选方案分支');
      }
    } else {
      setLoading(true);
      sendCoCreateChat({
        case_id: caseId || '',
        flow_key: flowKey,
        action: 'branch',
        session_id: sessionId,
        parent_message_id: currentVersion?.message_id || null,
        branch_label: branch,
      })
        .then((res) => {
          const assistantMsg: CoChatMessage = {
            id: `ast-${Date.now()}`,
            role: 'assistant',
            content: res.reply || `已切换至 Branch ${branch} 分支。`,
            time: '刚刚',
          };
          setMessages((prev) => [...prev, assistantMsg]);

          const rawDrafts: CoCreateDraft[] = res.versions && res.versions.length > 0
            ? res.versions
            : res.draft
            ? [res.draft]
            : [];

          if (rawDrafts.length > 0) {
            const mapped = mapBackendDrafts(rawDrafts);
            setVersions(mapped);
            setActiveVersionIdx(mapped.length - 1);
          }
        })
        .catch((err: any) => {
          showToast('error', `切换分支失败: ${err?.detail || err?.message || '未知错误'}`);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  };

  // Save to Draft Box
  const handleSaveToDraftBox = () => {
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      showToast('success', `已保存至草稿箱 (${currentVersion?.version || 'V1'}，绝不直接发送)`);
      window.dispatchEvent(new CustomEvent('drafts_updated'));
      onClose();
    } else {
      setLoading(true);
      createManualDraft({
        case_id: caseId || '',
        subject: currentVersion?.subject || '',
        body: currentVersion?.body || '',
        track: flowKey,
      })
        .then(() => {
          showToast('success', '已存入草稿箱');
          window.dispatchEvent(new CustomEvent('drafts_updated'));
          onClose();
        })
        .catch((err: any) => {
          showToast('error', `保存草稿失败: ${err?.detail || err?.message || '未知错误'}`);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  };

  // Confirm Version
  const handleConfirmVersion = () => {
    onConfirmed?.({
      flow_key: flowKey,
      subject: currentVersion?.subject,
      body: currentVersion?.body,
      version: currentVersion?.version,
      session_id: sessionId,
    });
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      showToast('success', `已确认 ${currentVersion?.version || 'V1'}，写入案件历史记录并存入草稿箱`);
      window.dispatchEvent(new CustomEvent('drafts_updated'));
      onClose();
    } else {
      setLoading(true);
      sendCoCreateChat({
        case_id: caseId || '',
        flow_key: flowKey,
        action: 'confirm',
        session_id: sessionId,
        parent_message_id: currentVersion?.message_id || null,
        create_todo: createTodo,
      })
        .then(() => {
          showToast('success', `已确认 ${currentVersion?.version || '此版本'}，写入案件历史 + 草稿箱`);
          window.dispatchEvent(new CustomEvent('drafts_updated'));
          onClose();
        })
        .catch((err: any) => {
          showToast('error', `确认版本失败: ${err?.detail || err?.message || '未知错误'}`);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  };

  // Copy English Body
  const handleCopyBody = () => {
    if (currentVersion?.body) {
      navigator.clipboard.writeText(currentVersion.body);
      showToast('success', '已复制英文正文至剪贴板');
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 select-none">
        {/* Backdrop Overlay */}
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0  }}
          animate={{ opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0  }}
          onClick={onClose}
          className="absolute inset-0 bg-[var(--bg-app)]/60 backdrop-blur-xs"
          id="co-create-dialog-backdrop"
        />

        {/* Dialog Card Window */}
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10  }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10  }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-[920px] max-w-[96vw] h-[86vh] max-h-[740px] rounded-2xl border shadow-2xl bg-[var(--bg-panel)] flex flex-col overflow-hidden z-10"
          style={{ borderColor: 'var(--border)' }}
          id="co-create-dialog"
        >
          {/* Header */}
          <div className="px-5 py-3 border-b flex items-center justify-between flex-shrink-0 glass-panel" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-[var(--purple-soft)] text-[var(--purple)]">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-extrabold text-sm" style={{ color: 'var(--text-primary)' }}>
                    {FLOW_TITLES[flowKey] || '沟通共创'}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--purple-soft)] text-[var(--purple)] border border-[var(--purple-soft)]">
                    共创深谈模式
                  </span>
                </div>
                <p className="text-[11px] text-muted mt-0.5">
                  客户：{clientName} {lender ? `（${lender}）` : ''} • 离线草稿拟定，绝对安全无自动发送
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              id="co-create-dialog-close-btn"
              className="p-1.5 rounded-xl text-muted hover:text-primary hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Main Content Area: Two-Column Split Layout */}
          <div className="flex-1 flex min-h-0 divide-x" style={{ borderColor: 'var(--border)' }}>
            {/* Left Column: Dialog Stream ("和 VERA 说") */}
            <div className="w-[420px] max-w-[48%] flex flex-col min-h-0 bg-[var(--bg-subtle)] ">
              <div className="px-4 py-2 border-b text-[11px] font-bold text-muted flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                <span>和 VERA 说 (对话调优区)</span>
                <span className="text-[11px] font-mono opacity-80">Session: {sessionId ? sessionId.slice(0, 8) : 'active'}</span>
              </div>

              {/* Message Stream */}
              <div className="flex-1 p-3.5 space-y-3 overflow-y-auto no-scrollbar">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`p-3 rounded-2xl text-xs max-w-[90%] leading-relaxed ${
                        m.role === 'user' ? 'shadow-xs' : 'border'
                      }`}
                      style={
                        m.role === 'user'
                          ? { backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }
                          : { backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }
                      }
                    >
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center space-x-2 text-xs text-muted p-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
                    <span>VERA 正在思考并构思草稿...</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Intent Chips */}
              <div className="p-2 border-t flex items-center space-x-1.5 overflow-x-auto no-scrollbar" style={{ borderColor: 'var(--border)' }}>
                {QUICK_INTENT_CHIPS.map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendPrompt(chip)}
                    className="px-2.5 py-1 rounded-xl border text-[11px] font-medium whitespace-nowrap cursor-pointer transition-all hover:border-[var(--accent)] hover:text-[var(--text-primary)] flex-shrink-0"
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Left Input Box */}
              <div className="p-3 border-t glass-panel" style={{ borderColor: 'var(--border)' }}>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendPrompt();
                  }}
                  className="flex items-center space-x-2"
                >
                  <input
                    type="text"
                    value={promptInput}
                    onChange={(e) => setPromptInput(e.target.value)}
                    placeholder="告诉 Vera 如何修改草稿..."
                    className="flex-1 px-3 py-2 rounded-xl border text-xs bg-[var(--bg-input)] focus:outline-none focus:border-[var(--border-active)]"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    id="co-create-input"
                  />
                  <button
                    type="submit"
                    disabled={!promptInput.trim() || loading}
                    id="co-create-send-btn"
                    className="p-2 rounded-xl text-white disabled:opacity-40 transition-opacity cursor-pointer shadow-xs btn-primary"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </div>

            {/* Right Column: Draft Preview & Versions */}
            <div className="flex-1 flex flex-col min-h-0 bg-[var(--bg-card)]">
              {/* Top Controls: Versions, Branch & Disclosure */}
              <div className="p-3 border-b flex items-center justify-between flex-wrap gap-2 flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
                {/* Version Selector Tabs */}
                <div className="flex items-center space-x-1">
                  <span className="text-xs font-bold text-muted mr-1">版本:</span>
                  {versions.map((ver, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveVersionIdx(idx)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeVersionIdx === idx
                          ? 'bg-[var(--accent-strong)] text-[var(--on-accent-strong)] shadow-xs'
                          : 'bg-[var(--bg-input)] text-muted hover:text-primary'
                      }`}
                    >
                      {ver.version}
                    </button>
                  ))}
                </div>

                {/* Branch Switcher & Disclosure Badge */}
                <div className="flex items-center space-x-2">
                  <div className="p-0.5 rounded-lg border flex items-center bg-[var(--bg-input)]" style={{ borderColor: 'var(--border)' }}>
                    <button
                      type="button"
                      onClick={() => handleBranchSwitch('A')}
                      className={`px-2 py-0.5 rounded-md text-xs font-extrabold cursor-pointer transition-all ${
                        activeBranch === 'A' ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-bold' : 'text-muted'
                      }`}
                    >
                      Branch A
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBranchSwitch('B')}
                      className={`px-2 py-0.5 rounded-md text-xs font-extrabold cursor-pointer transition-all ${
                        activeBranch === 'B' ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-bold' : 'text-muted'
                      }`}
                    >
                      Branch B
                    </button>
                  </div>

                  {/* Disclosure Badge */}
                  {currentVersion?.needsReview ? (
                    <span className="px-2 py-1 rounded-lg bg-[var(--yellow-soft)] text-[var(--yellow)] border border-[var(--yellow-soft)] font-bold text-[11px] flex items-center space-x-1">
                      <AlertTriangle className="w-3 h-3 text-[var(--yellow)]" />
                      <span>含待审核项</span>
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded-lg bg-[var(--green-soft)] text-[var(--green)] border border-[var(--green-soft)] font-bold text-[11px] flex items-center space-x-1">
                      <CheckCircle2 className="w-3 h-3 text-[var(--green)]" />
                      <span>✅ 仅含已披露数据</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Draft Content Scroll Area */}
              <div className="flex-1 p-4 space-y-3 overflow-y-auto no-scrollbar">
                {/* Subject Line */}
                <div className="p-3 rounded-xl border space-y-1 bg-[var(--bg-input)]" style={{ borderColor: 'var(--border)' }}>
                  <label className="text-xs font-extrabold text-muted uppercase tracking-wider block">
                    邮件主题 (Subject)
                  </label>
                  <div className="font-bold text-xs" style={{ color: 'var(--text-primary)' }}>
                    {currentVersion?.subject}
                  </div>
                </div>

                {/* English Body */}
                <div className="p-3.5 rounded-xl border space-y-1 bg-[var(--bg-input)] font-mono text-xs leading-relaxed whitespace-pre-wrap select-text min-h-[200px]" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                  <div className="text-[11px] font-mono text-muted uppercase border-b pb-1 mb-2 font-sans flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                    <span>ENGLISH DRAFT BODY</span>
                    <span className="text-[11px] text-[var(--accent)] font-bold">{currentVersion?.version}</span>
                  </div>
                  {currentVersion?.body}
                </div>

                {/* Chinese Translation Panel */}
                {showCnTranslation && (
                  <motion.div
                    initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0  }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0  }}
                    className="p-3.5 rounded-xl border bg-[var(--purple-soft)] border-[var(--purple-soft)] space-y-1.5"
                  >
                    <div className="text-xs font-bold text-[var(--purple)] flex items-center space-x-1">
                      <Languages className="w-3.5 h-3.5" />
                      <span>中文参考对照 (方便阅读与核对)</span>
                    </div>
                    <div className="text-xs leading-relaxed whitespace-pre-wrap font-sans text-muted">
                      {currentVersion?.bodyCn || '暂无中文翻译对照。'}
                    </div>
                  </motion.div>
                )}

                {/* Undisclosed items alert if any */}
                {currentVersion?.needsReview && (
                  <div className="p-2.5 rounded-xl border bg-[var(--yellow-soft)] border-[var(--yellow-soft)] text-[var(--yellow)] text-xs space-y-1">
                    <div className="font-bold flex items-center space-x-1.5 text-[var(--yellow)]">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>需要人工核对的未披露信息：</span>
                    </div>
                    <ul className="list-disc list-inside text-[11px] opacity-90 pl-1">
                      {currentVersion.undisclosedItems?.map((item, i) => (
                        <li key={i}>{item.text || item.fact_key}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Bottom Action Bar */}
              <div className="p-3 border-t glass-panel flex items-center justify-between flex-shrink-0 whitespace-nowrap gap-2" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center space-x-2 flex-shrink-0 min-w-0">
                  <button
                    type="button"
                    onClick={() => setShowCnTranslation(!showCnTranslation)}
                    className="px-2.5 py-1.5 rounded-xl border text-xs font-bold cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors flex items-center space-x-1 flex-shrink-0"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    id="co-create-toggle-cn-btn"
                  >
                    <Languages className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    <span>{showCnTranslation ? '隐藏中文' : '中文对照'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyBody}
                    className="px-2.5 py-1.5 rounded-xl border text-xs font-bold cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors flex items-center space-x-1 flex-shrink-0"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    id="co-create-copy-btn"
                  >
                    <Copy className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span>复制英文</span>
                  </button>
                </div>

                <div className="flex items-center space-x-2 flex-shrink-0">
                  <label className="flex items-center space-x-1.5 text-xs text-muted cursor-pointer select-none flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={createTodo}
                      onChange={(e) => setCreateTodo(e.target.checked)}
                      className="rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--ring)] cursor-pointer"
                      id="co-create-todo-checkbox"
                    />
                    <span>同时建跟进待办</span>
                  </label>

                  <button
                    type="button"
                    title="存为草稿箱草稿"
                    onClick={handleSaveToDraftBox}
                    className="px-2.5 py-1.5 rounded-xl border text-xs font-bold cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors flex-shrink-0"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    id="co-create-save-draft-btn"
                  >
                    保存草稿
                  </button>

                  <button
                    type="button"
                    title="确认此版本并存入草稿箱与案件记录"
                    onClick={handleConfirmVersion}
                    className="px-2.5 py-1.5 rounded-xl text-xs font-extrabold text-white cursor-pointer shadow-xs hover:opacity-90 transition-opacity flex items-center space-x-1 btn-primary flex-shrink-0"
                    id="co-create-confirm-version-btn"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>确认版本</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

