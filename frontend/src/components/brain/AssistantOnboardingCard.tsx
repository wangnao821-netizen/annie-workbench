import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Bot, X, Sparkles, Send } from 'lucide-react';
import { updateAssistantSettings } from '../../services/api/assistant';
import { AIPersona, AssistantSettingsResponse } from '../../types/api';
import { useToastStore } from '../../stores/toastStore';

interface AssistantOnboardingCardProps {
  initialAiName?: string | null;
  initialUserAddress?: string | null;
  initialPersonaKey?: string | null;
  defaultPersonaKey?: string;
  personas: AIPersona[];
  onSaveSuccess: (savedData: AssistantSettingsResponse) => void;
  onDismiss: () => void;
}

export function AssistantOnboardingCard({
  initialAiName,
  initialUserAddress,
  initialPersonaKey,
  defaultPersonaKey = 'a',
  personas,
  onSaveSuccess,
  onDismiss,
}: AssistantOnboardingCardProps) {
  const reduced = useReducedMotion();
  const showToast = useToastStore((state) => state.showToast);
  const [aiName, setAiName] = useState(initialAiName || '');
  const [userAddress, setUserAddress] = useState(initialUserAddress || '');
  const [personaKey, setPersonaKey] = useState(initialPersonaKey || defaultPersonaKey);
  const [saving, setSaving] = useState(false);

  const displayPersonas = personas.length > 0 ? personas : [
    { key: 'a', name: '专业稳重型', role: '资深澳洲信贷顾问', style: '专业、直接、不废话、会主动提醒风险' },
    { key: 'b', name: '亲和贴心型', role: '贴心业务助理', style: '温和、主动关怀、会解释为什么、共情客户处境' },
    { key: 'c', name: '干脆高效型', role: '极简效率助手', style: '最短回复、只给结论和下一步' },
    { key: 'd', name: '活泼幽默型', role: '轻松有趣的搭档', style: '轻松、偶尔幽默、有活力，但专业底线不松' },
  ];

  const handleSave = async () => {
    const finalAiName = aiName.trim() || '小V';
    const finalUserAddress = userAddress.trim() || 'Vera';

    setSaving(true);
    try {
      const res = await updateAssistantSettings({
        ai_name: finalAiName,
        user_address: finalUserAddress,
        persona_key: personaKey,
      });
      showToast('success', 'AI 助手配置保存成功');
      onSaveSuccess(res);
    } catch (err: unknown) {
      const detail = err && typeof err === 'object' && 'detail' in err ? String((err as { detail: unknown }).detail) : '保存失败，请稍后重试';
      showToast('error', `保存失败: ${detail}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: -10  }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -10  }}
      className="mb-4 p-4 rounded-2xl border bg-gradient-to-br from-[var(--purple)]/10 via-[var(--bg-card)] to-[var(--bg-card)] border-[var(--purple-soft)] shadow-xs relative text-xs"
      id="assistant-onboarding-card"
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-2 pb-2.5 border-b mb-3" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-[var(--purple-soft)] text-[var(--purple)] flex-shrink-0">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-extrabold text-xs tracking-tight" style={{ color: 'var(--text-primary)' }}>
              认识一下？给我起个名字，也告诉我该怎么称呼您。
            </h4>
            <p className="text-[11px] text-muted mt-0.5">初始化后在内线咨询中为您个性化定制称呼与语气</p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="text-muted hover:text-primary p-1 rounded-lg hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer flex-shrink-0"
          title="暂不设置（本次会话跳过）"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-muted" htmlFor="onboarding-ai-name">
            AI 名字
          </label>
          <input
            id="onboarding-ai-name"
            type="text"
            maxLength={40}
            value={aiName}
            onChange={(e) => setAiName(e.target.value)}
            placeholder="小V"
            className="w-full px-2.5 py-1.5 rounded-xl border text-xs outline-none focus:border-[var(--purple)] transition-colors"
            style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-bold text-muted" htmlFor="onboarding-user-address">
            您的称呼
          </label>
          <input
            id="onboarding-user-address"
            type="text"
            maxLength={20}
            value={userAddress}
            onChange={(e) => setUserAddress(e.target.value)}
            placeholder="Vera"
            className="w-full px-2.5 py-1.5 rounded-xl border text-xs outline-none focus:border-[var(--purple)] transition-colors"
            style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      {/* Personas */}
      <div className="space-y-1.5 mb-3">
        <label className="text-[11px] font-bold text-muted">选择语气人格</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {displayPersonas.map((p) => {
            const selected = personaKey === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setPersonaKey(p.key)}
                title={`${p.role}｜${p.style}`}
                className={`p-2 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
                  selected
                    ? 'border-[var(--purple-soft)] bg-[var(--purple-soft)] text-[var(--purple)] dark:text-[var(--purple)] font-extrabold shadow-2xs'
                    : 'border-[var(--border)] text-secondary hover:border-[var(--purple-soft)]'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[11px] truncate">{p.name}</span>
                  {selected && <Sparkles className="w-3 h-3 text-[var(--purple)] flex-shrink-0" />}
                </div>
                <span className="text-[11px] text-muted truncate mt-0.5 font-normal">
                  {p.role}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Button */}
      <div className="flex justify-end pt-1">
        <motion.button
          whileTap={reduced ? undefined : { scale: 0.96 }}
          disabled={saving}
          onClick={handleSave}
          className="px-4 py-1.5 rounded-xl bg-[var(--purple)] hover:bg-[var(--purple)] text-[var(--on-purple)] font-bold text-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 transition-colors shadow-2xs"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{saving ? '保存中...' : '保存并开始'}</span>
        </motion.button>
      </div>
    </motion.div>
  );
}
