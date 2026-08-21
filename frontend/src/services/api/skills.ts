import { request } from '../http';
import { SkillItem, CreateSkillRequest, SkillManifest, SkillStep } from '../../types/api';

const MOCK_SKILLS: SkillItem[] = [
  {
    id: 'sk-1',
    key: 'flow-followup',
    name: '跟进邮件生成流程包 (Follow-up Flow)',
    description: '自动对齐案件最新进展，生成英文跟进邮件与版本控制结构卡',
    category: 'flow_package',
    status: 'active',
    version: '1.0.0',
    created_by: 'system',
    is_builtin: true,
    triggers: ['跟进邮件', '发送跟进', '写一封跟进邮件', 'generate followup'],
    content: '流程包规则：提取最新脑盘事实，生成符合澳洲 Broker 标准的英文跟进邮件，支持多版本演化。',
    versions: [
      { version: '1.0.0', content: '初始内置系统流程包', updated_at: '2026-08-01 10:00', updated_by: 'System' },
    ],
    updated_at: '2026-08-01 10:00',
  },
  {
    id: 'sk-2',
    key: 'flow-chaser',
    name: '补件催件流程包 (Document Chaser Flow)',
    description: '针对缺失的 Checklist 清单项生成强语气/标准语气催件通知',
    category: 'flow_package',
    status: 'active',
    version: '1.0.0',
    created_by: 'system',
    is_builtin: true,
    triggers: ['发送催件邮件', '补件催件', '催材料', 'document chaser'],
    content: '流程包规则：根据丢失清单项生成精准多语气英文催件邮件。',
    versions: [
      { version: '1.0.0', content: '初始内置系统流程包', updated_at: '2026-08-01 10:00', updated_by: 'System' },
    ],
    updated_at: '2026-08-01 10:00',
  },
  {
    id: 'sk-3',
    key: 'flow-os-reply',
    name: '审贷意见回复流程包 (OS Review Reply Flow)',
    description: '针对银行审贷意见 (Outstanding Conditions) 逐条比对并生成专业审贷回复信',
    category: 'flow_package',
    status: 'active',
    version: '1.0.0',
    created_by: 'system',
    is_builtin: true,
    triggers: ['回复审贷意见', 'OS回复', '生成审贷回复', 'os reply'],
    content: '流程包规则：解析 OS 条件并关联已归档证据与知识库政策生成官方回复。',
    versions: [
      { version: '1.0.0', content: '初始内置系统流程包', updated_at: '2026-08-01 10:00', updated_by: 'System' },
    ],
    updated_at: '2026-08-01 10:00',
  },
  {
    id: 'sk-4',
    key: 'flow-declaration',
    name: '申报一致性检查流程包 (Declaration Check Flow)',
    description: '交叉比对申请表、薪资单、Bank Statement 与税务数据的一致性规则',
    category: 'flow_package',
    status: 'active',
    version: '1.0.0',
    created_by: 'system',
    is_builtin: true,
    triggers: ['检查申报一致性', '申报比对', '一致性核查'],
    content: '流程包规则：四方数据勾稽比对与冲突标红。',
    versions: [
      { version: '1.0.0', content: '初始内置系统流程包', updated_at: '2026-08-01 10:00', updated_by: 'System' },
    ],
    updated_at: '2026-08-01 10:00',
  },
  {
    id: 'sk-5',
    key: 'flow-servicing',
    name: '服务能力测算流程包 (Servicing Calculator Flow)',
    description: '基于各大银行官方计算器规则模型，精准测算客户最大贷款额度',
    category: 'flow_package',
    status: 'active',
    version: '1.0.0',
    created_by: 'system',
    is_builtin: true,
    triggers: ['服务能力计算', '帮我算贷款能力', '计算借贷额度'],
    content: '流程包规则：输入客户收支负债，计算各大银行最大额度。',
    versions: [
      { version: '1.0.0', content: '初始内置系统流程包', updated_at: '2026-08-01 10:00', updated_by: 'System' },
    ],
    updated_at: '2026-08-01 10:00',
  },
  {
    id: 'sk-6',
    key: 'flow-intake',
    name: '客户建档与材料预解析流程包 (Case Intake Flow)',
    description: '智能读取非结构化文本与附件生成标准案件数据',
    category: 'flow_package',
    status: 'active',
    version: '1.0.0',
    created_by: 'system',
    is_builtin: true,
    triggers: ['建档解析', '预解析材料'],
    content: '流程包规则：OCR 结构化提取与自动对齐案件表单。',
    versions: [
      { version: '1.0.0', content: '初始内置系统流程包', updated_at: '2026-08-01 10:00', updated_by: 'System' },
    ],
    updated_at: '2026-08-01 10:00',
  },
  {
    id: 'sk-7',
    key: 'skill-cba-lvr-policy',
    name: 'CBA LVR 85% 豁免 LMI 特约审核规则',
    description: '规定医护人员与金融高薪行业首套房免 LMI 的特规提示规则',
    category: 'rule',
    status: 'active',
    version: '1.1.0',
    created_by: 'vera',
    is_builtin: false,
    triggers: ['CBA LMI豁免', '医护人员85%LVR'],
    content: '匹配职业清单：Doctor, Nurse, Surgeon 等，触发利息与保费免除标记。',
    versions: [
      { version: '1.1.0', content: '更新 2026 年最新职业清单和收入线', updated_at: '2026-08-10 14:20', updated_by: 'Vera' },
      { version: '1.0.0', content: '建立初始豁免规则', updated_at: '2026-08-05 09:15', updated_by: 'Vera' },
    ],
    updated_at: '2026-08-10 14:20',
  },
  {
    id: 'sk-8',
    key: 'skill-auto-chaser-prompt',
    name: 'VIP 客户语气柔和型催件模板',
    description: '适合净值客户的高礼貌措辞补件提议样式',
    category: 'prompt',
    status: 'active',
    version: '2.0.0',
    created_by: 'vera',
    is_builtin: false,
    triggers: ['VIP催件', '柔和催件模板'],
    content: 'Prompt: Write a polite, high-touch document request email tailored for high-net-worth clients.',
    versions: [
      { version: '2.0.0', content: '优化了对高管客户的敬称表达', updated_at: '2026-08-08 11:00', updated_by: 'Vera' },
      { version: '1.0.0', content: '第一版柔和表达', updated_at: '2026-08-02 16:00', updated_by: 'Vera' },
    ],
    updated_at: '2026-08-08 11:00',
  },
  {
    id: 'sk-9',
    key: 'skill-westpac-self-employed-draft',
    name: 'Westpac 自雇人士两年 TAX Return 交叉比对 Prompt',
    description: '专门核查 Company Tax Return 与 Personal NOA 差异草稿规则',
    category: 'prompt',
    status: 'draft',
    version: '0.1.0',
    created_by: 'vera',
    is_builtin: false,
    triggers: ['Westpac自雇比对', '公司税单与个人税单比对'],
    content: '比对项目：Add-backs, Depreciation, Director fees 及借款扣除。',
    versions: [
      { version: '0.1.0', content: '草稿创建', updated_at: '2026-08-12 18:00', updated_by: 'Vera' },
    ],
    updated_at: '2026-08-12 18:00',
  },
  {
    id: 'sk-10',
    key: 'skill-ai-proposed-preapproval-reply',
    name: 'AI 提议: CBA 预核准材料缺漏快速澄清回复模板',
    description: 'AI 智能根据高频审贷回复总结出的精简答复流程提议',
    category: 'prompt',
    status: 'draft',
    version: '0.9.0',
    created_by: 'ai_propose',
    proposal_reason: '根据过去 10 次 CBA 预核准阶段客户关于补充流水质询的重复疑问，AI 自动提议生成此精简回复规则以提升转化率。',
    is_builtin: false,
    triggers: ['CBA预核准质询澄清', '流水提问回复'],
    content: 'Directly address the assessor query regarding unidentifiable transfer descriptions by mapping back to verified rental or salary facts.',
    versions: [
      { version: '0.9.0', content: 'AI 自动生成草稿提议', updated_at: '2026-08-13 01:30', updated_by: 'Annie Engine' },
    ],
    updated_at: '2026-08-13 01:30',
  },
];

let localSkillsState = [...MOCK_SKILLS];

function normalizeSkillItem(item: any): SkillItem {
  return {
    ...item,
    id: item.db_id ? String(item.db_id) : item.id || item.key,
    is_builtin: item.created_by === 'system' || item.is_builtin,
    proposal_reason: item.reason || item.proposal_reason,
    versions:
      item.versions && item.versions.length > 0
        ? item.versions
        : [
            {
              version: item.version || '1.0.0',
              content: item.description || item.name,
              updated_at: item.updated_at || '最近',
              updated_by: item.author || item.created_by || 'Vera',
            },
          ],
  };
}

export function buildSkillManifest(data: {
  key: string;
  name: string;
  description?: string;
  category?: string;
  triggers?: string[];
  content?: string;
  steps?: SkillStep[];
  version?: string;
}): SkillManifest {
  const allowedCategories = ['agent', 'tool', 'flow', 'knowledge'];
  let mappedCategory = data.category || 'flow';
  if (mappedCategory === 'flow_package') mappedCategory = 'flow';
  if (mappedCategory === 'prompt') mappedCategory = 'agent';
  if (mappedCategory === 'rule') mappedCategory = 'knowledge';
  if (!allowedCategories.includes(mappedCategory)) {
    mappedCategory = 'flow';
  }

  return {
    key: data.key,
    name: data.name,
    description: data.description || '',
    version: data.version || '0.1.0',
    category: mappedCategory as any,
    triggers: data.triggers || [],
    presentation: 'dialog',
    permission: 'draft',
    confirm_required: true,
    steps: data.steps || [
      {
        tool: 'draft_email',
        params: { content: data.content || '' },
      },
    ],
    author: 'vera',
  };
}

export async function getSkills(params?: { category?: string; status?: string }): Promise<SkillItem[]> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    let result = [...localSkillsState];
    if (params?.category && params.category !== 'all') {
      result = result.filter(
        (s) =>
          s.category === params.category ||
          (params.category === 'flow_package' && (s.category === 'flow' || s.category === 'flow_package')) ||
          (params.category === 'prompt' && (s.category === 'agent' || s.category === 'prompt')) ||
          (params.category === 'rule' && (s.category === 'knowledge' || s.category === 'rule'))
      );
    }
    if (params?.status && params.status !== 'all') {
      result = result.filter((s) => s.status === params.status);
    }
    return result;
  }
  const q = new URLSearchParams();
  if (params?.category && params.category !== 'all') {
    let cat = params.category;
    if (cat === 'flow_package') cat = 'flow';
    if (cat === 'prompt') cat = 'agent';
    if (cat === 'rule') cat = 'knowledge';
    q.set('category', cat);
  }
  if (params?.status && params.status !== 'all') q.set('status', params.status);
  const qs = q.toString();
  const rawList = await request<any[]>(`/api/skills${qs ? `?${qs}` : ''}`);
  return (rawList || []).map(normalizeSkillItem);
}

export async function getSkill(key: string): Promise<SkillItem> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    const item = localSkillsState.find((s) => s.key === key || s.id === key);
    if (!item) throw new Error('技能不存在');
    return item;
  }
  const raw = await request<any>(`/api/skills/${key}`);
  return normalizeSkillItem(raw);
}

export async function createSkillDraft(
  manifestOrData: SkillManifest | CreateSkillRequest | any,
  reason?: string
): Promise<SkillItem> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    const data = manifestOrData as any;
    const newSkill: SkillItem = {
      id: `sk-${Date.now()}`,
      key: data.key || data.manifest?.key,
      name: data.name || data.manifest?.name,
      description: data.description || data.manifest?.description || '',
      category: data.category || data.manifest?.category || 'flow',
      status: 'draft',
      version: data.version || data.manifest?.version || '0.1.0',
      created_by: 'vera',
      is_builtin: false,
      triggers: data.triggers || data.manifest?.triggers || [],
      content: data.content || (data.steps?.[0]?.params?.content as string) || '',
      versions: [
        {
          version: data.version || '0.1.0',
          content: data.description || '草稿创建',
          updated_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
          updated_by: 'Vera',
        },
      ],
      updated_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };
    localSkillsState.unshift(newSkill);
    return newSkill;
  }

  const manifest =
    manifestOrData.manifest ||
    ('key' in manifestOrData && 'steps' in manifestOrData
      ? (manifestOrData as SkillManifest)
      : buildSkillManifest({
          key: manifestOrData.key,
          name: manifestOrData.name,
          description: manifestOrData.description,
          category: manifestOrData.category,
          triggers: manifestOrData.triggers,
          content: manifestOrData.content,
        }));

  const raw = await request<any>('/api/skills', {
    method: 'POST',
    body: JSON.stringify({ manifest, reason }),
  });
  return normalizeSkillItem(raw);
}

export async function activateSkill(key: string, version?: string): Promise<SkillItem> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    const idx = localSkillsState.findIndex((s) => s.key === key || s.id === key);
    if (idx === -1) throw new Error('技能不存在');
    const target = localSkillsState[idx];
    const updated: SkillItem = {
      ...target,
      status: 'active',
      updated_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };
    localSkillsState[idx] = updated;
    return updated;
  }
  const raw = await request<any>(`/api/skills/${key}/activate`, {
    method: 'POST',
    body: JSON.stringify({
      version: version || '1.0.0',
      operator: 'vera',
    }),
  });
  return normalizeSkillItem(raw);
}

export async function deactivateSkill(key: string, version?: string): Promise<SkillItem> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    const idx = localSkillsState.findIndex((s) => s.key === key || s.id === key);
    if (idx === -1) throw new Error('技能不存在');
    const target = localSkillsState[idx];
    const updated: SkillItem = {
      ...target,
      status: 'deprecated',
      updated_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };
    localSkillsState[idx] = updated;
    return updated;
  }
  const url = `/api/skills/${key}/deactivate${version ? `?version=${encodeURIComponent(version)}` : ''}`;
  const raw = await request<any>(url, {
    method: 'POST',
  });
  return normalizeSkillItem(raw);
}

export async function rollbackSkill(key: string, targetVersion: string): Promise<SkillItem> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    const idx = localSkillsState.findIndex((s) => s.key === key || s.id === key);
    if (idx === -1) throw new Error('技能不存在');
    const target = localSkillsState[idx];
    const historical = target.versions?.find((v) => v.version === targetVersion);
    const newVersion = `1.${(target.versions?.length || 1) + 1}.0`;
    const updated: SkillItem = {
      ...target,
      version: newVersion,
      content: historical?.content || target.content,
      status: 'active',
      versions: [
        {
          version: newVersion,
          content: `回滚自版本 ${targetVersion}`,
          updated_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
          updated_by: 'Vera Rollback',
        },
        ...(target.versions || []),
      ],
      updated_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };
    localSkillsState[idx] = updated;
    return updated;
  }
  const raw = await request<any>(`/api/skills/${key}/rollback`, {
    method: 'POST',
    body: JSON.stringify({ target_version: targetVersion }),
  });
  return normalizeSkillItem(raw);
}

export async function rejectSkillProposal(key: string, reason?: string): Promise<SkillItem> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    const idx = localSkillsState.findIndex((s) => s.key === key || s.id === key);
    if (idx === -1) throw new Error('技能不存在');
    const target = localSkillsState[idx];
    const updated: SkillItem = {
      ...target,
      status: 'deprecated',
      description: `${target.description} (被 Vera 拒绝: ${reason || '未填写理由'})`,
      updated_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };
    localSkillsState[idx] = updated;
    return updated;
  }
  const raw = await request<any>(`/api/skills/${key}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason || '' }),
  });
  return normalizeSkillItem(raw);
}

export async function updateSkillDraft(
  key: string,
  manifestOrData: SkillManifest | Partial<SkillItem> | any,
  reason?: string
): Promise<SkillItem> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    const idx = localSkillsState.findIndex((s) => s.key === key || s.id === key);
    if (idx === -1) throw new Error('技能不存在');
    const target = localSkillsState[idx];
    const updated: SkillItem = {
      ...target,
      ...(manifestOrData as Partial<SkillItem>),
      updated_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };
    localSkillsState[idx] = updated;
    return updated;
  }

  const manifest =
    manifestOrData.manifest ||
    ('key' in manifestOrData && 'steps' in manifestOrData
      ? (manifestOrData as SkillManifest)
      : buildSkillManifest({
          key,
          name: (manifestOrData as any).name || key,
          description: (manifestOrData as any).description,
          category: (manifestOrData as any).category,
          triggers: (manifestOrData as any).triggers,
          content: (manifestOrData as any).content,
          version: (manifestOrData as any).version,
        }));

  const raw = await request<any>(`/api/skills/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ manifest, reason }),
  });
  return normalizeSkillItem(raw);
}
