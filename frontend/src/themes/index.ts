export type ThemeId = "dark" | "light" | "ivory" | "eyecare" | "blush" | "sand";

export interface ThemeConfig {
  id: ThemeId;
  name: string;        // 中文显示名
  preview: string;     // 预览色（hex）
}

export const THEMES: ThemeConfig[] = [
  { id: "dark", name: "深空黑", preview: "#0f1117" },
  { id: "light", name: "极光白", preview: "#f8f9fc" },
  { id: "ivory", name: "象牙米", preview: "#faf9f5" },
  { id: "eyecare", name: "护眼绿", preview: "#edf3e8" },
  { id: "blush", name: "柔光粉", preview: "#f9f0f2" },
  { id: "sand", name: "暖沙", preview: "#1c1812" },
];

export function applyTheme(themeId: ThemeId): void {
  document.documentElement.setAttribute("data-theme", themeId);
  localStorage.setItem("annie-theme", themeId);
}

export function getInitialTheme(): ThemeId {
  const saved = (localStorage.getItem("annie-theme") || localStorage.getItem("vera-theme")) as ThemeId;
  if (saved && ["dark", "light", "ivory", "eyecare", "blush", "sand"].includes(saved)) {
    return saved;
  }
  return "eyecare";
}

