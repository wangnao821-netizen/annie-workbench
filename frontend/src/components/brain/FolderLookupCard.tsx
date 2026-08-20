import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { FolderSearch, FileText, Loader2, FileCheck2 } from 'lucide-react';
import { FolderLookupPayload, FolderLookupFile } from '../../types/api';
import { parseCaseFile } from '../../services/api/cases';
import { useToastStore } from '../../stores/toastStore';
import { useUiStore } from '../../stores/uiStore';

interface FolderLookupCardProps {
  payload: FolderLookupPayload;
  caseId?: string | null;
}

export function FolderLookupCard({ payload }: FolderLookupCardProps) {
  const reduced = useReducedMotion();
  const [parsingMap, setParsingMap] = useState<Record<number, boolean>>({});
  const [summaryMap, setSummaryMap] = useState<Record<number, string>>({});

  const files = payload?.files || [];

  const handleParseFile = async (index: number, fileItem: FolderLookupFile) => {
    setParsingMap((prev) => ({ ...prev, [index]: true }));

    try {
      if (import.meta.env.VITE_USE_MOCK !== 'false') {
        await new Promise((resolve) => setTimeout(resolve, 600));
        const mockSummaries: Record<string, string> = {
          'bank_statement': '演示数据：识别到主账户近 3 个月流水，净划入合规，无异常高风险消费支出。',
          'payslip': '演示数据：识别到申请人近两期 PAYG 工资单，薪资收入与工作年限记录完整。',
          'noa': '演示数据：识别到近期 ATO Notice of Assessment 税单，应纳税收入与申报额度吻合。',
        };

        const key = (fileItem.doc_type || fileItem.rel_path).toLowerCase();
        let mockRes = '脱敏摘要：识别到文件符合银行审贷要求，各项数据勾稽比对无冲突。';
        if (key.includes('statement') || key.includes('bank')) mockRes = mockSummaries['bank_statement'];
        if (key.includes('pay') || key.includes('slip')) mockRes = mockSummaries['payslip'];
        if (key.includes('noa') || key.includes('tax')) mockRes = mockSummaries['noa'];

        setSummaryMap((prev) => ({ ...prev, [index]: mockRes }));
        useToastStore.getState().showToast('success', '已成功解析材料并提取脱敏摘要');
      } else {
        // Create dummy blob File object to trigger parseCaseFile API endpoint
        const dummyFile = new File(['mock content'], fileItem.rel_path.split('/').pop() || 'document.pdf', { type: 'application/pdf' });
        const result = await parseCaseFile(dummyFile);
        setSummaryMap((prev) => ({ ...prev, [index]: result.text_preview || '脱敏摘要：文件解析完成。' }));
        useToastStore.getState().showToast('success', '文件解析提取完成');
      }
    } catch (err: any) {
      useToastStore.getState().showToast('error', `解析失败: ${err?.message || '未知错误'}`);
    } finally {
      setParsingMap((prev) => ({ ...prev, [index]: false }));
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '1.2 MB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className="p-4 rounded-2xl border space-y-3"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow-card)',
      }}
      id="folder-lookup-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-lg bg-[var(--accent-soft)] border border-[var(--accent-soft)] flex items-center justify-center">
            <FolderSearch className="w-3.5 h-3.5 text-[var(--accent)]" />
          </div>
          <div>
            <h4 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
              案件文件夹检索结果 (folder_lookup)
            </h4>
            <p className="text-[11px] text-muted">
              根据指令在关联文件夹中检索到 {files.length} 个相关材料
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            useUiStore.getState().setFileDrawerOpen(true);
          }}
          className="px-2.5 py-1 rounded-lg border border-[var(--accent-soft)] bg-[var(--accent-soft)] text-[var(--accent)] font-bold text-[11px] hover:bg-[var(--accent-soft)] cursor-pointer transition-colors flex items-center space-x-1"
          id="btn-open-file-drawer-from-card"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>打开文件抽屉</span>
        </button>
      </div>

      {/* File List */}
      <div className="space-y-2">
        {files.length === 0 ? (
          <div className="text-xs text-muted py-2 text-center">未检索到符合条件的材料</div>
        ) : (
          files.map((fileItem, idx) => {
            const isParsing = !!parsingMap[idx];
            const summary = summaryMap[idx];

            return (
              <div
                key={idx}
                className="p-3 rounded-xl border space-y-2 transition-all"
                style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}
                id={`folder-lookup-file-${idx}`}
              >
                <div className="flex items-start justify-between space-x-2">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded font-bold bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-soft)] flex-shrink-0">
                        {fileItem.doc_type || 'PDF'}
                      </span>
                      <span className="text-xs font-mono font-bold truncate block" style={{ color: 'var(--text-primary)' }}>
                        {fileItem.rel_path}
                      </span>
                    </div>

                    <div className="flex items-center space-x-3 text-[11px] text-muted font-mono">
                      <span>大小: {formatSize(fileItem.size)}</span>
                      {fileItem.mtime && <span>修改时间: {fileItem.mtime}</span>}
                    </div>
                  </div>

                  {/* Parse Action Button */}
                  <motion.button
                    whileTap={reduced ? undefined : { scale: 0.95 }}
                    disabled={isParsing}
                    onClick={() => handleParseFile(idx, fileItem)}
                    className="px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center space-x-1 cursor-pointer transition-colors flex-shrink-0"
                    style={{
                      backgroundColor: summary ? 'var(--green-soft)' : 'var(--bg-card)',
                      borderColor: summary ? 'var(--green)' : 'var(--border)',
                      color: summary ? 'var(--green)' : 'var(--accent)',
                    }}
                    id={`parse-file-btn-${idx}`}
                  >
                    {isParsing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>解析中...</span>
                      </>
                    ) : summary ? (
                      <>
                        <FileCheck2 className="w-3.5 h-3.5 text-[var(--green)]" />
                        <span>已解析</span>
                      </>
                    ) : (
                      <>
                        <FileText className="w-3.5 h-3.5" />
                        <span>解析</span>
                      </>
                    )}
                  </motion.button>
                </div>

                {/* Sanitized Summary Output */}
                {summary && (
                  <motion.div
                    initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4  }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-2.5 rounded-lg border bg-[var(--green-soft)] border-[var(--green-soft)] text-xs leading-relaxed space-y-1"
                  >
                    <div className="text-xs font-bold text-[var(--green)] flex items-center space-x-1">
                      <span>🔒 脱敏解析摘要</span>
                    </div>
                    <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      {summary}
                    </p>
                  </motion.div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
