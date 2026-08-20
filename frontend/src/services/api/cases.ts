import { request, getApiBaseUrl } from '../http';
import {
  CaseResponse,
  ChecklistItemResponse,
  AddChecklistItemRequest,
  TimelineEventResponse,
  CaseFileResponse,
  SubmissionCheckResponse,
  CreateCaseRequest,
  CreateCaseResponse,
  ArchivedCase,
  CaseContext,
  BrainFact,
  ContextEvent,
  ContextEventRequest,
  ContextEventResponse,
  PreFillResponse,
  ParseFileResponse,
  PolicyCheckResult,
  DeclarationCheckResult,
  DeclarationCheckPayload,
  AssociateFolderRequest,
  AssociateFolderResponse,
  RevokeFolderFileResponse,
  ParsedFolderMetadata,
  FolderBrowseResponse,
  HoldCaseRequest,
  ResubmitCaseRequest,
  WithdrawCaseRequest,
  DeclineCaseRequest,
  CaseActionResponse,
  LegacyImportPreviewResponse,
  CaseSubfolderMeta,
  ClientTopologyMeta,
  TopologyScanSummary,
  FolderTopologyScanResponse,
  BatchTopologyImportRequest,
  BatchTopologyImportResponse,
  ChecklistMatchFilesResponse,
  CaseTimelineResponse,
  TimelineExtractResponse,
  CaseScaffoldRequest,
  CaseScaffoldResponse,
  ArchiveCaseItem,
  ArchiveScanResponse,
  ArchiveBatchImportRequest,
  ArchiveBatchImportResponse,
  RetentionOpportunityItem,
  RetentionRadarSummary,
  RetentionRadarResponse,
  AssessorInsightItem,
  AssessorListResponse,
  CasePrecedentItem,
  CasePrecedentSearchResponse,
  KnowledgeCardData,
  KnowledgeCardResponse,
  ArchiveHubStats,
  ArchiveHubStatsResponse,
  ClientPortfolioItem,
  ArchivePortfolioResponse,
  KnowledgeSyncResponse,
  CaseRecommendedPrecedentsResponse,
  RecommendedPrecedentItem,
  CaseBriefResponse,
  MailPreviewResponse,
} from '../../types/api';

import { updateMockCase, deleteMockCase, addMockCases } from '../../data/mockCases';

const MOCK_DYNAMIC_ARCHIVED_CASES: ArchivedCase[] = [
  {
    case_id: 'CASE_ARCH_01',
    client_name: 'PERSON_1',
    lender: 'CBA',
    loan_amount: 850000,
    stage: '交割完成',
    stage_days: 0,
    checklist_done: 12,
    checklist_total: 12,
    progress_pct: 100,
    last_activity: '2026-05-10T10:00:00Z',
    closed_at: '2026-05-10',
    close_reason: '已无条件批复并完成 Final Settlement 交割',
    property_address: '12 Burwood Rd, Burwood NSW 2134',
    settlement_date: '2024-05-10',
    interest_rate: '6.09%',
    folder_path: 'D:\\EverStones_Clients\\PERSON_1\\1. Purchase - CBA - 12 Burwood Rd',
  },
  {
    case_id: 'CASE_ARCH_02',
    client_name: 'PERSON_2',
    lender: 'ANZ Bank',
    loan_amount: 620000,
    stage: '案件终止',
    stage_days: 0,
    checklist_done: 5,
    checklist_total: 10,
    progress_pct: 50,
    last_activity: '2026-04-18T14:30:00Z',
    closed_at: '2026-04-18',
    close_reason: '客户因个人原因撤回申请或改买现房',
    property_address: '88 Pacific Hwy, St Leonards NSW 2065',
    settlement_date: '2024-04-18',
    interest_rate: '5.99%',
    folder_path: 'D:\\EverStones_Clients\\PERSON_2\\2. Refinance - ANZ - 88 Pacific Hwy',
  },
];

export function listCases(stage?: string): Promise<CaseResponse[]> {
  const query = stage ? `?stage=${encodeURIComponent(stage)}` : '';
  return request<CaseResponse[]>(`/api/cases/${query}`);
}

export function listArchivedCases(limit = 100): Promise<ArchivedCase[]> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    return Promise.resolve([...MOCK_DYNAMIC_ARCHIVED_CASES].slice(0, limit));
  }
  return request<ArchivedCase[]>(`/api/cases/archived/?limit=${limit}`);
}

export function scaffoldCaseFolder(body: CaseScaffoldRequest): Promise<CaseScaffoldResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    const clientName = body.client_name || 'PERSON_1';
    const caseName = body.case_name || '1. Purchase - CBA - 123 Sample St';
    const parentPath = (body.parent_path || 'D:\\EverStones_Clients').replace(/[\\/]+$/, '');
    const clientFolder = `${parentPath}\\${clientName}`;
    const caseFolder = `${clientFolder}\\${caseName}`;
    const subdirs = [
      '1. ID & Application',
      '2. Income & Financials',
      '3. Bank Statements',
      '4. Property & Valuation',
      '5. Send to Lender',
      '6. Approval & Conditions',
      '7. Loan Documents',
      '8. Settlement',
      '9. Commission',
      '10. Post-Settlement',
      '11. Correspondence',
    ];
    return Promise.resolve({
      ok: true,
      client_folder: clientFolder,
      case_folder: caseFolder,
      created_subdirs: subdirs,
      message: `成功为 ${clientName} 生成标准 11 级案卷工作目录！`,
    });
  }
  return request<CaseScaffoldResponse>('/api/cases/scaffold', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function createCase(body: CreateCaseRequest): Promise<CreateCaseResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    const newId = `CASE-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`;
    const calcLvr = body.property_value && body.loan_amount 
      ? Math.min(100, Math.round((body.loan_amount / body.property_value) * 100)) 
      : body.lvr || 80;
    
    const mockCase: any = {
      caseId: newId,
      clientName: body.client_name,
      lender: body.lender || 'CBA',
      loanAmount: body.loan_amount || 800000,
      stage: '资料收集',
      stageCategory: 'pre_review',
      checklistDone: 0,
      checklistTotal: 10,
      checklistProgress: 0,
      summary: body.client_goal || '新建借款人案件，初始资料收集阶段。',
      deadline: '14 天内 (Finance Clause)',
      financeDeadline: body.finance_clause_date || null,
      osPendingCount: 0,
      lvr: calcLvr,
      folderPath: body.folder_path || `broker_brandon/client_${body.client_name.toLowerCase().replace(/\s+/g, '_')}/${newId.toLowerCase()}`,
      folderMode: body.folder_mode || 'auto',
    };
    addMockCases([mockCase]);

    return Promise.resolve({
      case_id: newId,
      client_name: body.client_name,
      lender: body.lender || 'CBA',
      loan_amount: body.loan_amount || 800000,
      stage: '资料收集',
      stage_days: 1,
      checklist_done: 0,
      checklist_total: 10,
      progress_pct: 0,
      last_activity: new Date().toISOString(),
      finance_deadline: body.finance_clause_date || null,
      folder_path: mockCase.folderPath,
      folder_mode: mockCase.folderMode,
    });
  }
  return request<CreateCaseResponse>('/api/cases/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getCase(caseId: string): Promise<CaseResponse> {
  return request<CaseResponse>(`/api/cases/${encodeURIComponent(caseId)}`);
}

export function getCaseBrief(caseId: string): Promise<CaseBriefResponse> {
  return request<CaseBriefResponse>(`/api/cases/${encodeURIComponent(caseId)}/brief`);
}

export function updateCaseBrief(caseId: string, briefMarkdown: string): Promise<CaseBriefResponse> {
  return request<CaseBriefResponse>(`/api/cases/${encodeURIComponent(caseId)}/brief`, {
    method: 'PUT',
    body: JSON.stringify({ brief_markdown: briefMarkdown }),
  });
}

export function getChecklist(caseId: string): Promise<ChecklistItemResponse[]> {
  return request<ChecklistItemResponse[]>(`/api/cases/${encodeURIComponent(caseId)}/checklist`);
}

export function confirmChecklistItem(caseId: string, itemId: string): Promise<ChecklistItemResponse> {
  return request<ChecklistItemResponse>(`/api/cases/${encodeURIComponent(caseId)}/checklist/${encodeURIComponent(itemId)}/confirm`, {
    method: 'POST',
  });
}

export function revokeChecklistItem(caseId: string, itemId: string): Promise<ChecklistItemResponse> {
  return request<ChecklistItemResponse>(`/api/cases/${encodeURIComponent(caseId)}/checklist/${encodeURIComponent(itemId)}/revoke`, {
    method: 'POST',
  });
}

export function matchChecklistFiles(caseId: string): Promise<ChecklistMatchFilesResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    return Promise.resolve({
      ok: true,
      case_id: caseId,
      matched_count: 5,
      gathering_progress: 85,
      matched_details: [
        {
          checklist_id: 'chk-1',
          item_name: '身份证明 (护照 / 驾照)',
          master_id: 'identity_doc',
          status: 'received',
          matched_file_id: 'f-id-001',
          matched_file_name: 'ID DL.pdf',
        },
        {
          checklist_id: 'chk-2',
          item_name: '最新 2 期工资单 (Payslips)',
          master_id: 'payg_payslip',
          status: 'received',
          matched_file_id: 'f-pay-002',
          matched_file_name: 'Payslip_2026_01.pdf',
        },
        {
          checklist_id: 'chk-3',
          item_name: '2025 年 Notice of Assessment (NOA)',
          master_id: 'tax_noa_2025',
          status: 'received',
          matched_file_id: 'f-noa-003',
          matched_file_name: 'NOA_2025_Final.pdf',
        },
        {
          checklist_id: 'chk-4',
          item_name: '最近 3 个月主银行账户流水',
          master_id: 'bank_statements',
          status: 'received',
          matched_file_id: 'f-stm-004',
          matched_file_name: 'Bank_Statement_90Days.pdf',
        },
        {
          checklist_id: 'chk-5',
          item_name: '购房合同 (Contract of Sale)',
          master_id: 'contract_of_sale',
          status: 'received',
          matched_file_id: 'f-cos-005',
          matched_file_name: 'Contract_of_Sale_Signed.pdf',
        },
      ],
    });
  }
  return request<ChecklistMatchFilesResponse>(`/api/cases/${encodeURIComponent(caseId)}/checklist/match-files`, {
    method: 'POST',
  });
}

export function regenerateChecklist(caseId: string): Promise<ChecklistItemResponse[]> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    return Promise.resolve([
      {
        id: `chk-regen-1-${Date.now()}`,
        name: '身份证明 (护照 / 驾照)',
        name_zh: '身份证明 (护照 / 驾照)',
        category: 'identity',
        master_category: '身份',
        is_required: true,
        status: 'missing',
        reason: '主申请人基础有效证件 (重生成规则对齐)',
        file_ids: [],
      },
      {
        id: `chk-regen-2-${Date.now()}`,
        name: '最新 2 期工资单 (Payslips)',
        name_zh: '最新 2 期工资单 (Payslips)',
        category: 'income_payg',
        master_category: '收入（PAYG）',
        is_required: true,
        status: 'missing',
        reason: '银行核算近 3 个月连续稳定收入必须材料',
        file_ids: [],
      },
      {
        id: `chk-regen-3-${Date.now()}`,
        name: '2025 财年 Notice of Assessment (NOA)',
        name_zh: '2025 财年 Notice of Assessment (NOA)',
        category: 'income_self_employed',
        master_category: '收入（自雇）',
        is_required: true,
        status: 'missing',
        reason: '银行审贷自雇与补充收入报税凭据',
        file_ids: [],
      },
      {
        id: `chk-regen-4-${Date.now()}`,
        name: '购房合同签署版 (Contract of Sale)',
        name_zh: '购房合同签署版 (Contract of Sale)',
        category: 'property',
        master_category: '房产',
        is_required: true,
        status: 'missing',
        reason: '核实物业地址、买卖双方信息与交割定金',
        file_ids: [],
      },
      {
        id: `chk-regen-5-${Date.now()}`,
        name: '银行首付赠予信 (Gift Letter)',
        name_zh: '银行首付赠予信 (Gift Letter)',
        category: 'special',
        master_category: '特殊情况',
        is_required: false,
        status: 'missing',
        reason: 'AI 建议：核验 20% 首付款自有资金留存与赠予声明',
        file_ids: [],
      },
    ]);
  }
  return request<ChecklistItemResponse[]>(`/api/cases/${encodeURIComponent(caseId)}/checklist/regenerate`, {
    method: 'POST',
  });
}

export function addChecklistItem(caseId: string, body: AddChecklistItemRequest): Promise<ChecklistItemResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    return Promise.resolve({
      id: `chk-custom-${Date.now()}`,
      name: body.name_zh,
      name_zh: body.name_zh,
      category: body.category,
      master_category: body.category,
      is_required: body.is_required ?? true,
      status: 'missing',
      file_ids: [],
      bank_specific: body.bank_specific || null,
      applicable_when: body.applicable_when || null,
    });
  }
  return request<ChecklistItemResponse>(`/api/cases/${encodeURIComponent(caseId)}/checklist`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const MOCK_TIMELINES: Record<string, CaseTimelineResponse> = {
  'CASE-2026-001': {
    ok: true,
    case_id: 'CASE-2026-001',
    assessor_name: 'Rachel Fonseka',
    lender_ref: '23174 (EX 11199)',
    active_blocker: '估价过低 ($1.90M vs 期望 $2.30M)，复议中',
    events: [
      {
        id: 'evt-106',
        event_time: '2026-04-18T11:20:00Z',
        event_type: 'reassessment_submitted',
        title: '递交估价复议申请 (Reassessment Request)',
        summary: '向 CBA 评估部递交了同街区最新成交证据（31 Smith St 类似户型 $2.25M），申请重新核定估价。',
        sender: 'broker@vera-brokerage.com',
        assessor: 'Rachel Fonseka',
        lender_ref: '23174 (EX 11199)',
        source_file: '18.04.2026 Valuation Dispute Letter.pdf',
        is_blocker: true,
        blocker_reason: '估价复议等待银行复核中（预计 24-48 小时）',
      },
      {
        id: 'evt-105',
        event_time: '2026-04-18T09:15:00Z',
        event_type: 'valuation_shortfall',
        title: '房产估价不足 (Valuation Shortfall)',
        summary: 'CoreLogic / CBA 估价报告回传，估价仅为 $1.90M（申报意向 $2.30M），导致 LVR 超标无法按原额度放款。',
        sender: 'Rachel.Fonseka@cba.com.au',
        assessor: 'Rachel Fonseka',
        lender_ref: '23174 (EX 11199)',
        source_file: '18.04.2026 CBA Valuation Report.pdf',
        is_blocker: true,
        blocker_reason: '估价过低 ($1.90M vs 期望 $2.30M)，复议中',
      },
      {
        id: 'evt-104',
        event_time: '2026-04-17T16:45:00Z',
        event_type: 'mir_requested',
        title: '银行发出补件通知 (MIR Request)',
        summary: '审批官要求补充 2025 NOA 及最近 2 期主申请人工资单，以及租金评估佐证。',
        sender: 'Rachel.Fonseka@cba.com.au',
        assessor: 'Rachel Fonseka',
        lender_ref: '23174 (EX 11199)',
        source_file: '17.04.2026 CBA MIR Request.msg',
        is_blocker: false,
      },
      {
        id: 'evt-103',
        event_time: '2026-04-17T14:10:00Z',
        event_type: 'assessor_assigned',
        title: '信贷审批官已指派 (Assessor Assigned)',
        summary: '案件已分配给 Senior Credit Assessor Rachel Fonseka，进入深度信审队列。',
        sender: 'allocations@cba.com.au',
        assessor: 'Rachel Fonseka',
        lender_ref: '23174 (EX 11199)',
        source_file: '17.04.2026 Application Allocation.msg',
        is_blocker: false,
      },
      {
        id: 'evt-102',
        event_time: '2026-04-17T10:05:00Z',
        event_type: 'submission_lodged',
        title: '案件递交确认 (Submission Acknowledged)',
        summary: 'ApplyOnline 递交成功，银行系统生成正式案号 23174 (EX 11199)。',
        sender: 'cba.direct@applyonline.com.au',
        lender_ref: '23174 (EX 11199)',
        source_file: '17.04.2026 Submission.msg',
        is_blocker: false,
      },
      {
        id: 'evt-101',
        event_time: '2026-04-16T15:30:00Z',
        event_type: 'note',
        title: '材料收集完毕，完成预审自检',
        summary: '核心清单收集完毕，已确认借款人收入核算达标，准备递交。',
        sender: 'Vera AI Assistant',
        source_file: 'Broker Notes - Li Ming.docx',
        is_blocker: false,
      },
    ],
  },
  'CASE-2026-002': {
    ok: true,
    case_id: 'CASE-2026-002',
    assessor_name: 'Michael Chang',
    lender_ref: 'ANZ-994120',
    active_blocker: undefined,
    events: [
      {
        id: 'evt-203',
        event_time: '2026-04-18T10:00:00Z',
        event_type: 'approval_issued',
        title: '有条件批复已下达 (Conditional Approval)',
        summary: 'ANZ 审批官审理通过，下达有条件批准信，仅需补充交割前保单。',
        sender: 'Michael.Chang@anz.com',
        assessor: 'Michael Chang',
        lender_ref: 'ANZ-994120',
        source_file: '18.04.2026 ANZ Formal Approval Letter.pdf',
        is_blocker: false,
      },
      {
        id: 'evt-202',
        event_time: '2026-04-17T11:30:00Z',
        event_type: 'assessor_assigned',
        title: '信贷审批官已指派 (Assessor Assigned)',
        summary: '已指派审批官 Michael Chang，预计 24 小时出审批决议。',
        sender: 'credit@anz.com',
        assessor: 'Michael Chang',
        lender_ref: 'ANZ-994120',
        source_file: '17.04.2026 ANZ Allocation Notice.msg',
        is_blocker: false,
      },
      {
        id: 'evt-201',
        event_time: '2026-04-16T09:00:00Z',
        event_type: 'submission_lodged',
        title: '递件成功',
        summary: '全量材料经 ApplyOnline 传输至 ANZ 系统。',
        sender: 'anz.broker@applyonline.com.au',
        lender_ref: 'ANZ-994120',
        source_file: '16.04.2026 ANZ Submission.msg',
        is_blocker: false,
      },
    ],
  },
};

/**
 * 获取案件沟通与时序脉络 (GET /api/cases/{id}/timeline) (WO-55)
 */
export async function getCaseTimeline(caseId: string): Promise<CaseTimelineResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    if (MOCK_TIMELINES[caseId]) {
      return Promise.resolve(JSON.parse(JSON.stringify(MOCK_TIMELINES[caseId])));
    }
    return Promise.resolve({
      ok: true,
      case_id: caseId,
      assessor_name: 'Rachel Fonseka',
      lender_ref: '23174 (EX 11199)',
      active_blocker: '估价过低 ($1.90M vs 期望 $2.30M)，复议中',
      events: MOCK_TIMELINES['CASE-2026-001']?.events || [],
    });
  }

  return request<CaseTimelineResponse>(`/api/cases/${encodeURIComponent(caseId)}/timeline`);
}

/**
 * 重新扫描提取邮件 (POST /api/cases/{id}/timeline/extract-emails) (WO-55)
 */
export async function extractTimelineEmails(caseId: string): Promise<TimelineExtractResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    await new Promise((r) => setTimeout(r, 800));
    
    // Add an extracted email event into mock timeline
    if (!MOCK_TIMELINES[caseId]) {
      MOCK_TIMELINES[caseId] = {
        ok: true,
        case_id: caseId,
        assessor_name: 'Rachel Fonseka',
        lender_ref: '23174 (EX 11199)',
        active_blocker: '估价过低 ($1.90M vs 期望 $2.30M)，复议中',
        events: [],
      };
    }
    
    const target = MOCK_TIMELINES[caseId];
    const newCount = 6;
    
    return Promise.resolve({
      ok: true,
      case_id: caseId,
      extracted_count: newCount,
      assessor_name: target.assessor_name || 'Rachel Fonseka',
      lender_ref: target.lender_ref || '23174 (EX 11199)',
      active_blocker: target.active_blocker,
    });
  }

  return request<TimelineExtractResponse>(`/api/cases/${encodeURIComponent(caseId)}/timeline/extract-emails`, {
    method: 'POST',
  });
}

export function getTimeline(caseId: string): Promise<TimelineEventResponse[]> {
  return request<TimelineEventResponse[]>(`/api/cases/${encodeURIComponent(caseId)}/timeline`);
}

export function getCaseFiles(caseId: string): Promise<CaseFileResponse[]> {
  return request<CaseFileResponse[]>(`/api/cases/${encodeURIComponent(caseId)}/files`);
}

export function getSubmissionCheck(caseId: string): Promise<SubmissionCheckResponse> {
  return request<SubmissionCheckResponse>(`/api/cases/${encodeURIComponent(caseId)}/submission-check`);
}

export function getCaseContext(caseId: string): Promise<CaseContext> {
  return request<CaseContext>(`/api/cases/${encodeURIComponent(caseId)}/context`);
}

export function createContextEvent(caseId: string, body: ContextEventRequest): Promise<ContextEventResponse> {
  return request<ContextEventResponse>(`/api/cases/${encodeURIComponent(caseId)}/context-events`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function listContextEvents(
  caseId: string,
  params?: { status?: 'pending' | 'confirmed' | 'superseded'; track?: 'internal' | 'external'; limit?: number }
): Promise<ContextEvent[]> {
  const query = new URLSearchParams();
  if (params?.status) query.append('status', params.status);
  if (params?.track) query.append('track', params.track);
  if (params?.limit) query.append('limit', String(params.limit));
  const queryString = query.toString();
  const url = `/api/cases/${encodeURIComponent(caseId)}/context-events${queryString ? `?${queryString}` : ''}`;
  return request<ContextEvent[]>(url);
}

export function confirmContextEvent(caseId: string, eventId: number): Promise<ContextEvent> {
  return request<ContextEvent>(`/api/cases/${encodeURIComponent(caseId)}/context-events/${eventId}/confirm`, {
    method: 'POST',
  });
}

export function supersedeContextEvent(caseId: string, eventId: number, reason: string): Promise<ContextEvent> {
  return request<ContextEvent>(`/api/cases/${encodeURIComponent(caseId)}/context-events/${eventId}/supersede`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function listBrainFacts(
  caseId: string,
  params?: { track?: 'internal' | 'external' },
): Promise<BrainFact[]> {
  const query = new URLSearchParams();
  if (params?.track) query.append('track', params.track);
  const queryString = query.toString();
  const url = `/api/cases/${encodeURIComponent(caseId)}/facts${queryString ? `?${queryString}` : ''}`;
  return request<BrainFact[]>(url);
}

export function lockFact(caseId: string, factId: string | number): Promise<BrainFact> {
  return request<BrainFact>(`/api/cases/${encodeURIComponent(caseId)}/facts/${factId}/lock`, {
    method: 'POST',
  });
}

export function unlockFact(caseId: string, factId: string | number): Promise<BrainFact> {
  return request<BrainFact>(`/api/cases/${encodeURIComponent(caseId)}/facts/${factId}/unlock`, {
    method: 'POST',
  });
}

export function setFactDisclosure(
  caseId: string,
  factId: string | number,
  disclosure: 'disclosed' | 'internal_only' | null
): Promise<BrainFact> {
  return request<BrainFact>(`/api/cases/${encodeURIComponent(caseId)}/facts/${factId}/disclosure`, {
    method: 'PATCH',
    body: JSON.stringify({ disclosure }),
  });
}

export function amendFact(
  caseId: string,
  factId: string | number,
  value: string,
  reason?: string
): Promise<BrainFact> {
  return request<BrainFact>(`/api/cases/${encodeURIComponent(caseId)}/facts/${factId}/amend`, {
    method: 'POST',
    body: JSON.stringify({ value, reason }),
  });
}

export function parseCaseText(raw_text: string): Promise<PreFillResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    return Promise.resolve({
      prefilled: {
        client_name: '张伟 (David Zhang)',
        lender: 'CBA',
        loan_amount: 80,
        property_value: 100,
        purpose: '自住购房',
        employment_type: 'Full-time',
        residency: 'Citizen/PR',
        interest_rate: 6.14,
        client_goal: '赶在 Finance Clause 到期前获得 Formal Approval',
        special_circumstances: '试用期;首付款含大额境外赠予',
        income_description: 'IT 高管，年薪 $18万澳币，季度 Bonus $2万',
        finance_clause_date: '2026-08-25',
      },
      facts: [],
    });
  }
  return request<PreFillResponse>('/api/cases/parse-text', {
    method: 'POST',
    body: JSON.stringify({ raw_text }),
  });
}

export async function parseCaseFile(file: File): Promise<ParseFileResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    return Promise.resolve({
      filename: file.name,
      text_preview: `文件 ${file.name} 解析摘要：识别到申请人张伟，受雇于 Tech Corp (Full-time)，拟申请 CBA $80万贷款，房屋总价 $100万，目的自住。`,
      prefilled: {
        client_name: '张伟 (David Zhang)',
        lender: 'CBA',
        loan_amount: 80,
        property_value: 100,
        purpose: '自住购房',
        employment_type: 'Full-time',
        residency: 'Citizen/PR',
        interest_rate: 6.14,
        client_goal: '赶在 Finance Clause 到期前获得 Formal Approval',
        special_circumstances: '固定收入+Bonus',
        income_description: '年薪 $18万澳币，全职 IT 工程师',
      },
      facts: [],
    });
  }

  const BASE_URL = await getApiBaseUrl();
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${BASE_URL}/api/cases/parse-file`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let errorDetail = '文件解析失败';
    try {
      const errJson = await response.json();
      errorDetail = errJson.detail || errJson.message || response.statusText;
    } catch {
      errorDetail = response.statusText;
    }
    throw new Error(errorDetail);
  }

  return (await response.json()) as ParseFileResponse;
}

/**
 * 获取案件政策评估结果 (WO-19 接口: GET /api/cases/{id}/policy-check)
 */
export function getPolicyCheck(caseId: string): Promise<PolicyCheckResult> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    return Promise.resolve({
      lender: 'CBA',
      overall: 'amber',
      issues: [
        {
          level: 'amber',
          title: '试用期收入核算风险',
          detail: '客户在当前雇主处入职仅 2 个月，仍处于 Probation 试用期。CBA 政策要求试用期申请人需提供前雇主同行业 12 个月以上连续履历说明。',
          suggestion: '补充前雇主 Group Certificate 或 Payslip，并在转案 Cover Letter 中重点标注行业连续性。',
        },
        {
          level: 'amber',
          title: '首付款境外赠予资金来源核查',
          detail: '首付款中约 $20万 来源于父母海外银行汇款转账，存在资金来源与赠予无还款义务核查要求。',
          suggestion: '提供父母赠予信 (Gift Letter) 及海外银行近 3 个月流水，证明资金合法且无需偿还。',
        },
      ],
      alternative_lenders: ['Macquarie', 'Westpac', 'ANZ'],
      summary: '整体贷款方案可行，但针对试用期与境外赠予首付存在 2 项中度风控提示，建议补充前雇主履历及 Gift Letter。',
      disclaimer: '本政策建议由 Vera AI 根据目前录入的案情事实与各银行最新 Policy 指南自动生成，仅供 Broker 审案参考，不构成银行批复保证。',
    });
  }
  return request<PolicyCheckResult>(`/api/cases/${encodeURIComponent(caseId)}/policy-check`);
}

/**
 * 执行申报一致性检查 (WO-20 接口: POST /api/cases/{id}/declaration-check)
 */
export function runDeclarationCheck(
  caseId: string,
  body: DeclarationCheckPayload
): Promise<DeclarationCheckResult> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    return Promise.resolve({
      status: 'warning',
      findings: [
        {
          item: '抚养亲属/受抚养人人数不一致 (Dependents Discrepancy)',
          evidence: '申请表中申报 Dependents 人数为 0，但近 3 个月 Bank Statement 流水显示有多笔托儿所 (Childcare) 与私立学校支出。',
          level: 'warning',
          suggestion: '核实客户确切受抚养人人数，若有子女请在申请表与转案材料中同步修正；若为亲友垫付，请在 Cover Letter 中单独说明。',
        },
        {
          item: '居住地址与账单一致性校验',
          evidence: '驾照地址与近 3 个月 Utility Bill 账单地址完全一致，无冲突。',
          level: 'info',
          suggestion: '地址一致性校验通过，无需额外补充材料。',
        },
      ],
      summary: '申报材料与证据流水比对完成，发现 1 项申报错漏预警（受抚养人与流水支出不符），建议在正式递交前核对说明。',
      draft_explanation: '尊敬的审贷经理：\n\n关于客户申请表与流水比对中的受抚养人支出疑问，特此说明：\n1. 经与客户核实，流水中所列托儿所支出系帮助亲属短期垫付，客户本人无受抚养子女。\n2. 相关垫付流水不构成客户固定日常开支，已附上亲属转账凭证备查。\n\n请予以审核。',
    });
  }
  return request<DeclarationCheckResult>(`/api/cases/${encodeURIComponent(caseId)}/declaration-check`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * 关联案件文件夹 (POST /api/cases/{id}/folder)
 */
export function associateCaseFolder(
  caseId: string,
  body: AssociateFolderRequest
): Promise<AssociateFolderResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    const cleanId = caseId.toLowerCase().replace(/[^a-z0-9]/g, '_');
    let folderPath = body.path || 'client_files/default';
    if (body.mode === 'create') {
      const subName = body.folder_name || `client_${cleanId}`;
      folderPath = body.path ? `${body.path.replace(/[\\/]$/, '')}/${subName}` : `client_files/${subName}`;
    } else if (body.mode === 'auto') {
      folderPath = `broker_brandon/client_${cleanId}/case_main`;
    }
    return Promise.resolve({
      case_id: caseId,
      folder_path: folderPath,
      mode: body.mode,
    });
  }
  return request<AssociateFolderResponse>(`/api/cases/${encodeURIComponent(caseId)}/folder`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * 撤销自动匹配文件夹文件 (POST /api/cases/{id}/folder-files/{file_id}/revoke)
 */
export function revokeFolderFile(
  caseId: string,
  fileId: string
): Promise<RevokeFolderFileResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    return Promise.resolve({
      success: true,
      message: '已撤销自动匹配',
    });
  }
  return request<RevokeFolderFileResponse>(
    `/api/cases/${encodeURIComponent(caseId)}/folder-files/${encodeURIComponent(fileId)}/revoke`,
    {
      method: 'POST',
    }
  );
}

/**
 * 解析文件夹元数据自动预填 (GET /api/folders/parse?path=)
 */
export function parseFolder(path: string): Promise<ParsedFolderMetadata> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    const lower = path.toLowerCase();
    if (lower.includes('liming') || lower.includes('001')) {
      return Promise.resolve({
        path,
        client_name: 'PERSON_1',
        lender: 'CBA',
        loan_amount: 850000,
        property_value: 1062500,
        purpose: '自住购房',
        employment_type: 'Full-time',
        residency: 'Citizen/PR',
        broker_name: 'Brandon',
        notes: '从文件夹目录及 _Inbox 文件解析预填完成',
      });
    }
    if (lower.includes('wangfang') || lower.includes('002')) {
      return Promise.resolve({
        path,
        client_name: 'PERSON_2',
        lender: 'Westpac',
        loan_amount: 620000,
        property_value: 880000,
        purpose: '投资购房',
        employment_type: 'Self-employed',
        residency: 'Citizen/PR',
        broker_name: 'Brandon',
        notes: '从文件夹目录及 _Inbox 文件解析预填完成',
      });
    }
    if (lower.includes('chen') || lower.includes('005')) {
      return Promise.resolve({
        path,
        client_name: 'PERSON_5',
        lender: 'ANZ',
        loan_amount: 950000,
        property_value: 1200000,
        purpose: '自住转贷',
        employment_type: 'Full-time',
        residency: 'Citizen/PR',
        broker_name: 'Brandon',
        notes: '从文件夹目录解析预填完成',
      });
    }

    // Default fallback mock parse
    const parts = path.split('/');
    const clientPart = parts.find((p) => p.startsWith('client_')) || parts[parts.length - 1] || 'client_new';
    const rawName = clientPart.replace('client_', '').toUpperCase();
    return Promise.resolve({
      path,
      client_name: rawName ? `PERSON_${rawName}` : 'PERSON_NEW',
      lender: 'CBA',
      loan_amount: 750000,
      property_value: 937500,
      purpose: '自住购房',
      employment_type: 'Full-time',
      residency: 'Citizen/PR',
      broker_name: 'Brandon',
      notes: '自动扫描目录结构预填基础客户信息',
    });
  }

  return request<ParsedFolderMetadata>(`/api/folders/parse?path=${encodeURIComponent(path)}`);
}

/**
 * 浏览已有文件夹树 (GET /api/folders/browse?path=)
 */
export function browseFolders(parentPath?: string): Promise<FolderBrowseResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    return Promise.resolve({
      current_path: parentPath || 'broker_brandon',
      items: [
        {
          path: 'broker_brandon/client_liming/case_2026_001',
          name: 'client_liming/case_2026_001 (PERSON_1)',
          is_dir: true,
          mtime: '2026-08-12 14:20',
        },
        {
          path: 'broker_brandon/client_wangfang/case_2026_002',
          name: 'client_wangfang/case_2026_002 (PERSON_2)',
          is_dir: true,
          mtime: '2026-08-11 11:05',
        },
        {
          path: 'broker_brandon/client_zhangwei/case_01',
          name: 'client_zhangwei/case_01 (PERSON_3)',
          is_dir: true,
          mtime: '2026-08-10 09:30',
        },
        {
          path: 'broker_brandon/client_chen/case_2026_005',
          name: 'client_chen/case_2026_005 (PERSON_5)',
          is_dir: true,
          mtime: '2026-08-09 16:40',
        },
        {
          path: 'broker_brandon/client_zhao/case_main',
          name: 'client_zhao/case_main (PERSON_4)',
          is_dir: true,
          mtime: '2026-08-08 15:10',
        },
      ],
    });
  }

  const query = parentPath ? `?path=${encodeURIComponent(parentPath)}` : '';
  return request<FolderBrowseResponse>(`/api/folders/browse${query}`);
}

/**
 * 暂停案件 (POST /api/cases/{id}/hold)
 */
export function holdCase(caseId: string, body: HoldCaseRequest): Promise<CaseActionResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    updateMockCase(caseId, (c) => ({
      ...c,
      stage: '已暂停',
      stageCategory: 'other',
      summary: `案件已暂停: ${body.reason}`,
    }));
    return Promise.resolve({
      success: true,
      message: `案件 ${caseId} 已暂停: ${body.reason}`,
      case_id: caseId,
      stage: '已暂停',
    });
  }
  return request<CaseActionResponse>(`/api/cases/${encodeURIComponent(caseId)}/hold`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * 换银行重递 (POST /api/cases/{id}/resubmit)
 */
export function resubmitCase(caseId: string, body: ResubmitCaseRequest): Promise<CaseActionResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    updateMockCase(caseId, (c) => ({
      ...c,
      stage: '重新递交',
      stageCategory: 'pre_review',
      lender: body.new_lender,
      loanAmount: body.new_loan_amount ? body.new_loan_amount : c.loanAmount,
      summary: `已换行转案至 ${body.new_lender}，原因: ${body.reason}`,
    }));
    return Promise.resolve({
      success: true,
      message: `案件 ${caseId} 已换行重新递交至 ${body.new_lender}`,
      case_id: caseId,
      stage: '重新递交',
    });
  }
  return request<CaseActionResponse>(`/api/cases/${encodeURIComponent(caseId)}/resubmit`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * 客户撤回 (POST /api/cases/{id}/withdraw)
 */
export function withdrawCase(caseId: string, body: WithdrawCaseRequest): Promise<CaseActionResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    updateMockCase(caseId, (c) => ({
      ...c,
      stage: '已撤回',
      stageCategory: 'other',
      closeReason: body.reason,
      summary: `客户已主动撤回: ${body.reason}`,
    }));
    return Promise.resolve({
      success: true,
      message: `案件 ${caseId} 客户已撤回: ${body.reason}`,
      case_id: caseId,
      stage: '已撤回',
    });
  }
  return request<CaseActionResponse>(`/api/cases/${encodeURIComponent(caseId)}/withdraw`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * 终止案件 (POST /api/cases/{id}/decline)
 */
export function declineCase(caseId: string, body: DeclineCaseRequest): Promise<CaseActionResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    updateMockCase(caseId, (c) => ({
      ...c,
      stage: '已终止',
      stageCategory: 'other',
      closeReason: body.reason,
      summary: `案件已终止: ${body.reason}`,
    }));
    return Promise.resolve({
      success: true,
      message: `案件 ${caseId} 已终止: ${body.reason}`,
      case_id: caseId,
      stage: '已终止',
    });
  }
  return request<CaseActionResponse>(`/api/cases/${encodeURIComponent(caseId)}/decline`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * 恢复案件 (POST /api/cases/{id}/resume)
 */
export function resumeCase(caseId: string): Promise<CaseActionResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    updateMockCase(caseId, (c) => ({
      ...c,
      stage: '审批中',
      stageCategory: 'approval',
      summary: '案件已恢复正常跟进流程',
    }));
    return Promise.resolve({
      success: true,
      message: `案件 ${caseId} 已恢复正常跟进状态`,
      case_id: caseId,
      stage: '审批中',
    });
  }
  return request<CaseActionResponse>(`/api/cases/${encodeURIComponent(caseId)}/resume`, {
    method: 'POST',
  });
}

/**
 * 解封案件 (POST /api/cases/{id}/reopen)
 */
export function reopenCase(caseId: string): Promise<CaseActionResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    updateMockCase(caseId, (c) => ({
      ...c,
      stage: '预审准备',
      stageCategory: 'pre_review',
      summary: '历史案件已重新激活解封',
    }));
    return Promise.resolve({
      success: true,
      message: `案件 ${caseId} 已重新解封激活`,
      case_id: caseId,
      stage: '预审准备',
    });
  }
  return request<CaseActionResponse>(`/api/cases/${encodeURIComponent(caseId)}/reopen`, {
    method: 'POST',
  });
}

/**
 * 删除案件 (DELETE /api/cases/{id})
 */
export function deleteCase(caseId: string): Promise<{ success: boolean; message?: string }> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    deleteMockCase(caseId);
    return Promise.resolve({
      success: true,
      message: `案件 ${caseId} 已彻底删除`,
    });
  }
  return request<{ success: boolean; message?: string }>(`/api/cases/${encodeURIComponent(caseId)}`, {
    method: 'DELETE',
  });
}

/**
 * 存量导入预览 (POST /api/cases/legacy-import/preview) (WO-50)
 */
export async function legacyImportPreview(folderPath: string): Promise<LegacyImportPreviewResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    if (!folderPath || !folderPath.trim() || folderPath.includes('not_exist') || folderPath.includes('invalid') || folderPath.includes('不存在')) {
      return Promise.resolve({
        ok: false,
        message: '指定的案件文件夹不存在或路径无效，请核对目录',
        broker_notes_found: false,
        broker_notes_name: null,
        prefilled: {},
        submissions: [],
        submitted_platforms: [],
      });
    }

    const isTestClient = folderPath.includes('Yingkun') || folderPath.includes('CHEN') || folderPath.includes('Refi');
    return Promise.resolve({
      ok: true,
      message: null,
      broker_notes_found: true,
      broker_notes_name: isTestClient ? 'Broker Notes - Yingkun CHEN.docx' : 'Broker Notes - 陈伟.docx',
      prefilled: {
        client_name: isTestClient ? 'Yingkun CHEN' : 'PERSON_1 (陈伟)',
        lender: isTestClient ? 'Westpac' : 'CBA',
        loan_amount: isTestClient ? 78 : 85,
        property_value: isTestClient ? 110 : 120,
        purpose: '转贷 (Refinance)',
        employment_type: 'Full-time',
        residency: 'Citizen/PR',
        income_description: 'IT 架构师，年薪 $16.5万，转贷降低利率',
        raw_text: '从已有案件文件夹导入，识别到完整的 Broker Notes 申报摘要及 Send to Lender 材料。',
      },
      submissions: [
        {
          platform: 'Lender',
          dir_name: 'Send to Lender',
          file_count: 11,
          is_lender: true,
        },
        {
          platform: 'Infynity',
          dir_name: 'Send to Infynity',
          file_count: 4,
          is_lender: false,
        },
      ],
      submitted_platforms: ['Infynity'],
    });
  }

  return request<LegacyImportPreviewResponse>('/api/cases/legacy-import/preview', {
    method: 'POST',
    body: JSON.stringify({ folder_path: folderPath }),
  });
}

/**
 * 客户目录拓扑扫描 (POST /api/cases/folder-topology/scan) (WO-53)
 */
export async function scanFolderTopology(folderPath: string): Promise<FolderTopologyScanResponse> {
  const cleanPath = (folderPath || '').trim();

  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    if (!cleanPath || cleanPath.includes('not_exist') || cleanPath.includes('invalid') || cleanPath.includes('不存在')) {
      return Promise.resolve({
        ok: false,
        message: '指定的客户根目录不存在或无法读取，请核对本地路径',
        client_name: undefined,
        client_root: cleanPath,
        cases: [],
      });
    }

    // Determine client name from path
    const isMultiClientRoot =
      cleanPath.includes('EverStones_Clients_Root') ||
      cleanPath.includes('All_Clients') ||
      cleanPath.includes('Root') ||
      !cleanPath.includes('Yingkun CHEN');

    if (isMultiClientRoot) {
      const mockClients: ClientTopologyMeta[] = [
        {
          client_name: 'Yingkun CHEN',
          client_category: 'multi_case',
          referrer_name: 'Asik (AFG)',
          co_borrowers: ['Anna PERRE'],
          cases: [
            {
              dir_name: '8. Refinance_Westpac_AltDoc_Chatswood',
              folder_path: `${cleanPath}/Yingkun CHEN/8. Refinance_Westpac_AltDoc_Chatswood`,
              sequence: 8,
              is_resub: false,
              loan_type: 'Refinance (转贷)',
              lender: 'Westpac',
              property_address: '12 Victoria Ave, Chatswood NSW 2067',
              doc_type: 'Alt Doc',
              status: 'active',
              is_recommended_active: true,
              has_broker_notes: true,
              broker_notes_name: 'Broker Notes - Yingkun CHEN.docx',
              file_count: 14,
              prefilled: {
                client_name: 'Yingkun CHEN',
                lender: 'Westpac',
                loan_amount: 85,
                property_value: 125,
                purpose: '转贷 (Refinance)',
                employment_type: 'Self-employed',
                residency: 'Citizen/PR',
                interest_rate: 6.19,
              },
              submitted_platforms: ['ApplyOnline'],
            },
            {
              dir_name: '6. Purchase_ORDE_LiteDoc_Chatswood_Onhold',
              folder_path: `${cleanPath}/Yingkun CHEN/6. Purchase_ORDE_LiteDoc_Chatswood_Onhold`,
              sequence: 6,
              is_resub: false,
              loan_type: 'Purchase (自住购房)',
              lender: 'ORDE',
              property_address: '12 Victoria Ave, Chatswood NSW 2067',
              doc_type: 'Lite Doc',
              status: 'onhold',
              onhold_reason: '估价过低阻断，复议中',
              is_recommended_active: false,
              has_broker_notes: true,
              broker_notes_name: 'Broker Notes_ORDE_V1.docx',
              file_count: 9,
              prefilled: {
                client_name: 'Yingkun CHEN',
                lender: 'ORDE',
                loan_amount: 90,
                property_value: 115,
                purpose: '自住购房',
                employment_type: 'Self-employed',
                residency: 'Citizen/PR',
              },
            },
            {
              dir_name: '2. Investment_CBA_FullDoc_Settled',
              folder_path: `${cleanPath}/Yingkun CHEN/2. Investment_CBA_FullDoc_Settled`,
              sequence: 2,
              is_resub: true,
              loan_type: 'Investment (投资购房)',
              lender: 'CBA',
              property_address: '88 Queens Rd, Melbourne VIC 3004',
              doc_type: 'Full Doc',
              status: 'settled',
              is_recommended_active: false,
              has_broker_notes: true,
              file_count: 18,
              prefilled: {
                client_name: 'Yingkun CHEN',
                lender: 'CBA',
                loan_amount: 110,
                property_value: 160,
                purpose: '投资购房',
                employment_type: 'Full-time',
                residency: 'Citizen/PR',
              },
            },
          ],
        },
        {
          client_name: 'PERSON_1 (陈伟)',
          client_category: 'multi_case',
          referrer_name: 'TP (Top Performance)',
          co_borrowers: ['Li ZHANG'],
          cases: [
            {
              dir_name: '1. Purchase_ANZ_FullDoc_Burwood',
              folder_path: `${cleanPath}/PERSON_1/1. Purchase_ANZ_FullDoc_Burwood`,
              sequence: 1,
              loan_type: 'Purchase (自住)',
              lender: 'ANZ',
              property_address: '16 Railway Parade, Burwood NSW 2134',
              doc_type: 'Full Doc',
              status: 'active',
              is_recommended_active: true,
              has_broker_notes: true,
              file_count: 16,
              prefilled: {
                client_name: 'PERSON_1 (陈伟)',
                lender: 'ANZ',
                loan_amount: 95,
                property_value: 138,
                employment_type: 'PAYG Full-time',
              },
            },
            {
              dir_name: '2. FirstHome_NAB_Parramatta_Settled',
              folder_path: `${cleanPath}/PERSON_1/2. FirstHome_NAB_Parramatta_Settled`,
              sequence: 2,
              loan_type: 'Purchase',
              lender: 'NAB',
              property_address: '88 Church St, Parramatta NSW 2150',
              doc_type: 'Full Doc',
              status: 'settled',
              is_recommended_active: false,
              has_broker_notes: false,
              file_count: 12,
              prefilled: {
                client_name: 'PERSON_1 (陈伟)',
                lender: 'NAB',
                loan_amount: 60,
                property_value: 85,
              },
            },
          ],
        },
        {
          client_name: 'David WANG & Sarah LIU',
          client_category: 'single_case',
          referrer_name: 'Ray White Epping',
          co_borrowers: ['Sarah LIU'],
          cases: [
            {
              dir_name: '1. FirstHome_CBA_FullDoc_Epping',
              folder_path: `${cleanPath}/David WANG/1. FirstHome_CBA_FullDoc_Epping`,
              sequence: 1,
              loan_type: 'First Home Buyer',
              lender: 'CBA',
              property_address: '5 Oxford St, Epping NSW 2121',
              doc_type: 'Full Doc',
              status: 'active',
              is_recommended_active: true,
              has_broker_notes: true,
              broker_notes_name: 'Broker Notes_David WANG.pdf',
              file_count: 21,
              prefilled: {
                client_name: 'David WANG & Sarah LIU',
                lender: 'CBA',
                loan_amount: 105,
                property_value: 145,
                employment_type: 'PAYG + Self-employed',
              },
            },
          ],
        },
        {
          client_name: 'Michael ZHANG',
          client_category: 'single_case',
          referrer_name: 'McGrath Eastwood',
          cases: [
            {
              dir_name: '1. Refinance_Macquarie_AltDoc_Eastwood',
              folder_path: `${cleanPath}/Michael ZHANG/1. Refinance_Macquarie_AltDoc_Eastwood`,
              sequence: 1,
              loan_type: 'Refinance',
              lender: 'Macquarie',
              property_address: '22 Rowe St, Eastwood NSW 2122',
              doc_type: 'Alt Doc',
              status: 'active',
              is_recommended_active: true,
              has_broker_notes: true,
              file_count: 11,
              prefilled: {
                client_name: 'Michael ZHANG',
                lender: 'Macquarie',
                loan_amount: 78,
                property_value: 120,
              },
            },
          ],
        },
        {
          client_name: 'Emily ZHOU',
          client_category: 'lead',
          referrer_name: 'Direct Inquiry (WeChat)',
          cases: [
            {
              dir_name: 'Consultation_PreApproval_Enquiry_2026',
              folder_path: `${cleanPath}/Emily ZHOU/Consultation_PreApproval_Enquiry_2026`,
              loan_type: 'Pre-Approval (预批咨询)',
              lender: 'St George',
              property_address: 'TBD (Looking in Rhodes/Wentworth Point)',
              doc_type: 'PAYG Only',
              status: 'lead',
              is_recommended_active: false,
              has_broker_notes: true,
              broker_notes_name: 'Initial Fact Find & Borrowing Power.pdf',
              file_count: 4,
              prefilled: {
                client_name: 'Emily ZHOU',
                lender: 'St George',
                loan_amount: 70,
                property_value: 90,
              },
            },
          ],
        },
        {
          client_name: 'Kevin ZHAO & Wendy GUO',
          client_category: 'multi_case',
          referrer_name: 'Belle Property Pyrmont',
          co_borrowers: ['Wendy GUO'],
          cases: [
            {
              dir_name: '3. Commercial_LaTrobe_Pyrmont_Active',
              folder_path: `${cleanPath}/Kevin ZHAO/3. Commercial_LaTrobe_Pyrmont_Active`,
              sequence: 3,
              loan_type: 'Commercial Loan',
              lender: 'La Trobe',
              property_address: '100 Harris St, Pyrmont NSW 2009',
              doc_type: 'Lite Doc',
              status: 'active',
              is_recommended_active: true,
              has_broker_notes: true,
              file_count: 19,
              prefilled: {
                client_name: 'Kevin ZHAO & Wendy GUO',
                lender: 'La Trobe',
                loan_amount: 180,
                property_value: 280,
              },
            },
            {
              dir_name: '2. Investment_Liberty_Onhold',
              folder_path: `${cleanPath}/Kevin ZHAO/2. Investment_Liberty_Onhold`,
              sequence: 2,
              loan_type: 'Investment',
              lender: 'Liberty',
              property_address: '38 Pirrama Rd, Pyrmont NSW 2009',
              doc_type: 'Custom Doc',
              status: 'onhold',
              onhold_reason: '等待信托结构决议书',
              is_recommended_active: false,
              has_broker_notes: true,
              file_count: 8,
              prefilled: {
                client_name: 'Kevin ZHAO & Wendy GUO',
                lender: 'Liberty',
                loan_amount: 120,
                property_value: 175,
              },
            },
            {
              dir_name: '1. Purchase_Westpac_Settled_2024',
              folder_path: `${cleanPath}/Kevin ZHAO/1. Purchase_Westpac_Settled_2024`,
              sequence: 1,
              loan_type: 'Purchase',
              lender: 'Westpac',
              property_address: '12 Miller St, Pyrmont NSW 2009',
              doc_type: 'Full Doc',
              status: 'settled',
              is_recommended_active: false,
              has_broker_notes: true,
              file_count: 24,
              prefilled: {
                client_name: 'Kevin ZHAO & Wendy GUO',
                lender: 'Westpac',
                loan_amount: 140,
                property_value: 210,
              },
            },
          ],
        },
        {
          client_name: 'Jessica LIN (历史已结案)',
          client_category: 'single_case',
          referrer_name: 'Savills Sydney',
          cases: [
            {
              dir_name: '1. FirstHome_NAB_Settled_2023',
              folder_path: `${cleanPath}/Jessica LIN/1. FirstHome_NAB_Settled_2023`,
              sequence: 1,
              loan_type: 'Purchase',
              lender: 'NAB',
              property_address: '55 Pitt St, Sydney NSW 2000',
              doc_type: 'Full Doc',
              status: 'settled',
              is_recommended_active: false,
              has_broker_notes: false,
              file_count: 15,
              prefilled: {
                client_name: 'Jessica LIN',
                lender: 'NAB',
                loan_amount: 88,
                property_value: 120,
              },
            },
          ],
        },
        {
          client_name: 'Grace TANG',
          client_category: 'single_case',
          referrer_name: 'First National Ryde',
          cases: [
            {
              dir_name: '1. Purchase_Macquarie_AltDoc_Ryde',
              folder_path: `${cleanPath}/Grace TANG/1. Purchase_Macquarie_AltDoc_Ryde`,
              sequence: 1,
              loan_type: 'Purchase (自住)',
              lender: 'Macquarie',
              property_address: '88 Devlin St, Ryde NSW 2112',
              doc_type: 'Alt Doc',
              status: 'active',
              is_recommended_active: true,
              has_broker_notes: true,
              file_count: 14,
              prefilled: {
                client_name: 'Grace TANG',
                lender: 'Macquarie',
                loan_amount: 92,
                property_value: 135,
              },
            },
          ],
        },
      ];

      const allCases = mockClients.flatMap((c) => c.cases);
      const multiCaseCount = mockClients.filter((c) => c.client_category === 'multi_case').length;
      const singleCaseCount = mockClients.filter((c) => c.client_category === 'single_case').length;
      const leadCount = mockClients.filter((c) => c.client_category === 'lead').length;
      const recActiveCount = allCases.filter((c) => c.is_recommended_active).length;

      const summary: TopologyScanSummary = {
        total_clients: mockClients.length,
        multi_case_clients: multiCaseCount,
        single_case_clients: singleCaseCount,
        lead_clients: leadCount,
        total_cases: allCases.length,
        recommended_active_cases: recActiveCount,
      };

      return Promise.resolve({
        ok: true,
        is_root_multi_client: true,
        summary,
        clients: mockClients,
        client_root: cleanPath,
        cases: allCases,
      });
    }

    let clientName = 'Yingkun CHEN';
    if (cleanPath.includes('陈伟') || cleanPath.includes('PERSON_1')) {
      clientName = 'PERSON_1 (陈伟)';
    } else if (cleanPath.includes('李明') || cleanPath.includes('liming')) {
      clientName = '李明 (Li Ming)';
    } else {
      const match = cleanPath.match(/([^\\/]+)[\\/]?$/);
      if (match && match[1] && !match[1].startsWith('.')) {
        clientName = match[1].replace(/_/g, ' ');
      }
    }

    const mockSubfolders: CaseSubfolderMeta[] = [
      {
        dir_name: '8. Refinance_Westpac_AltDoc_Chatswood',
        folder_path: `${cleanPath}/8. Refinance_Westpac_AltDoc_Chatswood`,
        sequence: 8,
        is_resub: false,
        loan_type: 'Refinance (转贷)',
        lender: 'Westpac',
        property_address: '12 Victoria Ave, Chatswood NSW 2067',
        doc_type: 'Alt Doc',
        status: 'active',
        is_recommended_active: true,
        has_broker_notes: true,
        broker_notes_name: 'Broker Notes - Yingkun CHEN.docx',
        file_count: 14,
        prefilled: {
          client_name: clientName,
          lender: 'Westpac',
          loan_amount: 85,
          property_value: 125,
          purpose: '转贷 (Refinance)',
          employment_type: 'Self-employed',
          residency: 'Citizen/PR',
          income_description: '自雇企业主（会计师公证信 + 6 个月 BAS），拟转贷至 Westpac 降低月供',
          interest_rate: 6.19,
        },
        submitted_platforms: ['ApplyOnline', 'Lender Direct Portal'],
      },
      {
        dir_name: '6. Purchase_ORDE_LiteDoc_Chatswood_Onhold',
        folder_path: `${cleanPath}/6. Purchase_ORDE_LiteDoc_Chatswood_Onhold`,
        sequence: 6,
        is_resub: false,
        loan_type: 'Purchase (自住购房)',
        lender: 'ORDE',
        property_address: '12 Victoria Ave, Chatswood NSW 2067',
        doc_type: 'Lite Doc',
        status: 'onhold',
        onhold_reason: '估价过低阻断，复议中',
        is_recommended_active: false,
        has_broker_notes: true,
        broker_notes_name: 'Broker Notes_ORDE_V1.docx',
        file_count: 9,
        prefilled: {
          client_name: clientName,
          lender: 'ORDE',
          loan_amount: 90,
          property_value: 115,
          purpose: '自住购房',
          employment_type: 'Self-employed',
          residency: 'Citizen/PR',
          income_description: 'ORDE 快速通道，等待估价机构复议报告',
        },
        submitted_platforms: ['ORDE Broker Portal'],
      },
      {
        dir_name: '4. Commercial_Zank_Financial_Withdrawn',
        folder_path: `${cleanPath}/4. Commercial_Zank_Financial_Withdrawn`,
        sequence: 4,
        is_resub: false,
        loan_type: 'Commercial (商业贷款)',
        lender: 'Zank Financial',
        property_address: '88 Queens Rd, Melbourne VIC 3004',
        doc_type: 'Full Doc',
        status: 'withdrawn',
        is_recommended_active: false,
        has_broker_notes: false,
        file_count: 6,
        prefilled: {
          client_name: clientName,
          lender: 'Zank Financial',
          loan_amount: 150,
          property_value: 230,
          purpose: '商业贷款',
          employment_type: 'Self-employed',
        },
        submitted_platforms: ['Zank Connect'],
      },
      {
        dir_name: '2. Investment_CBA_FullDoc_Settled',
        folder_path: `${cleanPath}/2. Investment_CBA_FullDoc_Settled`,
        sequence: 2,
        is_resub: true,
        loan_type: 'Investment (投资购房)',
        lender: 'CBA',
        property_address: '88 Queens Rd, Melbourne VIC 3004',
        doc_type: 'Full Doc',
        status: 'submitted',
        is_recommended_active: false,
        has_broker_notes: true,
        broker_notes_name: 'Broker Notes - CBA Investment.pdf',
        file_count: 18,
        prefilled: {
          client_name: clientName,
          lender: 'CBA',
          loan_amount: 110,
          property_value: 160,
          purpose: '投资购房',
          employment_type: 'Full-time',
          residency: 'Citizen/PR',
        },
        submitted_platforms: ['ApplyOnline'],
      },
    ];

    return Promise.resolve({
      ok: true,
      message: undefined,
      client_name: clientName,
      client_root: cleanPath,
      cases: mockSubfolders,
    });
  }

  return request<FolderTopologyScanResponse>('/api/cases/folder-topology/scan', {
    method: 'POST',
    body: JSON.stringify({ folder_path: cleanPath }),
  });
}

/**
 * 客户目录案卷批量导入 (POST /api/cases/topology-import/batch) (WO-53)
 */
export async function batchTopologyImport(body: BatchTopologyImportRequest): Promise<BatchTopologyImportResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    const createdIds: string[] = [];
    const newMockCases = body.items.map((item, idx) => {
      const generatedCaseId = `CASE-TOP-${Date.now().toString().slice(-4)}-${idx + 1}`;
      createdIds.push(generatedCaseId);
      
      const loanAmtNum = (item.loan_amount || 85) * 10000;
      return {
        caseId: generatedCaseId,
        clientName: item.client_name || 'Yingkun CHEN',
        lender: item.lender || 'Westpac',
        loanAmount: loanAmtNum,
        stage: item.stage || '资料收集',
        stageDays: 1,
        checklistDone: 0,
        checklistTotal: 10,
        checklistProgress: 0,
        summary: `由客户根目录批量导入案卷：${item.property_address || item.folder_path}`,
        deadline: '14 天后 (Finance Due)',
        lastActivity: '刚刚',
        folderPath: item.folder_path,
        folderMode: 'existing',
      };
    });

    addMockCases(newMockCases);

    return Promise.resolve({
      ok: true,
      message: `成功导入 ${body.items.length} 个案卷`,
      imported_count: body.items.length,
      created_case_ids: createdIds,
      active_case_id: createdIds[0],
    });
  }

  return request<BatchTopologyImportResponse>('/api/cases/topology-import/batch', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * 历史客户案卷目录扫描 (POST /api/archive/scan) (WO-57)
 */
export async function scanArchiveFolder(folderPath: string): Promise<ArchiveScanResponse> {
  const cleanPath = (folderPath || '').trim();

  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    if (!cleanPath) {
      return Promise.resolve({
        ok: false,
        message: '请选择或输入有效的客户历史目录',
        total_found: 0,
        eligible_count: 0,
        cases: [],
      });
    }

    const clientName = cleanPath.split(/[\\/]/).filter(Boolean).pop() || 'Yingkun CHEN';

    const mockArchiveCases: ArchiveCaseItem[] = [
      {
        dir_name: '1. Purchase - CBA - 12 Burwood Rd (Settled)',
        folder_path: `${cleanPath}\\1. Purchase - CBA - 12 Burwood Rd (Settled)`,
        client_name: clientName,
        lender: 'CBA',
        loan_amount: 850000,
        property_address: '12 Burwood Rd, Burwood NSW 2134',
        settlement_date: '2024-05-12',
        interest_rate: '6.09% (Fixed 2Y)',
        status: 'settled',
        eligible: true,
        in_workbench: false,
        already_archived: false,
        file_count: 18,
      },
      {
        dir_name: '2. Refinance - Westpac - 88 George St (Settled)',
        folder_path: `${cleanPath}\\2. Refinance - Westpac - 88 George St (Settled)`,
        client_name: clientName,
        lender: 'Westpac',
        loan_amount: 1150000,
        property_address: '88 George St, Sydney NSW 2000',
        settlement_date: '2024-11-20',
        interest_rate: '5.89% (Variable)',
        status: 'settled',
        eligible: true,
        in_workbench: false,
        already_archived: false,
        file_count: 22,
      },
      {
        dir_name: '3. Purchase - ANZ - 55 Victoria Ave (In Workbench)',
        folder_path: `${cleanPath}\\3. Purchase - ANZ - 55 Victoria Ave (In Workbench)`,
        client_name: clientName,
        lender: 'ANZ',
        loan_amount: 920000,
        property_address: '55 Victoria Ave, Chatswood NSW 2067',
        settlement_date: '2026-06-15 (预计)',
        interest_rate: '5.99%',
        status: 'in_progress',
        eligible: false,
        in_workbench: true,
        already_archived: false,
        filter_reason: '⚠️ 当前正在工作台推进中·已自动过滤',
        file_count: 12,
      },
      {
        dir_name: '4. First Home - NAB - 6 Park St (Archived)',
        folder_path: `${cleanPath}\\4. First Home - NAB - 6 Park St (Archived)`,
        client_name: clientName,
        lender: 'NAB',
        loan_amount: 650000,
        property_address: '6 Park St, Parramatta NSW 2150',
        settlement_date: '2023-08-10',
        interest_rate: '5.49%',
        status: 'settled',
        eligible: false,
        in_workbench: false,
        already_archived: true,
        filter_reason: '已在档案库',
        file_count: 15,
      },
    ];

    const eligibleCount = mockArchiveCases.filter((c) => c.eligible).length;

    return Promise.resolve({
      ok: true,
      client_name: clientName,
      total_found: mockArchiveCases.length,
      eligible_count: eligibleCount,
      cases: mockArchiveCases,
    });
  }

  return request<ArchiveScanResponse>('/api/archive/scan', {
    method: 'POST',
    body: JSON.stringify({ folder_path: cleanPath }),
  });
}

/**
 * 历史案卷批量归档入库 (POST /api/archive/batch-import) (WO-57)
 */
export async function batchImportArchive(body: ArchiveBatchImportRequest): Promise<ArchiveBatchImportResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    const createdCases = body.items.map((item, idx) => {
      const generatedArchId = `CASE_ARCH_BATCH_${Date.now().toString().slice(-4)}_${idx + 1}`;
      
      const newArchCase: ArchivedCase = {
        case_id: generatedArchId,
        client_name: item.client_name || 'Yingkun CHEN',
        lender: item.lender || 'CBA',
        loan_amount: item.loan_amount || 850000,
        stage: '交割完成',
        stage_days: 0,
        checklist_done: 10,
        checklist_total: 10,
        progress_pct: 100,
        last_activity: new Date().toISOString(),
        closed_at: item.settlement_date || new Date().toISOString().slice(0, 10),
        close_reason: `历史案卷批量归档（放款交割日: ${item.settlement_date || '未知'}，利率: ${item.interest_rate || 'N/A'}）`,
        property_address: item.property_address,
        settlement_date: item.settlement_date,
        interest_rate: item.interest_rate,
        folder_path: item.folder_path,
      };

      MOCK_DYNAMIC_ARCHIVED_CASES.unshift(newArchCase);

      return {
        case_id: generatedArchId,
        client_name: item.client_name,
        folder_path: item.folder_path,
      };
    });

    return Promise.resolve({
      ok: true,
      imported_count: createdCases.length,
      created_cases: createdCases,
    });
  }

  return request<ArchiveBatchImportResponse>('/api/archive/batch-import', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const MOCK_RETENTION_OPPORTUNITIES: RetentionOpportunityItem[] = [
  {
    case_id: 'CASE_ARCH_01',
    client_name: 'PERSON_1',
    property_address: '12 Burwood Rd, Burwood NSW 2134',
    lender: 'CBA',
    loan_amount: 850000,
    interest_rate: '5.89% (2Y Fixed)',
    settlement_date: '2024-05-12',
    level: 'red',
    opp_type: 'fixed_rate_expiry',
    title: '固定利率即将在 42 天内到期',
    action_suggest: '建议主动联系客户比较当前转贷市场各大行固定/浮动方案，提前 30 天向 CBA 递交定案申请锁定利率。',
    days_relevant: 42,
    draft_template: '您好 PERSON_1，您在 CBA 的 2 年期固定贷款（当前 $850k / 5.89%）即将在下月到期。为了防止到期后自动滚入较高的标准浮动利率（Roll over），我们已为您提前对比了当前各主流银行的最新利率与转贷优惠，方便为您约一个 10 分钟电话确认最优方案吗？',
  },
  {
    case_id: 'CASE_ARCH_03',
    client_name: 'PERSON_3',
    property_address: '24 High St, Mascot NSW 2020',
    lender: 'NAB',
    loan_amount: 720000,
    interest_rate: '5.99% (3Y Fixed)',
    settlement_date: '2023-09-20',
    level: 'red',
    opp_type: 'fixed_rate_expiry',
    title: '固定利率即将在 68 天内到期',
    action_suggest: '提前获取 NAB 本行 Retention 方案与 Macquarie 转贷方案对比，测算潜在月供差额。',
    days_relevant: 68,
    draft_template: '您好 PERSON_3，您的 NAB 房贷固定期将于 2 个月后届满。建议我们提前向 NAB 申请本行保留降息（Pricing Request），同时评估转贷降息空间，为您锁定最优月供。',
  },
  {
    case_id: 'CASE_ARCH_02',
    client_name: 'PERSON_2',
    property_address: '88 Pacific Hwy, St Leonards NSW 2065',
    lender: 'Westpac',
    loan_amount: 1150000,
    interest_rate: '6.24% (Variable)',
    settlement_date: '2025-05-18',
    level: 'yellow',
    opp_type: 'annual_repricing',
    title: '放款已满 1 周年 · 触发降息体检',
    action_suggest: '客户浮动利率已满 12 个月且还款记录优良，可向 Westpac 递交 Pricing Discount 请求，预计可下调 0.20%~0.35%。',
    days_relevant: 365,
    draft_template: '您好 PERSON_2，恭喜您的 Westpac 房贷已顺利还款满 1 年！基于您良好的还款表现，我们正为您向 Westpac 申请存量客户降息优惠（Pricing Review），预计每年可为您节省数千澳元利息支出。',
  },
  {
    case_id: 'CASE_ARCH_04',
    client_name: 'PERSON_4',
    property_address: '108 Victoria Rd, Gladesville NSW 2111',
    lender: 'ANZ',
    loan_amount: 960000,
    interest_rate: '6.18% (Variable)',
    settlement_date: '2024-08-15',
    level: 'yellow',
    opp_type: 'annual_repricing',
    title: '放款已满 2 周年 · 利率与产品健康度巡检',
    action_suggest: '当前利率高于市场新客户优惠档位，建议发起本行降息申请或考虑 Refinance 套现缓冲。',
    days_relevant: 730,
    draft_template: '您好 PERSON_4，我们为您定期做贷款健康度体检时发现，您目前的 ANZ 利率存在下调空间。我们可协助向银行申请利率折扣，有最新回复我第一时间告知您！',
  },
  {
    case_id: 'CASE_ARCH_05',
    client_name: 'PERSON_5',
    property_address: '5/18 Railway Pde, Hurstville NSW 2220',
    lender: 'CBA',
    loan_amount: 580000,
    interest_rate: '5.74%',
    settlement_date: '2023-04-10',
    level: 'green',
    opp_type: 'equity_cashout',
    title: '房产增值显著 · 建议主动评估再置业与增值套现',
    action_suggest: 'Hurstville 区域房产增值估算净资产超 $350k，可做房产估价（Desktop Valuation）以评估二套投资房首付额度。',
    days_relevant: 1200,
    draft_template: '您好 PERSON_5，近期悉尼南区房产估值有所上升。按当前市场评估，您的房产有较为充裕的净值增量（Equity）。如果您近期有考虑配置第二套投资房或做家庭备用金 Line of Credit，随时与我们联系为您免费做房产估值报告！',
  },
  {
    case_id: 'CASE_ARCH_06',
    client_name: 'PERSON_6',
    property_address: '33 Ocean St, Wollstonecraft NSW 2065',
    lender: 'Bankwest',
    loan_amount: 1280000,
    interest_rate: '5.94%',
    settlement_date: '2026-07-20',
    level: 'blue',
    opp_type: 'settlement_care',
    title: '放款 30 天回访 · 账单扣款与对冲账户(Offset)核对',
    action_suggest: '确认首期还款日扣款是否正常、Offset 账户是否已与贷款主账户绑定并享受 100% 抵扣利息。',
    days_relevant: 29,
    draft_template: '您好 PERSON_6，您的房贷已顺利交割近 1 个月，特地来跟您核对一下：请确认首期月供扣款正常，且您的 Offset 对冲账户已正常激活抵扣利息。若有任何网银或账单疑问，随时微信联系我！',
  },
];

/**
 * 获取档案中心二次经营商机雷达 (GET /api/archive/retention-radar) (WO-58)
 */
export async function getRetentionRadar(): Promise<RetentionRadarResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    const opps = [...MOCK_RETENTION_OPPORTUNITIES];
    const red_count = opps.filter((o) => o.level === 'red').length;
    const yellow_count = opps.filter((o) => o.level === 'yellow').length;
    const green_count = opps.filter((o) => o.level === 'green').length;
    const blue_count = opps.filter((o) => o.level === 'blue').length;

    const summary: RetentionRadarSummary = {
      total_opportunities: opps.length,
      red_count,
      yellow_count,
      green_count,
      blue_count,
    };

    return Promise.resolve({
      ok: true,
      summary,
      opportunities: opps,
    });
  }

  return request<RetentionRadarResponse>('/api/archive/retention-radar');
}

// ==========================================
// WO-59 先例智库与审批官画像 MOCK 数据与 API
// ==========================================

const MOCK_PRECEDENTS: CasePrecedentItem[] = [
  {
    case_id: 'CASE_PREC_01',
    client_name: 'PERSON_1',
    property_address: '12 Burwood Rd, Burwood NSW 2134',
    lender: 'ORDE',
    loan_amount: 850000,
    doc_type: 'Alt Doc',
    interest_rate: '6.79%',
    settlement_date: '2024-05-12',
    summary_highlight: '自雇 18 个月 BAS 报税缺口，以 6 个月银行流水 + 会计师信成功突破，当天无条件获批',
  },
  {
    case_id: 'CASE_PREC_02',
    client_name: 'PERSON_2',
    property_address: '88 Pacific Hwy, St Leonards NSW 2065',
    lender: 'Westpac',
    loan_amount: 1150000,
    doc_type: 'Full Doc',
    interest_rate: '6.14%',
    settlement_date: '2025-05-18',
    summary_highlight: '高密公寓估价下调 8%，通过提供同楼栋最新真实成交数据进行估价复议，成功恢复原放款额度',
  },
  {
    case_id: 'CASE_PREC_03',
    client_name: 'PERSON_3',
    property_address: '24 High St, Mascot NSW 2020',
    lender: 'Brighten',
    loan_amount: 720000,
    doc_type: 'Lite Doc',
    interest_rate: '7.19%',
    settlement_date: '2023-09-20',
    summary_highlight: '海外收入认证痛点，通过雇主双重背景背书及外汇监管入境流水核验，实现 48 小时极速下批',
  },
  {
    case_id: 'CASE_PREC_04',
    client_name: 'PERSON_4',
    property_address: '108 Victoria Rd, Gladesville NSW 2111',
    lender: 'CBA',
    loan_amount: 960000,
    doc_type: 'Full Doc',
    interest_rate: '6.09%',
    settlement_date: '2024-08-15',
    summary_highlight: '首置业新移民 VEVO 签证临近换签，利用 CBA 政策豁免与本地稳定年薪流水顺利交割',
  },
  {
    case_id: 'CASE_PREC_05',
    client_name: 'PERSON_5',
    property_address: '5/18 Railway Pde, Hurstville NSW 2220',
    lender: 'Latrobe',
    loan_amount: 680000,
    doc_type: 'Alt Doc',
    interest_rate: '6.95%',
    settlement_date: '2023-04-10',
    summary_highlight: '短期信用分微瑕疵（一笔电讯滞纳），出具合理申诉解释信 + 资产负债自证，全额获批',
  },
];

const MOCK_KNOWLEDGE_CARDS: Record<string, KnowledgeCardData> = {
  CASE_PREC_01: {
    case_id: 'CASE_PREC_01',
    client_name: 'PERSON_1',
    lender: 'ORDE Financial',
    loan_amount: 850000,
    strategy_summary: '自雇仅 18 个月且最新一期 BAS 尚未报税，传统大行无法认可 Full Doc。转向非银机构 ORDE 的 Alt Doc 方案，整合 6 个月对公对私流水交叉验证。',
    key_challenges: [
      '主贷人自雇年限不足 2 年，四大行直接拒件',
      '报税时间差导致最新财年 Tax Return 缺失',
      '家庭有一笔未结清的商业车贷每月占用还款能力',
    ],
    approved_conditions: '提供注册会计师出具的收入确认声明函（Accountant Letter）+ 6 个月银行流水（日均留存 > $15,000），ORDE 豁免第 2 年财报。',
    takeaway: '自雇客户遇大行卡点时，切勿盲目重复递交引发信用分受损；优先选定对自雇现金流友好的非银机构，提前准备会计师信与流水交叉对账表。',
  },
  CASE_PREC_02: {
    case_id: 'CASE_PREC_02',
    client_name: 'PERSON_2',
    lender: 'Westpac',
    loan_amount: 1150000,
    strategy_summary: 'Westpac 合作估价师对高密度楼盘给出保守估价，导致 LVR 超标需补交额外保证金。立即调取 CoreLogic RP Data 及邻近单元近 30 天结算价发起复议。',
    key_challenges: [
      '高密公寓估价下调 8%（缺口 $95,000）',
      '临近 Cooling-off 截止日期仅剩 48 小时',
      '买家无法在短时间内筹集补足差额资金',
    ],
    approved_conditions: '提交附带完整建筑面积、朝向和高质量装修比对的 3 套近期真实成交案卷，估价行成功修正估值。',
    takeaway: '遇到估价偏低，不要被动接受；经纪人应当第一时间出具详实成交对照证据包（Valuation Dispute Pack），90% 具有合理依据的复议均可上调。',
  },
  CASE_PREC_03: {
    case_id: 'CASE_PREC_03',
    client_name: 'PERSON_3',
    lender: 'Brighten',
    loan_amount: 720000,
    strategy_summary: '海外主申请人收入结构特殊，通过提供第三方审计雇佣报告及完税单据，满足 Brighten 特殊海外贷款产品审核标准。',
    key_challenges: [
      '海外雇主跨国背景核实流程长',
      '外汇结算凭证繁琐',
    ],
    approved_conditions: '补充提供雇主视频回访授权函及连续 12 个月完税凭证，48 小时内正式核准。',
    takeaway: '针对海外收入客户，提前锁定对口非银机构专属通道，前置做好雇主回访辅导。',
  },
  CASE_PREC_04: {
    case_id: 'CASE_PREC_04',
    client_name: 'PERSON_4',
    lender: 'CBA',
    loan_amount: 960000,
    strategy_summary: '首置业客户签证处于 Transition 期，借助 CBA Policy 豁免条款，辅以本地长期雇主稳定雇佣背书完成放款。',
    key_challenges: [
      '签证有效期不足 12 个月',
      '首付资金来源多笔转账',
    ],
    approved_conditions: '出具律师签证换发证明与 90 天存款证明，获 CBA 一线审批官直通核准。',
    takeaway: '熟悉四大行对于准移民政策的豁免指引，关键时刻能抢下最优质的低利率方案。',
  },
  CASE_PREC_05: {
    case_id: 'CASE_PREC_05',
    client_name: 'PERSON_5',
    lender: 'Latrobe',
    loan_amount: 680000,
    strategy_summary: '因搬家遗漏电讯账单产生一笔小额 Default 记录，通过撰写详尽的信用争议说明函及当前充裕资产证明，成功获得全额按揭。',
    key_challenges: [
      '信用报告包含一笔小额过往违约记录',
      '传统银行自动化审批系统直接评分不通过',
    ],
    approved_conditions: '提供已结清收据与还款能力证明，人工特批通道无附加高息全额放款。',
    takeaway: '非恶意信用瑕疵应走人工信审通道，附上清晰诚恳的合理解释信和结清证据。',
  },
};

const MOCK_ASSESSORS: AssessorInsightItem[] = [
  {
    assessor_name: 'Rachel Fonseka',
    lender: 'ORDE Financial',
    case_count: 12,
    latest_case_id: 'CASE_PREC_01',
    latest_case_ref: 'ORDE-2024-8891',
    common_blockers: ['自雇流水严格', '要求会计师信规范抬头', 'MIR补件要求明确'],
    communication_tips: '建议邮件提交时一并附上会计师资格证书编号与 6 个月对账单 Excel 摘要，该审批官偏好逻辑严密的流水分析，一次性补齐材料可当天出结果。',
  },
  {
    assessor_name: 'Marcus Vance',
    lender: 'Westpac',
    case_count: 19,
    latest_case_id: 'CASE_PREC_02',
    latest_case_ref: 'WBC-APP-4920',
    common_blockers: ['估价缺口偏好', 'HEM 生活开支核实', '信用卡额度未关停'],
    communication_tips: '对信用额度与生活开支极度敏感，递件前确保客户已签署信用卡降额确认单，并在 Cover Note 中注明大额单笔支出的合理性质。',
  },
  {
    assessor_name: 'Brendan Kelly',
    lender: 'CBA',
    case_count: 27,
    latest_case_id: 'CASE_PREC_04',
    latest_case_ref: 'CBA-DIRECT-6102',
    common_blockers: ['签证到期日审核', 'PAYG 试用期核实', '首付资金穿透'],
    communication_tips: 'CBA 资深审批官，偏好标准的 CommBroker 格式，对于非 PR 签证务必附上 VEVO 实时查验 PDF 与雇佣稳定证明信。',
  },
  {
    assessor_name: 'Chloe Zhang',
    lender: 'Brighten',
    case_count: 8,
    latest_case_id: 'CASE_PREC_03',
    latest_case_ref: 'BRT-GLB-1033',
    common_blockers: ['海外雇主背景调查', '第三方外汇汇款凭证', '电话回访严格'],
    communication_tips: '负责海外及非标准收入审核，要求雇主官方网站、公司邮箱回访及完税单据三者一致。提前与客户约定银行回访时间。',
  },
];

/**
 * 多维检索先例 (GET /api/archive/precedents) (WO-59)
 */
export async function searchPrecedents(params?: {
  lender?: string;
  doc_type?: string;
  keyword?: string;
}): Promise<CasePrecedentSearchResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    let list = [...MOCK_PRECEDENTS];
    if (params?.lender && params.lender !== 'all') {
      list = list.filter((p) => p.lender?.toLowerCase() === params.lender?.toLowerCase());
    }
    if (params?.doc_type && params.doc_type !== 'all') {
      list = list.filter((p) => p.doc_type?.toLowerCase() === params.doc_type?.toLowerCase());
    }
    if (params?.keyword && params.keyword.trim()) {
      const kw = params.keyword.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.client_name.toLowerCase().includes(kw) ||
          p.property_address?.toLowerCase().includes(kw) ||
          p.summary_highlight?.toLowerCase().includes(kw) ||
          p.lender?.toLowerCase().includes(kw)
      );
    }
    return Promise.resolve({
      ok: true,
      total_found: list.length,
      precedents: list,
    });
  }

  const query = new URLSearchParams();
  if (params?.lender) query.set('lender', params.lender);
  if (params?.doc_type) query.set('doc_type', params.doc_type);
  if (params?.keyword) query.set('keyword', params.keyword);

  return request<CasePrecedentSearchResponse>(`/api/archive/precedents?${query.toString()}`);
}

/**
 * 获取案件复盘知识卡 (GET /api/archive/cases/{case_id}/knowledge-card) (WO-59)
 */
export async function getCaseKnowledgeCard(caseId: string): Promise<KnowledgeCardResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    const card = MOCK_KNOWLEDGE_CARDS[caseId] || {
      case_id: caseId,
      client_name: 'PERSON_1',
      lender: '主流机构',
      loan_amount: 850000,
      strategy_summary: '针对客户个性化财务结构，整合流水与资产资质定制专属按揭申报通道。',
      key_challenges: ['申请材料多项待核验', '银行政策窗口期紧张'],
      approved_conditions: '前置补充详实资金来源与工作背景背书，顺利全额批复。',
      takeaway: '前置做好材料合规性穿透自查，可大幅缩短信审等待时间。',
    };
    return Promise.resolve({
      ok: true,
      card,
    });
  }

  return request<KnowledgeCardResponse>(`/api/archive/cases/${caseId}/knowledge-card`);
}

/**
 * 获取审批官列表 (GET /api/archive/assessors) (WO-59)
 */
export async function listAssessors(): Promise<AssessorListResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    return Promise.resolve({
      ok: true,
      total_assessors: MOCK_ASSESSORS.length,
      assessors: MOCK_ASSESSORS,
    });
  }

  return request<AssessorListResponse>('/api/archive/assessors');
}

// ==========================================
// WO-60 档案中心资产大盘与客户资产池 API
// ==========================================

const MOCK_ARCHIVE_STATS: ArchiveHubStats = {
  total_archived_clients: 18,
  total_cases_count: 24,
  total_loan_volume: 18600000,
  total_opportunities_count: 6,
  total_precedents_count: 12,
};

const MOCK_PORTFOLIO_CLIENTS: ClientPortfolioItem[] = [
  {
    client_name: 'PERSON_1',
    total_properties_count: 2,
    total_loan_amount: 1840000,
    primary_lender: 'ORDE',
    latest_settlement_date: '2024-05-12',
    active_opportunities_count: 1,
    latest_opportunity_title: '🔴 固定利率临期 (还剩 45 天)',
    cases_summary: [
      {
        case_id: 'CASE_ARCH_01',
        property_address: '12 Burwood Rd, Burwood NSW 2134',
        lender: 'ORDE',
        loan_amount: 850000,
        interest_rate: '6.79%',
        stage: '已交割结案',
      },
      {
        case_id: 'CASE_ARCH_06',
        property_address: '188 George St, Sydney NSW 2000',
        lender: 'CBA',
        loan_amount: 990000,
        interest_rate: '5.99%',
        stage: '已交割结案',
      },
    ],
  },
  {
    client_name: 'PERSON_2',
    total_properties_count: 2,
    total_loan_amount: 2350000,
    primary_lender: 'Westpac',
    latest_settlement_date: '2025-05-18',
    active_opportunities_count: 1,
    latest_opportunity_title: '🟡 满 1 年降息体检 (放款满 365 天)',
    cases_summary: [
      {
        case_id: 'CASE_ARCH_02',
        property_address: '88 Pacific Hwy, St Leonards NSW 2065',
        lender: 'Westpac',
        loan_amount: 1150000,
        interest_rate: '6.14%',
        stage: '已交割结案',
      },
      {
        case_id: 'CASE_ARCH_07',
        property_address: '45 Archer St, Chatswood NSW 2067',
        lender: 'Westpac',
        loan_amount: 1200000,
        interest_rate: '6.29%',
        stage: '已交割结案',
      },
    ],
  },
  {
    client_name: 'PERSON_3',
    total_properties_count: 1,
    total_loan_amount: 1450000,
    primary_lender: 'Macquarie',
    latest_settlement_date: '2023-11-20',
    active_opportunities_count: 1,
    latest_opportunity_title: '🟢 房产增值套现/再置业 (满 2 年以上)',
    cases_summary: [
      {
        case_id: 'CASE_ARCH_03',
        property_address: '24 High St, Mascot NSW 2020',
        lender: 'Macquarie',
        loan_amount: 1450000,
        interest_rate: '5.89%',
        stage: '已交割结案',
      },
    ],
  },
  {
    client_name: 'PERSON_4',
    total_properties_count: 1,
    total_loan_amount: 960000,
    primary_lender: 'CBA',
    latest_settlement_date: '2024-08-15',
    active_opportunities_count: 0,
    cases_summary: [
      {
        case_id: 'CASE_ARCH_04',
        property_address: '108 Victoria Rd, Gladesville NSW 2111',
        lender: 'CBA',
        loan_amount: 960000,
        interest_rate: '6.09%',
        stage: '已交割结案',
      },
    ],
  },
  {
    client_name: 'PERSON_5',
    total_properties_count: 1,
    total_loan_amount: 680000,
    primary_lender: 'Latrobe',
    latest_settlement_date: '2023-04-10',
    active_opportunities_count: 1,
    latest_opportunity_title: '🔴 固定利率临期 (还剩 28 天)',
    cases_summary: [
      {
        case_id: 'CASE_ARCH_05',
        property_address: '5/18 Railway Pde, Hurstville NSW 2220',
        lender: 'Latrobe',
        loan_amount: 680000,
        interest_rate: '6.95%',
        stage: '已交割结案',
      },
    ],
  },
  {
    client_name: 'PERSON_6',
    total_properties_count: 1,
    total_loan_amount: 820000,
    primary_lender: 'ANZ',
    latest_settlement_date: '2026-07-20',
    active_opportunities_count: 1,
    latest_opportunity_title: '🔵 放款 30 天关怀回访 (账单与对冲账户核对)',
    cases_summary: [
      {
        case_id: 'CASE_ARCH_08',
        property_address: '72 Church St, Parramatta NSW 2150',
        lender: 'ANZ',
        loan_amount: 820000,
        interest_rate: '5.94%',
        stage: '已交割结案',
      },
    ],
  },
];

/**
 * 获取档案中心大盘统计 (GET /api/archive/stats) (WO-60)
 */
export async function getArchiveStats(): Promise<ArchiveHubStatsResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    return Promise.resolve({
      ok: true,
      stats: MOCK_ARCHIVE_STATS,
    });
  }

  return request<ArchiveHubStatsResponse>('/api/archive/stats');
}

/**
 * 获取客户终生资产全景 (GET /api/archive/portfolio) (WO-60)
 */
export async function getArchivePortfolio(query?: string): Promise<ArchivePortfolioResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    let list = [...MOCK_PORTFOLIO_CLIENTS];
    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.client_name.toLowerCase().includes(q) ||
          c.primary_lender?.toLowerCase().includes(q) ||
          c.cases_summary.some((cs) => cs.property_address?.toLowerCase().includes(q))
      );
    }
    return Promise.resolve({
      ok: true,
      stats: MOCK_ARCHIVE_STATS,
      clients: list,
    });
  }

  const searchParams = new URLSearchParams();
  if (query) searchParams.set('query', query);
  return request<ArchivePortfolioResponse>(`/api/archive/portfolio?${searchParams.toString()}`);
}

/**
 * 一键同步/刷新先例入知识库 (POST /api/archive/sync-knowledge) (WO-61)
 */
export async function syncKnowledgePrecedents(): Promise<KnowledgeSyncResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    await new Promise((r) => setTimeout(r, 600));
    return Promise.resolve({
      ok: true,
      synced_count: 12,
      total_precedents: 12,
      message: '成功同步 12 条实战先例至全局知识库！',
    });
  }

  return request<KnowledgeSyncResponse>('/api/archive/sync-knowledge', {
    method: 'POST',
  });
}

/**
 * 获取案件推荐的相似先例 (GET /api/cases/{case_id}/recommended-precedents) (WO-61)
 */
export async function getCaseRecommendedPrecedents(
  caseId: string
): Promise<CaseRecommendedPrecedentsResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    await new Promise((r) => setTimeout(r, 300));

    // Dynamic mock recommendations based on caseId / context
    const recommendations: RecommendedPrecedentItem[] = [
      {
        precedent_id: 'PRECEDENT_001',
        case_id: 'CASE_ARCH_01',
        title: '【实战先例】ORDE · Yingkun CHEN · $1.84M',
        lender: 'ORDE',
        client_name: 'Yingkun CHEN',
        strategy_summary: '低估价卡点破解：针对初评估值偏低 $40 万，前置补充相近街区真实成交对比（Comparable Sales）与租金收益评估，成功说服复议批准。',
        takeaway: 'Alt Doc 方案中，估价偏低时务必提供第三方数据及租金回报背书，复议通过率可提升 80%。',
        relevance_score: 0.95,
        match_reasons: ['[同机构 ORDE]', '[同低估价卡点]', '[Alt Doc 方案]'],
      },
      {
        precedent_id: 'PRECEDENT_002',
        case_id: 'CASE_ARCH_02',
        title: '【实战先例】Westpac · PERSON_2 · $1.15M',
        lender: 'Westpac',
        client_name: 'PERSON_2',
        strategy_summary: '复杂自雇报税穿透：跨公司结构多重报税扣减，前置提供注册会计师背书信（CPA Letter）证明真实现金流与利润留存。',
        takeaway: '四大行处理多公司自雇案件，前置会计师声明明细可直接缩短审批审查周期 5 个工作日。',
        relevance_score: 0.88,
        match_reasons: ['[自雇复杂财报]', '[CPA 证明信突破]', '[四大行标准]'],
      },
    ];

    return Promise.resolve({
      ok: true,
      case_id: caseId,
      total_recommended: recommendations.length,
      precedents: recommendations,
    });
  }

  return request<CaseRecommendedPrecedentsResponse>(
    `/api/cases/${encodeURIComponent(caseId)}/recommended-precedents`
  );
}

/**
 * 获取邮件原件解析预览 (GET /api/cases/{case_id}/mail-preview?filename=...)
 */
export async function getCaseMailPreview(caseId: string, filename: string): Promise<MailPreviewResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    await new Promise((r) => setTimeout(r, 250));
    return {
      ok: true,
      filename,
      subject: `Re: Loan Assessment & MIR Condition Update - #${caseId}`,
      sender: 'assessment.officer@lender.com.au',
      to: 'vera.broker@everstones.com.au',
      date: '2026-08-18 14:32 (AEST)',
      body_text: `Hi Vera,\n\nWe have reviewed the updated financial verification and CPA statement for loan application #${caseId}.\n\nThe assessor has conditionally approved the LVR threshold subject to:\n1. Confirmation of final loan contract signing.\n2. Valuation report review verification.\n\nPlease provide the remaining documents at your earliest convenience.\n\nBest regards,\nLender Assessment Team`,
      body_html: null,
      attachments: ['Approval_Notice_Schedule.pdf', 'Valuation_Report.pdf'],
    };
  }

  return request<MailPreviewResponse>(
    `/api/cases/${encodeURIComponent(caseId)}/mail-preview?filename=${encodeURIComponent(filename)}`
  );
}









