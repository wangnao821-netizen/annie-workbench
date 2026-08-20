import React, { useRef } from 'react';
import { Send, Paperclip, Loader2, Zap, Calculator, Mail, PlusCircle, FolderSearch, X } from 'lucide-react';

interface ChatInputBarProps {
  prompt: string;
  sending: boolean;
  uploadingFile: boolean;
  lastAttachedFile: { name: string; textPreview: string } | null;
  toolsMenuOpen: boolean;
  caseId: string | null;
  onPromptChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onToggleToolsMenu: () => void;
  onCloseToolsMenu: () => void;
  onSelectQuickAsk: (text: string) => void;
  onRemoveAttachedFile: () => void;
  onTriggerFileUpload: () => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenCalculator: () => void;
  onOpenCoCreate: (flowKey: 'followup' | 'chaser' | 'os_reply') => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export const ChatInputBar: React.FC<ChatInputBarProps> = ({
  prompt,
  sending,
  uploadingFile,
  lastAttachedFile,
  toolsMenuOpen,
  caseId,
  onPromptChange,
  onSubmit,
  onKeyDown,
  onToggleToolsMenu,
  onCloseToolsMenu,
  onSelectQuickAsk,
  onRemoveAttachedFile,
  onTriggerFileUpload,
  onFileUpload,
  onOpenCalculator,
  onOpenCoCreate,
  fileInputRef,
}) => {
  const quickAsks = caseId
    ? ['查一下政策', '缺什么材料？', '当前案卷下一步', '算一下借贷能力']
    : ['新建案卷', '待办催办', '查看今日概览'];

  return (
    <div className="p-3 border-t space-y-2 flex-shrink-0 relative" style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }}>
      {/* Attached file preview tag */}
      {lastAttachedFile && (
        <div className="flex items-center space-x-2 px-2.5 py-1 rounded-lg bg-[var(--bg-card-hover)] border border-[var(--border)] text-xs text-[var(--text-secondary)] w-fit">
          <Paperclip className="w-3 h-3 text-[var(--accent)]" />
          <span className="font-medium text-[var(--text-primary)] truncate max-w-[200px]">
            {lastAttachedFile.name}
          </span>
          <button
            type="button"
            onClick={onRemoveAttachedFile}
            className="hover:text-[var(--red)] cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Quick Asks Pills */}
      <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
        {quickAsks.map((q, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onSelectQuickAsk(q)}
            className="px-2.5 py-1 rounded-full border text-[11px] whitespace-nowrap hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer bg-[var(--bg-card)]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Form & Textarea */}
      <form onSubmit={onSubmit} className="flex items-center space-x-2">
        <input
          type="file"
          ref={fileInputRef}
          onChange={onFileUpload}
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt,.csv"
        />

        {/* Tools Menu Trigger Button */}
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={onToggleToolsMenu}
            title="常用工具箱"
            className="p-2 rounded-xl border text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}
          >
            <Zap className="w-4 h-4 text-[var(--purple)]" />
          </button>

          {/* Tools Menu Popup */}
          {toolsMenuOpen && (
            <div
              className="absolute left-0 bottom-12 w-52 p-1.5 rounded-2xl border bg-[var(--bg-card)] shadow-xl z-50 space-y-1 text-xs"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="px-2.5 py-1 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                信贷专业工具集
              </div>
              <button
                type="button"
                onClick={() => {
                  onOpenCalculator();
                  onCloseToolsMenu();
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg hover:bg-[var(--bg-card-hover)] text-left transition-colors cursor-pointer text-[var(--text-primary)]"
              >
                <Calculator className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>借贷能力计算器</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenCoCreate('followup');
                  onCloseToolsMenu();
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg hover:bg-[var(--bg-card-hover)] text-left transition-colors cursor-pointer text-[var(--text-primary)]"
              >
                <Mail className="w-3.5 h-3.5 text-[var(--green)]" />
                <span>协同共创邮件</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectQuickAsk('查一下客户本地文件夹拓扑与已收材料');
                  onCloseToolsMenu();
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg hover:bg-[var(--bg-card-hover)] text-left transition-colors cursor-pointer text-[var(--text-primary)]"
              >
                <FolderSearch className="w-3.5 h-3.5 text-[var(--yellow)]" />
                <span>检索案卷文件夹</span>
              </button>
            </div>
          )}
        </div>

        {/* Input Bar with Attachment Pin */}
        <div
          className="flex-1 flex items-center px-2.5 py-1.5 rounded-xl border space-x-1.5 transition-colors focus-within:border-[var(--accent)]"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <button
            type="button"
            onClick={onTriggerFileUpload}
            disabled={uploadingFile || sending}
            title="发送文件/图片给 Vera 识别"
            className="p-1 rounded-lg hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50"
          >
            {uploadingFile ? (
              <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
            ) : (
              <Paperclip className="w-4 h-4" />
            )}
          </button>

          <input
            id="brain-chat-input"
            type="text"
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSubmit(e);
              }
            }}
            placeholder={
              caseId
                ? '向 Vera AI 提问、指令或输入信贷口径数据...'
                : '向全局 AI 助手提问...'
            }
            disabled={sending}
            className="bg-transparent border-none outline-none focus:outline-none focus:ring-0 w-full text-xs select-text"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>

        {/* Send Button */}
        <button
          type="submit"
          disabled={!prompt.trim() || sending}
          className="px-3.5 py-2 rounded-xl font-semibold text-xs flex items-center space-x-1 cursor-pointer text-white shadow-xs disabled:opacity-40 hover:opacity-90 transition-all shrink-0"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          <span>发送</span>
          {sending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
        </button>
      </form>
    </div>
  );
};
