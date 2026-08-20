import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { 
  FileCheck2, CheckCircle2, AlertTriangle, FileText, Folder,
  Play, Sparkles, ChevronDown, ChevronUp, FileSearch, HelpCircle
} from 'lucide-react';
import { DeclarationCheckResult, DeclarationFinding } from '../../types/api';
import { runDeclarationCheck, createContextEvent } from '../../services/api/cases';
import { createManualDraft } from '../../services/api/drafts';
import { useToastStore } from '../../stores/toastStore';

interface DeclarationCheckCardProps {
  caseId?: string | null;
  onCheckComplete?: (result: DeclarationCheckResult) => void;
}

const MOCK_FILES_OPTION = [
  '主申请表_ApplicationForm.pdf',
  '近3个月流水_Bank_Statement.pdf',
  '工资单_Payslips_2M.pdf',
  '身份证明_Passport_License.pdf',
];

export function DeclarationCheckCard({ caseId, onCheckComplete }: DeclarationCheckCardProps) {
  const reduced = useReducedMotion();
  const [selectedFiles, setSelectedFiles] = useState<string[]>(['主申请表_ApplicationForm.pdf', '近3个月流水_Bank_Statement.pdf']);
  const [folderPath, setFolderPath] = useState<string>('');
  const [checking, setChecking] = useState<boolean>(false);
  const [result, setResult] = useState<DeclarationCheckResult | null>(null);
  const [expandedFindings, setExpandedFindings] = useState<Record<number, boolean>>({ 0: true });

  const toggleFile = (filename: string) => {
    setSelectedFiles((prev) =>
      prev.includes(filename) ? prev.filter((f) => f !== filename) : [...prev, filename]
    );
  };

  const handleStartCheck = async () => {
    if (!caseId && import.meta.env.VITE_USE_MOCK === 'false') {
      useToastStore.getState().showToast('info', '当前模式无选择案件，采用全局离线校验');
    }

    setChecking(true);
    setResult(null);

    try {
      const payload = {
        files: selectedFiles.length > 0 ? selectedFiles : undefined,
        folder: folderPath.trim() || undefined,
      };

      const res = await runDeclarationCheck(caseId || 'MOCK_CASE', payload);
      setResult(res);

      // Record context event if caseId exists
      if (caseId) {
        try {
          await createContextEvent(caseId, {
            track: 'internal',
            source_type: 'declaration_check',
            content: `【申报一致性比对】结论: ${res.status.toUpperCase()} — ${res.summary}`,
          });
        } catch {
          // Silent catch for context event
        }
      }

      useToastStore.getState().showToast(
        res.status === 'pass' ? 'success' : res.status === 'warning' ? 'info' : 'error',
        `申报一致性检查完成 (${res.status === 'pass' ? '通过' : '发现预警'})`
      );

      if (onCheckComplete) {
        onCheckComplete(res);
      }
    } catch (err: any) {
      useToastStore.getState().showToast('error', err?.message || '申报一致性检查失败，请重试');
    } finally {
      setChecking(false);
    }
  };

  const handleDraftExplainLetter = async () => {
    const explanation = result?.draft_explanation;
    if (!explanation) {
      useToastStore.getState().showToast('info', '本次检查未生成解释信草稿，可直接在对话中让 AI 拟写');
      return;
    }
    if (!caseId) {
      useToastStore.getState().showToast('info', '请先选择案件，再生成解释信草稿');
      return;
    }
    try {
      await createManualDraft({
        case_id: caseId,
        subject: `审贷解释信草稿 (${new Date().toLocaleDateString()})`,
        body: explanation,
        track: 'external',
      });
      useToastStore.getState().showToast('success', '已生成并存入草稿箱 (只出草稿，绝不发送)');
      window.dispatchEvent(new CustomEvent('drafts_updated'));
    } catch (err: any) {
      useToastStore.getState().showToast('error', `保存草稿失败: ${err?.message || '未知错误'}`);
    }
  };

  const toggleFindingExpand = (index: number) => {
    setExpandedFindings((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const renderStatusHeader = (res: DeclarationCheckResult) => {
    switch (res.status) {
      case 'pass':
        return {
          icon: CheckCircle2,
          title: '✅ 申报信息与核验证据完全一致',
          bgColor: 'bg-[var(--green-soft)] dark:bg-[var(--green-soft)]',
          borderColor: 'border-[var(--green-soft)]',
          textColor: 'text-[var(--green)]',
          badgeText: 'PASS / 完全一致',
        };
      case 'unparseable':
        return {
          icon: HelpCircle,
          title: '🔴 部分材料格式无法解析，需人工复核',
          bgColor: 'bg-[var(--red-soft)] dark:bg-[var(--red-soft)]',
          borderColor: 'border-[var(--red-soft)]',
          textColor: 'text-[var(--red)]',
          badgeText: 'UNPARSEABLE / 无法解析',
        };
      case 'warning':
      case 'fail':
      default:
        return {
          icon: AlertTriangle,
          title: '⚠️ 发现申报错漏与流水不符预警',
          bgColor: 'bg-[var(--yellow-soft)] dark:bg-[var(--yellow-soft)]',
          borderColor: 'border-[var(--yellow-soft)]',
          textColor: 'text-[var(--yellow)] dark:text-[var(--yellow)]',
          badgeText: 'WARNING / 发现不一致',
        };
    }
  };

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="rounded-2xl p-4 border bg-[var(--bg-card)] border-[var(--border)] shadow-2xs space-y-3.5"
      id="declaration-check-card"
    >
      {/* Card Title & Icon */}
      <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-xl bg-[var(--purple-soft)] text-[var(--purple)]">
            <FileCheck2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              申报一致性交叉比对 (Declaration Check)
            </h3>
            <p className="text-[11px] text-muted">
              比对申请表申报项与银行流水/权属证明逻辑矛盾
            </p>
          </div>
        </div>
        <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-[var(--purple-soft)] text-[var(--purple)] font-bold">
          WO-20
        </span>
      </div>

      {/* Trigger & Selection Controls */}
      <div className="space-y-2.5 bg-[var(--bg-app)] p-3 rounded-xl border border-[var(--border)] text-xs">
        <div className="flex items-center justify-between font-extrabold text-primary">
          <span className="flex items-center space-x-1">
            <FileSearch className="w-3.5 h-3.5 text-[var(--purple)]" />
            <span>1. 选择需交叉比对的文件材料</span>
          </span>
          <span className="text-[11px] text-muted font-normal">或贴入本地路径</span>
        </div>

        {/* File Checkboxes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {MOCK_FILES_OPTION.map((file) => {
            const checked = selectedFiles.includes(file);
            return (
              <label
                key={file}
                onClick={() => toggleFile(file)}
                className={`p-2 rounded-lg border text-[11px] flex items-center space-x-2 cursor-pointer transition-all ${
                  checked
                    ? 'bg-[var(--bg-card)] border-[var(--purple-soft)] text-[var(--purple)] dark:text-[var(--purple)] font-bold shadow-2xs'
                    : 'bg-[var(--bg-card)] border-[var(--border)] text-muted hover:text-primary'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {}}
                  className="rounded border-[var(--border)] text-[var(--purple)] focus:ring-[var(--purple)] w-3.5 h-3.5"
                />
                <FileText className="w-3.5 h-3.5 flex-shrink-0 text-[var(--purple)]" />
                <span className="truncate">{file}</span>
              </label>
            );
          })}
        </div>

        {/* Folder Path Input */}
        <div className="pt-1 flex items-center space-x-2">
          <div className="flex-1 flex items-center px-2.5 py-1.5 rounded-lg border bg-[var(--bg-card)] border-[var(--border)] space-x-1.5 text-xs">
            <Folder className="w-3.5 h-3.5 text-muted flex-shrink-0" />
            <input
              type="text"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="贴入材料文件夹路径 (例: /Users/broker/CaseFiles/DavidZhang)"
              className="bg-transparent border-none outline-none w-full text-[11px]"
              style={{ color: 'var(--text-primary)' }}
              id="declaration-check-folder-input"
            />
          </div>
        </div>

        {/* Start Button */}
        <motion.button
          whileTap={reduced ? undefined : { scale: 0.97 }}
          onClick={handleStartCheck}
          disabled={checking}
          id="declaration-start-check-btn"
          className="w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs disabled:opacity-50 transition-opacity"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          {checking ? (
            <>
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
              <span>正在交叉检索申请表与流水证据...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>开始申报一致性比对 (Declaration Check)</span>
            </>
          )}
        </motion.button>
      </div>

      {/* Results Display */}
      {result && (
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-3 pt-1"
        >
          {/* Result Header */}
          {(() => {
            const config = renderStatusHeader(result);
            const StatusIcon = config.icon;
            return (
              <div className={`p-3 rounded-xl border space-y-1 ${config.bgColor} ${config.borderColor}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <StatusIcon className={`w-4 h-4 ${config.textColor}`} />
                    <span className={`text-xs font-extrabold ${config.textColor}`}>
                      {config.title}
                    </span>
                  </div>
                  <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${config.textColor} bg-white/20 dark:bg-[var(--bg-subtle-strong)]`}>
                    {config.badgeText}
                  </span>
                </div>
                <p className="text-[11px] font-medium text-muted leading-relaxed pl-6">
                  {result.summary}
                </p>
              </div>
            );
          })()}

          {/* Detailed Findings */}
          {result.findings && result.findings.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-extrabold text-secondary block">
                核查发现项明细 ({result.findings.length} 项)：
              </span>

              <div className="space-y-2">
                {result.findings.map((f: DeclarationFinding, index: number) => {
                  const isWarning = f.level === 'warning' || f.level === 'red';
                  const isExpanded = !!expandedFindings[index];

                  return (
                    <div
                      key={index}
                      className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden shadow-2xs"
                    >
                      <button
                        type="button"
                        onClick={() => toggleFindingExpand(index)}
                        className="w-full p-2.5 flex items-center justify-between text-xs font-bold text-left cursor-pointer hover:bg-[var(--bg-subtle)] transition-colors"
                      >
                        <div className="flex items-center space-x-2 truncate pr-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            isWarning ? 'bg-[var(--yellow)]' : 'bg-[var(--green)]'
                          }`} />
                          <span className="truncate" style={{ color: 'var(--text-primary)' }}>
                            {f.item}
                          </span>
                        </div>

                        <div className="flex items-center space-x-1.5 flex-shrink-0">
                          <span className={`text-xs font-mono px-1.5 py-0.2 rounded font-bold ${
                            isWarning ? 'bg-[var(--yellow-soft)] text-[var(--yellow)]' : 'bg-[var(--green-soft)] text-[var(--green)]'
                          }`}>
                            {f.level?.toUpperCase()}
                          </span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted" /> : <ChevronDown className="w-3.5 h-3.5 text-muted" />}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="p-2.5 pt-0 border-t border-[var(--border)] text-xs space-y-1.5 bg-[var(--bg-app)]/50">
                          <div>
                            <span className="text-xs font-bold text-muted block">冲突或核验依据 (Evidence):</span>
                            <p className="text-[11px] text-muted leading-relaxed mt-0.5">
                              {f.evidence}
                            </p>
                          </div>

                          {f.suggestion && (
                            <div className="pt-1 border-t border-black/5 dark:border-white/5">
                              <span className="text-xs font-bold text-[var(--purple)] block">
                                💡 修复建议与转案说明：
                              </span>
                              <p className="text-[11px] text-[var(--purple)] dark:text-[var(--purple)] font-medium leading-relaxed mt-0.5">
                                {f.suggestion}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bottom Action for Warnings */}
          {(result.status === 'warning' || result.status === 'fail') && (
            <div className="pt-1 flex items-center justify-end">
              <motion.button
                whileTap={reduced ? undefined : { scale: 0.96 }}
                onClick={handleDraftExplainLetter}
                id="draft-explain-letter-btn"
                className="px-3 py-1.5 rounded-xl font-bold text-xs flex items-center space-x-1.5 cursor-pointer shadow-xs"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>生成审贷解释信草稿 (Cover Letter Draft)</span>
              </motion.button>
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
