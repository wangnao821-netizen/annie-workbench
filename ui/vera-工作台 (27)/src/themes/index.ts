export type ThemeId = "dark" | "light" | "royal" | "ocean" | "sand";

export interface ThemeConfig {
  id: ThemeId;
  name: string;        // 中文显示名
  preview: string;     // 预览色（hex）
}

export const THEMES: ThemeConfig[] = [
  { id: "dark", name: "深空黑", preview: "#0f1117" },
  { id: "light", name: "极光白", preview: "#f8f9fc" },
  { id: "royal", name: "紫金", preview: "#1a0a2e" },
  { id: "ocean", name: "海洋蓝", preview: "#0a1628" },
  { id: "sand", name: "暖沙", preview: "#1c1812" },
];

export function applyTheme(themeId: ThemeId): void {
  document.documentElement.setAttribute("data-theme", themeId);
  localStorage.setItem("vera-theme", themeId);
}

export function getInitialTheme(): ThemeId {
  const saved = localStorage.getItem("vera-theme") as ThemeId;
  if (saved && ["dark", "light", "royal", "ocean", "sand"].includes(saved)) {
    return saved;
  }
  return "dark";
}
