import { create } from 'zustand';

interface ModeState {
  mode: 'internal' | 'external';
  setMode: (m: 'internal' | 'external') => void;
}

export const useModeStore = create<ModeState>((set) => ({
  mode: 'internal',
  setMode: (m) => set({ mode: m }),
}));
