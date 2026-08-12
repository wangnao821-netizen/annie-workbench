import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import { THEMES, ThemeId } from '../../themes';
import { useThemeStore } from '../../stores/themeStore';

const THEME_ACCENTS: Record<ThemeId, string> = {
  dark: '#3b82f6',
  light: '#2563eb',
  royal: '#a855f7',
  ocean: '#06b6d4',
  sand: '#f59e0b',
};

export function ThemePicker() {
  const { current, setTheme } = useThemeStore();

  const handleSelectTheme = (id: ThemeId) => {
    // Crossfade visual effect on root element
    document.documentElement.style.transition = 'background-color 200ms ease, color 200ms ease';
    setTheme(id);

    setTimeout(() => {
      document.documentElement.style.transition = '';
    }, 250);
  };

  return (
    <div className="space-y-4" id="theme-picker-container">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
          🎨 界面与主题偏好 (Color Themes)
        </h4>
        <span className="text-[11px] font-mono text-muted">
          当前主题: {THEMES.find((t) => t.id === current)?.name}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {THEMES.map((theme) => {
          const isSelected = current === theme.id;
          const accentColor = THEME_ACCENTS[theme.id];

          return (
            <motion.div
              key={theme.id}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleSelectTheme(theme.id)}
              className="relative p-3.5 rounded-2xl border flex flex-col items-center justify-center space-y-2.5 cursor-pointer shadow-2xs transition-all select-none"
              style={{
                backgroundColor: 'var(--bg-app)',
                borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
              }}
              id={`theme-option-${theme.id}`}
            >
              {/* Selected Spring Ring Indicator */}
              {isSelected && (
                <motion.div
                  layoutId="activeThemeRing"
                  className="absolute -inset-1 rounded-2xl border-2 pointer-events-none"
                  style={{ borderColor: 'var(--accent)' }}
                  transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                />
              )}

              {/* Color Swatch Circle */}
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shadow-md relative border overflow-hidden"
                style={{
                  backgroundColor: theme.preview,
                  borderColor: 'rgba(255,255,255,0.15)',
                }}
              >
                {/* Secondary Accent Dot inside Swatch */}
                <span
                  className="w-3.5 h-3.5 rounded-full absolute bottom-1 right-1 border border-white/20 shadow-xs"
                  style={{ backgroundColor: accentColor }}
                />

                {isSelected && (
                  <Check className="w-5 h-5 text-white drop-shadow-md stroke-[3]" />
                )}
              </div>

              {/* Name */}
              <span
                className="text-xs font-semibold"
                style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}
              >
                {theme.name}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
