import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Sparkles, User, ChevronDown, Check, BrainCircuit, Plus, Trash2, CheckCircle, RefreshCw, AlertCircle } from 'lucide-react';
import { useCaseStore } from '../../stores/caseStore';
import { useToastStore } from '../../stores/toastStore';
import { getKnowledge, createKnowledge, confirmKnowledge, deleteKnowledge, KnowledgeEntry } from '../../services/api/knowledge';

export function CaseMemoryTab() {
  const reduced = useReducedMotion();
  const { cases, currentCase } = useCaseStore();
  const showToast = useToastStore((s) => s.showToast);

  const [selectedCaseId, setSelectedCaseId] = useState<string>(currentCase?.caseId || cases[0]?.caseId || '');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [memories, setMemories] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New memory input
  const [newContent, setNewContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedCase = cases.find((c) => c.caseId === selectedCaseId) || currentCase || cases[0];

  const fetchMemories = useCallback(async (caseId: string) => {
    if (!caseId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getKnowledge({ layer: 'case', case_id: caseId });
      setMemories(data || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '加载失败';
      setError(msg);
      setMemories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCaseId) {
      fetchMemories(selectedCaseId);
    }
  }, [selectedCaseId, fetchMemories]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDropdownOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim() || !selectedCaseId) return;
    setIsSubmitting(true);
    try {
      const created = await createKnowledge({
        layer: 'case',
        case_id: selectedCaseId,
        content: newContent.trim(),
        source: 'Vera 手动',
      });
      showToast('success', '已成功添加案件记忆');
      setNewContent('');
      setMemories((prev) => [created, ...prev]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '保存失败';
      showToast('error', `添加记忆失败: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirm = async (id: string) => {
    try {
      await confirmKnowledge(id);
      showToast('success', '已确认该条记忆');
      setMemories((prev) => prev.map((m) => (m.id === id ? { ...m, vera_confirmed: true } : m)));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '确认失败';
      showToast('error', `确认失败: ${msg}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteKnowledge(id);
      showToast('info', '已删除该条记忆');
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '删除失败';
      showToast('error', `删除失败: ${msg}`);
    }
  };

  return (
    <div className="space-y-4" id="case-memory-tab">
      {/* Selector bar */}
      <div className="flex items-center justify-between p-3.5 rounded-2xl border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2.5">
          <BrainCircuit className="w-4 h-4 text-[var(--purple)]" />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>当前查看案件：</span>
        </div>

        <div className="relative" ref={dropdownRef}>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-2 cursor-pointer transition-colors"
            style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            id="case-memory-select"
          >
            <span>{selectedCase ? `${selectedCase.clientName} (${selectedCase.lender})` : '请选择案件'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-muted" />
          </motion.button>

          <AnimatePresence>
            {dropdownOpen && (
              <motion.div
                initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 4 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -4 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="absolute right-0 top-full z-30 w-64 p-1.5 rounded-2xl border shadow-xl flex flex-col space-y-1"
                style={{ transformOrigin: 'top right', backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-overlay)' }}
              >
                {cases.map((c) => (
                  <motion.button
                    key={c.caseId}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      setSelectedCaseId(c.caseId);
                      setDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between cursor-pointer transition-colors ${
                      selectedCaseId === c.caseId ? 'text-[var(--accent)] bg-[var(--accent-soft)]' : 'text-secondary hover:bg-[var(--bg-card-hover)] hover:text-primary'
                    }`}
                  >
                    <span>{c.clientName} - {c.lender}</span>
                    {selectedCaseId === c.caseId && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Add Memory Form */}
      <form onSubmit={handleAddMemory} className="flex items-center space-x-2">
        <input
          type="text"
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="添加一条案件备注/特别交代记忆..."
          className="flex-1 px-3.5 py-2 rounded-xl border text-xs outline-none bg-transparent"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          id="add-case-memory-input"
        />
        <motion.button
          whileTap={{ scale: 0.97 }}
          type="submit"
          disabled={isSubmitting || !newContent.trim()}
          className="px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
          id="add-case-memory-btn"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>添加</span>
        </motion.button>
      </form>

      {/* States: Loading, Error, Empty, List */}
      {loading && (
        <div className="py-8 text-center text-xs text-muted flex items-center justify-center space-x-2">
          <RefreshCw className="w-4 h-4 animate-spin text-[var(--accent)]" />
          <span>正在读取案件记忆...</span>
        </div>
      )}

      {error && !loading && (
        <div className="p-4 rounded-2xl border border-[var(--red-soft)] bg-[var(--red-soft)] text-xs text-[var(--red)] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>加载失败: {error}</span>
          </div>
          <button
            onClick={() => fetchMemories(selectedCaseId)}
            className="px-2.5 py-1 rounded-lg border border-[var(--red-soft)] text-[11px] font-bold hover:bg-[var(--red-soft)] cursor-pointer"
          >
            重试
          </button>
        </div>
      )}

      {!loading && !error && memories.length === 0 && (
        <div className="py-8 text-center text-xs text-muted rounded-2xl border border-dashed" style={{ borderColor: 'var(--border)' }}>
          暂无该案件的相关记忆，可在上方输入框手动添加。
        </div>
      )}

      {!loading && !error && memories.length > 0 && (
        <div className="space-y-3">
          {memories.map((m) => {
            const isVera = m.source?.includes('Vera') || m.source === 'manual';
            return (
              <motion.div
                key={m.id}
                whileHover={{ y: -1 }}
                className="p-4 rounded-2xl border space-y-2 transition-transform duration-100"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className={`p-1.5 rounded-lg text-xs font-bold flex items-center ${isVera ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--purple-soft)] text-[var(--purple)]'}`}>
                      {isVera ? <User className="w-3.5 h-3.5 mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                      {m.source || (isVera ? 'Vera 手动记录' : 'AI 自动提取')}
                    </span>
                    {m.vera_confirmed ? (
                      <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-[var(--green-soft)] text-[var(--green)]">
                        ✅ Vera 已确认
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-[var(--yellow-soft)] text-[var(--yellow)]">
                        ⏳ 待确认
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-mono text-muted">
                      {m.created_at ? new Date(m.created_at).toLocaleDateString('zh-CN') : ''}
                    </span>
                    {!m.vera_confirmed && (
                      <button
                        onClick={() => handleConfirm(m.id)}
                        title="确认此记忆"
                        className="p-1 rounded-lg text-[var(--green)] hover:bg-[var(--green-soft)] cursor-pointer"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(m.id)}
                      title="删除记录"
                      className="p-1 rounded-lg text-[var(--red)] hover:bg-[var(--red-soft)] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{m.content}</p>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
