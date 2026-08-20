import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Building2, Layers, ShieldAlert, CheckCircle2, RefreshCw, AlertCircle, Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';
import { getKnowledge, createKnowledge, updateKnowledge, confirmKnowledge, deleteKnowledge, KnowledgeEntry } from '../../services/api/knowledge';

type SubTab = 'all' | 'policies' | 'platforms' | 'compliance';

const SUB_TABS: { key: SubTab; label: string; icon: React.ElementType }[] = [
  { key: 'all', label: '全部规则', icon: Building2 },
  { key: 'policies', label: '银行政策', icon: Building2 },
  { key: 'platforms', label: '平台规范', icon: Layers },
  { key: 'compliance', label: '合规红线', icon: ShieldAlert },
];

export function IndustryKnowledgeTab() {
  const reduced = useReducedMotion();
  const showToast = useToastStore((s) => s.showToast);

  const [subTab, setSubTab] = useState<SubTab>('all');
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New entry modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newLender, setNewLender] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit entry
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editLender, setEditLender] = useState('');

  const fetchIndustry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getKnowledge({ layer: 'industry' });
      setEntries(data || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '加载失败';
      setError(msg);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIndustry();
  }, [fetchIndustry]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    setIsSubmitting(true);
    try {
      const created = await createKnowledge({
        layer: 'industry',
        content: newContent.trim(),
        lender: newLender.trim() || undefined,
        source: '行业知识库',
      });
      showToast('success', '已添加行业规则与政策知识');
      setEntries((prev) => [created, ...prev]);
      setShowAddModal(false);
      setNewContent('');
      setNewLender('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '添加失败';
      showToast('error', `新增失败: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (item: KnowledgeEntry) => {
    setEditingId(item.id);
    setEditContent(item.content);
    setEditLender(item.lender || '');
  };

  const handleSaveEdit = async (id: string) => {
    if (!editContent.trim()) return;
    try {
      const updated = await updateKnowledge(id, {
        content: editContent.trim(),
        lender: editLender.trim() || undefined,
      });
      showToast('success', '信息已更新');
      setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
      setEditingId(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '更新失败';
      showToast('error', `更新失败: ${msg}`);
    }
  };

  const handleConfirm = async (id: string) => {
    try {
      await confirmKnowledge(id);
      showToast('success', '已确认行业知识');
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, vera_confirmed: true } : e)));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '确认失败';
      showToast('error', `确认失败: ${msg}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteKnowledge(id);
      showToast('info', '已删除条目');
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '删除失败';
      showToast('error', `删除失败: ${msg}`);
    }
  };

  const filtered = entries.filter((e) => {
    if (subTab === 'all') return true;
    if (subTab === 'policies') return e.lender || e.content.includes('银行') || e.content.includes('政策');
    if (subTab === 'platforms') return e.content.includes('平台') || e.content.includes('ApplyOnline') || e.content.includes('Loanapp');
    if (subTab === 'compliance') return e.content.includes('合规') || e.content.includes('红线') || e.content.includes('脱敏');
    return true;
  });

  return (
    <div className="space-y-4" id="industry-knowledge-tab">
      {/* Sub tabs & Add button */}
      <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2">
          {SUB_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = subTab === tab.key;
            return (
              <motion.button
                key={tab.key}
                whileTap={{ scale: 0.97 }}
                onClick={() => setSubTab(tab.key)}
                className={`relative px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 cursor-pointer transition-colors ${
                  isActive ? 'text-[var(--accent)]' : 'text-secondary hover:text-primary'
                }`}
                id={`industry-subtab-${tab.key}`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {isActive && !reduced && (
                  <motion.span
                    layoutId="industry-subtab-underline"
                    className="absolute -bottom-2 left-1.5 right-1.5 h-[2px] rounded-full"
                    style={{ backgroundColor: 'var(--accent)' }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  />
                )}
                {isActive && reduced && (
                  <span className="absolute -bottom-2 left-1.5 right-1.5 h-[2px] rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
                )}
              </motion.button>
            );
          })}
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1 cursor-pointer"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
          id="add-industry-knowledge-btn"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>添加知识</span>
        </motion.button>
      </div>

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0  }}
            animate={{ opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0  }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-app)]/60 backdrop-blur-xs"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="w-full max-w-md p-5 rounded-2xl border shadow-2xl space-y-4"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--border)' }}>
                <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>新增行业规则 / 银行政策</h3>
                <button onClick={() => setShowAddModal(false)} className="text-muted hover:text-primary">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-muted block mb-1">关联机构 / 平台 (选填):</label>
                  <input
                    type="text"
                    value={newLender}
                    onChange={(e) => setNewLender(e.target.value)}
                    placeholder="例如: CBA, ANZ, ApplyOnline, 合规"
                    className="w-full px-3 py-1.5 rounded-xl border text-xs outline-none bg-transparent"
                    style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-muted block mb-1">政策或规则说明:</label>
                  <textarea
                    rows={4}
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder="录入银行最新政策、平台提交规范或合规要求..."
                    className="w-full p-3 rounded-xl border text-xs outline-none bg-transparent resize-none"
                    style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    required
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-3.5 py-1.5 rounded-xl border text-xs font-medium cursor-pointer"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !newContent.trim()}
                    className="px-4 py-1.5 rounded-xl text-xs font-semibold text-[var(--on-accent)] bg-[var(--accent)] cursor-pointer disabled:opacity-50"
                  >
                    保存提交
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading / Error / Empty States */}
      {loading && (
        <div className="py-10 text-center text-xs text-muted flex items-center justify-center space-x-2">
          <RefreshCw className="w-4 h-4 animate-spin text-[var(--accent)]" />
          <span>正在加载行业知识库...</span>
        </div>
      )}

      {error && !loading && (
        <div className="p-4 rounded-2xl border border-[var(--red-soft)] bg-[var(--red-soft)] text-xs text-[var(--red)] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>加载失败: {error}</span>
          </div>
          <button
            onClick={fetchIndustry}
            className="px-2.5 py-1 rounded-lg border border-[var(--red-soft)] text-[11px] font-bold hover:bg-[var(--red-soft)] cursor-pointer"
          >
            重试
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="py-10 text-center text-xs text-muted rounded-2xl border border-dashed" style={{ borderColor: 'var(--border)' }}>
          {entries.length === 0 ? '暂无行业知识库数据，请点击右上角添加知识。' : '当前分类下暂无行业知识条目。'}
        </div>
      )}

      {/* Industry Knowledge List */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((item) => {
            const isEditing = editingId === item.id;
            return (
              <motion.div
                key={item.id}
                whileHover={{ y: -1 }}
                className="p-4 rounded-2xl border space-y-2.5 transition-transform duration-100"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    {item.lender && (
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-[var(--purple-soft)] text-[var(--purple)]">
                        {item.lender}
                      </span>
                    )}
                    {item.vera_confirmed ? (
                      <span className="text-xs font-mono px-2 py-0.5 rounded font-bold bg-[var(--green-soft)] text-[var(--green)]">
                        ✅ 已确认
                      </span>
                    ) : (
                      <span className="text-xs font-mono px-2 py-0.5 rounded font-bold bg-[var(--yellow-soft)] text-[var(--yellow)]">
                        ⏳ 待确认
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-1">
                    {!item.vera_confirmed && (
                      <button
                        onClick={() => handleConfirm(item.id)}
                        title="确认知识"
                        className="p-1 rounded-lg text-[var(--green)] hover:bg-[var(--green-soft)] cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => (isEditing ? handleSaveEdit(item.id) : handleStartEdit(item))}
                      title={isEditing ? '保存' : '编辑'}
                      className="p-1 rounded-lg text-[var(--accent)] hover:bg-[var(--accent-soft)] cursor-pointer"
                    >
                      {isEditing ? <Check className="w-3.5 h-3.5" /> : <Edit2 className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      title="删除"
                      className="p-1 rounded-lg text-[var(--red)] hover:bg-[var(--red-soft)] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-2 pt-1">
                    <input
                      type="text"
                      value={editLender}
                      onChange={(e) => setEditLender(e.target.value)}
                      placeholder="关联机构 / 平台"
                      className="w-full px-2.5 py-1 rounded-lg border text-xs bg-transparent"
                      style={{ borderColor: 'var(--border)' }}
                    />
                    <textarea
                      rows={3}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full p-2 rounded-lg border text-xs bg-transparent"
                      style={{ borderColor: 'var(--border)' }}
                    />
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-2 py-0.5 rounded text-[11px] border"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => handleSaveEdit(item.id)}
                        className="px-2 py-0.5 rounded text-[11px] bg-[var(--accent)] text-[var(--on-accent)] font-bold cursor-pointer"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {item.content}
                  </p>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
