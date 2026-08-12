import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Send, History, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useDraftStore } from '../../stores/draftStore';

interface DraftEditorProps {
  actionId: number;
}

export function DraftEditor({ actionId }: DraftEditorProps) {
  const {
    draft,
    versions,
    loading,
    error,
    fetchDraft,
    refineDraft,
    confirmDraft,
    rollbackDraft,
    reset,
  } = useDraftStore();

  const [instruction, setInstruction] = useState('');

  useEffect(() => {
    fetchDraft(actionId);
    return () => {
      reset();
    };
  }, [actionId, fetchDraft, reset]);

  const handleRefine = () => {
    if (!instruction.trim()) return;
    refineDraft(actionId, instruction);
    setInstruction('');
  };

  if (loading && !draft) {
    return (
      <div className="p-4 rounded-2xl border animate-pulse space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="h-4 rounded w-1/3 bg-slate-200 dark:bg-slate-700" />
        <div className="h-16 rounded bg-slate-200 dark:bg-slate-700" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-500 space-y-3">
        <div className="flex items-center space-x-2 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
        <button
          onClick={() => fetchDraft(actionId)}
          className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-xs font-medium flex items-center space-x-1 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>重试</span>
        </button>
      </div>
    );
  }

  if (!draft) return null;

  return (
    <div className="rounded-2xl p-5 border space-y-4 shadow-2xs" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }} id="draft-editor">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-purple-500" />
          <h4 className="text-xs font-extrabold" style={{ color: 'var(--text-primary)' }}>
            📝 AI 建议草稿 (版本 v{draft.version})
          </h4>
        </div>
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
            draft.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-purple-500/10 text-purple-500'
          }`}
        >
          {draft.status === 'confirmed' ? '已确认' : '草稿生成'}
        </span>
      </div>

      {/* Subject */}
      <div className="space-y-1 text-xs">
        <span className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>主题:</span>
        <div className="p-2.5 rounded-xl border font-bold text-xs" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
          {draft.subject}
        </div>
      </div>

      {/* Bilingual Content */}
      <div className="space-y-2 text-xs">
        <span className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>双语正文:</span>
        <div className="p-3.5 rounded-xl border text-xs leading-relaxed font-mono whitespace-pre-wrap space-y-3" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
          <div>
            <div className="text-[10px] font-sans font-bold text-blue-500 pb-1">=== 中文 (Chinese) ===</div>
            <p>{draft.body_zh}</p>
          </div>
          <div>
            <div className="text-[10px] font-sans font-bold text-purple-500 pb-1">=== English ===</div>
            <p>{draft.body_en}</p>
          </div>
        </div>
      </div>

      {/* AI Refine Bar */}
      <div className="flex items-center space-x-2 pt-1">
        <input
          id="draft-refine-input"
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
          placeholder="给 AI 提示词（例如：'语气更客气一点'）..."
          className="flex-1 px-3 py-2 rounded-xl border text-xs bg-transparent outline-none"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
        <motion.button
          whileTap={{ scale: 0.95 }}
          id="draft-refine-btn"
          onClick={handleRefine}
          className="px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1 cursor-pointer border hover:opacity-80"
          style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--purple)' }}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>💬 AI 修正</span>
        </motion.button>
      </div>

      {/* Main Actions Row */}
      <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <motion.button
          whileTap={{ scale: 0.95 }}
          id="draft-confirm-btn"
          onClick={() => confirmDraft(actionId)}
          className="px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer text-white shadow-xs"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {draft.status === 'confirmed' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
          <span>{draft.status === 'confirmed' ? '已确认发送' : '📤 确认发送'}</span>
        </motion.button>

        {/* Version History Chips */}
        {versions.length > 0 && (
          <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar">
            <History className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>版本:</span>
            {versions.map((v) => (
              <button
                key={v.version}
                id={`draft-version-${v.version}`}
                onClick={() => rollbackDraft(actionId, v.version)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-mono cursor-pointer border transition-colors ${
                  v.version === draft.version ? 'font-bold border-purple-500 bg-purple-500/10 text-purple-500' : 'hover:opacity-80'
                }`}
                style={v.version !== draft.version ? { backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-secondary)' } : {}}
              >
                v{v.version}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
