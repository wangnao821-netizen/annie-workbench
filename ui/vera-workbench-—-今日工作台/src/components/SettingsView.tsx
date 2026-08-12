import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Settings, BookOpen, Key, Bot, Shield, Check, Sliders, Database } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'knowledge' | 'rules' | 'api' | 'system'>('knowledge');

  return (
    <div id="settings-page" className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
        <div className="flex items-center space-x-2">
          <Settings className="w-5 h-5 text-[var(--accent)]" />
          <h1 className="text-xl font-extrabold text-[var(--text-primary)]">
            设置与能力中心 (Capabilities Center)
          </h1>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex space-x-2 border-b border-[var(--border)] pb-2 text-xs">
        <button
          onClick={() => setActiveTab('knowledge')}
          className={`px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 transition-all ${
            activeTab === 'knowledge' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>知识中心 (Knowledge Base)</span>
        </button>

        <button
          onClick={() => setActiveTab('rules')}
          className={`px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 transition-all ${
            activeTab === 'rules' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>AI 决策规则 (Policy Rules)</span>
        </button>

        <button
          onClick={() => setActiveTab('api')}
          className={`px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 transition-all ${
            activeTab === 'api' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
          }`}
        >
          <Key className="w-4 h-4" />
          <span>接口与 API 配置</span>
        </button>
      </div>

      {/* Content based on tab */}
      {activeTab === 'knowledge' && (
        <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] space-y-4 text-xs">
          <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
            <BookOpen className="w-4 h-4 text-blue-600" />
            <span>澳洲贷款政策知识库 (Knowledge Base)</span>
          </h2>
          <p className="text-[var(--text-secondary)]">
            知识中心已合入设置能力中心。此处维护四大行（CBA, Westpac, ANZ, NAB）最新政策指引、利率比较与预核算规则。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            {[
              { bank: 'CBA 银行服务指引', note: 'HECS 债务预扣免除条款及 DTI 6x 预警限制', date: '2026-08 更新' },
              { bank: 'Westpac 自雇收入加回规则', note: 'Depreciation / Director Fee 加回折算标准', date: '2026-07 更新' },
              { bank: 'ANZ 绿通道 Fast-Track 条件', note: 'LTV <= 80% 且估值直接 Pass 规则', date: '2026-08 更新' },
              { bank: 'Macquarie 投资房租金覆盖率', note: '75% 净租金覆盖负债率校验', date: '2026-08 更新' }
            ].map((k, idx) => (
              <div key={idx} className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] space-y-1">
                <div className="flex justify-between font-bold text-[var(--text-primary)]">
                  <span>{k.bank}</span>
                  <span className="text-[10px] text-[var(--text-muted)]">{k.date}</span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)]">{k.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] space-y-3 text-xs">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">AI 提醒与防呆触发配置</h2>
          <p className="text-[var(--text-secondary)]">
            设置当案件逾期大于 24 小时或材料状态标为“待补件”时，自动提示警示红条。
          </p>
          <div className="flex items-center space-x-2 text-emerald-600 font-semibold pt-2">
            <Check className="w-4 h-4" />
            <span>自动防呆拦截已开启 (Active)</span>
          </div>
        </div>
      )}

      {activeTab === 'api' && (
        <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] space-y-3 text-xs">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">模型与 API Key 凭据管理</h2>
          <p className="text-[var(--text-secondary)]">
            Gemini API 环境变量状态：<span className="font-bold text-emerald-600">process.env.GEMINI_API_KEY 已注入</span>
          </p>
          <p className="text-[10px] text-[var(--text-muted)]">
            如需修改 Key，请在 AI Studio 侧边栏的 Secrets 页面配置，代码自动从环境读取，安全合规。
          </p>
        </div>
      )}
    </div>
  );
};
