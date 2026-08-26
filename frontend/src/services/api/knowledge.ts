import { request } from '../http';
import { KnowledgeEntry } from '../../types/api';

export type { KnowledgeEntry };

const MOCK_KNOWLEDGE_ENTRIES: KnowledgeEntry[] = [
  {
    id: 'KNOW_PREC_001',
    layer: 'global',
    source: 'archive_precedent',
    source_type: 'archive_precedent',
    precedent_id: 'PRECEDENT_001',
    case_id: 'CASE_ARCH_01',
    client_name: 'PERSON_1',
    lender: 'ORDE',
    content: 'ORDE 机构针对商业物业抵押兼 Low Doc 审查，利用同区域租金回报率与租约组合成功替代个人财报审查。',
    background: '客户个人公司财报显示折旧后净利润较低，但抵押物为 Burwood 优质商业物业，周租金达到 $1,850。',
    strategy: '避开常规个人收入核算通道，转为 ORDE 专属 Commercial Alt Doc 管道，前置提交租约文本与银行近 6 个月租金流水核对。',
    takeaway: '针对租金现金流充裕的商业房产，选用 Alt Doc 租金覆盖率模式可规避公司财务折旧带来的扣减。',
    scheme_type: 'Alt Doc',
    tags: ['ORDE', '商业房产', '租金替代收入', 'Alt Doc'],
    vera_confirmed: true,
    created_at: '2026-08-10T10:00:00Z',
  },
  {
    id: 'KNOW_PREC_002',
    layer: 'global',
    source: 'archive_precedent',
    source_type: 'archive_precedent',
    precedent_id: 'PRECEDENT_002',
    case_id: 'CASE_ARCH_02',
    client_name: 'PERSON_2',
    lender: 'Westpac',
    content: 'Westpac 自雇人士信贷审查：前置补充注册会计师声明信（CPA Letter）说明一次性资本支出扣除逻辑。',
    background: '客户上一财年采购重型设备产生 $18 万一次性设备折旧，导致信贷系统计算的 DTI 超标。',
    strategy: '由 CPA 出具 Add-back 补充说明函，详细列明设备采购非重复性支出，并证明本财年真现金流强劲。',
    takeaway: '四大行对一次性大额资本支出具有 Add-back 调优政策，前置会计师函可直接避免一票否决。',
    scheme_type: 'Full Doc',
    tags: ['Westpac', '自雇人士', 'CPA 声明信', 'Add-back'],
    vera_confirmed: true,
    created_at: '2026-08-12T14:30:00Z',
  },
  {
    id: 'KNOW_PREC_003',
    layer: 'global',
    source: 'archive_precedent',
    source_type: 'archive_precedent',
    precedent_id: 'PRECEDENT_003',
    case_id: 'CASE_ARCH_03',
    client_name: 'PERSON_3',
    lender: 'Macquarie',
    content: 'Macquarie 极速预批：高净值客户流动资产与股票质押对冲核算模式。',
    background: '客户离职创业期间无固定工资单，但拥有 $80 万定期存款与 Macquarie 股票账户。',
    strategy: '采用 Macquarie 专属 Liquidity Asset Tier 评估通道，按存款收益率折算做收入补充。',
    takeaway: '高净值过渡期客户，善用存款利息与流动资产背书可直接拿全额 Full Doc 批准。',
    scheme_type: 'Full Doc',
    tags: ['Macquarie', '高净值客户', '流动资产背书'],
    vera_confirmed: true,
    created_at: '2026-08-15T09:15:00Z',
  },
];

export async function getKnowledge(params?: {
  layer?: string;
  case_id?: string;
  lender?: string;
  limit?: number;
}): Promise<KnowledgeEntry[]> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    let list = [...MOCK_KNOWLEDGE_ENTRIES];
    if (params?.layer) {
      list = list.filter((e) => e.layer === params.layer);
    }
    if (params?.lender) {
      list = list.filter((e) => e.lender?.toLowerCase() === params.lender?.toLowerCase());
    }
    if (params?.case_id) {
      list = list.filter((e) => e.case_id === params.case_id);
    }
    return Promise.resolve(list);
  }

  const query = new URLSearchParams();
  if (params?.layer) query.append('layer', params.layer);
  if (params?.case_id) query.append('case_id', params.case_id);
  if (params?.lender) query.append('lender', params.lender);
  if (params?.limit) query.append('limit', String(params.limit));
  const queryString = query.toString();

  try {
    return await request<KnowledgeEntry[]>(`/api/knowledge${queryString ? `?${queryString}` : ''}`);
  } catch (err) {
    console.warn('Backend /api/knowledge fetch failed, using mock knowledge entries:', err);
    return MOCK_KNOWLEDGE_ENTRIES;
  }
}

export function createKnowledge(body: {
  layer: string;
  content: string;
  case_id?: string;
  lender?: string;
  source?: string;
  tags?: string[] | string;
}): Promise<KnowledgeEntry> {
  const payload = {
    ...body,
    tags: Array.isArray(body.tags) ? body.tags.join(',') : body.tags,
  };
  return request<KnowledgeEntry>('/api/knowledge', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateKnowledge(
  id: string,
  body: { content?: string; lender?: string; vera_confirmed?: boolean; tags?: string[] | string }
): Promise<KnowledgeEntry> {
  const payload = {
    ...body,
    tags: Array.isArray(body.tags) ? body.tags.join(',') : body.tags,
  };
  return request<KnowledgeEntry>(`/api/knowledge/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function confirmKnowledge(id: string): Promise<KnowledgeEntry> {
  return request<KnowledgeEntry>(`/api/knowledge/${encodeURIComponent(id)}/confirm`, {
    method: 'POST',
  }).catch(() => {
    return updateKnowledge(id, { vera_confirmed: true });
  });
}

export function deleteKnowledge(id: string): Promise<void> {
  return request<void>(`/api/knowledge/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
