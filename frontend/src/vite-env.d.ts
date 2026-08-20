/// <reference types="vite/client" />

export interface VeraElectronApi {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  getVersion: () => Promise<string>;
  getApiBase: () => Promise<string>;
  apiBase?: string;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (cb: (maximized: boolean) => void) => () => void;
  chooseDirectory?: () => Promise<string | null>;
}

declare global {
  interface Window {
    veraElectron?: VeraElectronApi;
  }
}

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_USE_MOCK?: string; // "true" | "false"
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

