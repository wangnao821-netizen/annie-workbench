import { create } from 'zustand';

interface UiState {
  newCaseOpen: boolean;
  setNewCaseOpen: (open: boolean) => void;
  newTaskOpen: boolean;
  setNewTaskOpen: (open: boolean) => void;
  osWorkbenchTaskId: number | null;
  openOsWorkbench: (taskId: number) => void;
  closeOsWorkbench: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  newCaseOpen: false,
  setNewCaseOpen: (open) => set({ newCaseOpen: open }),
  newTaskOpen: false,
  setNewTaskOpen: (open) => set({ newTaskOpen: open }),
  osWorkbenchTaskId: null,
  openOsWorkbench: (taskId) => set({ osWorkbenchTaskId: taskId }),
  closeOsWorkbench: () => set({ osWorkbenchTaskId: null }),
}));
