import { request } from '../http';
import {
  AiSettingsResponse,
  UpdateAiSettingsRequest,
  TestAiSettingsRequest,
  TestAiSettingsResponse,
} from '../../types/api';

const LOCAL_STORAGE_KEY = 'vera_ai_settings_cache';

function getLocalCache(): AiSettingsResponse {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {
    deepseek: { key_configured: true, base_url: null },
    gemini: { key_configured: false, base_url: null },
  };
}

function setLocalCache(data: AiSettingsResponse) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export async function getAiSettings(): Promise<AiSettingsResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    return getLocalCache();
  }
  try {
    const res = await request<AiSettingsResponse>('/api/settings/ai');
    setLocalCache(res);
    return res;
  } catch (err) {
    console.warn('[AI Settings API] Falling back to local cache:', err);
    return getLocalCache();
  }
}

export async function updateAiSettings(
  body: UpdateAiSettingsRequest
): Promise<AiSettingsResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    const current = getLocalCache();
    const updated: AiSettingsResponse = {
      deepseek: {
        key_configured:
          body.deepseek_api_key !== undefined
            ? body.deepseek_api_key.trim().length > 0
            : current.deepseek.key_configured,
        base_url:
          body.deepseek_base_url !== undefined
            ? body.deepseek_base_url.trim() || null
            : current.deepseek.base_url,
      },
      gemini: {
        key_configured:
          body.gemini_api_key !== undefined
            ? body.gemini_api_key.trim().length > 0
            : current.gemini.key_configured,
        base_url:
          body.gemini_base_url !== undefined
            ? body.gemini_base_url.trim() || null
            : current.gemini.base_url,
      },
    };
    setLocalCache(updated);
    return updated;
  }

  const res = await request<AiSettingsResponse>('/api/settings/ai', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  setLocalCache(res);
  return res;
}

export async function testAiSettings(
  body: TestAiSettingsRequest
): Promise<TestAiSettingsResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    // Mock simulation
    if (body.api_key && body.api_key.startsWith('sk-invalid')) {
      return { ok: false, message: '认证失败: 无效的 API Key (401 Unauthorized)' };
    }
    const current = getLocalCache();
    const isConfigured = body.provider === 'deepseek'
      ? (body.api_key ? body.api_key.trim().length > 0 : current.deepseek.key_configured)
      : (body.api_key ? body.api_key.trim().length > 0 : current.gemini.key_configured);

    if (!isConfigured) {
      return { ok: false, message: '未配置 API Key 且未输入临时 Key' };
    }
    return { ok: true, message: '连接成功 (Ping 200 OK)' };
  }

  return await request<TestAiSettingsResponse>('/api/settings/ai/test', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
