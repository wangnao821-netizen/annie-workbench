import { request, ApiError, getApiBaseUrl } from '../http';
import {
  FolderFilesResponse,
  FilePreviewResponse,
  RenameFileRequest,
  RenameFileResponse,
  MoveFileRequest,
  MoveFileResponse,
  ImportFileResponse,
  NamingSuggestResponse,
  FileItem,
} from '../../types/api';

// In-memory mock file state to keep file operations reactive in mock mode
const MOCK_STORAGE: Record<string, FileItem[]> = {
  '': [
    { name: '_Inbox', rel_path: '_Inbox', is_dir: true },
    { name: 'Send to Lender', rel_path: 'Send to Lender', is_dir: true },
    { name: 'Bank Statements', rel_path: 'Bank Statements', is_dir: true },
    { name: 'Identity & Income', rel_path: 'Identity & Income', is_dir: true },
    { name: 'application_summary.pdf', rel_path: 'application_summary.pdf', is_dir: false, size: 450000, mtime: '2026-08-14 08:00', doc_type: 'application' },
  ],
  '_Inbox': [
    { name: 'bank_statement_3m.pdf', rel_path: '_Inbox/bank_statement_3m.pdf', is_dir: false, size: 2450000, mtime: '2026-08-12 14:30', doc_type: 'bank_statement' },
    { name: 'notice_of_assessment_2025.pdf', rel_path: '_Inbox/notice_of_assessment_2025.pdf', is_dir: false, size: 890000, mtime: '2026-08-10 16:45', doc_type: 'noa' },
  ],
  'Send to Lender': [
    { name: 'payslip_2026_01.pdf', rel_path: 'Send to Lender/payslip_2026_01.pdf', is_dir: false, size: 1120000, mtime: '2026-08-11 09:15', doc_type: 'payslip' },
    { name: 'property_valuation_report.pdf', rel_path: 'Send to Lender/property_valuation_report.pdf', is_dir: false, size: 3200000, mtime: '2026-08-13 11:20', doc_type: 'valuation' },
  ],
  'Bank Statements': [
    { name: 'ANZ_savings_account_statement.pdf', rel_path: 'Bank Statements/ANZ_savings_account_statement.pdf', is_dir: false, size: 1850000, mtime: '2026-08-05 15:10', doc_type: 'bank_statement' },
  ],
  'Identity & Income': [
    { name: 'passport_PERSON_1.pdf', rel_path: 'Identity & Income/passport_PERSON_1.pdf', is_dir: false, size: 1540000, mtime: '2026-08-01 10:00', doc_type: 'passport' },
    { name: 'group_certificate_2025.pdf', rel_path: 'Identity & Income/group_certificate_2025.pdf', is_dir: false, size: 920000, mtime: '2026-08-02 11:30', doc_type: 'tax_return' },
  ],
};

export async function getCaseFolderFiles(caseId: string, path = ''): Promise<FolderFilesResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    const cleanPath = path.replace(/^\/+|\/+$/g, '');
    const items = MOCK_STORAGE[cleanPath] || [];
    return { current_path: cleanPath, items };
  }

  try {
    const query = path ? `?path=${encodeURIComponent(path)}` : '';
    return await request<FolderFilesResponse>(`/api/cases/${encodeURIComponent(caseId)}/folder/files${query}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      const cleanPath = path.replace(/^\/+|\/+$/g, '');
      const items = MOCK_STORAGE[cleanPath] || [];
      return { current_path: cleanPath, items };
    }
    throw err;
  }
}

export async function getCaseFilePreview(caseId: string, path: string): Promise<FilePreviewResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    const fileName = path.split('/').pop() || 'file.pdf';
    
    // Simulate parse error for testing error state
    if (fileName.includes('corrupted') || fileName.includes('invalid')) {
      return {
        rel_path: path,
        size: 512000,
        mtime: '2026-08-14 10:00',
        doc_type: 'corrupted_file',
        text_preview: null,
        parse_error: '无法读取加密或损坏的 PDF 文件，请核对文件格式并重新上传。',
      };
    }

    let docType = 'document';
    let textPreview = `【文本提取预览 (${fileName})】\n`;
    if (fileName.includes('statement') || fileName.includes('bank')) {
      docType = 'bank_statement';
      textPreview += '识别到主账户近 3 个月流水，月均净流入约 $12,500，无高风险借贷或博彩支出。';
    } else if (fileName.includes('payslip') || fileName.includes('pay')) {
      docType = 'payslip';
      textPreview += '识别到申请人 PERSON_1 近两期 PAYG 工资单，雇主 Tech Corp，年化固定薪资约 $180,000。';
    } else if (fileName.includes('assessment') || fileName.includes('noa') || fileName.includes('tax')) {
      docType = 'noa';
      textPreview += '识别到 2025 财年 ATO Notice of Assessment 税单，Taxable Income $182,500，与申报一致。';
    } else if (fileName.includes('passport')) {
      docType = 'passport';
      textPreview += '识别到申请人 PERSON_1 护照扫描件，有效期至 2031 年，身份比对一致。';
    } else {
      textPreview += '文件校验完成，元数据符合合规与审计标准。';
    }

    return {
      rel_path: path,
      size: 1450000,
      mtime: '2026-08-12 14:30',
      doc_type: docType,
      text_preview: textPreview,
      parse_error: null,
    };
  }

  return request<FilePreviewResponse>(`/api/cases/${encodeURIComponent(caseId)}/folder/files/preview?path=${encodeURIComponent(path)}`);
}

export async function renameCaseFile(caseId: string, req: RenameFileRequest): Promise<RenameFileResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    const { source, new_name } = req;
    const parts = source.split('/');
    parts.pop();
    const dirPath = parts.join('/');
    
    if (MOCK_STORAGE[dirPath]) {
      const idx = MOCK_STORAGE[dirPath].findIndex((i) => i.rel_path === source);
      if (idx !== -1) {
        const item = MOCK_STORAGE[dirPath][idx];
        const newRelPath = dirPath ? `${dirPath}/${new_name}` : new_name;
        MOCK_STORAGE[dirPath][idx] = {
          ...item,
          name: new_name,
          rel_path: newRelPath,
        };
      }
    }
    return { ok: true, source, target: new_name, event_id: Date.now() };
  }

  return request<RenameFileResponse>(`/api/cases/${encodeURIComponent(caseId)}/folder/files/rename`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function moveCaseFile(caseId: string, req: MoveFileRequest): Promise<MoveFileResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    const { source, target_dir } = req;
    const parts = source.split('/');
    const filename = parts.pop() || '';
    const srcDir = parts.join('/');

    if (MOCK_STORAGE[srcDir]) {
      const itemIdx = MOCK_STORAGE[srcDir].findIndex((i) => i.rel_path === source);
      if (itemIdx !== -1) {
        const [movedItem] = MOCK_STORAGE[srcDir].splice(itemIdx, 1);
        const cleanTargetDir = target_dir.replace(/^\/+|\/+$/g, '');
        const newRelPath = cleanTargetDir ? `${cleanTargetDir}/${filename}` : filename;
        movedItem.rel_path = newRelPath;

        if (!MOCK_STORAGE[cleanTargetDir]) {
          MOCK_STORAGE[cleanTargetDir] = [];
        }
        MOCK_STORAGE[cleanTargetDir].push(movedItem);
      }
    }
    return { ok: true, source, target_dir };
  }

  return request<MoveFileResponse>(`/api/cases/${encodeURIComponent(caseId)}/folder/files/move`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function importCaseFile(caseId: string, file: File, targetDir: string): Promise<ImportFileResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    const cleanTargetDir = targetDir.replace(/^\/+|\/+$/g, '');
    const newRelPath = cleanTargetDir ? `${cleanTargetDir}/${file.name}` : file.name;

    if (!MOCK_STORAGE[cleanTargetDir]) {
      MOCK_STORAGE[cleanTargetDir] = [];
    }

    const exists = MOCK_STORAGE[cleanTargetDir].some((i) => i.name === file.name);
    if (exists) {
      throw new ApiError(409, `目标文件夹中已存在同名文件 "${file.name}"，系统禁止覆盖。`);
    }

    MOCK_STORAGE[cleanTargetDir].push({
      name: file.name,
      rel_path: newRelPath,
      is_dir: false,
      size: file.size,
      mtime: new Date().toISOString().replace('T', ' ').slice(0, 16),
      doc_type: 'imported_file',
    });

    return { ok: true, target: newRelPath };
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('target_dir', targetDir);

  const BASE_URL = await getApiBaseUrl();
  const url = `${BASE_URL}/api/cases/${encodeURIComponent(caseId)}/folder/files/import`;

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let detail = '导入文件失败';
    try {
      const errJson = await response.json();
      detail = errJson.detail || errJson.message || response.statusText;
    } catch {
      detail = response.statusText;
    }
    throw new ApiError(response.status, detail);
  }

  return response.json();
}

export async function getNamingSuggest(caseId: string, filename: string): Promise<NamingSuggestResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    const lower = filename.toLowerCase();
    if (lower.includes('statement') || lower.includes('bank')) {
      return {
        doc_type: 'bank_statement',
        suggested: `${caseId}_BankStatement_3M_2026.pdf`,
        template_key: 'bank_statement_v1',
        matched: true,
        reasons: [
          '根据文件名包含 bank/statement 特征匹配近3个月银行流水模版',
          '符合 NAB / ANZ 等主流机构统一收单命名范式',
          '自动补充案件编号前缀以方便存贮检索',
        ],
      };
    }
    if (lower.includes('payslip') || lower.includes('pay')) {
      return {
        doc_type: 'payslip',
        suggested: `${caseId}_Payslip_2026_Recent.pdf`,
        template_key: 'payslip_v1',
        matched: true,
        reasons: [
          '识别为 PAYG 雇主工资单文件',
          '符合 2026 年最新审贷文件规范命名建议',
        ],
      };
    }
    if (lower.includes('tax') || lower.includes('assessment') || lower.includes('noa')) {
      return {
        doc_type: 'noa',
        suggested: `${caseId}_NOA_TaxReturn_2025.pdf`,
        template_key: 'tax_noa_v1',
        matched: true,
        reasons: [
          '匹配 ATO Notice of Assessment 审贷材料命名标准',
          '规范年份与案例信息，防止乱码或拼写混淆',
        ],
      };
    }

    return {
      doc_type: 'document',
      suggested: `${caseId}_Doc_${filename.replace(/\.[^/.]+$/, '')}.pdf`,
      template_key: 'general_doc',
      matched: false,
      reasons: ['未命中特殊材料类型，依据标准案件文件夹命名规则附加统一编号前缀'],
    };
  }

  return request<NamingSuggestResponse>(`/api/cases/${encodeURIComponent(caseId)}/folder/naming-suggest?filename=${encodeURIComponent(filename)}`);
}

export async function previewRawFileUrl(caseId: string, path: string): Promise<string> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
        <rect width="600" height="400" fill="#0f172a"/>
        <rect x="20" y="20" width="560" height="360" rx="12" fill="#1e293b" stroke="#334155" stroke-width="2"/>
        <text x="300" y="180" font-family="sans-serif" font-size="20" font-weight="bold" fill="#38bdf8" text-anchor="middle">【原始文件图像视图】</text>
        <text x="300" y="220" font-family="sans-serif" font-size="14" fill="#94a3b8" text-anchor="middle">${path}</text>
        <text x="300" y="260" font-family="sans-serif" font-size="12" fill="#64748b" text-anchor="middle">VERA 原生文件解码引擎等候中</text>
      </svg>`;
      return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    }
    if (ext === 'pdf') {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
        body { margin:0; padding:24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background:#0f172a; color:#e2e8f0; }
        .card { background:#1e293b; border:1px solid #334155; border-radius:12px; padding:24px; max-width:600px; margin:0 auto; box-shadow:0 10px 25px rgba(0,0,0,0.5); }
        .header { display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #334155; padding-bottom:12px; margin-bottom:16px; }
        .title { font-size:16px; font-weight:bold; color:#38bdf8; }
        .tag { background:rgba(56,189,248,0.1); color:#38bdf8; border:1px solid rgba(56,189,248,0.2); padding:2px 8px; border-radius:6px; font-size:11px; }
        .content { font-family: monospace; font-size:12px; line-height:1.6; color:#cbd5e1; white-space:pre-wrap; }
      </style></head><body>
        <div class="card">
          <div class="header"><span class="title">📄 PDF 原始文件流</span><span class="tag">RAW STREAM</span></div>
          <p style="font-size:12px; color:#94a3b8;">路径: ${path}</p>
          <div class="content">===== EVERSTONES RAW PDF VIEWER STREAM =====\nFile Path: ${path}\nStatus: VERIFIED & READABLE\n\n[PAYROLL STATEMENT CONTENT]\nEmployer: Tech Enterprise Pty Ltd\nEmployee: PERSON_1\nPeriod: 2026-07-01 to 2026-07-31\nGross Pay: $15,000.00 AUD\nNet Pay: $10,800.00 AUD\nBank Credit Confirmed: $10,800.00 AUD</div>
        </div>
      </body></html>`;
      return URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    }
    if (['txt', 'md', 'csv'].includes(ext)) {
      const txt = `【原文文本数据】\n文件路径: ${path}\n----------------------------------------\n${path.includes('csv') ? 'Date,Description,Amount,Balance\n2026-08-01,Salary Credit,$12500.00,$45200.00\n2026-08-05,Rent Deposit,$2800.00,$48000.00' : '这是来自底层的原始文件内容流。'}`;
      return URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
    }
    if (['doc', 'docx', 'xls', 'xlsx', 'msg'].includes(ext)) {
      return `UNSUPPORTED_FORMAT:${ext}`;
    }
    return URL.createObjectURL(new Blob([`RAW CONTENT STREAM OF ${path}`], { type: 'text/plain' }));
  }

  const BASE_URL = await getApiBaseUrl();
  const url = `${BASE_URL}/api/cases/${encodeURIComponent(caseId)}/folder/files/raw?path=${encodeURIComponent(path)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new ApiError(response.status, '获取文件原文失败');
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

