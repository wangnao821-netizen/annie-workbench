import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Bot, Save, Sparkles } from 'lucide-react';
import { getAssistantSettings, updateAssistantSettings } from '../../services/api/assistant';
import { AssistantSettingsResponse } from '../../types/api';
import { useToastStore } from '../../stores/toastStore';

export function AssistantSettingsCard() {
  const reduced = useReducedMotion();
  const showToast = useToastStore((state) => state.showToast);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<AssistantSettingsResponse | null>(null);

  const [aiName, setAiName] = useState('');
  const [userAddress, setUserAddress] = useState('');
  const [personaKey, setPersonaKey] = useState('a');

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await getAssistantSettings();
      setData(res);
      setAiName(res.ai_name || '');
      setUserAddress(res.user_address || '');
      setPersonaKey(res.persona_key || res.default_persona || 'a');
    } catch {
      showToast('error', '加载 AI 助手设置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await updateAssistantSettings({
        ai_name: aiName.trim() || null,
        user_address: userAddress.trim() || null,
        persona_key: personaKey,
      });
      setData(res);
      setAiName(res.ai_name || '');
      setUserAddress(res.user_address || '');
      setPersonaKey(res.persona_key || res.default_persona || 'a');
      showToast('success', 'AI 助手设置已更新');
    } catch (err: unknown) {
      const detail = err && typeof err === 'object' && 'detail' in err ? String((err as { detail: unknown }).detail) : '请重试';
      showToast('error', `保存失败: ${detail}`);
    } finally {
      setSaving(false);
    }
  };

  const personas = data?.personas || [
    { key: 'a', name: '专业稳重型', role: '资深澳洲信贷顾问', style: '专业、直接、不废话、会主动提醒风险' },
    { key: 'b', name: '亲和贴心型', role: '贴心业务助理', style: '温和、主动关怀、会解释为什么、共情客户处境' },
    { key: 'c', name: '干脆高效型', role: '极简效率助手', style: '最短回复、只给结论和下一步' },
    { key: 'd', name: '活泼幽默型', role: '轻松有趣的搭档', style: '轻松、偶尔幽默、有活力，但专业底线不松' },
  ];

  return (
    <div className="rounded-2xl p-5 border space-y-4 shadow-2xs" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-[var(--purple-soft)] text-[var(--purple)]">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
              🤖 AI 助手偏好设置 (Assistant Personalization)
            </h3>
            <p className="text-[11px] text-muted">定义 AI 的名字、对您的尊称以及交流的人格风格</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-4 text-center text-xs text-muted">加载设置中...</div>
      ) : (
        <div className="space-y-4">
          {/* Inputs grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted" htmlFor="settings-ai-name-input">
                AI 名字
              </label>
              <input
                id="settings-ai-name-input"
                type="text"
                maxLength={40}
                value={aiName}
                onChange={(e) => setAiName(e.target.value)}
                placeholder="例如：Annie"
                className="w-full px-3 py-2 rounded-xl border text-xs outline-none focus:border-[var(--purple)] transition-colors"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted" htmlFor="settings-user-address-input">
                您的称呼
              </label>
              <input
                id="settings-user-address-input"
                type="text"
                maxLength={20}
                value={userAddress}
                onChange={(e) => setUserAddress(e.target.value)}
                placeholder="例如：Vera姐 / Vera"
                className="w-full px-3 py-2 rounded-xl border text-xs outline-none focus:border-[var(--purple)] transition-colors"
                style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          {/* Persona selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted">AI 人格语气</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {personas.map((p) => {
                const selected = personaKey === p.key;
                return (
                  <div
                    key={p.key}
                    onClick={() => setPersonaKey(p.key)}
                    title={`${p.role}｜${p.style}`}
                    className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                      selected
                        ? 'border-[var(--purple-soft)] bg-[var(--purple-soft)] shadow-2xs'
                        : 'border-[var(--border)] hover:border-[var(--purple-soft)]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${selected ? 'text-[var(--purple)]' : 'text-primary'}`}>
                        {p.name}
                      </span>
                      {selected && <Sparkles className="w-3.5 h-3.5 text-[var(--purple)]" />}
                    </div>
                    <div className="text-[11px] text-muted mt-0.5 truncate">
                      {p.role} · {p.style}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer instruction & Save button */}
          <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[11px] text-muted">
              💡 小字说明：AI 名字与称呼仅用于内线对话；外线邮件/递交材料不会出现 AI 名字。
            </p>
            <motion.button
              whileTap={reduced ? undefined : { scale: 0.96 }}
              disabled={saving}
              onClick={handleSave}
              className="px-4 py-1.5 rounded-xl bg-[var(--purple)] hover:bg-[var(--purple)] text-[var(--on-purple)] font-bold text-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 transition-colors shadow-2xs self-end sm:self-auto"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? '保存中...' : '保存'}</span>
            </motion.button>
          </div>
        </div>
      )}
    </div>
  );
}
