import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, FolderPlus, ListPlus, AlertCircle } from 'lucide-react';
import { useCaseStore } from '../../stores/caseStore';
import { useTaskStore } from '../../stores/taskStore';
import { useToastStore } from '../../stores/toastStore';
import { createTask } from '../../services/api/tasks';

interface NewTaskModalProps {
  open: boolean;
  onClose: () => void;
  onOpenNewCase?: () => void;
}

export function NewTaskModal({ open, onClose, onOpenNewCase }: NewTaskModalProps) {
  const cases = useCaseStore((s) => s.cases);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);
  const showToast = useToastStore((s) => s.showToast);

  const [caseId, setCaseId] = useState('');
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState('high');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseId) {
      setError('请选择关联案件');
      return;
    }
    if (!title.trim()) {
      setError('请填写任务标题');
      return;
    }

    setLoading(true);
    setError(null);

    const isMock = import.meta.env.VITE_USE_MOCK !== 'false';
    if (isMock) {
      setTimeout(() => {
        showToast('success', '新建任务成功');
        fetchTasks();
        setLoading(false);
        onClose();
      }, 300);
      return;
    }

    try {
      await createTask({
        title: title.trim(),
        case_id: caseId,
        deadline: deadline ? `${deadline}T17:00:00Z` : null,
        priority,
        source_channel: 'manual',
      });
      showToast('success', '任务创建成功');
      await fetchTasks();
      onClose();
    } catch (err: any) {
      setError(err?.message || '创建任务失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs" id="new-task-modal-overlay">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden flex flex-col space-y-4 p-5"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
          id="new-task-modal"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center space-x-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              <ListPlus className="w-4 h-4 text-purple-500" />
              <span>新建手工任务 (New Task)</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:opacity-80 transition-opacity cursor-pointer text-muted"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form / Guidance */}
          {cases.length === 0 ? (
            <div className="p-4 rounded-xl border bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs space-y-3">
              <div className="flex items-center space-x-2 font-bold">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-500" />
                <span>未找到可用案件，无法创建关联任务</span>
              </div>
              <p className="text-[11px] text-muted">
                新任务必须关联具体客户案件，请先建立对应贷款案件。
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  if (onOpenNewCase) onOpenNewCase();
                }}
                className="w-full py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs"
              >
                <FolderPlus className="w-4 h-4" />
                <span>先去新建案件</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              {error && (
                <div className="p-2.5 rounded-xl border bg-rose-500/10 border-rose-500/20 text-rose-600 text-xs flex items-center space-x-1.5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* 1. 关联案件 */}
              <div className="space-y-1">
                <label className="font-bold text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  关联案件 <span className="text-rose-500">*</span>
                </label>
                <select
                  id="newtask-case"
                  value={caseId}
                  onChange={(e) => setCaseId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border outline-none font-medium bg-black/5 dark:bg-white/5"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                  <option value="">-- 请选择关联案件 --</option>
                  {cases.map((c) => (
                    <option key={c.caseId} value={c.caseId}>
                      {c.clientName} ({c.lender} - ${c.loanAmount ? (c.loanAmount >= 10000 ? `${(c.loanAmount / 10000).toFixed(0)}万` : c.loanAmount) : '0'})
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. 标题 */}
              <div className="space-y-1">
                <label className="font-bold text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  任务标题 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  id="newtask-title"
                  placeholder="一句话说明任务要求，如：与客户沟通补充工资单..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border outline-none font-medium bg-black/5 dark:bg-white/5"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              {/* 3. 截止时间 */}
              <div className="space-y-1">
                <label className="font-bold text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  截止日期 (可选)
                </label>
                <input
                  type="date"
                  id="newtask-deadline"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border outline-none font-medium bg-black/5 dark:bg-white/5"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              {/* 4. 优先级 */}
              <div className="space-y-1">
                <label className="font-bold text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  优先级
                </label>
                <select
                  id="newtask-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border outline-none font-medium bg-black/5 dark:bg-white/5"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                  <option value="urgent">🔥 紧急 (Urgent)</option>
                  <option value="high">✨ 高优先 (High)</option>
                  <option value="normal">⚡ 普通 (Normal)</option>
                  <option value="low">⏳ 低优先 (Low)</option>
                </select>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t flex items-center justify-end space-x-2" style={{ borderColor: 'var(--border)' }}>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer hover:opacity-80"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 rounded-xl text-xs font-bold text-white shadow-xs cursor-pointer hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  {loading ? '提交中...' : '确认新建'}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
