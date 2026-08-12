import { create } from 'zustand';

interface UiState {
  newCaseOpen: boolean;
  setNewCaseOpen: (open: boolean) => void;
  osWorkbenchTaskId: number | null;
  openOsWorkbench: (taskId: number) => void;
  closeOsWorkbench: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  newCaseOpen: false,
  setNewCaseOpen: (open) => set({ newCaseOpen: open }),
  osWorkbenchTaskId: null,
  openOsWorkbench: (taskId) => set({ osWorkbenchTaskId: taskId }),
  closeOsWorkbench: () => set({ osWorkbenchTaskId: null }),
}));
