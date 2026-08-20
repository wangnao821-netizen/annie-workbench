import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Cpu, Save, Sparkles } from 'lucide-react';
import { getAiSettings, updateAiSettings, testAiSettings } from '../../services/api/aiSettings';
import { AiSettingsResponse, UpdateAiSettingsRequest, TestAiSettingsResponse } from '../../types/api';
import { useToastStore } from '../../stores/toastStore';
import { ProviderConfigSection } from './ProviderConfigSection';

export function AiConfigCard() {
  const reduced = useReducedMotion();
  const showToast = useToastStore((state) => state.showToast);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<AiSettingsResponse | null>(null);

  const [deepseekKey, setDeepseekKey] = useState('');
  const [deepseekBaseUrl, setDeepseekBaseUrl] = useState('');
  const [deepseekKeyCleared, setDeepseekKeyCleared] = useState(false);

  const [geminiKey, setGeminiKey] = useState('');
  const [geminiBaseUrl, setGeminiBaseUrl] = useState('');
  const [geminiKeyCleared, setGeminiKeyCleared] = useState(false);

  const [testingProvider, setTestingProvider] = useState<'deepseek' | 'gemini' | null>(null);
  const [testResult, setTestResult] = useState<{
    deepseek?: TestAiSettingsResponse;
    gemini?: TestAiSettingsResponse;
  }>({});

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await getAiSettings();
      setData(res);
      setDeepseekBaseUrl(res.deepseek.base_url || '');
      setGeminiBaseUrl(res.gemini.base_url || '');
      setDeepseekKey('');
      setGeminiKey('');
      setDeepseekKeyCleared(false);
      setGeminiKeyCleared(false);
    } catch {
      showToast('error', '加载 AI 模型配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleTest = async (provider: 'deepseek' | 'gemini') => {
    setTestingProvider(provider);
    setTestResult((prev) => ({ ...prev, [provider]: undefined }));
    try {
      const key = provider === 'deepseek' ? deepseekKey : geminiKey;
      const url = provider === 'deepseek' ? deepseekBaseUrl : geminiBaseUrl;
      const res = await testAiSettings({
        provider,
        api_key: key.trim() ? key.trim() : undefined,
        base_url: url.trim() ? url.trim() : undefined,
      });
      setTestResult((prev) => ({ ...prev, [provider]: res }));
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'detail' in err
        ? String((err as { detail: unknown }).detail)
        : '测试连接失败，请检查网络或配置';
      setTestResult((prev) => ({ ...prev, [provider]: { ok: false, message: msg } }));
    } finally {
      setTestingProvider(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: UpdateAiSettingsRequest = {};
      if (deepseekKeyCleared) {
        body.deepseek_api_key = '';
      } else if (deepseekKey.trim()) {
        body.deepseek_api_key = deepseekKey.trim();
      }

      if (deepseekBaseUrl.trim() !== (data?.deepseek.base_url || '')) {
        body.deepseek_base_url = deepseekBaseUrl.trim();
      }

      if (geminiKeyCleared) {
        body.gemini_api_key = '';
      } else if (geminiKey.trim()) {
        body.gemini_api_key = geminiKey.trim();
      }

      if (geminiBaseUrl.trim() !== (data?.gemini.base_url || '')) {
        body.gemini_base_url = geminiBaseUrl.trim();
      }

      await updateAiSettings(body);
      showToast('success', '已保存并生效');
      await fetchConfig();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'detail' in err
        ? String((err as { detail: unknown }).detail)
        : '保存配置失败，请重试';
      showToast('error', `保存失败: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="rounded-2xl p-5 border space-y-4 shadow-2xs"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      id="ai-model-config-card"
    >
      <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-[var(--purple-soft)] text-[var(--purple)]">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
              ⚡ AI 大模型配置 (AI Model & API Gateway)
            </h3>
            <p className="text-[11px] text-muted">
              配置 DeepSeek 及 Gemini API Key 与中转地址，保存后热重载即时生效
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-6 text-center text-xs text-muted">加载模型配置中...</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ProviderConfigSection
              provider="deepseek"
              title="DeepSeek"
              badgeText="主力模型"
              defaultUrlPlaceholder="https://api.deepseek.com/v1"
              isConfigured={data ? data.deepseek.key_configured : false}
              keyVal={deepseekKey}
              setKeyVal={setDeepseekKey}
              urlVal={deepseekBaseUrl}
              setUrlVal={setDeepseekBaseUrl}
              keyCleared={deepseekKeyCleared}
              setKeyCleared={setDeepseekKeyCleared}
              isTesting={testingProvider === 'deepseek'}
              testResult={testResult.deepseek}
              onTest={() => handleTest('deepseek')}
            />

            <ProviderConfigSection
              provider="gemini"
              title="Gemini"
              badgeText="英文兜底"
              defaultUrlPlaceholder="https://generativelanguage.googleapis.com"
              isConfigured={data ? data.gemini.key_configured : false}
              keyVal={geminiKey}
              setKeyVal={setGeminiKey}
              urlVal={geminiBaseUrl}
              setUrlVal={setGeminiBaseUrl}
              keyCleared={geminiKeyCleared}
              setKeyCleared={setGeminiKeyCleared}
              isTesting={testingProvider === 'gemini'}
              testResult={testResult.gemini}
              onTest={() => handleTest('gemini')}
            />
          </div>

          <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center space-x-1.5 text-[11px] text-muted">
              <Sparkles className="w-3.5 h-3.5 text-[var(--yellow)]" />
              <span>Key 采用脱敏只写机制保护，不回传浏览器；修改保存后免重启直接生效。</span>
            </div>

            <motion.button
              whileTap={reduced ? undefined : { scale: 0.96 }}
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs btn-primary flex-shrink-0"
              id="save-ai-config-btn"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? '保存中...' : '保存配置'}</span>
            </motion.button>
          </div>
        </div>
      )}
    </div>
  );
}
