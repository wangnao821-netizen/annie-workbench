import { request, ApiError, getApiBaseUrl } from '../http';
import {
  CalculatorProfileInfo,
  CalculatorUploadResult,
  CalculatorApplyResult,
  CalculatorRollbackResult,
  CalculatorAssessRequest,
  CalculatorAssessResponse,
} from '../../types/api';

export async function getCalculatorProfiles(): Promise<CalculatorProfileInfo[]> {
  try {
    return await request<CalculatorProfileInfo[]>('/api/calculator/profiles');
  } catch (err) {
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      return [
        { bank: 'cba', name: 'CBA Servicing Calculator', version: '2026.08.13', effective_date: '2026-08-13', source_file: 'CBA_Servicing_Calculator.xlsm', status: 'active' },
        { bank: 'macquarie', name: 'Macquarie Servicing Calculator', version: '2026.08.13', effective_date: '2026-08-13', source_file: 'Macquarie_Servicing_Calculator.xlsm', status: 'active' },
        { bank: 'boc', name: 'BOC Servicing Calculator', version: '2026.08.13', effective_date: '2026-08-13', source_file: 'BOC_Servicing_Calculator.xlsm', status: 'active' },
        { bank: 'ma_money', name: 'MA Money Servicing Calculator', version: '2026.08.13', effective_date: '2026-08-13', source_file: 'MA_Money_Servicing_Calculator.xlsm', status: 'active' },
        { bank: 'latrobe', name: 'LaTrobe Servicing Calculator', version: '2026.08.13', effective_date: '2026-08-13', source_file: 'LaTrobe_Servicing_Calculator.xlsm', status: 'active' },
        { bank: 'resimac', name: 'Resimac Servicing Calculator', version: '2026.08.13', effective_date: '2026-08-13', source_file: 'Resimac_Servicing_Calculator.xlsm', status: 'active' },
      ];
    }
    throw err;
  }
}

export async function uploadCalculatorProfile(file: File): Promise<CalculatorUploadResult> {
  const BASE_URL = await getApiBaseUrl();
  const url = `${BASE_URL}/api/calculator/profiles/upload`;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 15000);

  console.log('[HTTP Request] POST /api/calculator/profiles/upload');

  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(id);

    if (!response.ok) {
      let errorDetail = '上传失败';
      try {
        const errJson = await response.json();
        errorDetail = errJson.detail || errJson.message || response.statusText;
      } catch {
        errorDetail = response.statusText;
      }
      throw new ApiError(response.status, errorDetail);
    }

    return (await response.json()) as CalculatorUploadResult;
  } catch (error) {
    clearTimeout(id);
    if (error instanceof ApiError) throw error;
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      const bankName = file.name.split('_')[0]?.toLowerCase() || 'cba';
      return {
        bank: bankName,
        detected_version: '2026.08.13-preview',
        current_version: '2026.08.13',
        is_new_bank: false,
        needs_review: false,
        review_note: '解析成功，检测到 2 处核心参数变动',
        diff: [
          { path: 'hem.couple_base', old: 2850, new: 2980 },
          { path: 'buffer.floor_rate', old: 0.0825, new: 0.085 },
        ],
        changed_count: 2,
        source_hash: 'sha256_mock_hash_12345678',
      };
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(0, '请求超时，网络不可用');
    }
    throw new ApiError(0, '网络不可用');
  }
}

export async function applyCalculatorProfile(bank: string, sourceHash: string): Promise<CalculatorApplyResult> {
  return request<CalculatorApplyResult>(`/api/calculator/profiles/${encodeURIComponent(bank)}/apply`, {
    method: 'POST',
    body: JSON.stringify({ source_hash: sourceHash }),
  });
}

export async function rollbackCalculatorProfile(bank: string, version?: string): Promise<CalculatorRollbackResult> {
  return request<CalculatorRollbackResult>(`/api/calculator/profiles/${encodeURIComponent(bank)}/rollback`, {
    method: 'POST',
    body: JSON.stringify({ version }),
  });
}

export async function assessCalculator(body: CalculatorAssessRequest): Promise<CalculatorAssessResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    await new Promise((r) => setTimeout(r, 120));
    const baseInc = body.applicants?.[0]?.base || 120000;
    const otherInc = (body.applicants?.[0]?.overtime || 0) + (body.applicants?.[0]?.rental_income || 0);
    const loanAmt = body.loan?.portions?.[0]?.amount || 550000;
    const bankKey = (body.bank || 'cba').toLowerCase();

    // Bank-specific factor multipliers for realistic multi-bank benchmarking
    const multipliers: Record<string, { borrowingPower: number; surplusAdj: number; floorRate: number; name: string }> = {
      macquarie: { borrowingPower: 6.45, surplusAdj: 1.15, floorRate: 0.0825, name: 'Macquarie' },
      cba: { borrowingPower: 6.20, surplusAdj: 1.00, floorRate: 0.0850, name: 'CBA' },
      boc: { borrowingPower: 6.10, surplusAdj: 0.95, floorRate: 0.0865, name: 'BOC' },
      ma_money: { borrowingPower: 6.60, surplusAdj: 1.25, floorRate: 0.0810, name: 'MA Money' },
      latrobe: { borrowingPower: 6.55, surplusAdj: 1.20, floorRate: 0.0815, name: 'LaTrobe' },
      resimac: { borrowingPower: 6.35, surplusAdj: 1.08, floorRate: 0.0835, name: 'Resimac' },
    };

    const cfg = multipliers[bankKey] || { borrowingPower: 6.2, surplusAdj: 1.0, floorRate: 0.085, name: body.bank || 'CBA' };
    const maxLoan = Math.round((baseInc + otherInc * 0.8) * cfg.borrowingPower);
    const surplusBase = (maxLoan - loanAmt) * 0.0035 * cfg.surplusAdj;
    const surplus = Math.round(surplusBase);
    const pass = surplus >= 0 && maxLoan >= loanAmt;
    const dti = Number((loanAmt / Math.max(1, baseInc)).toFixed(2));
    const lvr = body.loan?.security_value
      ? Number(((loanAmt / body.loan.security_value) * 100).toFixed(1))
      : 80;

    let resultStatus: 'PASS' | 'REFER' | 'FAIL' = 'PASS';
    if (!pass) {
      resultStatus = surplus > -500 ? 'REFER' : 'FAIL';
    }

    return {
      bank: cfg.name,
      result: resultStatus,
      indicator: 'Net Monthly Surplus',
      indicator_value: surplus,
      threshold: 0,
      min_surplus: 0,
      surplus,
      max_loan: maxLoan,
      dti,
      lvr,
      profile_version: '2026.8.19',
      steps: [
        {
          step_id: 'S01_TOTAL_INCOME',
          label: `${cfg.name} 申请人年化收入折算与核定`,
          formula: 'Assessable Gross = Base + (Overtime * 80%) + (Rental * 80%)',
          inputs: { base: baseInc, other: otherInc },
          output: Math.round(baseInc + otherInc * 0.8),
          source: `${cfg.name}_Servicing_Model.xlsm!Income_Tab`,
        },
        {
          step_id: 'S02_ASSESSMENT_RATE',
          label: `${cfg.name} 审贷缓冲评估利率 (Buffer Rate)`,
          formula: `Max(Actual Rate + 3.0%, Floor Rate ${(cfg.floorRate * 100).toFixed(2)}%)`,
          inputs: { actual_rate: body.loan?.portions?.[0]?.rate || 0.0615, floor_rate: cfg.floorRate },
          output: `${(cfg.floorRate * 100).toFixed(2)}% p.a. Assessment Floor`,
          source: `${cfg.name}_Servicing_Model.xlsm!Rates_Tab`,
        },
        {
          step_id: 'S03_NET_SURPLUS',
          label: '月度净可用偿债盈余 (Net Monthly Surplus / UMI)',
          formula: 'Net Monthly Income - Monthly Assessment Repayment - HEM Living Expense',
          inputs: {
            net_income_monthly: Math.round(baseInc * 0.72 / 12),
            monthly_repayment_assessed: Math.round(loanAmt * (cfg.floorRate / 12) / (1 - Math.pow(1 + cfg.floorRate / 12, -360))),
          },
          output: `$${surplus.toLocaleString()} /月`,
          source: `${cfg.name}_Servicing_Model.xlsm!Summary_Tab`,
        },
      ],
    };
  }

  return await request<CalculatorAssessResponse>('/api/calculator/assess', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
