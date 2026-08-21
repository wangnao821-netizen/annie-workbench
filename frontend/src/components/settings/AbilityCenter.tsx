import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { 
  Bot, Wrench, Sparkles, Clock, 
  MessageSquare, HelpCircle, ShieldCheck, Zap, ToggleLeft, ToggleRight, RefreshCw
} from 'lucide-react';
import { getAgents, updateAgent } from '../../services/api/agents';
import { AgentItem } from '../../types/api';
import { useToastStore } from '../../stores/toastStore';

const FALLBACK_AGENTS: AgentItem[] = [
  {
    key: 'agent-intake',
    name: '建档 Agent (Case Intake)',
    description: '一键完成新客户或存量客户建档、支持文件/文本识别自动提取与预填',
    category: 'agent',
    triggers: ['帮我建个案件', '新建贷款案件'],
    status: 'available',
    enabled: true,
  },
  {
    key: 'agent-followup',
    name: '跟进 Agent (Follow-up)',
    description: '智能追踪案件进度节点、实时检测补件完成度与到期风险',
    category: 'agent',
    triggers: ['看一下进度', '最近有什么要跟进的'],
    status: 'pending',
    enabled: true,
  },
  {
    key: 'agent-audit',
    name: '申报一致性检查 Agent (Audit & Cross-Check)',
    description: '交叉比对申请表、薪资单、Bank Statement 与税务数据一致性',
    category: 'agent',
    triggers: ['检查一下申报一致性', '比对材料与申请表'],
    status: 'available',
    enabled: true,
  },
  {
    key: 'agent-chaser',
    name: '催件 Agent (Chaser)',
    description: '自动汇总缺失材料清单，生成并发送客户催件提醒与邮件草稿',
    category: 'agent',
    triggers: ['写一封催件邮件', '提醒客户补交材料'],
    status: 'pending',
    enabled: true,
  },
  {
    key: 'agent-os-reply',
    name: 'OS 回复 Agent (Condition Response)',
    description: '针对银行 Outstanding / Condition 自动化生成专业回复与解释信',
    category: 'agent',
    triggers: ['帮我回复银行', '生成 OS 答复草稿'],
    status: 'pending',
    enabled: true,
  },
  {
    key: 'agent-calculator',
    name: '服务能力计算器 Agent (Servicing Calculator)',
    description: '基于各大银行官方计算器规则模型，精准测算客户最大贷款额度与服务能力',
    category: 'agent',
    triggers: ['帮我算贷款能力', '服务能力计算'],
    status: 'available',
    enabled: true,
  },
];

const FALLBACK_TOOLS: AgentItem[] = [
  {
    key: 'tool-memory',
    name: '记忆工具 (Case Memory)',
    description: '记录 / 确认 / 撤销案件关键事实',
    category: 'tool',
    capability: '记录 / 确认 / 撤销',
    status: 'available',
    permission: '自动同步沟通要点与案情事实',
    enabled: true,
  },
  {
    key: 'tool-ocr',
    name: '文件识别提取 (OCR & Parse)',
    description: 'PDF / 图片 / 文本智能解析预填',
    category: 'tool',
    capability: 'PDF / 图片 / 文本智能解析预填',
    status: 'available',
    permission: '仅 Vera 主动上传/指定路径',
    enabled: true,
  },
  {
    key: 'tool-policy',
    name: '政策库查询 (Policy Search)',
    description: '智能检索各大银行最新政策与 LVR 限制',
    category: 'tool',
    capability: '智能检索各大银行最新政策与 LVR 限制',
    status: 'available',
    permission: '读取云端银行政策指南数据库',
    enabled: true,
  },
  {
    key: 'tool-email',
    name: '邮件进度同步 (Email Sync)',
    description: '自动读取并匹配银行邮件批复与补件通知',
    category: 'tool',
    capability: '自动读取并匹配银行邮件批复与补件通知',
    status: 'pending',
    permission: '仅匹配已关联客户邮件 (执行数据待后端接入)',
    enabled: false,
  },
  {
    key: 'tool-calendar',
    name: '智能日历对接 (Calendar)',
    description: '自动同步 Finance Clause 与 Settlement 到期日程',
    category: 'tool',
    capability: '自动同步 Finance Clause 与 Settlement 到期日程',
    status: 'pending',
    permission: '需授权个人或团队日历权限 (执行数据待后端接入)',
    enabled: false,
  },
];

const PROMPT_CHIPS = [
  '帮我建个案件',
  '检查申报一致性',
  '今天有哪些到期？',
  '写一封补件邮件',
];

export function AbilityCenter() {
  const reduced = useReducedMotion();
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [tools, setTools] = useState<AgentItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [updatingKeys, setUpdatingKeys] = useState<Set<string>>(new Set());

  const fetchAbilityData = async () => {
    setLoading(true);
    try {
      const res = await getAgents();
      const allItems = res.agents || [];
      
      const agentList = allItems.filter((i) => i.category === 'agent' || i.category !== 'tool');
      const toolList = allItems.filter((i) => i.category === 'tool');

      setAgents(agentList.length > 0 ? agentList : FALLBACK_AGENTS);
      setTools(toolList.length > 0 ? toolList : FALLBACK_TOOLS);
    } catch {
      setAgents(FALLBACK_AGENTS);
      setTools(FALLBACK_TOOLS);
    } finally {
      setLoading(false);
    }
  };

  const activeTriggers = Array.from(
    new Set(
      agents
        .filter((a) => (a.category === 'agent' || a.category !== 'tool') && a.status === 'available' && a.enabled)
        .flatMap((a) => a.triggers || [])
    )
  ).slice(0, 6);

  const displayChips = activeTriggers.length > 0 ? activeTriggers : PROMPT_CHIPS;

  useEffect(() => {
    fetchAbilityData();
  }, []);

  const handleToggle = async (item: AgentItem, isTool: boolean) => {
    const itemKey = item.key || item.id || '';
    if (!itemKey || updatingKeys.has(itemKey)) return;

    const nextState = !item.enabled;

    // Optimistic Update
    if (isTool) {
      setTools((prev) => prev.map((t) => ((t.key || t.id) === itemKey ? { ...t, enabled: nextState } : t)));
    } else {
      setAgents((prev) => prev.map((a) => ((a.key || a.id) === itemKey ? { ...a, enabled: nextState } : a)));
    }

    setUpdatingKeys((prev) => new Set(prev).add(itemKey));

    try {
      await updateAgent(itemKey, nextState);
      useToastStore
        .getState()
        .showToast('info', `${item.name} 已${nextState ? '开启' : '关闭'}`);
    } catch (err: any) {
      // Rollback on failure
      if (isTool) {
        setTools((prev) => prev.map((t) => ((t.key || t.id) === itemKey ? { ...t, enabled: !nextState } : t)));
      } else {
        setAgents((prev) => prev.map((a) => ((a.key || a.id) === itemKey ? { ...a, enabled: !nextState } : a)));
      }
      useToastStore
        .getState()
        .showToast('error', `更新 ${item.name} 状态失败: ${err?.detail || err?.message || '网络错误'}`);
    } finally {
      setUpdatingKeys((prev) => {
        const next = new Set(prev);
        next.delete(itemKey);
        return next;
      });
    }
  };

  const handleChipClick = (prompt: string) => {
    useToastStore
      .getState()
      .showToast('info', `触发指令 "${prompt}"：可在全局咨询或案件对话中直接说出`);
  };

  return (
    <div className="space-y-6" id="ability-center-container">
      {/* Top Banner: Capability Prompts / Chips */}
      <div 
        className="rounded-2xl p-5 border space-y-3 shadow-2xs"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-[var(--purple)]" />
            <h3 className="text-xs font-extrabold" style={{ color: 'var(--text-primary)' }}>
              💡 常用对话触发语 (Quick Capability Prompts)
            </h3>
          </div>
          {loading && (
            <span className="text-[11px] text-muted font-mono flex items-center space-x-1">
              <RefreshCw className="w-3 h-3 animate-spin text-[var(--purple)]" />
              <span>同步注册表中…</span>
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted">
          以下触发语已接入对话路由，可直接在全局咨询或案件对话中对 Annie 说出：
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          {displayChips.map((chip, idx) => (
            <motion.button
              key={idx}
              whileTap={reduced ? undefined : { scale: 0.96 }}
              onClick={() => handleChipClick(chip)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center space-x-1.5 cursor-pointer shadow-2xs hover:border-[var(--purple)] hover:text-[var(--purple)] dark:hover:text-[var(--purple)]"
              style={{ 
                backgroundColor: 'var(--bg-app)', 
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
              id={`ability-chip-${idx}`}
            >
              <MessageSquare className="w-3 h-3 text-[var(--purple)]" />
              <span>"{chip}"</span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* 1. Business Agents Section */}
      <div 
        className="rounded-2xl p-5 border space-y-4 shadow-2xs"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center space-x-2">
            <Bot className="w-4 h-4 text-[var(--purple)]" />
            <div>
              <h3 className="text-xs font-extrabold" style={{ color: 'var(--text-primary)' }}>
                🤖 业务 Agent 中心 (Business Agents)
              </h3>
              <p className="text-[11px] text-muted">
                针对房贷特定场景专门训化的智能体，负责协同完成建档、跟进、风控审核与银行沟通
              </p>
            </div>
          </div>
          <span className="text-xs font-mono px-2 py-0.5 rounded-full font-bold bg-[var(--purple-soft)] text-[var(--purple)]">
            {agents.filter((a) => a.enabled).length} / {agents.length} 已激活
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {agents.map((agent) => {
            const agentKey = agent.key || agent.id || '';
            const isUpdating = updatingKeys.has(agentKey);
            return (
              <div
                key={agentKey}
                className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  agent.enabled 
                    ? 'bg-[var(--bg-app)] border-[var(--border)]' 
                    : 'bg-[var(--bg-app)]/50 border-[var(--border)] opacity-60'
                }`}
                id={`agent-card-${agentKey}`}
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                    <span className="text-xs font-extrabold" style={{ color: 'var(--text-primary)' }}>
                      {agent.name}
                    </span>

                    {/* Status Badge */}
                    {agent.status === 'available' ? (
                      agent.enabled ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--purple-soft)] text-[var(--purple)] border border-[var(--purple-soft)] flex items-center space-x-1">
                          <Zap className="w-3 h-3 text-[var(--purple)]" />
                          <span>对话可触发</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--bg-subtle)] text-muted border border-[var(--border)] flex items-center space-x-1">
                          <Clock className="w-3 h-3 text-muted" />
                          <span>已停用</span>
                        </span>
                      )
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--bg-subtle)] text-muted border border-[var(--border)] flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-muted" />
                        <span>待接入 (执行数据待后端接入)</span>
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-muted leading-relaxed">
                    {agent.description}
                  </p>

                  {/* Triggers */}
                  {agent.triggers && agent.triggers.length > 0 && (
                    <div className="flex items-center space-x-1.5 pt-0.5 text-[11px]">
                      <span className="text-muted font-semibold flex items-center">
                        <Zap className="w-3 h-3 text-[var(--yellow)] mr-1" />
                        触发词：
                      </span>
                      <div className="flex items-center space-x-1 flex-wrap">
                        {agent.triggers.map((t, i) => (
                          <span 
                            key={i} 
                            className={`px-1.5 py-0.2 rounded text-xs font-mono bg-[var(--purple-soft)] text-[var(--purple)] dark:text-[var(--purple)] border border-[var(--purple-soft)] ${
                              !agent.enabled ? 'opacity-50' : ''
                            }`}
                          >
                            "{t}"
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Toggle Switch */}
                <div className="flex items-center space-x-2 flex-shrink-0 self-end sm:self-center">
                  <motion.button
                    whileTap={reduced ? undefined : { scale: 0.92 }}
                    onClick={() => handleToggle(agent, false)}
                    disabled={isUpdating}
                    className={`p-1 rounded-xl transition-colors cursor-pointer flex items-center space-x-1 ${
                      agent.enabled ? 'text-[var(--purple)]' : 'text-muted'
                    } ${isUpdating ? 'opacity-50' : ''}`}
                    id={`toggle-agent-${agentKey}`}
                    aria-label={`切换 ${agent.name}`}
                  >
                    {isUpdating ? (
                      <RefreshCw className="w-6 h-6 animate-spin text-[var(--purple)]" />
                    ) : agent.enabled ? (
                      <ToggleRight className="w-7 h-7 text-[var(--purple)]" />
                    ) : (
                      <ToggleLeft className="w-7 h-7 text-muted" />
                    )}
                  </motion.button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Brain Tools Section */}
      <div 
        className="rounded-2xl p-5 border space-y-4 shadow-2xs"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center space-x-2">
            <Wrench className="w-4 h-4 text-[var(--purple)]" />
            <div>
              <h3 className="text-xs font-extrabold" style={{ color: 'var(--text-primary)' }}>
                🛠️ 工具库 (Brain Tools & Integrations)
              </h3>
              <p className="text-[11px] text-muted">
                供 Annie 底层调用的原子能力，覆盖记忆同步、文件解析、政策库检索与第三方工具集成
              </p>
            </div>
          </div>
          <span className="text-xs font-mono px-2 py-0.5 rounded-full font-bold bg-[var(--purple-soft)] text-[var(--purple)]">
            {tools.filter((t) => t.enabled).length} / {tools.length} 已启用
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {tools.map((tool) => {
            const toolKey = tool.key || tool.id || '';
            const isUpdating = updatingKeys.has(toolKey);
            return (
              <div
                key={toolKey}
                className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between space-y-2 ${
                  tool.enabled 
                    ? 'bg-[var(--bg-app)] border-[var(--border)]' 
                    : 'bg-[var(--bg-app)]/50 border-[var(--border)] opacity-60'
                }`}
                id={`tool-card-${toolKey}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-1.5 flex-wrap">
                      <span className="text-xs font-extrabold" style={{ color: 'var(--text-primary)' }}>
                        {tool.name}
                      </span>
                      {tool.status === 'available' ? (
                        <span className="px-1.5 py-0.2 rounded text-[11px] font-bold bg-[var(--green-soft)] text-[var(--green)]">
                          🟢 可用
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.2 rounded text-[11px] font-bold bg-[var(--bg-subtle)] text-muted">
                          ⚪ 待接入
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted font-medium">
                      {tool.capability || tool.description}
                    </p>
                  </div>

                  <motion.button
                    whileTap={reduced ? undefined : { scale: 0.92 }}
                    onClick={() => handleToggle(tool, true)}
                    disabled={isUpdating}
                    className="cursor-pointer"
                    id={`toggle-tool-${toolKey}`}
                    aria-label={`切换 ${tool.name}`}
                  >
                    {isUpdating ? (
                      <RefreshCw className="w-5 h-5 animate-spin text-[var(--purple)]" />
                    ) : tool.enabled ? (
                      <ToggleRight className="w-6 h-6 text-[var(--purple)]" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-muted" />
                    )}
                  </motion.button>
                </div>

                {/* Permission & Security note */}
                <div className="pt-1 border-t flex items-center space-x-1 text-[11px] text-muted truncate" style={{ borderColor: 'var(--border)' }}>
                  <ShieldCheck className="w-3 h-3 text-[var(--purple)] flex-shrink-0" />
                  <span className="truncate">权限规范：{tool.permission || '系统标准安全权限'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-3.5 rounded-xl border bg-[var(--bg-subtle)] text-[11px] text-muted flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center space-x-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-[var(--purple)]" />
          <span>能力中心状态与后端注册表保持实时同步，开关变更自动提交并即时生效。</span>
        </div>
      </div>
    </div>
  );
}
