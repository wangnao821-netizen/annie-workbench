import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Plus,
  CheckCircle2,
  Circle,
  UserPlus,
  Calendar,
  ArrowUpRight,
  Check,
  Crown,
  Mail,
  FolderOpen,
  Landmark,
  X,
} from 'lucide-react';
import { useTaskStore } from '../../stores/taskStore';
import { useUiStore } from '../../stores/uiStore';
import { useToastStore } from '../../stores/toastStore';
import { TaskItem, TaskPriority } from '../../types';
import { delegateTask, createTask } from '../../services/api/tasks';

interface TaskDeckContentProps {
  caseId: string | null;
}

type TabType = 'all' | 'overdue' | 'in_progress' | 'boss' | 'delegated' | 'completed';

export function TaskDeckContent({ caseId }: TaskDeckContentProps) {
  const reduced = useReducedMotion();
  const tasks = useTaskStore((s) => s.tasks);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);
  const completeTask = useTaskStore((s) => s.completeTask);

  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form states
  const [newTitle, setNewTitle] = useState('');
  const [newDeadline, setNewDeadline] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('normal');
  const [newAssignee, setNewAssignee] = useState<'vera' | 'brandon' | 'boss'>('vera');

  // Inline Delegate state
  const [delegatingTaskId, setDelegatingTaskId] = useState<number | null>(null);
  const [delegateTo, setDelegateTo] = useState('brandon');
  const [delegateDeadline, setDelegateDeadline] = useState('');

  // Inline Edit Deadline state
  const [editingDeadlineTaskId, setEditingDeadlineTaskId] = useState<number | null>(null);
  const [editingDeadlineVal, setEditingDeadlineVal] = useState('');

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Filter tasks belonging to current case
  const caseTasks = tasks.filter((t) => {
    if (!caseId) return true;
    if (t.caseId === caseId) return true;
    if (
      (caseId === 'CASE_001' || caseId === 'CASE-2026-0801') &&
      (t.id === 1 || t.id === 6 || t.id === 101 || t.id === 102)
    ) {
      return true;
    }
    return false;
  });

  const isTaskOverdue = (t: TaskItem) => {
    if (t.completed) return false;
    if (!t.deadline) return false;
    const date = new Date(t.deadline);
    if (isNaN(date.getTime())) return false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    return target.getTime() < now.getTime();
  };

  const filteredTasks = caseTasks.filter((t) => {
    if (activeTab === 'overdue') return isTaskOverdue(t);
    if (activeTab === 'in_progress') return !t.completed;
    if (activeTab === 'boss') return t.escalatedToBoss || t.type === 'BOSS_DECISION';
    if (activeTab === 'delegated') return Boolean(t.delegatedTo);
    if (activeTab === 'completed') return t.completed;
    return true;
  });

  const getDeadlineBadge = (deadlineStr?: string | null) => {
    if (!deadlineStr) return { label: '无截止', colorClass: 'bg-[var(--bg-subtle)] text-muted' };
    const date = new Date(deadlineStr);
    if (isNaN(date.getTime())) return { label: '无截止', colorClass: 'bg-[var(--bg-subtle)] text-muted' };

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);

    const diffMs = target.getTime() - now.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        label: `已逾期 ${Math.abs(diffDays)} 天`,
        colorClass: 'bg-[var(--red-soft)] text-[var(--red)] border border-[var(--red-soft)] font-bold',
      };
    }
    if (diffDays === 0) {
      return {
        label: '今天到期',
        colorClass: 'bg-[var(--yellow-soft)] text-[var(--yellow)] border border-[var(--yellow-soft)] font-bold',
      };
    }
    if (diffDays <= 7) {
      return {
        label: `${diffDays} 天到期`,
        colorClass: 'bg-[var(--orange-soft)] text-[var(--orange)] border border-[var(--orange-soft)] font-semibold',
      };
    }
    return {
      label: `${date.getMonth() + 1}-${date.getDate()} 到期`,
      colorClass: 'bg-[var(--bg-subtle)] text-muted',
    };
  };

  const getCategoryBadge = (task: TaskItem) => {
    if (task.escalatedToBoss || task.type === 'BOSS_DECISION') {
      return { label: '待老板', Icon: Crown, colorClass: 'bg-[var(--yellow-soft)] text-[var(--yellow)] border-[var(--yellow-soft)]' };
    }
    if (task.type === 'EMAIL_DISPATCH' || task.type === 'GENERAL_EMAIL' || task.type === 'NEW_CLIENT') {
      return { label: '邮件', Icon: Mail, colorClass: 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-soft)]' };
    }
    if (task.type === 'FILE_MATCH' || task.type === 'SETTLEMENT') {
      return { label: '材料', Icon: FolderOpen, colorClass: 'bg-[var(--green-soft)] text-[var(--green)] border-[var(--green-soft)]' };
    }
    if (task.type === 'OS_ATTACK') {
      return { label: 'OS攻坚', Icon: Landmark, colorClass: 'bg-[var(--purple-soft)] text-[var(--purple)] border-[var(--purple-soft)]' };
    }

    // 根据标题关键词智能分类，避免生硬的“其他”
    const t = `${task.title} ${task.subtitle || ''}`;
    if (t.includes('催') || t.includes('电话') || t.includes('联系客户')) {
      return { label: '催件/联系', Icon: Calendar, colorClass: 'bg-[var(--orange-soft)] text-[var(--orange)] border-[var(--orange-soft)]' };
    }
    if (t.includes('邮件') || t.includes('BDM') || t.includes('草稿')) {
      return { label: '外发邮件', Icon: Mail, colorClass: 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-soft)]' };
    }
    if (t.includes('政策') || t.includes('核实') || t.includes('口径')) {
      return { label: '政策核查', Icon: Landmark, colorClass: 'bg-[var(--purple-soft)] text-[var(--purple)] border-[var(--purple-soft)]' };
    }
    if (t.includes('流水') || t.includes('对账单') || t.includes('结单') || t.includes('材料') || t.includes('补交')) {
      return { label: '材料跟进', Icon: FolderOpen, colorClass: 'bg-[var(--green-soft)] text-[var(--green)] border-[var(--green-soft)]' };
    }

    // 常规事项不展示冗余的“其他”标
    return null;
  };

  const formatAiSummary = (raw?: string | null, title?: string): string | null => {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    let res: string | null = null;
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        const keys = Object.keys(parsed);
        if (keys.length === 1 && (keys[0] === 'source' || keys[0] === 'raw_time' || keys[0] === 'mode')) {
          return null;
        }
        if (parsed.note) res = `备忘: ${parsed.note}`;
        else if (parsed.summary) res = parsed.summary;
        else if (parsed.items && Array.isArray(parsed.items)) {
          res = `要点: ${parsed.items.slice(0, 2).join('；')}`;
        }
        else if (parsed.reason) res = `原因: ${parsed.reason}`;
        else if (parsed.case) {
          const parts = [];
          if (parsed.loan) parts.push(`贷款 $${Number(parsed.loan).toLocaleString()}`);
          if (parsed.rate) parts.push(`利率 ${parsed.rate}%`);
          if (parsed.note) parts.push(parsed.note);
          if (parts.length > 0) res = parts.join(' · ');
        }
      } catch {
        return null;
      }
    } else if (!trimmed.includes('"source"') && !trimmed.includes('"chat"')) {
      res = trimmed;
    }

    if (!res) return null;

    // 若提取出的内容与标题高度重复，则隐藏，避免画面冗余
    if (title) {
      const cleanTitle = title.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
      const cleanRes = res.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
      if (cleanTitle.includes(cleanRes) || cleanRes.includes(cleanTitle)) {
        return null;
      }
    }

    return res;
  };

  const getBankBadge = (task: TaskItem): { name: string; styleClass: string } | null => {
    const fullText = `${task.title} ${task.subtitle || ''} ${task.caseBank || ''}`;
    const match = fullText.match(/\b(ANZ|CBA|NAB|WBC|Westpac|Macquarie|ORDE|LaTrobe|Resimac|BOC)\b/i);
    if (!match) return null;

    const b = match[1].toUpperCase();
    if (b === 'ORDE') {
      return { name: 'ORDE', styleClass: 'bg-[#7c3aed]/10 text-[#7c3aed] border border-[#7c3aed]/25' };
    }
    if (b === 'ANZ') {
      return { name: 'ANZ', styleClass: 'bg-[#0284c7]/10 text-[#0284c7] border border-[#0284c7]/25' };
    }
    if (b === 'CBA') {
      return { name: 'CBA', styleClass: 'bg-[#eab308]/15 text-[#b45309] border border-[#eab308]/30' };
    }
    if (b === 'NAB') {
      return { name: 'NAB', styleClass: 'bg-[#dc2626]/10 text-[#dc2626] border border-[#dc2626]/25' };
    }
    if (b === 'WESTPAC' || b === 'WBC') {
      return { name: 'Westpac', styleClass: 'bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/25' };
    }
    if (b === 'MACQUARIE') {
      return { name: 'Macquarie', styleClass: 'bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border)]' };
    }
    return { name: b, styleClass: 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-soft)]' };
  };

  const getSourceLabel = (task: TaskItem): string | null => {
    const s = (task.sourceChannel || '').toLowerCase();
    if (s.includes('email') || s.includes('mail')) return '📧 邮件';
    if (s.includes('file')) return '📄 材料';
    if (s.includes('wechat') || s.includes('chat')) return '💬 对话';
    if (s.includes('followup') || s.includes('chaser')) return '⏰ 催件';
    if (s.includes('manual')) return '👤 手动';
    return null;
  };

  const handleCreateTask = async () => {
    if (!newTitle.trim()) {
      useToastStore.getState().showToast('error', '请输入任务标题');
      return;
    }
    if (!caseId) {
      useToastStore.getState().showToast('error', '未关联案件');
      return;
    }
    setCreating(true);
    try {
      await createTask({
        title: newTitle.trim(),
        case_id: caseId,
        deadline: newDeadline || null,
        priority: newPriority,
        assignee: newAssignee,
      });
      useToastStore.getState().showToast('success', '任务新建成功');
      setNewTitle('');
      setNewDeadline('');
      setShowCreateForm(false);
      await fetchTasks();
      window.dispatchEvent(new CustomEvent('task_updated'));
    } catch {
      useToastStore.getState().showToast('error', '新建任务失败');
    } finally {
      setCreating(false);
    }
  };

  const handleDelegateSubmit = async (taskId: number) => {
    try {
      await delegateTask(taskId, { delegate_to: delegateTo, deadline: delegateDeadline || undefined });
      useToastStore.getState().showToast('success', `已成功委派给 ${delegateTo}`);
      setDelegatingTaskId(null);
      await fetchTasks();
      window.dispatchEvent(new CustomEvent('task_updated'));
    } catch {
      useToastStore.getState().showToast('error', '委派任务失败');
    }
  };

  const handleDeadlineSave = async (taskId: number) => {
    useToastStore.getState().showToast('success', `任务 #${taskId} 已更新截止日期为 ${editingDeadlineVal || '未设置'}`);
    setEditingDeadlineTaskId(null);
    await fetchTasks();
    window.dispatchEvent(new CustomEvent('task_updated'));
  };

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden relative select-none"
      style={{ backgroundColor: 'var(--bg-card)' }}
      id="task-deck-content"
    >
      {/* 1. Header Toolbar */}
      <div
        className="px-3 py-2.5 border-b flex items-center justify-between flex-shrink-0"
        style={{
          backgroundColor: 'var(--bg-panel)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="flex items-center space-x-1.5 min-w-0">
          <span className="font-extrabold text-xs tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>
            客户任务
          </span>
          <span className="text-[11px] font-mono font-bold text-muted bg-[var(--bg-subtle)] px-1.5 py-0.2 rounded-full">
            {caseTasks.length}
          </span>
          {/* Mini Progress */}
          {(() => {
            const total = caseTasks.length;
            const done = caseTasks.filter(t => t.completed).length;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <div className="flex items-center space-x-1.5 ml-2">
                <div className="w-16 h-1.5 rounded-full overflow-hidden bg-[var(--bg-subtle)]">
                  <motion.div
                    className="h-full rounded-full bg-[var(--green)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
                <span className="text-[10px] font-mono text-muted">{done}/{total}</span>
              </div>
            );
          })()}
        </div>

        <div className="flex items-center space-x-1.5">
          <motion.button
            whileTap={reduced ? undefined : { scale: 0.94 }}
            onClick={() => {
              const osTask = caseTasks.find(t => t.type === 'OS_ATTACK' || t.title.includes('OS') || t.title.includes('补件'));
              useUiStore.getState().openOsWorkbench(osTask ? osTask.id : (caseTasks[0]?.id || 1));
            }}
            className="px-2 py-1 rounded-lg border text-xs font-bold text-[var(--purple)] bg-[var(--purple-soft)] border-[var(--purple)]/30 hover:bg-[var(--purple)] hover:text-white cursor-pointer flex items-center space-x-1 shadow-2xs transition-colors"
            title="打开当前案卷 OS 补件双语攻坚看板"
            id="task-deck-open-os-btn"
          >
            <Landmark className="w-3.5 h-3.5" />
            <span>OS攻坚</span>
          </motion.button>

          <motion.button
            whileTap={reduced ? undefined : { scale: 0.94 }}
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-2.5 py-1 rounded-lg border text-xs font-bold text-[var(--on-accent)] bg-[var(--accent)] hover:opacity-90 cursor-pointer flex items-center space-x-1 shadow-xs"
            id="task-deck-create-btn"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新建</span>
          </motion.button>
        </div>
      </div>

      {/* 2. Category Tabs */}
      <div
        className="px-3 py-1.5 border-b flex items-center space-x-1 overflow-x-auto no-scrollbar flex-shrink-0"
        style={{
          backgroundColor: 'var(--bg-panel)',
          borderColor: 'var(--border)',
        }}
      >
        {[
          { id: 'all', label: '全部' },
          { id: 'overdue', label: '🔴 逾期' },
          { id: 'in_progress', label: '进行中' },
          { id: 'boss', label: '待老板' },
          { id: 'delegated', label: '已委派' },
          { id: 'completed', label: '已完成' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`px-2 py-0.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              activeTab === tab.id
                ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-soft)] font-bold'
                : 'text-muted hover:text-primary hover:bg-[var(--bg-subtle)]'
            }`}
            id={`task-deck-tab-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 3. Create Task Form (Expandable) */}
      {showCreateForm && (
        <div
          className="p-3 border-b bg-[var(--bg-subtle)] space-y-2.5 overflow-hidden flex-shrink-0"
          style={{ borderColor: 'var(--border)' }}
          id="create-task-deck-form"
        >
          <div className="flex items-center justify-between text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
            <span>＋ 新建客户任务</span>
            <button type="button" onClick={() => setShowCreateForm(false)} className="text-muted hover:text-primary">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div>
              <label className="block text-xs font-bold text-muted mb-1">任务标题 *</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="如：联系客户补充 2025 年 NOA"
                className="w-full p-2 rounded-lg border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none focus:border-[var(--accent)]"
                id="new-task-deck-title-input"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-muted mb-1">截止日期</label>
                <input
                  type="date"
                  value={newDeadline}
                  onChange={(e) => setNewDeadline(e.target.value)}
                  className="w-full p-1.5 rounded-lg border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none"
                  id="new-task-deck-deadline-input"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-muted mb-1">优先级</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                  className="w-full p-1.5 rounded-lg border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none"
                  id="new-task-deck-priority-select"
                >
                  <option value="normal">⚪ 普通</option>
                  <option value="urgent">🔴 紧急</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-muted mb-1">指派给</label>
              <select
                value={newAssignee}
                onChange={(e) => setNewAssignee(e.target.value as 'vera' | 'brandon')}
                className="w-full p-1.5 rounded-lg border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none"
                id="new-task-deck-assignee-select"
              >
                <option value="vera">Vera (AI 助理)</option>
                <option value="brandon">Brandon (贷款顾问)</option>
                <option value="boss">老板（拍板）</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-1">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted hover:text-primary cursor-pointer"
            >
              取消
            </button>
            <motion.button
              whileTap={reduced ? undefined : { scale: 0.94 }}
              onClick={handleCreateTask}
              disabled={creating}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-[var(--accent)] hover:opacity-90 cursor-pointer shadow-xs disabled:opacity-50"
              id="submit-new-task-deck-btn"
            >
              {creating ? '创建中...' : '确认创建'}
            </motion.button>
          </div>
        </div>
      )}

      {/* 4. Task List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
        {filteredTasks.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-center space-y-2.5 text-muted">
            <div className="w-10 h-10 rounded-full bg-[var(--bg-subtle)] flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-[var(--green)]" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>🎉 当前分类暂无任务</p>
              <p className="text-[11px] text-muted">所有事项已处理完毕，或切换其他分类查看</p>
            </div>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const deadlineBadge = getDeadlineBadge(task.deadline);
            const categoryBadge = getCategoryBadge(task);
            const sourceLabel = getSourceLabel(task);
            const bankBadge = getBankBadge(task);
            const cleanSummary = formatAiSummary(task.aiSummary || task.subtitle, task.title);
            const isDelegating = delegatingTaskId === task.id;
            const isEditingDeadline = editingDeadlineTaskId === task.id;
            const isOverdue = isTaskOverdue(task);
            const isBossTask = task.escalatedToBoss || task.type === 'BOSS_DECISION';

            const stripeColor = task.completed
              ? 'var(--border)'
              : task.priority === 'urgent'
              ? 'var(--red)'
              : isOverdue
              ? 'var(--red)'
              : isBossTask
              ? 'var(--yellow)'
              : task.priority === 'high'
              ? 'var(--orange)'
              : 'var(--accent)';

            const cardBgGradient = task.completed
              ? 'var(--bg-card)'
              : isOverdue || task.priority === 'urgent'
              ? 'linear-gradient(135deg, rgba(239,68,68,0.04) 0%, var(--bg-card) 100%)'
              : isBossTask
              ? 'linear-gradient(135deg, rgba(234,179,8,0.04) 0%, var(--bg-card) 100%)'
              : task.priority === 'high'
              ? 'linear-gradient(135deg, rgba(249,115,22,0.04) 0%, var(--bg-card) 100%)'
              : 'linear-gradient(135deg, rgba(99,102,241,0.025) 0%, var(--bg-card) 100%)';

            return (
              <div
                key={task.id}
                className={`group p-3 rounded-xl border transition-all hover:border-[var(--accent)] hover:shadow-xs flex flex-col space-y-2 relative overflow-hidden shadow-2xs ${
                  task.completed ? 'opacity-65' : ''
                }`}
                style={{
                  background: cardBgGradient,
                  borderColor: 'var(--border)',
                  borderLeftWidth: '4px',
                  borderLeftColor: stripeColor,
                }}
                id={`task-deck-item-${task.id}`}
              >
                {/* 1. Header Line: Checkbox + Title (line-clamp-2) + Deadline */}
                <div className="flex items-start justify-between space-x-2">
                  <div className="flex items-start space-x-2 flex-1 min-w-0">
                    <motion.button
                      whileTap={reduced ? undefined : { scale: 0.88 }}
                      onClick={() => {
                        completeTask(task.id);
                        window.dispatchEvent(new CustomEvent('task_updated'));
                      }}
                      className="text-muted hover:text-[var(--green)] cursor-pointer flex-shrink-0 mt-0.5"
                      title={task.completed ? '已完成' : '标记完成'}
                      id={`task-deck-complete-btn-${task.id}`}
                    >
                      {task.completed ? (
                        <CheckCircle2 className="w-4 h-4 text-[var(--green)]" />
                      ) : (
                        <Circle className="w-4 h-4 text-muted hover:text-primary" />
                      )}
                    </motion.button>

                    <span
                      className={`text-xs font-semibold leading-snug cursor-pointer hover:text-[var(--accent)] transition-colors line-clamp-2 ${
                        task.completed ? 'line-through text-muted' : 'text-[var(--text-primary)]'
                      }`}
                      onClick={() => useUiStore.getState().openTaskDetail(task.id)}
                      title={task.title || task.subtitle}
                    >
                      {task.title || task.subtitle}
                    </span>
                  </div>

                  <span className={`px-1.5 py-0.5 rounded text-[11px] font-mono flex-shrink-0 ${deadlineBadge.colorClass} ${isOverdue ? 'animate-pulse font-bold' : ''}`}>
                    {deadlineBadge.label}
                  </span>
                </div>

                {/* 2. AI Business Summary Box (if clean summary exists and not redundant) */}
                {cleanSummary && !task.completed && (
                  <div className="ml-6 p-2 rounded-lg text-[11px] leading-relaxed font-sans bg-[var(--bg-app)] border border-[var(--border)]/50 text-[var(--text-secondary)] shadow-2xs">
                    <span className="font-semibold text-[var(--accent)] mr-1">✨</span>
                    {cleanSummary}
                  </div>
                )}

                {/* 3. Bottom Meta Line & Actions */}
                <div className="flex items-center justify-between pt-1 border-t text-[11px] font-mono" style={{ borderColor: 'var(--border)' }}>
                  {/* Left Badges */}
                  <div className="flex items-center space-x-1.5 flex-wrap">
                    {sourceLabel && (
                      <span className="px-1.5 py-0.2 rounded text-[10.5px] bg-[var(--bg-subtle)] text-muted border border-[var(--border)]/30">
                        {sourceLabel}
                      </span>
                    )}
                    {bankBadge && (
                      <span className={`px-1.5 py-0.2 rounded text-[10.5px] font-bold ${bankBadge.styleClass}`}>
                        {bankBadge.name}
                      </span>
                    )}
                    {categoryBadge && (
                      <span className={`px-1.5 py-0.2 rounded text-[10.5px] border font-medium flex items-center space-x-0.5 ${categoryBadge.colorClass}`}>
                        <categoryBadge.Icon className="w-2.5 h-2.5" />
                        <span>{categoryBadge.label}</span>
                      </span>
                    )}
                    {task.assignee && task.assignee !== 'vera' && (
                      <span className="px-1.5 py-0.2 rounded text-[10.5px] bg-[var(--purple-soft)] text-[var(--purple)] font-medium">
                        👤 {task.assignee}
                      </span>
                    )}
                  </div>

                  {/* Right Action Buttons */}
                  <div className="flex items-center space-x-1 flex-shrink-0">
                    {!task.completed && (
                      <button
                        type="button"
                        onClick={() => {
                          completeTask(task.id);
                          window.dispatchEvent(new CustomEvent('task_updated'));
                        }}
                        className="px-2 py-0.5 rounded text-[11px] font-bold text-[var(--green)] hover:bg-[var(--green-soft)] cursor-pointer flex items-center space-x-0.5"
                        title="完成任务"
                      >
                        <Check className="w-3 h-3" />
                        <span>完成</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setDelegatingTaskId(isDelegating ? null : task.id);
                        setEditingDeadlineTaskId(null);
                      }}
                      className="px-2 py-0.5 rounded text-[11px] text-muted hover:text-[var(--accent)] hover:bg-[var(--accent-soft)] cursor-pointer flex items-center space-x-0.5"
                      title="委派任务"
                    >
                      <UserPlus className="w-3 h-3" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingDeadlineTaskId(isEditingDeadline ? null : task.id);
                        setDelegatingTaskId(null);
                      }}
                      className="px-2 py-0.5 rounded text-[11px] text-muted hover:text-[var(--yellow)] hover:bg-[var(--yellow-soft)] cursor-pointer flex items-center space-x-0.5"
                      title="修改截止时间"
                    >
                      <Calendar className="w-3 h-3" />
                    </button>

                    {(task.type === 'OS_ATTACK' || task.title.includes('OS') || task.title.includes('补件')) && (
                      <button
                        type="button"
                        onClick={() => {
                          useUiStore.getState().openOsWorkbench(task.id);
                        }}
                        className="px-1.5 py-0.5 rounded text-[11px] font-bold text-[var(--purple)] bg-[var(--purple-soft)] hover:bg-[var(--purple)] hover:text-white cursor-pointer flex items-center space-x-0.5 transition-colors"
                        title="打开 OS 攻坚草稿看板"
                      >
                        <Landmark className="w-2.5 h-2.5" />
                        <span>攻坚</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        useUiStore.getState().openTaskDetail(task.id);
                      }}
                      className="px-1.5 py-0.5 rounded text-[11px] font-semibold text-[var(--purple)] hover:bg-[var(--purple-soft)] cursor-pointer flex items-center space-x-0.5"
                      title="查看详情"
                    >
                      <span>详情</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Inline Delegate Form */}
                {isDelegating && (
                  <div className="p-2 rounded-lg bg-[var(--accent-soft)] border border-[var(--accent-soft)] space-y-2 mt-1">
                    <div className="text-[11px] font-bold text-[var(--accent)]">委派任务</div>
                    <div className="flex items-center space-x-2">
                      <select
                        value={delegateTo}
                        onChange={(e) => setDelegateTo(e.target.value)}
                        className="text-xs p-1 rounded border bg-[var(--bg-app)] border-[var(--border)]"
                      >
                        <option value="brandon">Brandon (助理)</option>
                        <option value="vera">Vera (AI)</option>
                        <option value="team_lead">团队主管</option>
                      </select>
                      <input
                        type="date"
                        value={delegateDeadline}
                        onChange={(e) => setDelegateDeadline(e.target.value)}
                        className="text-xs p-1 rounded border bg-[var(--bg-app)] border-[var(--border)]"
                      />
                    </div>
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => setDelegatingTaskId(null)}
                        className="px-2 py-0.5 text-[11px] text-muted hover:underline cursor-pointer"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelegateSubmit(task.id)}
                        className="px-2.5 py-1 text-xs font-bold text-[var(--on-accent)] bg-[var(--accent)] hover:bg-[var(--accent)] rounded cursor-pointer"
                      >
                        确认委派
                      </button>
                    </div>
                  </div>
                )}

                {/* Inline Change Deadline Form */}
                {isEditingDeadline && (
                  <div className="p-2 rounded-lg bg-[var(--yellow-soft)] border border-[var(--yellow-soft)] space-y-2 mt-1">
                    <div className="text-[11px] font-bold text-[var(--yellow)]">修改截止日期</div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="date"
                        value={editingDeadlineVal}
                        onChange={(e) => setEditingDeadlineVal(e.target.value)}
                        className="text-xs p-1 rounded border bg-[var(--bg-app)] border-[var(--border)] flex-1"
                      />
                    </div>
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => setEditingDeadlineTaskId(null)}
                        className="px-2 py-0.5 text-[11px] text-muted hover:underline cursor-pointer"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeadlineSave(task.id)}
                        className="px-2.5 py-1 text-xs font-bold text-white bg-[var(--yellow)] hover:bg-[var(--yellow)] rounded cursor-pointer"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
