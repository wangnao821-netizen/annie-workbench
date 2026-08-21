import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Settings as SettingsIcon, Shield, Server, HardDrive, CheckCircle2, AlertCircle, Info, RefreshCw, Cpu, Sliders, Landmark, Calculator, Zap } from 'lucide-react';
import { ThemePicker } from '../components/settings/ThemePicker';
import { AbilityCenter } from '../components/settings/AbilityCenter';
import { SkillCenter } from '../components/settings/SkillCenter';
import { CalculatorManager } from '../components/settings/CalculatorManager';
import { BankPlatformPanel } from '../components/settings/BankPlatformPanel';
import { AssistantSettingsCard } from '../components/settings/AssistantSettingsCard';
import { AiConfigCard } from '../components/settings/AiConfigCard';
import { getVersion } from '../services/api/system';

export function Settings() {
  const reduced = useReducedMotion();
  const [activeTab, setActiveTab] = useState<'ability' | 'skills' | 'calculator' | 'banks' | 'system'>('ability');
  const [apiStatus, setApiStatus] = useState<'checking' | 'connected' | 'offline'>('checking');
  const [apiVersion, setApiVersion] = useState<string>('v2.0.0');

  const checkApiHealth = async () => {
    setApiStatus('checking');
    try {
      const data = await getVersion();
      setApiStatus('connected');
      if (data.version) setApiVersion(data.version);
    } catch {
      setApiStatus('offline');
    }
  };

  useEffect(() => {
    checkApiHealth();
  }, []);

  return (
    <div className="flex-1 p-4 md:p-8 space-y-5 overflow-y-auto no-scrollbar max-w-4xl mx-auto" style={{ backgroundColor: 'var(--bg-app)' }} id="settings-page">
      {/* Page Header */}
      <div className="flex flex-col gap-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
        {/* Row 1: Title & Subtitle */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-xs flex-shrink-0" style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}>
            <SettingsIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              系统设置与能力中心 (System & Capability Center)
            </h1>
            <p className="text-xs text-muted">
  管理 Annie 业务 Agent、技能组件、计算器模型、银行与递交平台及系统偏好
            </p>
          </div>
        </div>

        {/* Row 2: Top Navigation Tabs (Full Width) */}
        <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-xl bg-[var(--bg-subtle)] border w-full" style={{ borderColor: 'var(--border)' }}>
          <motion.button
            whileTap={reduced ? undefined : { scale: 0.96 }}
            onClick={() => setActiveTab('ability')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'ability' 
                ? 'bg-[var(--bg-card)] text-[var(--accent)] shadow-2xs border border-[var(--border)]' 
                : 'text-muted hover:text-primary'
            }`}
            id="tab-ability-center"
          >
            <Cpu className="w-3.5 h-3.5 text-[var(--purple)]" />
            <span>能力中心</span>
          </motion.button>

          <motion.button
            whileTap={reduced ? undefined : { scale: 0.96 }}
            onClick={() => setActiveTab('skills')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'skills' 
                ? 'bg-[var(--bg-card)] text-[var(--accent)] shadow-2xs border border-[var(--border)]' 
                : 'text-muted hover:text-primary'
            }`}
            id="tab-skill-center"
          >
            <Zap className="w-3.5 h-3.5 text-[var(--yellow)]" />
            <span>技能中心</span>
          </motion.button>

          <motion.button
            whileTap={reduced ? undefined : { scale: 0.96 }}
            onClick={() => setActiveTab('calculator')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'calculator' 
                ? 'bg-[var(--bg-card)] text-[var(--accent)] shadow-2xs border border-[var(--border)]' 
                : 'text-muted hover:text-primary'
            }`}
            id="tab-calculator-manager"
          >
            <Calculator className="w-3.5 h-3.5 text-[var(--purple)]" />
            <span>计算器管理</span>
          </motion.button>

          <motion.button
            whileTap={reduced ? undefined : { scale: 0.96 }}
            onClick={() => setActiveTab('banks')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'banks' 
                ? 'bg-[var(--bg-card)] text-[var(--accent)] shadow-2xs border border-[var(--border)]' 
                : 'text-muted hover:text-primary'
            }`}
            id="tab-bank-platform"
          >
            <Landmark className="w-3.5 h-3.5 text-[var(--yellow)]" />
            <span>银行与平台</span>
          </motion.button>

          <motion.button
            whileTap={reduced ? undefined : { scale: 0.96 }}
            onClick={() => setActiveTab('system')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'system' 
                ? 'bg-[var(--bg-card)] text-[var(--accent)] shadow-2xs border border-[var(--border)]' 
                : 'text-muted hover:text-primary'
            }`}
            id="tab-system-settings"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>基础配置与健康度</span>
          </motion.button>
        </div>
      </div>

      {/* Tab Content 1: Ability Center */}
      {activeTab === 'ability' && (
        <AbilityCenter />
      )}

      {/* Tab Content 2: Skill Center */}
      {activeTab === 'skills' && (
        <SkillCenter />
      )}

      {/* Tab Content 2: Calculator Manager */}
      {activeTab === 'calculator' && (
        <CalculatorManager />
      )}

      {/* Tab Content 3: Bank Platform Panel */}
      {activeTab === 'banks' && (
        <BankPlatformPanel />
      )}

      {/* Tab Content 4: System Settings */}
      {activeTab === 'system' && (

        <div className="space-y-6">
          {/* AI Model Configuration Card (F-48) */}
          <AiConfigCard />

          {/* AI Assistant Preferences Card (F-32) */}
          <AssistantSettingsCard />

          {/* Theme Picker Section */}
          <div className="rounded-2xl p-6 border space-y-4 shadow-2xs" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <ThemePicker />
          </div>

          {/* System Runtime & API Connection Status */}
          <div className="rounded-2xl p-6 border space-y-4 shadow-2xs" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center space-x-2">
                <Server className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                  🖥️ 服务状态与 API 连接 (Runtime Status)
                </h3>
              </div>

              <motion.button
                whileTap={reduced ? undefined : { scale: 0.95 }}
                onClick={checkApiHealth}
                className="px-2.5 py-1 rounded-lg text-xs font-mono flex items-center space-x-1 border cursor-pointer"
                style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                id="settings-refresh-api-btn"
              >
                <RefreshCw className={`w-3 h-3 ${apiStatus === 'checking' ? 'animate-spin' : ''}`} />
                <span>重新检测</span>
              </motion.button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              {/* API Health */}
              <div className="p-3.5 rounded-xl border flex items-center justify-between" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}>
                <div>
                  <span className="text-[11px] text-muted block">API 连接状态</span>
                  <div className="flex items-center space-x-1.5 font-bold mt-0.5">
                    {apiStatus === 'connected' ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-[var(--green)]" />
                        <span style={{ color: 'var(--green)' }}>已正常连接</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3.5 h-3.5 text-[var(--yellow)]" />
                        <span style={{ color: 'var(--yellow)' }}>检测中 / 离线模式</span>
                      </>
                    )}
                  </div>
                </div>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--green-soft)', color: 'var(--green)' }}>
                  HTTP/SSE
                </span>
              </div>

              {/* App Version */}
              <div className="p-3.5 rounded-xl border flex items-center justify-between" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}>
                <div>
                  <span className="text-[11px] text-muted block">系统架构版本</span>
                  <span className="font-bold font-mono mt-0.5 block" style={{ color: 'var(--text-primary)' }}>
                    {apiVersion} (V5 Workbench)
                  </span>
                </div>
                <span className="text-xs font-mono px-2 py-0.5 rounded font-bold" style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  Release
                </span>
              </div>

              {/* File Storage Root */}
              <div className="p-3.5 rounded-xl border flex items-center justify-between" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)' }}>
                <div>
                  <span className="text-[11px] text-muted block">客户文件根目录 (Read-Only)</span>
                  <span className="font-bold font-mono text-[11px] mt-0.5 block" style={{ color: 'var(--text-primary)' }}>
                    CLIENT_FILES_ROOT
                  </span>
                </div>
                <HardDrive className="w-4 h-4 text-muted" />
              </div>
            </div>
          </div>

          {/* Safety & PII Rules */}
          <div className="rounded-2xl p-6 border space-y-3 shadow-2xs" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4" style={{ color: 'var(--green)' }} />
              <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
        🛡️ 安全隐私与 Annie 核心守则
              </h3>
            </div>

            <div className="p-4 rounded-xl border space-y-2 text-xs leading-relaxed font-mono" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              <div className="flex items-center space-x-1.5 font-bold" style={{ color: 'var(--green)' }}>
                <Info className="w-3.5 h-3.5" />
                <span>绝对合规限制 (Strict Safety Constraints):</span>
              </div>
              <ul className="space-y-1 pl-5 list-disc text-[11px]">
                <li><strong>文件只读约束:</strong> AI 仅读取本地客户目录材料，物理禁止写入、删除或重命名客户源文件。</li>
                <li><strong>敏感信息防泄漏 (PII Safe):</strong> 客户 TFN、ABN 及银行卡号在传输与大模型分析前已完成脱敏擦除。</li>
                <li><strong>Human-in-the-loop 确认:</strong> 邮件发送、材料提交及转案决策均生成草稿，需 Vera (Broker) 确认后方可执行。</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
