import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { 
  FileText, Plus, Lock, Globe, Trash2, Edit3,
  Clock, Sparkles, RefreshCw
} from 'lucide-react';
import { useToastStore } from '../../../stores/toastStore';
import { useUiStore } from '../../../stores/uiStore';
import { 
  getKnowledge, 
  createKnowledge, 
  updateKnowledge, 
  deleteKnowledge, 
  KnowledgeEntry 
} from '../../../services/api/knowledge';

interface CaseNotesDeckProps {
  caseId: string;
}

export function CaseNotesDeck({ caseId }: CaseNotesDeckProps) {
  const reduced = useReducedMotion();
  const showToast = useToastStore((s) => s.showToast);
  const triggerTabHighlight = useUiStore((s) => s.triggerTabHighlight);

  const [notes, setNotes] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newDisclosure, setNewDisclosure] = useState<'internal_only' | 'disclosed'>('internal_only');
  const [submitting, setSubmitting] = useState(false);

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchNotes = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const data = await getKnowledge({ layer: 'case', case_id: caseId });
      // Filter to case-specific manual notes or all case entries
      const manualNotes = (data || []).filter(
        (n) => n.source === 'vera_manual' || n.layer === 'case'
      );
      setNotes(manualNotes);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '加载备忘失败';
      showToast('error', msg);
    } finally {
      setLoading(false);
    }
  }, [caseId, showToast]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  useEffect(() => {
    const handleUpdate = () => {
      fetchNotes();
    };
    window.addEventListener('case_notes_updated', handleUpdate);
    return () => {
      window.removeEventListener('case_notes_updated', handleUpdate);
    };
  }, [fetchNotes]);

  const handleCreateNote = async () => {
    const text = newContent.trim();
    if (!text) {
      showToast('info', '请输入备忘内容');
      return;
    }

    setSubmitting(true);
    try {
      await createKnowledge({
        layer: 'case',
        case_id: caseId,
        content: text,
        source: 'vera_manual',
        tags: newDisclosure,
      });

      setNewContent('');
      showToast('success', '备忘已存入，AI 上下文已全量同步');
      triggerTabHighlight('notes');
      window.dispatchEvent(new CustomEvent('case_notes_updated'));
      await fetchNotes();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '创建备忘失败';
      showToast('error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleDisclosure = async (note: KnowledgeEntry) => {
    const currentTags = (note.tags ? (Array.isArray(note.tags) ? note.tags.join(',') : note.tags) : '').toLowerCase();
    const isDisclosed = currentTags.includes('disclosed');
    const targetDisclosure = isDisclosed ? 'internal_only' : 'disclosed';

    try {
      await updateKnowledge(note.id, { tags: targetDisclosure });
      showToast('info', targetDisclosure === 'disclosed' ? '已标记为：🔵 银行可披露' : '已标记为：🟡 仅内部保密');
      window.dispatchEvent(new CustomEvent('case_notes_updated'));
      await fetchNotes();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '切换失败';
      showToast('error', msg);
    }
  };

  const handleStartEdit = (note: KnowledgeEntry) => {
    setEditingId(note.id);
    setEditContent(note.content);
  };

  const handleSaveEdit = async (noteId: string) => {
    const text = editContent.trim();
    if (!text) {
      showToast('info', '备忘内容不能为空');
      return;
    }
    setSavingEdit(true);
    try {
      await updateKnowledge(noteId, { content: text });
      setEditingId(null);
      showToast('success', '备忘已更新');
      window.dispatchEvent(new CustomEvent('case_notes_updated'));
      await fetchNotes();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '保存失败';
      showToast('error', msg);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!window.confirm('确定要删除这条手工备忘吗？删除后 AI 将不再引用。')) return;
    try {
      await deleteKnowledge(noteId);
      showToast('success', '备忘已删除');
      window.dispatchEvent(new CustomEvent('case_notes_updated'));
      await fetchNotes();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '删除失败';
      showToast('error', msg);
    }
  };

  const formatTime = (ts?: string | null) => {
    if (!ts) return '刚刚';
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return ts;
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      if (isToday) return `今天 ${hh}:${mm}`;
      const mon = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${mon}-${day} ${hh}:${mm}`;
    } catch {
      return ts;
    }
  };

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: 'var(--bg-app)' }}
      id="case-notes-deck-container"
    >
      {/* Header & Quick Input Area */}
      <div
        className="p-3.5 border-b space-y-3 flex-shrink-0"
        style={{
          backgroundColor: 'var(--bg-panel)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center shadow-2xs"
              style={{ backgroundColor: 'var(--purple-soft)', color: 'var(--purple)' }}
            >
              <FileText className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-xs font-extrabold" style={{ color: 'var(--text-primary)' }}>
                案件手工备忘与交代
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchNotes}
            disabled={loading}
            title="刷新备忘录"
            className="p-1 rounded-lg border text-muted hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer disabled:opacity-50"
            style={{ borderColor: 'var(--border)' }}
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Quick Note Input Box */}
        <div
          className="p-2.5 rounded-xl border space-y-2 focus-within:border-[var(--purple)] transition-colors shadow-2xs"
          style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)' }}
        >
          <textarea
            ref={textareaRef}
            rows={2}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleCreateNote();
              }
            }}
            placeholder="随手记一笔案件交代（或直接在左侧对话对 Annie 说『记一下：...』）"
            className="w-full text-xs bg-transparent border-none outline-none resize-none no-scrollbar leading-relaxed"
            style={{ color: 'var(--text-primary)' }}
          />

          <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
            {/* Disclosure Selector */}
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => setNewDisclosure('internal_only')}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border flex items-center space-x-1 transition-all cursor-pointer ${
                  newDisclosure === 'internal_only'
                    ? 'bg-[var(--yellow-soft)] text-[var(--yellow)] border-[var(--yellow-soft)]'
                    : 'text-muted border-transparent hover:bg-[var(--bg-subtle)]'
                }`}
                title="仅内部操盘可见，外发邮件与生成 Notes 时物理过滤"
              >
                <Lock className="w-2.5 h-2.5" />
                <span>🟡 仅内部保密</span>
              </button>

              <button
                type="button"
                onClick={() => setNewDisclosure('disclosed')}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border flex items-center space-x-1 transition-all cursor-pointer ${
                  newDisclosure === 'disclosed'
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-soft)]'
                    : 'text-muted border-transparent hover:bg-[var(--bg-subtle)]'
                }`}
                title="可披露给银行，外线生成 Notes/邮件时允许引用"
              >
                <Globe className="w-2.5 h-2.5" />
                <span>🔵 银行可披露</span>
              </button>
            </div>

            {/* Save Button */}
            <motion.button
              type="button"
              whileTap={reduced ? undefined : { scale: 0.95 }}
              onClick={handleCreateNote}
              disabled={submitting || !newContent.trim()}
              className="px-3 py-1 rounded-lg text-xs font-bold text-white flex items-center space-x-1 cursor-pointer transition-opacity disabled:opacity-40 shadow-xs"
              style={{ backgroundColor: 'var(--purple)' }}
              id="save-note-btn"
            >
              <Plus className="w-3 h-3" />
              <span>{submitting ? '保存中...' : '记录'}</span>
            </motion.button>
          </div>
        </div>
      </div>

      {/* Notes Timeline List */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 no-scrollbar">
        {notes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-muted space-y-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center border shadow-xs"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <Sparkles className="w-5 h-5 text-[var(--purple)]" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                暂无案件备忘记录
              </p>
              <p className="text-[11px] leading-relaxed max-w-[240px]">
                在上方快速速记，或在左栏对话中对 Annie 说 <span className="font-bold text-[var(--purple)]">“记一下：客户...”</span>，AI 将全量吸收并不漏掉任何关键交代。
              </p>
            </div>
          </div>
        ) : (
          <AnimatePresence>
            {notes.map((note) => {
              const tagsStr = (note.tags ? (Array.isArray(note.tags) ? note.tags.join(',') : note.tags) : '').toLowerCase();
              const isDisclosed = tagsStr.includes('disclosed');
              const isEditing = editingId === note.id;

              return (
                <motion.div
                  key={note.id}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
                  className="p-3 rounded-2xl border space-y-2 shadow-xs group transition-all"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: isDisclosed ? 'var(--accent-soft)' : 'var(--border)',
                  }}
                  id={`case-note-card-${note.id}`}
                >
                  {/* Top Bar: Timestamp & Disclosure Toggle */}
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center space-x-1.5 text-muted">
                      <Clock className="w-3 h-3 text-muted flex-shrink-0" />
                      <span className="font-mono">{formatTime(note.created_at)}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleDisclosure(note)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center space-x-1 cursor-pointer transition-all ${
                        isDisclosed
                          ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-soft)] hover:opacity-80'
                          : 'bg-[var(--yellow-soft)] text-[var(--yellow)] border-[var(--yellow-soft)] hover:opacity-80'
                      }`}
                      title="点击切换披露状态"
                    >
                      {isDisclosed ? <Globe className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                      <span>{isDisclosed ? '🔵 银行可披露' : '🟡 仅内部保密'}</span>
                    </button>
                  </div>

                  {/* Body Content */}
                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        rows={3}
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full p-2 rounded-xl text-xs border outline-none resize-none"
                        style={{
                          backgroundColor: 'var(--bg-input)',
                          borderColor: 'var(--purple)',
                          color: 'var(--text-primary)',
                        }}
                      />
                      <div className="flex justify-end space-x-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-2 py-1 rounded-lg text-xs border text-muted hover:text-primary cursor-pointer"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(note.id)}
                          disabled={savingEdit}
                          className="px-3 py-1 rounded-lg text-xs font-bold text-white bg-[var(--purple)] cursor-pointer disabled:opacity-50"
                        >
                          {savingEdit ? '保存中...' : '保存'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p
                      className="text-xs leading-relaxed break-words whitespace-pre-wrap font-normal select-text"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {note.content}
                    </p>
                  )}

                  {/* Bottom Action Footer */}
                  {!isEditing && (
                    <div
                      className="pt-1.5 border-t flex items-center justify-between text-[11px] text-muted opacity-85 group-hover:opacity-100 transition-opacity"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleDisclosure(note)}
                        className="hover:text-[var(--text-primary)] cursor-pointer transition-colors"
                      >
                        {isDisclosed ? '转为内部保密' : '转为可披露'}
                      </button>

                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(note)}
                          className="p-1 rounded hover:bg-[var(--bg-subtle)] text-muted hover:text-[var(--purple)] transition-colors cursor-pointer"
                          title="编辑备忘"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteNote(note.id)}
                          className="p-1 rounded hover:bg-[var(--bg-subtle)] text-muted hover:text-[var(--red)] transition-colors cursor-pointer"
                          title="删除备忘"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
