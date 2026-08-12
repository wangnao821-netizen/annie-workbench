import { create } from 'zustand';
import { ThemeId, applyTheme, getInitialTheme } from '../themes';

interface ThemeState {
  current: ThemeId;
  setTheme: (id: ThemeId) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  current: getInitialTheme(),
  setTheme: (id) => {
    applyTheme(id);
    set({ current: id });
  },
}));
