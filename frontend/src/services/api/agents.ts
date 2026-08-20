import { request } from '../http';
import { AgentsResponse, AgentItem, AgentUpdateRequest } from '../../types/api';

const MOCK_AGENTS: AgentItem[] = [
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

export async function getAgents(): Promise<AgentsResponse> {
  try {
    return await request<AgentsResponse>('/api/agents/');
  } catch (err) {
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      return { agents: MOCK_AGENTS };
    }
    throw err;
  }
}

export async function updateAgent(key: string, enabled: boolean): Promise<AgentItem> {
  try {
    const body: AgentUpdateRequest = { enabled };
    return await request<AgentItem>(`/api/agents/${key}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      const match = MOCK_AGENTS.find((a) => a.key === key);
      return {
        key,
        name: match?.name || key,
        description: match?.description || '',
        category: match?.category || 'agent',
        status: match?.status || 'available',
        enabled,
      };
    }
    throw err;
  }
}
