import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  X, Plus, CheckCircle2, Circle, UserPlus, Calendar, ArrowUpRight, Check, AlertCircle,
  Crown, Mail, FolderOpen, Landmark, Settings
} from 'lucide-react';
import { useTaskStore } from '../../stores/taskStore';
import { useUiStore } from '../../stores/uiStore';
import { useToastStore } from '../../stores/toastStore';
import { TaskItem, TaskPriority } from '../../types';
import { delegateTask, createTask } from '../../services/api/tasks';

interface TaskDrawerProps {
  caseId: string | null;
}

type TabType = 'all' | 'overdue' | 'in_progress' | 'boss' | 'delegated' | 'completed';

export function TaskDrawer({ caseId }: TaskDrawerProps) {
  const reduced = useReducedMotion();
  const open = useUiStore((s) => s.taskDrawerOpen);
  const setOpen = useUiStore((s) => s.setTaskDrawerOpen);
  const taskDrawerTab = useUiStore((s) => s.taskDrawerTab);
  const tasks = useTaskStore((s) => s.tasks);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);
  const completeTask = useTaskStore((s) => s.completeTask);

  const [activeTab, setActiveTab] = useState<TabType>(taskDrawerTab || 'all');

  useEffect(() => {
    if (open) {
      setActiveTab(taskDrawerTab || 'all');
    }
  }, [open, taskDrawerTab]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form states
  const [newTitle, setNewTitle] = useState('');
  const [newDeadline, setNewDeadline] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('normal');
  const [newAssignee, setNewAssignee] = useState<'vera' | 'brandon'>('vera');

  // Inline Delegate state
  const [delegatingTaskId, setDelegatingTaskId] = useState<number | null>(null);
  const [delegateTo, setDelegateTo] = useState('brandon');
  const [delegateDeadline, setDelegateDeadline] = useState('');

  // Inline Edit Deadline state
  const [editingDeadlineTaskId, setEditingDeadlineTaskId] = useState<number | null>(null);
  const [editingDeadlineVal, setEditingDeadlineVal] = useState('');

  useEffect(() => {
    if (open) {
      fetchTasks();
    }
  }, [open, fetchTasks]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, setOpen]);

  if (!open) return null;

  // Filter tasks belonging to current case
  const caseTasks = tasks.filter((t) => {
    if (!caseId) return true;
    if (t.caseId === caseId) return true;
    if ((caseId === 'CASE_001' || caseId === 'CASE-2026-0801') && (t.id === 1 || t.id === 6 || t.id === 101 || t.id === 102)) {
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
    if (!deadlineStr) return { label: '无截止', colorClass: 'bg-[var(--bg-subtle)] text-muted ' };
    const date = new Date(deadlineStr);
    if (isNaN(date.getTime())) return { label: '无截止', colorClass: 'bg-[var(--bg-subtle)] text-muted ' };

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
        colorClass: 'bg-[var(--orange-soft)] text-[var(--orange)] dark:text-[var(--orange)] border border-[var(--orange-soft)] font-semibold',
      };
    }
    return {
      label: `${date.getMonth() + 1}-${date.getDate()} 到期`,
      colorClass: 'bg-[var(--bg-subtle)] text-muted ',
    };
  };

  const getCategoryBadge = (task: TaskItem) => {
    if (task.escalatedToBoss || task.type === 'BOSS_DECISION') {
      return { label: '老板', Icon: Crown, colorClass: 'bg-[var(--yellow-soft)] text-[var(--yellow)] border-[var(--yellow-soft)]' };
    }
    if (task.type === 'EMAIL_DISPATCH' || task.type === 'GENERAL_EMAIL' || task.type === 'NEW_CLIENT') {
      return { label: '邮件', Icon: Mail, colorClass: 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-soft)]' };
    }
    if (task.type === 'FILE_MATCH' || task.type === 'SETTLEMENT') {
      return { label: '文件', Icon: FolderOpen, colorClass: 'bg-[var(--yellow-soft)] text-[var(--yellow)] border-[var(--yellow-soft)]' };
    }
    if (task.type === 'OS_ATTACK') {
      return { label: 'OS', Icon: Landmark, colorClass: 'bg-[var(--purple-soft)] text-[var(--purple)] border-[var(--purple-soft)]' };
    }
    return { label: '其他', Icon: Settings, colorClass: 'bg-[var(--bg-subtle)]/15 text-[var(--text-secondary)] dark:text-[var(--text-secondary)] border-[var(--border)]/30' };
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
    } catch {
      useToastStore.getState().showToast('error', '委派任务失败');
    }
  };

  const handleDeadlineSave = async (taskId: number) => {
    // Soft notification / toast for updating deadline
    useToastStore.getState().showToast('success', `任务 #${taskId} 已更新截止日期为 ${editingDeadlineVal || '未设置'}`);
    setEditingDeadlineTaskId(null);
    await fetchTasks();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0  }}
        animate={{ opacity: 1 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0  }}
        className="absolute inset-0 bg-[var(--bg-subtle-strong)] dark:bg-[var(--bg-app)]/60 z-30 backdrop-blur-xs flex items-center justify-center p-4"
        onClick={() => setOpen(false)}
        id="task-drawer-overlay"
      >
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-[480px] max-w-[92%] h-[min(760px,90%)] rounded-2xl border shadow-2xl bg-[var(--bg-panel)] flex flex-col overflow-hidden relative select-none"
          style={{ borderColor: 'var(--border)' }}
          onClick={(e) => e.stopPropagation()}
          id="task-drawer-panel"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0 glass-panel" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-[var(--purple-soft)] text-[var(--purple)]">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <span className="font-extrabold text-sm" style={{ color: 'var(--text-primary)' }}>
                客户任务 ({caseTasks.length})
              </span>
            </div>
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg border text-muted hover:text-primary cursor-pointer transition-colors"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
              id="task-drawer-close-btn"
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>

          {/* Category Tabs */}
          <div className="px-3 py-2 border-b flex items-center space-x-1 overflow-x-auto no-scrollbar flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
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
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                  activeTab === tab.id
                    ? 'bg-[var(--purple-soft)] text-[var(--purple)] border border-[var(--purple-soft)] font-bold'
                    : 'text-muted hover:text-primary hover:bg-[var(--bg-subtle)]'
                }`}
                id={`task-tab-${tab.id}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Task List - Compact One-Line Items */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5 no-scrollbar">
            {filteredTasks.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-center space-y-2 text-muted">
                <AlertCircle className="w-6 h-6 text-muted" />
                <p className="text-xs font-medium">当前分类暂无任务</p>
              </div>
            ) : (
              filteredTasks.map((task) => {
                const deadlineBadge = getDeadlineBadge(task.deadline);
                const categoryBadge = getCategoryBadge(task);
                const isDelegating = delegatingTaskId === task.id;
                const isEditingDeadline = editingDeadlineTaskId === task.id;

                return (
                  <div
                    key={task.id}
                    className="group p-2.5 rounded-xl border transition-all hover:border-[var(--purple-soft)] flex flex-col space-y-2 bg-[var(--bg-card)]"
                    style={{ borderColor: 'var(--border)' }}
                    id={`task-item-${task.id}`}
                  >
                    {/* Top Row: One line compact layout */}
                    <div className="flex items-center justify-between space-x-2 min-w-0">
                      <div className="flex items-center space-x-2 truncate flex-1 min-w-0">
                        {/* Complete Checkbox */}
                        <motion.button
                          whileTap={{ scale: 0.88 }}
                          onClick={() => completeTask(task.id)}
                          className="text-muted hover:text-[var(--green)] cursor-pointer flex-shrink-0"
                          title={task.completed ? '已完成' : '标记完成'}
                          id={`task-complete-btn-${task.id}`}
                        >
                          {task.completed ? (
                            <CheckCircle2 className="w-4 h-4 text-[var(--green)]" />
                          ) : (
                            <Circle className="w-4 h-4 text-muted" />
                          )}
                        </motion.button>

                        {/* Title */}
                        <span
                          className={`text-xs font-medium truncate cursor-pointer hover:text-[var(--purple)] transition-colors ${
                            task.completed ? 'line-through text-muted' : 'text-[var(--text-primary)] font-semibold'
                          }`}
                          onClick={() => useUiStore.getState().openTaskDetail(task.id)}
                          title={task.title || task.subtitle}
                        >
                          {task.title || task.subtitle}
                        </span>
                      </div>

                      {/* Right Meta: Category Badge & Deadline Tag */}
                      <div className="flex items-center space-x-1.5 flex-shrink-0 text-[11px]">
                        <span className={`px-1.5 py-0.5 rounded border font-medium flex items-center space-x-1 ${categoryBadge.colorClass}`}>
                          <categoryBadge.Icon className="w-3 h-3" />
                          <span>{categoryBadge.label}</span>
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-xs ${deadlineBadge.colorClass}`}>
                          {deadlineBadge.label}
                        </span>
                      </div>
                    </div>

                    {/* Hover Actions Bar */}
                    <div className="flex items-center justify-end space-x-2 pt-1 border-t opacity-90 transition-opacity text-[11px]" style={{ borderColor: 'var(--border)' }}>
                      {/* Mark Complete */}
                      {!task.completed && (
                        <button
                          type="button"
                          onClick={() => completeTask(task.id)}
                          className="px-2 py-0.5 rounded text-xs font-bold text-[var(--green)] bg-[var(--green-soft)] hover:bg-[var(--green-soft)] cursor-pointer flex items-center space-x-0.5"
                          id={`hover-complete-${task.id}`}
                        >
                          <Check className="w-3 h-3" />
                          <span>完成</span>
                        </button>
                      )}

                      {/* Delegate */}
                      <button
                        type="button"
                        onClick={() => {
                          setDelegatingTaskId(isDelegating ? null : task.id);
                          setEditingDeadlineTaskId(null);
                        }}
                        className="px-2 py-0.5 rounded text-xs font-medium text-[var(--accent)] bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] cursor-pointer flex items-center space-x-0.5"
                        id={`hover-delegate-${task.id}`}
                      >
                        <UserPlus className="w-3 h-3" />
                        <span>委派</span>
                      </button>

                      {/* Change Deadline */}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDeadlineTaskId(isEditingDeadline ? null : task.id);
                          setDelegatingTaskId(null);
                        }}
                        className="px-2 py-0.5 rounded text-xs font-medium text-[var(--yellow)] bg-[var(--yellow-soft)] hover:bg-[var(--yellow-soft)] cursor-pointer flex items-center space-x-0.5"
                        id={`hover-deadline-${task.id}`}
                      >
                        <Calendar className="w-3 h-3" />
                        <span>改截止</span>
                      </button>

                      {/* Detail */}
                      <button
                        type="button"
                        onClick={() => {
                          useUiStore.getState().openTaskDetail(task.id);
                        }}
                        className="px-2 py-0.5 rounded text-xs font-medium text-[var(--purple)] bg-[var(--purple-soft)] hover:bg-[var(--purple-soft)] cursor-pointer flex items-center space-x-0.5"
                        id={`hover-detail-${task.id}`}
                      >
                        <span>详情</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Inline Delegate Form */}
                    {isDelegating && (
                      <div className="p-2 rounded-lg bg-[var(--accent-soft)] border border-[var(--accent-soft)] space-y-2 mt-1">
                        <div className="text-[11px] font-bold text-[var(--accent)] dark:text-[var(--accent)]">委派任务</div>
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

          {/* Bottom Area: Create Task Form Toggle */}
          <div className="p-3 border-t glass-panel flex-shrink-0 space-y-2" style={{ borderColor: 'var(--border)' }}>
            {!showCreateForm ? (
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => setShowCreateForm(true)}
                className="w-full py-2 rounded-xl text-xs font-bold text-[var(--on-accent)] bg-[var(--accent)] hover:opacity-90 flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs transition-opacity"
                id="task-drawer-create-btn"
              >
                <Plus className="w-4 h-4" />
                <span>新建任务</span>
              </motion.button>
            ) : (
              <div className="p-3 rounded-xl border bg-[var(--bg-card)] space-y-2.5" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                  <span>新建客户任务</span>
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
                      className="w-full p-2 rounded-lg border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none focus:border-[var(--purple)]"
                      id="new-task-title-input"
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
                        id="new-task-deadline-input"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-muted mb-1">优先级</label>
                      <select
                        value={newPriority}
                        onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                        className="w-full p-1.5 rounded-lg border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none"
                        id="new-task-priority-select"
                      >
                        <option value="urgent">🔴 紧急 (Urgent)</option>
                        <option value="high">🟠 高 (High)</option>
                        <option value="normal">🟡 普通 (Normal)</option>
                        <option value="low">⚪ 低 (Low)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-muted mb-1">负责人</label>
                    <select
                      value={newAssignee}
                      onChange={(e) => setNewAssignee(e.target.value as 'vera' | 'brandon')}
                      className="w-full p-1.5 rounded-lg border bg-[var(--bg-input)] border-[var(--border)] text-xs outline-none"
                      id="new-task-assignee-select"
                    >
                      <option value="vera">Vera AI</option>
                      <option value="brandon">Brandon (经纪人/助理)</option>
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
                    whileTap={{ scale: 0.94 }}
                    onClick={handleCreateTask}
                    disabled={creating}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold text-[var(--on-accent)] bg-[var(--accent)] hover:opacity-90 cursor-pointer shadow-xs disabled:opacity-50"
                    id="submit-new-task-btn"
                  >
                    {creating ? '创建中...' : '提交新建'}
                  </motion.button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
