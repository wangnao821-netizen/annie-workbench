import { create } from 'zustand';
import { useTaskStore } from './taskStore';

export type RightDeckView = 'panorama' | 'checklist' | 'tasks' | 'files';

interface UiState {
  newCaseOpen: boolean;
  setNewCaseOpen: (open: boolean) => void;
  newTaskOpen: boolean;
  setNewTaskOpen: (open: boolean) => void;
  osWorkbenchTaskId: number | null;
  openOsWorkbench: (taskId: number) => void;
  closeOsWorkbench: () => void;
  pendingChatPrompt: string | null;
  setPendingChatPrompt: (prompt: string | null) => void;
  rightDeckTab: RightDeckView;
  setRightDeckTab: (tab: RightDeckView) => void;
  taskDrawerOpen: boolean;
  setTaskDrawerOpen: (open: boolean) => void;
  taskDrawerTab: 'all' | 'overdue' | 'in_progress' | 'boss' | 'delegated' | 'completed';
  setTaskDrawerTab: (tab: 'all' | 'overdue' | 'in_progress' | 'boss' | 'delegated' | 'completed') => void;
  checklistDrawerOpen: boolean;
  setChecklistDrawerOpen: (open: boolean) => void;
  fileDrawerOpen: boolean;
  setFileDrawerOpen: (open: boolean) => void;
  taskDetailOpen: boolean;
  activeTaskDetailId: number | null;
  openTaskDetail: (taskId: number) => void;
  closeTaskDetail: () => void;
  onboardingOpen: boolean;
  setOnboardingOpen: (open: boolean) => void;
  welcomeCaseId: string | null;
  setWelcomeCaseId: (caseId: string | null) => void;
  dismissedWelcomeCases: string[];
  dismissWelcomeCase: (caseId: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  newCaseOpen: false,
  setNewCaseOpen: (open) => set({ newCaseOpen: open }),
  newTaskOpen: false,
  setNewTaskOpen: (open) => set({ newTaskOpen: open }),
  osWorkbenchTaskId: null,
  openOsWorkbench: (taskId) => set({ osWorkbenchTaskId: taskId }),
  closeOsWorkbench: () => set({ osWorkbenchTaskId: null }),
  pendingChatPrompt: null,
  setPendingChatPrompt: (prompt) => set({ pendingChatPrompt: prompt }),
  rightDeckTab: 'panorama',
  setRightDeckTab: (tab) => set({ rightDeckTab: tab }),
  taskDrawerOpen: false,
  setTaskDrawerOpen: (open) => set({ taskDrawerOpen: open }),
  taskDrawerTab: 'all',
  setTaskDrawerTab: (tab) => set({ taskDrawerTab: tab }),
  checklistDrawerOpen: false,
  setChecklistDrawerOpen: (open) => set({ checklistDrawerOpen: open }),
  fileDrawerOpen: false,
  setFileDrawerOpen: (open) => set({ fileDrawerOpen: open }),
  taskDetailOpen: false,
  activeTaskDetailId: null,
  openTaskDetail: (taskId) => {
    useTaskStore.getState().selectTask(taskId);
    set({ taskDetailOpen: true, activeTaskDetailId: taskId });
  },
  closeTaskDetail: () => set({ taskDetailOpen: false, activeTaskDetailId: null }),
  onboardingOpen: false,
  setOnboardingOpen: (open) => set({ onboardingOpen: open }),
  welcomeCaseId: null,
  setWelcomeCaseId: (caseId) => set({ welcomeCaseId: caseId }),
  dismissedWelcomeCases: [],
  dismissWelcomeCase: (caseId) =>
    set((state) => ({
      dismissedWelcomeCases: state.dismissedWelcomeCases.includes(caseId)
        ? state.dismissedWelcomeCases
        : [...state.dismissedWelcomeCases, caseId],
      welcomeCaseId: state.welcomeCaseId === caseId ? null : state.welcomeCaseId,
    })),
}));
