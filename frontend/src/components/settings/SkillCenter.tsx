import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Sparkles,
  Plus,
  CheckCircle2,
  Clock,
  History,
  Lock,
  Play,
  Ban,
  X,
  Edit3,
  Search,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import { SkillItem } from '../../types/api';
import {
  getSkills,
  activateSkill,
  deactivateSkill,
  rollbackSkill,
  rejectSkillProposal,
  createSkillDraft,
  updateSkillDraft,
} from '../../services/api/skills';
import { useToastStore } from '../../stores/toastStore';

export function SkillCenter() {
  const reduced = useReducedMotion();
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [editingSkill, setEditingSkill] = useState<SkillItem | null>(null);

  // Form state
  const [formKey, setFormKey] = useState<string>('');
  const [formName, setFormName] = useState<string>('');
  const [formDesc, setFormDesc] = useState<string>('');
  const [formCategory, setFormCategory] = useState<string>('prompt');
  const [formTriggers, setFormTriggers] = useState<string>('');
  const [formContent, setFormContent] = useState<string>('');

  // Human Gate confirm activation modal
  const [activatingSkill, setActivatingSkill] = useState<SkillItem | null>(null);

  // Reject proposal modal
  const [rejectingSkill, setRejectingSkill] = useState<SkillItem | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');

  // Version history modal
  const [historySkill, setHistorySkill] = useState<SkillItem | null>(null);

  const fetchSkillsData = async () => {
    setLoading(true);
    try {
      const data = await getSkills({
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      setSkills(data);
    } catch (err) {
      console.error('Failed to load skills:', err);
      useToastStore.getState().showToast('error', '加载技能中心列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSkillsData();
  }, [categoryFilter, statusFilter]);

  const filteredSkills = skills.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.key.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q)
    );
  });

  const aiProposals = skills.filter((s) => s.created_by === 'ai_propose' && s.status === 'draft');

  // Handle open create modal
  const handleOpenCreate = () => {
    setEditingSkill(null);
    setFormKey(`skill-custom-${Date.now().toString().slice(-4)}`);
    setFormName('');
    setFormDesc('');
    setFormCategory('prompt');
    setFormTriggers('');
    setFormContent('');
    setCreateModalOpen(true);
  };

  // Handle open edit modal
  const handleOpenEdit = (skill: SkillItem) => {
    if (skill.is_builtin) {
      useToastStore.getState().showToast('info', '系统内置流程包为只读属性，不可编辑');
      return;
    }
    setEditingSkill(skill);
    setFormKey(skill.key);
    setFormName(skill.name);
    setFormDesc(skill.description);
    setFormCategory(skill.category);
    setFormTriggers((skill.triggers || []).join(', '));
    setFormContent(skill.content || '');
    setCreateModalOpen(true);
  };

  // Submit create or edit form
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formKey.trim() || !formName.trim() || !formContent.trim()) {
      useToastStore.getState().showToast('error', '请填写完整 Key、名称及规则内容');
      return;
    }

    const triggersArr = formTriggers
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      if (editingSkill) {
        await updateSkillDraft(editingSkill.key, {
          name: formName,
          description: formDesc,
          category: formCategory,
          triggers: triggersArr,
          content: formContent,
        });
        useToastStore.getState().showToast('success', `已更新技能草稿 [${formName}]`);
      } else {
        await createSkillDraft({
          key: formKey,
          name: formName,
          description: formDesc,
          category: formCategory,
          triggers: triggersArr,
          content: formContent,
        });
        useToastStore.getState().showToast('success', `已创建技能草稿 [${formName}] (注: 草稿永不自动触发)`);
      }
      setCreateModalOpen(false);
      fetchSkillsData();
    } catch (err) {
      useToastStore.getState().showToast('error', '保存技能草稿失败');
    }
  };

  // Human Gate: Execute activation
  const handleExecuteActivate = async () => {
    if (!activatingSkill) return;
    try {
      await activateSkill(activatingSkill.key);
      useToastStore.getState().showToast('success', `技能 [${activatingSkill.name}] 已成功激活，开启自动触发`);
      setActivatingSkill(null);
      fetchSkillsData();
    } catch (err) {
      useToastStore.getState().showToast('error', '激活技能失败');
    }
  };

  // Deactivate
  const handleDeactivate = async (skill: SkillItem) => {
    if (skill.is_builtin) {
      useToastStore.getState().showToast('info', '内置流程无法停用');
      return;
    }
    try {
      await deactivateSkill(skill.key);
      useToastStore.getState().showToast('success', `已停用技能 [${skill.name}]`);
      fetchSkillsData();
    } catch (err) {
      useToastStore.getState().showToast('error', '停用失败');
    }
  };

  // Reject proposal
  const handleExecuteReject = async () => {
    if (!rejectingSkill) return;
    try {
      await rejectSkillProposal(rejectingSkill.key, rejectReason);
      useToastStore.getState().showToast('success', `已拒绝 AI 技能提议 [${rejectingSkill.name}]`);
      setRejectingSkill(null);
      setRejectReason('');
      fetchSkillsData();
    } catch (err) {
      useToastStore.getState().showToast('error', '拒绝失败');
    }
  };

  // Rollback version
  const handleExecuteRollback = async (skill: SkillItem, ver: string) => {
    try {
      await rollbackSkill(skill.key, ver);
      useToastStore.getState().showToast('success', `已将 [${skill.name}] 回滚至版本 ${ver}`);
      setHistorySkill(null);
      fetchSkillsData();
    } catch (err) {
      useToastStore.getState().showToast('error', '回滚失败');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="p-5 rounded-2xl border shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-[var(--purple-soft)] text-[var(--purple)]">
              <Zap className="w-5 h-5" />
            </div>
            <h1 className="text-base font-extrabold" style={{ color: 'var(--text-primary)' }}>
              技能中心 (Skill Center)
            </h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-[var(--purple-soft)] text-[var(--purple)] dark:text-[var(--purple)]">
              WO-28 契约
            </span>
          </div>
          <p className="text-xs text-muted max-w-2xl leading-relaxed">
  管理 Annie 的技能规则库与流程包。<strong>人闸原则：</strong>草稿状态 (draft) 永不参与对话触发，必须由 Vera 手动确认激活后方可生效。
          </p>
        </div>

        <motion.button
          whileTap={reduced ? undefined : { scale: 0.96 }}
          onClick={handleOpenCreate}
          className="px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-xs hover:opacity-90 self-start md:self-auto"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
          id="create-skill-draft-btn"
        >
          <Plus className="w-4 h-4" />
          <span>新建技能草稿</span>
        </motion.button>
      </div>

      {/* AI Proposal Highlight Section */}
      {aiProposals.length > 0 && (
        <div className="p-4 rounded-2xl border bg-gradient-to-r from-[var(--yellow-soft)] via-[var(--purple-soft)] to-[var(--yellow-soft)] border-[var(--yellow-soft)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-[var(--yellow)]" />
              <span className="text-xs font-extrabold text-[var(--yellow)] dark:text-[var(--yellow)]">
                AI 技能演化提议 ({aiProposals.length} 项等待 Vera 审核把关)
              </span>
            </div>
            <span className="text-[11px] font-mono text-muted">Human-in-the-loop Gate</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {aiProposals.map((prop) => (
              <div
                key={prop.id}
                className="p-3.5 rounded-xl border bg-white/60 dark:bg-[var(--bg-app)]/60 border-[var(--yellow-soft)] space-y-2.5 text-xs shadow-2xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-extrabold text-primary block">{prop.name}</span>
                    <span className="text-[11px] font-mono text-muted">Key: {prop.key} · {prop.version}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--yellow-soft)] text-[var(--yellow)] flex-shrink-0">
                    AI 提议草稿
                  </span>
                </div>

                <div className="p-2 rounded-lg bg-[var(--yellow-soft)] text-[11px] text-[var(--yellow)] dark:text-[var(--yellow)] leading-relaxed">
                  <strong>提议理由：</strong>
                  {prop.proposal_reason || 'AI 自动分析高频处理流，建议新建此模板。'}
                </div>

                <div className="flex items-center justify-end space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setRejectingSkill(prop);
                      setRejectReason('');
                    }}
                    className="px-2.5 py-1 rounded-lg border border-[var(--red-soft)] text-[var(--red)] text-[11px] font-bold hover:bg-[var(--red-soft)] cursor-pointer"
                  >
                    拒绝提议
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(prop)}
                    className="px-2.5 py-1 rounded-lg border text-[11px] font-bold text-secondary hover:text-primary cursor-pointer"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    修改草稿
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivatingSkill(prop)}
                    className="px-3 py-1 rounded-lg text-[11px] font-bold cursor-pointer shadow-2xs"
                    style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
                  >
                    确认激活
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-2xl border" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        {/* Category tabs */}
        <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar text-xs font-semibold">
          {[
            { id: 'all', label: '全部类别' },
            { id: 'flow_package', label: '流程包 (Flows)' },
            { id: 'prompt', label: 'Prompt 规则' },
            { id: 'rule', label: '政策/规则 (Rules)' },
            { id: 'tool', label: '工具接口 (Tools)' },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                categoryFilter === cat.id
                  ? 'bg-[var(--purple)] text-[var(--on-purple)] font-bold shadow-xs'
                  : 'text-muted hover:text-primary hover:bg-[var(--bg-subtle)]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Status Filter & Search input */}
        <div className="flex items-center space-x-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl border text-xs font-semibold outline-none cursor-pointer"
            style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <option value="all">全部状态</option>
            <option value="active">已激活 (Active)</option>
            <option value="draft">草稿 (Draft)</option>
            <option value="deprecated">已停用 (Deprecated)</option>
          </select>

          <div className="relative min-w-[160px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted" />
            <input
              type="text"
              placeholder="搜索技能..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border text-xs outline-none focus:border-[var(--purple)]"
              style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>
      </div>

      {/* Skills Grid / List */}
      {loading ? (
        <div className="p-12 text-center space-y-2">
          <div className="w-6 h-6 border-2 border-[var(--purple)] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-muted">正在加载技能注册表数据...</p>
        </div>
      ) : filteredSkills.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border space-y-2" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <Zap className="w-8 h-8 text-muted mx-auto opacity-40" />
          <p className="text-xs font-bold text-muted">未检索到匹配的技能注册项</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSkills.map((skill) => {
            const isDraft = skill.status === 'draft';
            const isActive = skill.status === 'active';
            const isDeprecated = skill.status === 'deprecated';

            return (
              <div
                key={skill.id}
                className={`p-4 rounded-2xl border shadow-2xs space-y-3 transition-all flex flex-col justify-between ${
                  isActive ? 'hover:border-[var(--purple-soft)]' : 'opacity-85'
                }`}
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                id={`skill-card-${skill.key}`}
              >
                {/* Header */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                        <span className="text-xs font-extrabold truncate" style={{ color: 'var(--text-primary)' }}>
                          {skill.name}
                        </span>
                        {skill.is_builtin && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-[var(--accent-soft)] text-[var(--accent)] dark:text-[var(--accent)] border border-[var(--accent-soft)] flex items-center space-x-0.5">
                            <Lock className="w-2.5 h-2.5" />
                            <span>内置只读</span>
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-mono text-muted truncate">Key: {skill.key}</p>
                    </div>

                    {/* Status Badge */}
                    {isActive ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[var(--green-soft)] text-[var(--green)] border border-[var(--green-soft)] flex items-center space-x-1 flex-shrink-0">
                        <CheckCircle2 className="w-3 h-3 text-[var(--green)]" />
                        <span>已激活 · 自动触发</span>
                      </span>
                    ) : isDraft ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20 flex items-center space-x-1 flex-shrink-0">
                        <ShieldAlert className="w-3 h-3 text-[var(--yellow)]" />
                        <span>草稿 · 永不自动触发</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[var(--red-soft)] text-[var(--red)] dark:text-[var(--red)] border border-[var(--red-soft)] flex items-center space-x-1 flex-shrink-0">
                        <Ban className="w-3 h-3 text-[var(--red)]" />
                        <span>已停用</span>
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-secondary leading-relaxed line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                    {skill.description}
                  </p>

                  {/* Triggers list */}
                  {skill.triggers && skill.triggers.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      <span className="text-[11px] text-muted font-mono font-bold mr-1">匹配触发词:</span>
                      {skill.triggers.map((trig, idx) => (
                        <span key={idx} className="px-1.5 py-0.5 rounded text-xs font-mono bg-[var(--bg-subtle)] text-muted border border-[var(--border)]">
                          {trig}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer Controls */}
                <div className="pt-3 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center space-x-2 text-[11px] text-muted font-mono">
                    <Clock className="w-3 h-3" />
                    <span>v{skill.version}</span>
                    <span>· {skill.created_by === 'system' ? '系统' : skill.created_by === 'ai_propose' ? 'AI提议' : 'Vera'}</span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    {/* Version History Button */}
                    <button
                      type="button"
                      onClick={() => setHistorySkill(skill)}
                      className="px-2 py-1 rounded-lg border text-[11px] font-semibold text-muted hover:text-primary cursor-pointer hover:bg-[var(--bg-subtle)] flex items-center space-x-1"
                      style={{ borderColor: 'var(--border)' }}
                      title="查看版本演化链与回滚"
                    >
                      <History className="w-3 h-3" />
                      <span>版本历史</span>
                    </button>

                    {/* Edit Draft Button */}
                    {!skill.is_builtin && isDraft && (
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(skill)}
                        className="px-2 py-1 rounded-lg border text-[11px] font-semibold text-secondary hover:text-primary cursor-pointer flex items-center space-x-1"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>编辑</span>
                      </button>
                    )}

                    {/* Human Gate Activate Button */}
                    {!skill.is_builtin && (isDraft || isDeprecated) && (
                      <button
                        type="button"
                        onClick={() => setActivatingSkill(skill)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer shadow-xs flex items-center space-x-1"
                        style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
                        id={`activate-skill-btn-${skill.key}`}
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>激活</span>
                      </button>
                    )}

                    {/* Deactivate Button */}
                    {!skill.is_builtin && isActive && (
                      <button
                        type="button"
                        onClick={() => handleDeactivate(skill)}
                        className="px-2.5 py-1 rounded-lg border border-[var(--red-soft)] text-[var(--red)] text-[11px] font-bold hover:bg-[var(--red-soft)] cursor-pointer"
                      >
                        停用
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: Create / Edit Skill Draft Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-app)]/80 backdrop-blur-sm animate-in fade-in duration-200">
          <motion.div
            initial={reduced ? undefined : { scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-lg rounded-2xl border shadow-2xl p-6 space-y-4 glass-panel max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>
                {editingSkill ? `编辑技能草稿: ${editingSkill.name}` : '新建技能草稿 (Draft)'}
              </h3>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="p-1 rounded-lg text-muted hover:text-primary cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-muted block">唯一标识 (Skill Key)</label>
                <input
                  type="text"
                  disabled={!!editingSkill}
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value)}
                  placeholder="e.g. skill-custom-prompt"
                  className="w-full px-3 py-2 rounded-xl border font-mono outline-none focus:border-[var(--purple)] disabled:opacity-60"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-muted block">技能名称 (Skill Name)</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. VIP 客户语气柔和型催件模板"
                  className="w-full px-3 py-2 rounded-xl border outline-none focus:border-[var(--purple)]"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-muted block">技能类别 (Category)</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border outline-none cursor-pointer"
                    style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  >
                    <option value="prompt">Prompt 模板</option>
                    <option value="rule">业务规则/政策</option>
                    <option value="flow_package">流程包</option>
                    <option value="tool">工具接口</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-muted block">触发词列表 (用逗号分隔)</label>
                  <input
                    type="text"
                    value={formTriggers}
                    onChange={(e) => setFormTriggers(e.target.value)}
                    placeholder="催件, VIP催件"
                    className="w-full px-3 py-2 rounded-xl border outline-none focus:border-[var(--purple)]"
                    style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-muted block">描述简述 (Description)</label>
                <input
                  type="text"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="简要说明此技能的用途与适用场景..."
                  className="w-full px-3 py-2 rounded-xl border outline-none focus:border-[var(--purple)]"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-muted block">技能规则/Prompt 正文 (Content)</label>
                <textarea
                  rows={5}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="输入技能详细指令与范例..."
                  className="w-full p-3 rounded-xl border font-mono outline-none focus:border-[var(--purple)]"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              <div className="p-2.5 rounded-xl bg-slate-500/10 border border-slate-500/20 text-[11px] text-muted flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-[var(--yellow)] flex-shrink-0" />
                <span>保存后将以【草稿 (Draft)】状态存储，在 Vera 审核确认激活前不会自动参与对话调度。</span>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl border text-muted hover:text-primary cursor-pointer"
                  style={{ borderColor: 'var(--border)' }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl font-bold cursor-pointer shadow-xs"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
                  id="save-skill-draft-btn"
                >
                  保存为草稿
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* MODAL 2: Human Gate Confirm Activation Modal */}
      {activatingSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-app)]/80 backdrop-blur-sm animate-in fade-in duration-200">
          <motion.div
            initial={reduced ? undefined : { scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md rounded-2xl border shadow-2xl p-6 space-y-4 glass-panel"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center space-x-2 text-[var(--yellow)]">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="text-sm font-extrabold">人人把关 (Human-in-the-loop Gate)</h3>
            </div>

            <p className="text-xs text-secondary leading-relaxed">
              您正在准备激活技能：<strong className="text-primary">【{activatingSkill.name}】</strong>。
              <br /><br />
              <strong>确认后果：</strong>激活后，此技能将进入正式 AI 规则调度池，并在匹配对话触发词时自动响应。
            </p>

            <div className="p-3 rounded-xl border bg-[var(--bg-subtle)] space-y-1 text-xs font-mono" style={{ borderColor: 'var(--border)' }}>
              <div>Key: {activatingSkill.key}</div>
              <div>Version: {activatingSkill.version}</div>
              <div>Triggers: {(activatingSkill.triggers || []).join(', ')}</div>
            </div>

            <div className="pt-2 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setActivatingSkill(null)}
                className="px-4 py-2 rounded-xl border text-xs text-muted hover:text-primary cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleExecuteActivate}
                className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer shadow-xs"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
                id="confirm-activate-skill-btn"
              >
                确认激活上线
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* MODAL 3: Reject AI Proposal Modal */}
      {rejectingSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-app)]/80 backdrop-blur-sm animate-in fade-in duration-200">
          <motion.div
            initial={reduced ? undefined : { scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md rounded-2xl border shadow-2xl p-6 space-y-4 glass-panel"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-sm font-extrabold text-[var(--red)]">
                拒绝 AI 技能演化提议
              </h3>
              <button type="button" onClick={() => setRejectingSkill(null)} className="p-1 text-muted hover:text-primary cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-secondary">
              拒绝提议【{rejectingSkill.name}】后，此技能草稿将被移入已停用列表。请在下方说明拒绝原因以便系统改进：
            </p>

            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="例如：措辞过于死板，或暂不需要此类高频模版..."
              className="w-full p-2.5 rounded-xl border text-xs outline-none focus:border-[var(--red)]"
              style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectingSkill(null)}
                className="px-4 py-2 rounded-xl border text-xs text-muted hover:text-primary cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleExecuteReject}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--red)] text-white cursor-pointer shadow-xs hover:bg-[var(--red)]"
              >
                确认拒绝
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* MODAL 4: Version History & Rollback Modal */}
      {historySkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--bg-app)]/80 backdrop-blur-sm animate-in fade-in duration-200">
          <motion.div
            initial={reduced ? undefined : { scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-lg rounded-2xl border shadow-2xl p-6 space-y-4 glass-panel max-h-[85vh] flex flex-col"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center space-x-2">
                <History className="w-4 h-4 text-[var(--purple)]" />
                <h3 className="text-sm font-extrabold" style={{ color: 'var(--text-primary)' }}>
                  版本历史与回滚: {historySkill.name}
                </h3>
              </div>
              <button type="button" onClick={() => setHistorySkill(null)} className="p-1 text-muted hover:text-primary cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-muted">
              当前版本：<strong className="text-primary">v{historySkill.version}</strong>。可随时选择旧版本并执行一键回滚。
            </p>

            <div className="space-y-3 flex-1 overflow-y-auto no-scrollbar pt-1">
              {(historySkill.versions || []).length === 0 ? (
                <p className="text-xs text-muted">暂无更早的版本演化记录</p>
              ) : (
                (historySkill.versions || []).map((verObj, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border bg-[var(--bg-subtle)] space-y-2 text-xs"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-[var(--purple)]">
                          v{verObj.version}
                        </span>
                        <span className="text-[11px] text-muted">({verObj.updated_at})</span>
                      </div>
                      {verObj.version !== historySkill.version && (
                        <button
                          type="button"
                          onClick={() => handleExecuteRollback(historySkill, verObj.version)}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer shadow-xs"
                          style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
                        >
                          回滚至此版本
                        </button>
                      )}
                    </div>
                    <p className="text-secondary text-[11px] leading-relaxed">
                      {verObj.content}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t flex justify-end" style={{ borderColor: 'var(--border)' }}>
              <button
                type="button"
                onClick={() => setHistorySkill(null)}
                className="px-4 py-1.5 rounded-xl border text-xs text-muted hover:text-primary cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
              >
                关闭
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
