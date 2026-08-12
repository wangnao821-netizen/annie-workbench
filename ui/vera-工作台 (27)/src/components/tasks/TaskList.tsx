import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, CheckCircle2, X, RefreshCw, AlertCircle } from 'lucide-react';
import { useTaskStore } from '../../stores/taskStore';
import { useToastStore } from '../../stores/toastStore';
import { TaskCard } from './TaskCard';
import { EmptyState } from './EmptyState';
import { TaskSkeleton } from './TaskSkeleton';
import { TaskItem, QuickAction } from '../../types';

export function TaskList() {
  const { 
    tasks, selectedTaskId, selectedIds, filter, searchQuery, loading, error,
    fetchTasks, setFilter, setSearchQuery, selectTask, toggleSelect, clearSelection,
    completeTask, dispatchTaskAction
  } = useTaskStore();

  const showToast = useToastStore((s) => s.showToast);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  const filteredTasks = tasks.filter((task) => {
    let categoryMatch = true;
    if (filter === "email") categoryMatch = task.filterCategory === "email" || ["EMAIL_DISPATCH", "NEW_CLIENT", "GENERAL_EMAIL"].includes(task.type);
    else if (filter === "file") categoryMatch = task.filterCategory === "file" || ["FILE_MATCH", "SETTLEMENT"].includes(task.type);
    else if (filter === "os") categoryMatch = task.filterCategory === "os" || task.type === "OS_ATTACK";
    else if (filter === "brandon") categoryMatch = task.filterCategory === "brandon" || task.type === "BOSS_DECISION";
    else if (filter === "overdue") categoryMatch = task.filterCategory === "overdue" || task.type === "OVERDUE_REMINDER";

    let searchMatch = true;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      searchMatch = task.title.toLowerCase().includes(q) ||
        task.subtitle.toLowerCase().includes(q) ||
        !!(task.caseName && task.caseName.toLowerCase().includes(q)) ||
        !!(task.caseId && task.caseId.toLowerCase().includes(q)) ||
        !!(task.aiSummary && task.aiSummary.toLowerCase().includes(q));
    }
    return categoryMatch && searchMatch;
  });

  const pendingTasks = filteredTasks.filter((t) => !t.completed);
  const completedTasks = filteredTasks.filter((t) => t.completed);

  const handleQuickAction = (task: TaskItem, action: QuickAction) => {
    selectTask(task.id);
    if (action.action === "ignore" || action.action === "record_reply") completeTask(task.id);
  };

  const handleBatchAction = async (action: 'approve' | 'reject') => {
    if (selectedIds.length === 0 || isBatchProcessing) return;
    setIsBatchProcessing(true);
    const count = selectedIds.length;
    try {
      for (const id of selectedIds) await dispatchTaskAction(id, action);
      showToast('success', `已批量处理 ${count} 项`);
      clearSelection();
    } catch {
      showToast('error', '批量处理失败');
    } finally {
      setIsBatchProcessing(false);
    }
  };

  return (
    <div className="w-[380px] flex-shrink-0 border-r flex flex-col h-full overflow-hidden select-none relative" style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border)' }} id="workbench-task-list">
      <div className="p-3 border-b flex items-center space-x-2" style={{ borderColor: 'var(--border)' }}>
        <div className="flex-1 flex items-center px-3 py-1.5 rounded-xl border text-xs space-x-2" style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)' }}>
          <Search className="w-3.5 h-3.5 flex-shrink-0 text-muted" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索案件、客户姓名或任务..." aria-label="搜索任务" className="bg-transparent border-none outline-none w-full text-xs" style={{ color: 'var(--text-primary)' }} id="task-search-input" />
          {searchQuery && <button onClick={() => setSearchQuery('')} className="p-0.5 hover:opacity-80 text-muted"><X className="w-3 h-3" /></button>}
        </div>
      </div>

      {error && (
        <div className="m-3 p-2.5 rounded-xl border flex items-center justify-between text-xs" style={{ backgroundColor: 'var(--red-soft)', borderColor: 'rgba(248,113,113,0.3)', color: 'var(--red)' }}>
          <div className="flex items-center space-x-1.5 truncate pr-1"><AlertCircle className="w-4 h-4 flex-shrink-0" /><span className="truncate">{error}</span></div>
          <button onClick={() => fetchTasks()} className="flex items-center space-x-1 px-2 py-0.5 rounded border text-[11px] font-semibold flex-shrink-0 bg-white/10 hover:bg-white/20 cursor-pointer" id="task-list-retry-btn">
            <RefreshCw className="w-3 h-3" /><span>重试</span>
          </button>
        </div>
      )}

      {loading && tasks.length === 0 ? (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar">{[1, 2, 3, 4, 5].map((i) => <TaskSkeleton key={i} />)}</div>
      ) : filteredTasks.length === 0 ? (
        <EmptyState filter={filter} onResetFilter={() => setFilter('all')} />
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-4 no-scrollbar pb-16" id="task-items-scroll">
          {pendingTasks.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1 text-[11px] font-bold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>
                <span>待处理事项</span>
                <span className="px-1.5 py-0.2 rounded-md font-mono" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--accent)' }}>{pendingTasks.length}</span>
              </div>
              <div className="space-y-2.5">
                <AnimatePresence mode="popLayout">
                  {pendingTasks.map((task) => (
                    <motion.div key={task.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -50, scale: 0.95 }} transition={{ type: 'spring', stiffness: 450, damping: 30 }}>
                      <TaskCard task={task} isSelected={task.id === selectedTaskId} isMultiSelected={selectedIds.includes(task.id)} onSelect={selectTask} onToggleSelect={toggleSelect} onQuickAction={handleQuickAction} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {completedTasks.length > 0 && (
            <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center space-x-1.5 px-1 text-[11px] font-bold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>
                <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} /><span>已完成 ({completedTasks.length})</span>
              </div>
              <div className="space-y-2.5">
                {completedTasks.map((task) => (
                  <div key={task.id}><TaskCard task={task} isSelected={task.id === selectedTaskId} onSelect={selectTask} /></div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.95 }} transition={{ type: 'spring', damping: 20, stiffness: 300 }} id="batch-action-bar" className="absolute bottom-4 left-3 right-3 z-30 px-3.5 py-2.5 rounded-2xl border shadow-xl flex items-center justify-between text-xs" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--accent)', color: 'var(--text-primary)' }}>
            <span className="font-bold text-[11px]">已选 <span style={{ color: 'var(--accent)' }}>{selectedIds.length}</span> 项</span>
            <div className="flex items-center space-x-2">
              <motion.button whileTap={{ scale: 0.95 }} disabled={isBatchProcessing} onClick={() => handleBatchAction('approve')} className="px-2.5 py-1 rounded-xl font-semibold text-white cursor-pointer disabled:opacity-50 flex items-center space-x-1 shadow-xs" style={{ backgroundColor: 'var(--accent)' }}>
                <span>🙋 我来做</span>
              </motion.button>
              <motion.button whileTap={{ scale: 0.95 }} disabled={isBatchProcessing} onClick={() => handleBatchAction('reject')} className="px-2.5 py-1 rounded-xl font-semibold cursor-pointer border disabled:opacity-50 flex items-center space-x-1" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                <span>🔇 忽略</span>
              </motion.button>
              <motion.button whileTap={{ scale: 0.95 }} disabled={isBatchProcessing} onClick={clearSelection} className="p-1 rounded-lg cursor-pointer hover:opacity-80" style={{ color: 'var(--text-muted)' }} title="取消选择">
                <X className="w-4 h-4" />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
