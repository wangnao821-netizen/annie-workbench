import { useEffect } from 'react';
import { ThemeId, applyTheme } from './themes';
import { useThemeStore } from './stores/themeStore';
import { AppShell } from './components/layout/AppShell';
import { Toast } from './components/ui/Toast';
import { useTaskSync } from './hooks/useTaskSync';
import { useNotifications } from './hooks/useNotifications';

// Attach applyTheme to global window object for console debugging
declare global {
  interface Window {
    applyTheme: (themeId: ThemeId) => void;
  }
}

export default function App() {
  const { current, setTheme } = useThemeStore();
  useTaskSync();
  useNotifications();

  useEffect(() => {
    // Apply initial theme on load
    applyTheme(current);
    window.applyTheme = (themeId: ThemeId) => {
      setTheme(themeId);
    };
  }, [current, setTheme]);

  return (
    <>
      <AppShell />
      <Toast />
    </>
  );
}

