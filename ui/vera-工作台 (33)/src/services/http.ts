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

// 核心封装
export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const url = `${BASE_URL}${path}`;
  const method = options?.method || 'GET';

  // 15 秒超时 (AbortController)
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 15000);

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
