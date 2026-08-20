import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Search, Calendar, User, Trash2, CheckCircle, Plus, RefreshCw, AlertCircle, Edit2, X, Check, Trophy, FolderArchive, Sparkles, Target } from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';
import { getKnowledge, createKnowledge, updateKnowledge, confirmKnowledge, deleteKnowledge, KnowledgeEntry } from '../../services/api/knowledge';

const FILTER_TAGS = ['全部', 'CBA', 'ANZ', 'NAB', 'Westpac', '常用政策', '风控合规'];

export function GlobalExperienceTab() {
  const reduced = useReducedMotion();
  const showToast = useToastStore((s) => s.showToast);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('全部');

  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal / Form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newLender, setNewLender] = useState('');
  const [newSource, setNewSource] = useState('团队经验');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit inline state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editLender, setEditLender] = useState('');

  const fetchGlobal = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getKnowledge({ layer: 'global' });
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
    fetchGlobal();
  }, [fetchGlobal]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    setIsSubmitting(true);
    try {
      const created = await createKnowledge({
        layer: 'global',
        content: newContent.trim(),
        lender: newLender.trim() || undefined,
        source: newSource.trim() || '团队经验',
      });
      showToast('success', '已成功新增团队全局经验');
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
      showToast('success', '经验条目已更新');
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
      showToast('success', '已确认此条全局经验');
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, vera_confirmed: true } : e)));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '确认失败';
      showToast('error', `确认失败: ${msg}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteKnowledge(id);
      showToast('info', '已删除经验条目');
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '删除失败';
      showToast('error', `删除失败: ${msg}`);
    }
  };

  const filtered = entries.filter((item) => {
    const q = searchQuery.toLowerCase();
    const matchesQuery = item.content.toLowerCase().includes(q) || (item.lender && item.lender.toLowerCase().includes(q)) || item.source.toLowerCase().includes(q);
    const matchesTag = selectedTag === '全部' || (item.lender && item.lender.includes(selectedTag)) || item.source.includes(selectedTag);
    return matchesQuery && matchesTag;
  });

  return (
    <div className="space-y-4" id="global-experience-tab">
      {/* Search & Action bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 搜索团队全局经验库 (关键词/银行/出处)..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border text-xs outline-none bg-transparent shadow-2xs"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            id="experience-search"
          />
        </div>

        <div className="flex items-center space-x-2">
          <motion.button
            whileTap={reduced ? undefined : { scale: 0.97 }}
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer whitespace-nowrap shadow-xs"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
            id="add-experience-btn"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新增经验</span>
          </motion.button>
        </div>
      </div>

      {/* Filter Tags */}
      <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-0.5">
        {FILTER_TAGS.map((tag) => (
          <motion.button
            key={tag}
            whileTap={reduced ? undefined : { scale: 0.97 }}
            onClick={() => setSelectedTag(tag)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
              selectedTag === tag ? 'bg-[var(--accent)] text-[var(--on-accent)] font-semibold' : 'bg-[var(--bg-card)] border border-[var(--border)] text-secondary'
            }`}
          >
            {tag}
          </motion.button>
        ))}
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
                <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>新增团队全局经验</h3>
                <button onClick={() => setShowAddModal(false)} className="text-muted hover:text-primary">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-muted block mb-1">关联银行 / 房贷机构 (选填):</label>
                  <input
                    type="text"
                    value={newLender}
                    onChange={(e) => setNewLender(e.target.value)}
                    placeholder="例如: CBA, ANZ, NAB, Westpac"
                    className="w-full px-3 py-1.5 rounded-xl border text-xs outline-none bg-transparent"
                    style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-muted block mb-1">经验来源 / 实战案例 (选填):</label>
                  <input
                    type="text"
                    value={newSource}
                    onChange={(e) => setNewSource(e.target.value)}
                    placeholder="例如: PERSON_1 案件实战总结"
                    className="w-full px-3 py-1.5 rounded-xl border text-xs outline-none bg-transparent"
                    style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-muted block mb-1">经验要点与总结内容:</label>
                  <textarea
                    rows={4}
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder="输入实战经验要点、政策突破技巧或审批注意事项..."
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
          <span>正在读取团队经验库...</span>
        </div>
      )}

      {error && !loading && (
        <div className="p-4 rounded-2xl border border-[var(--red-soft)] bg-[var(--red-soft)] text-xs text-[var(--red)] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>加载失败: {error}</span>
          </div>
          <button
            onClick={fetchGlobal}
            className="px-2.5 py-1 rounded-lg border border-[var(--red-soft)] text-[11px] font-bold hover:bg-[var(--red-soft)] cursor-pointer"
          >
            重试
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="py-10 text-center text-xs text-muted rounded-2xl border border-dashed" style={{ borderColor: 'var(--border)' }}>
          {entries.length === 0 ? '暂无团队经验库数据，请点击右上角新增经验。' : '未找到匹配的经验条目。'}
        </div>
      )}

      {/* Main List */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((item) => {
            const isEditing = editingId === item.id;
            const isPrecedent =
              item.source_type === 'archive_precedent' ||
              item.source === 'archive_precedent' ||
              !!item.precedent_id ||
              item.source.includes('实战') ||
              item.source.includes('先例');

            const handleNavigateToArchive = () => {
              window.dispatchEvent(
                new CustomEvent('open-archive-hub', {
                  detail: { clientName: item.client_name, caseId: item.case_id },
                })
              );
              showToast(
                'info',
                `已跳转至档案中心：${item.client_name ? `${item.client_name} 的` : ''}原始案卷卡片`
              );
            };

            return (
              <motion.div
                key={item.id}
                whileHover={reduced ? undefined : { y: -1 }}
                className="p-4 rounded-2xl border space-y-3 transition-all"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: isPrecedent ? 'var(--yellow, #eab308)' : 'var(--border)',
                  boxShadow: 'var(--shadow-card)',
                }}
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                      {/* 实战先例 Golden Badge */}
                      {isPrecedent && (
                        <span className="text-xs font-mono px-2 py-0.5 rounded-md font-extrabold flex items-center space-x-1 bg-amber-500/15 text-amber-500 border border-amber-500/30">
                          <Trophy className="w-3 h-3" />
                          <span>[ 🏆 实战先例 ]</span>
                        </span>
                      )}

                      {item.lender && (
                        <span className="text-xs font-mono px-2 py-0.5 rounded font-bold bg-[var(--accent-soft)] text-[var(--accent)]">
                          {item.lender}
                        </span>
                      )}

                      {item.scheme_type && (
                        <span className="text-xs font-mono px-2 py-0.5 rounded font-bold bg-[var(--purple-soft)] text-[var(--purple)]">
                          {item.scheme_type}
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

                    <div className="flex items-center space-x-3 text-[11px] font-mono text-muted pt-0.5 flex-wrap gap-y-1">
                      <span className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3 text-[var(--yellow)]" />
                        <span>{item.created_at ? new Date(item.created_at).toLocaleDateString('zh-CN') : ''}</span>
                      </span>
                      <span>•</span>
                      <span className="flex items-center space-x-1">
                        <User className="w-3 h-3 text-[var(--accent)]" />
                        <span>{item.client_name ? `${item.client_name} · ` : ''}{item.source || '团队积累'}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 shrink-0">
                    {!item.vera_confirmed && (
                      <button
                        onClick={() => handleConfirm(item.id)}
                        title="确认经验"
                        className="p-1 rounded-lg text-[var(--green)] hover:bg-[var(--green-soft)] cursor-pointer"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
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
                      placeholder="关联银行"
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
                  <div className="space-y-2.5">
                    {/* 主要描述 */}
                    <p className="text-xs leading-relaxed font-medium" style={{ color: 'var(--text-primary)' }}>
                      "{item.content}"
                    </p>

                    {/* 三段式结构 (若为实战先例) */}
                    {isPrecedent && (item.background || item.strategy || item.takeaway) && (
                      <div
                        className="p-3 rounded-xl border space-y-2 text-xs"
                        style={{
                          backgroundColor: 'var(--bg-panel)',
                          borderColor: 'var(--border)',
                        }}
                      >
                        {item.background && (
                          <div className="flex items-start space-x-2">
                            <Target className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                            <div>
                              <strong className="text-amber-500 font-bold mr-1">🎯 背景与痛点:</strong>
                              <span style={{ color: 'var(--text-secondary)' }}>{item.background}</span>
                            </div>
                          </div>
                        )}

                        {item.strategy && (
                          <div className="flex items-start space-x-2">
                            <Sparkles className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 mt-0.5" />
                            <div>
                              <strong className="text-[var(--accent)] font-bold mr-1">💡 突破策略:</strong>
                              <span style={{ color: 'var(--text-secondary)' }}>{item.strategy}</span>
                            </div>
                          </div>
                        )}

                        {item.takeaway && (
                          <div className="flex items-start space-x-2">
                            <Trophy className="w-3.5 h-3.5 text-[var(--green)] shrink-0 mt-0.5" />
                            <div>
                              <strong className="text-[var(--green)] font-bold mr-1">🏆 获批经验:</strong>
                              <span style={{ color: 'var(--text-secondary)' }}>{item.takeaway}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 标签 & 穿透按钮 */}
                    <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                      <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                        {item.tags?.map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded text-[10px] font-mono bg-[var(--bg-panel)] text-muted border border-[var(--border)]"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>

                      {/* [ 📂 查看档案库原始案卷 ➔ ] 按钮 */}
                      {isPrecedent && (
                        <motion.button
                          whileTap={reduced ? undefined : { scale: 0.96 }}
                          onClick={handleNavigateToArchive}
                          className="px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center space-x-1 cursor-pointer transition-all hover:bg-[var(--accent-soft)] hover:border-[var(--accent)]"
                          style={{
                            backgroundColor: 'var(--bg-panel)',
                            borderColor: 'var(--border)',
                            color: 'var(--accent)',
                          }}
                        >
                          <FolderArchive className="w-3.5 h-3.5" />
                          <span>查看档案库原始案卷 ➔</span>
                        </motion.button>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
