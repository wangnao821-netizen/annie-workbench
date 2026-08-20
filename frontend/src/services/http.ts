export class ApiError extends Error {
  status: number;
  detail: string;      // 后端返回的 detail 或错误信息

  constructor(status: number, detail: string) {
    super(`API Error ${status}: ${detail}`);
    this.status = status;
    this.detail = detail;
    this.name = 'ApiError';
  }
}

export async function getApiBaseUrl(): Promise<string> {
  if (typeof window !== 'undefined') {
    if (window.veraElectron?.getApiBase) {
      try {
        const base = await window.veraElectron.getApiBase();
        if (base) return base;
      } catch (e) {
        console.warn('[http] Failed to get api base via IPC:', e);
      }
    }
    if (window.veraElectron?.apiBase) {
      return window.veraElectron.apiBase;
    }
  }
  return import.meta.env.VITE_API_URL || 'http://localhost:8000';
}

// 核心封装
export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const base = await getApiBaseUrl();
  const url = `${base}${path}`;
  const method = options?.method || 'GET';

  // AI 大模型深度分析预留充裕超时 (90秒)，普通接口 30 秒
  const timeoutMs = path.includes('/chat') || path.includes('/ai') ? 90000 : 30000;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  // 日志只输出 `${method} ${path}`，绝不输出 body (PII 红线)
  console.log(`[HTTP Request] ${method} ${path}`);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    clearTimeout(id);

    if (!response.ok) {
      let errorDetail = 'Unknown Error';
      try {
        const errJson = await response.json();
        errorDetail = errJson.detail || errJson.message || response.statusText;
      } catch {
        errorDetail = response.statusText;
      }
      throw new ApiError(response.status, errorDetail);
    }

    const data = await response.json() as T;
    return data;
  } catch (error) {
    clearTimeout(id);
    if (error instanceof ApiError) {
      throw error;
    }
    // 网络错误或超时统一转 ApiError(0, "网络不可用")
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(0, '请求超时，网络不可用');
    }
    throw new ApiError(0, '网络不可用');
  }
}
