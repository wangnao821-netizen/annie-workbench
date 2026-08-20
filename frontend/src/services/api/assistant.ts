import { request } from '../http';
import { AssistantSettingsResponse, UpdateAssistantSettingsRequest } from '../../types/api';

const DEFAULT_PERSONAS = [
  { key: 'a', name: '专业稳重型', role: '资深澳洲信贷顾问', style: '专业、直接、不废话、会主动提醒风险' },
  { key: 'b', name: '亲和贴心型', role: '贴心业务助理', style: '温和、主动关怀、会解释为什么、共情客户处境' },
  { key: 'c', name: '干脆高效型', role: '极简效率助手', style: '最短回复、只给结论和下一步' },
  { key: 'd', name: '活泼幽默型', role: '轻松有趣的搭档', style: '轻松、偶尔幽默、有活力，但专业底线不松' },
];

const LOCAL_STORAGE_KEY = 'vera_assistant_settings_cache';

function getLocalCache(): AssistantSettingsResponse | null {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AssistantSettingsResponse;
  } catch {
    return null;
  }
}

function setLocalCache(data: AssistantSettingsResponse) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export async function getAssistantSettings(): Promise<AssistantSettingsResponse> {
  try {
    const res = await request<AssistantSettingsResponse>('/api/settings/assistant');
    // Ensure onboarding_needed calculation is strictly consistent
    const onboarding_needed = res.onboarding_needed ?? !(res.ai_name && res.user_address);
    const updated = { ...res, onboarding_needed };
    setLocalCache(updated);
    return updated;
  } catch (err) {
    console.warn('[Assistant API] Falling back to local cache or defaults:', err);
    const cached = getLocalCache();
    if (cached) return cached;

    return {
      ai_name: null,
      user_address: null,
      persona_key: null,
      default_persona: 'a',
      personas: DEFAULT_PERSONAS,
      onboarding_needed: true,
    };
  }
}

export async function updateAssistantSettings(
  body: UpdateAssistantSettingsRequest
): Promise<AssistantSettingsResponse> {
  try {
    const res = await request<AssistantSettingsResponse>('/api/settings/assistant', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    const onboarding_needed = res.onboarding_needed ?? !(res.ai_name && res.user_address);
    const updated = { ...res, onboarding_needed };
    setLocalCache(updated);
    return updated;
  } catch (err) {
    console.warn('[Assistant API] PATCH failed, updating local cache:', err);
    const cached = getLocalCache() || {
      ai_name: null,
      user_address: null,
      persona_key: null,
      default_persona: 'a',
      personas: DEFAULT_PERSONAS,
      onboarding_needed: true,
    };

    const newAiName = body.ai_name !== undefined ? (body.ai_name === '' ? null : body.ai_name) : cached.ai_name;
    const newUserAddress = body.user_address !== undefined ? (body.user_address === '' ? null : body.user_address) : cached.user_address;
    const newPersonaKey = body.persona_key !== undefined ? (body.persona_key === '' ? null : body.persona_key) : cached.persona_key;

    const onboarding_needed = !(newAiName && newUserAddress);

    const updated: AssistantSettingsResponse = {
      ...cached,
      ai_name: newAiName,
      user_address: newUserAddress,
      persona_key: newPersonaKey,
      onboarding_needed,
    };

    setLocalCache(updated);
    return updated;
  }
}
