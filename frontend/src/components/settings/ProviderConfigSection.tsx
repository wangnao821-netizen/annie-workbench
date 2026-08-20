import { motion, useReducedMotion } from 'motion/react';
import { Globe, CheckCircle2, AlertCircle, RefreshCw, XCircle } from 'lucide-react';
import { TestAiSettingsResponse } from '../../types/api';

interface ProviderConfigSectionProps {
  provider: 'deepseek' | 'gemini';
  title: string;
  badgeText: string;
  defaultUrlPlaceholder: string;
  isConfigured: boolean;
  keyVal: string;
  setKeyVal: (v: string) => void;
  urlVal: string;
  setUrlVal: (v: string) => void;
  keyCleared: boolean;
  setKeyCleared: (v: boolean) => void;
  isTesting: boolean;
  testResult?: TestAiSettingsResponse;
  onTest: () => void;
}

export function ProviderConfigSection({
  provider,
  title,
  badgeText,
  defaultUrlPlaceholder,
  isConfigured,
  keyVal,
  setKeyVal,
  urlVal,
  setUrlVal,
  keyCleared,
  setKeyCleared,
  isTesting,
  testResult,
  onTest,
}: ProviderConfigSectionProps) {
  const reduced = useReducedMotion();
  const configuredState = !keyCleared && isConfigured;

  return (
    <div
      className="p-4 rounded-xl border space-y-3.5"
      style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}
      id={`ai-provider-card-${provider}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="font-extrabold text-xs" style={{ color: 'var(--text-primary)' }}>
            {title}
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--purple-soft)] text-[var(--purple)]">
            {badgeText}
          </span>
        </div>

        <div className="flex items-center space-x-1 text-xs">
          {configuredState ? (
            <span className="flex items-center space-x-1 text-[var(--green)] font-bold text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>已配置 ****</span>
            </span>
          ) : (
            <span className="flex items-center space-x-1 text-muted text-[11px]">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>未配置</span>
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3 text-xs">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-muted" htmlFor={`settings-${provider}-key-input`}>
              API Key
            </label>
            {configuredState && (
              <button
                type="button"
                onClick={() => {
                  setKeyCleared(true);
                  setKeyVal('');
                }}
                className="text-[10px] text-muted hover:text-[var(--red)] cursor-pointer"
              >
                清空此 Key
              </button>
            )}
            {keyCleared && (
              <span className="text-[10px] text-[var(--yellow)]">已标记清除 (保存后生效)</span>
            )}
          </div>
          <input
            id={`settings-${provider}-key-input`}
            type="password"
            value={keyVal}
            onChange={(e) => {
              setKeyVal(e.target.value);
              if (keyCleared) setKeyCleared(false);
            }}
            placeholder={configuredState ? '已配置则留空不修改 / 输入新 Key 覆盖' : '请输入 API Key'}
            className="w-full px-3 py-2 rounded-xl border text-xs outline-none focus:border-[var(--purple)] transition-colors"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-bold text-muted flex items-center space-x-1" htmlFor={`settings-${provider}-base-url-input`}>
            <Globe className="w-3 h-3 text-muted" />
            <span>Base URL (中转/代理地址)</span>
          </label>
          <input
            id={`settings-${provider}-base-url-input`}
            type="text"
            value={urlVal}
            onChange={(e) => setUrlVal(e.target.value)}
            placeholder={defaultUrlPlaceholder}
            className="w-full px-3 py-2 rounded-xl border text-xs outline-none focus:border-[var(--purple)] transition-colors font-mono"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex-1 mr-2 overflow-hidden text-ellipsis whitespace-nowrap">
          {testResult && (
            <div
              className={`text-[11px] flex items-center space-x-1 truncate ${
                testResult.ok ? 'text-[var(--green)]' : 'text-[var(--red)]'
              }`}
              title={testResult.message}
            >
              {testResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
              <span className="truncate">{testResult.message}</span>
            </div>
          )}
        </div>

        <motion.button
          whileTap={reduced ? undefined : { scale: 0.96 }}
          type="button"
          disabled={isTesting}
          onClick={onTest}
          className="px-3 py-1.5 rounded-xl border font-bold text-xs flex items-center space-x-1 text-muted hover:text-primary transition-colors cursor-pointer flex-shrink-0"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}
          id={`test-ai-conn-${provider}-btn`}
        >
          <RefreshCw className={`w-3 h-3 ${isTesting ? 'animate-spin' : ''}`} />
          <span>{isTesting ? '测试中...' : '测试连接'}</span>
        </motion.button>
      </div>
    </div>
  );
}
