import { create } from 'zustand';
import { TaskItem, FilterId } from '../types';
import { DelegateRequest, BossReplyRequest } from '../types/api';
import { MOCK_TASKS } from '../data/mockTasks';
import { listTasks, dispatchTask, delegateTask, bossReply } from '../services/api/tasks';
import { mapTaskResponse } from '../services/taskMapper';
import { useToastStore } from './toastStore';
import { ApiError } from '../services/http';

interface TaskState {
  tasks: TaskItem[];
  selectedTaskId: number | null;
  selectedIds: number[];
  filter: FilterId;
  searchQuery: string;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  setFilter: (f: FilterId) => void;
  setSearchQuery: (q: string) => void;
  selectTask: (id: number | null) => void;
  toggleSelect: (id: number) => void;
  clearSelection: () => void;
  completeTask: (id: number) => void;
  setTasks: (tasks: TaskItem[]) => void;
  fetchTasks: () => Promise<void>;
  dispatchTaskAction: (taskId: number, action: 'approve' | 'reject' | 'defer' | 'delegate') => Promise<void>;
  delegateTaskAction: (taskId: number, body: DelegateRequest) => Promise<void>;
  bossReplyAction: (taskId: number, body: BossReplyRequest) => Promise<void>;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: MOCK_TASKS,
  selectedTaskId: 1,
  selectedIds: [],
  filter: 'all',
  searchQuery: '',
  loading: false,
  error: null,
  lastUpdated: null,
  setFilter: (f) => set({ filter: f }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  selectTask: (id) => set({ selectedTaskId: id }),
  toggleSelect: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((item) => item !== id)
        : [...state.selectedIds, id],
    })),
  clearSelection: () => set({ selectedIds: [] }),
  completeTask: (id) =>
    set((state) => ({
      tasks: state.tasks.map((task) => (task.id === id ? { ...task, completed: true } : task)),
    })),
  setTasks: (tasks) => set({ tasks }),
  fetchTasks: async () => {
    set({ loading: true, error: null });
    const useMock = import.meta.env.VITE_USE_MOCK !== 'false';
    if (useMock) {
      const currentSelected = get().selectedTaskId;
      const newSelected = currentSelected || (MOCK_TASKS[0]?.id ?? null);
      set({
        tasks: MOCK_TASKS,
        selectedTaskId: newSelected,
        loading: false,
        error: null,
        lastUpdated: new Date().toISOString(),
      });
      return;
    }

    try {
      const res = await listTasks('all');
      const mapped = res.map(mapTaskResponse);
      const currentSelected = get().selectedTaskId;
      const newSelected = mapped.some((t) => t.id === currentSelected) ? currentSelected : (mapped[0]?.id ?? null);

      set({
        tasks: mapped,
        selectedTaskId: newSelected,
        loading: false,
        error: null,
        lastUpdated: new Date().toISOString(),
      });
    } catch {
      set({ loading: false, error: '任务加载失败，请检查后端服务' });
    }
  },
  dispatchTaskAction: async (taskId, action) => {
    const showToast = useToastStore.getState().showToast;
    const useMock = import.meta.env.VITE_USE_MOCK !== 'false';

    if (useMock) {
      if (action === 'defer') {
        showToast('info', '已暂缓');
      } else {
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, completed: true } : t)),
        }));
        showToast('success', action === 'delegate' ? '已委派' : '已处理');
      }
      return;
    }

    try {
      const res = await dispatchTask(taskId, { action });
      const mapped = mapTaskResponse(res);
      if (action === 'approve' || action === 'reject' || action === 'delegate') mapped.completed = true;
      set((state) => ({ tasks: state.tasks.map((t) => (t.id === taskId ? mapped : t)) }));
      if (action === 'defer') showToast('info', '已暂缓');
      else showToast('success', action === 'delegate' ? '已委派' : '已处理');
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : '操作失败';
      showToast('error', detail);
    }
  },
  delegateTaskAction: async (taskId, body) => {
    const showToast = useToastStore.getState().showToast;
    const useMock = import.meta.env.VITE_USE_MOCK !== 'false';

    if (useMock) {
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, completed: true, delegatedTo: body.delegate_to } : t)),
      }));
      showToast('success', '已委派');
      return;
    }

    try {
      const res = await delegateTask(taskId, body);
      const mapped = mapTaskResponse(res);
      mapped.completed = true;
      set((state) => ({ tasks: state.tasks.map((t) => (t.id === taskId ? mapped : t)) }));
      showToast('success', '已委派');
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : '操作失败';
      showToast('error', detail);
    }
  },
  bossReplyAction: async (taskId, body) => {
    const showToast = useToastStore.getState().showToast;
    const useMock = import.meta.env.VITE_USE_MOCK !== 'false';

    if (useMock) {
      if (body.decision === 'defer') showToast('info', '已暂缓');
      else {
        set((state) => ({ tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, completed: true } : t)) }));
        showToast('success', '已记录老板回复');
      }
      return;
    }

    try {
      const res = await bossReply(taskId, body);
      const mapped = mapTaskResponse(res);
      if (body.decision === 'approve' || body.decision === 'reject') mapped.completed = true;
      set((state) => ({ tasks: state.tasks.map((t) => (t.id === taskId ? mapped : t)) }));
      if (body.decision === 'defer') showToast('info', '已暂缓');
      else showToast('success', '已记录老板回复');
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : '操作失败';
      showToast('error', detail);
    }
  },
}));
