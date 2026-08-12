import { create } from 'zustand';
import { MOCK_CASES } from '../data/mockCases';
import { listCases } from '../services/api/cases';
import { mapCaseResponse } from '../services/caseMapper';

export interface CaseInfo {
  caseId: string;
  clientName: string;
  lender: string;
  loanAmount: number;
  stage: string;
  checklistDone: number;
  checklistTotal: number;
  checklistProgress: number; // percentage (0-100)
  summary: string;           // one-sentence summary
  deadline: string;          // Finance Due date
  lvr?: number;
  stageDays?: number;
  lastActivity?: string | null;
  financeDeadline?: string | null;
  osPendingCount?: number;
}

interface CaseState {
  cases: CaseInfo[];
  casesLoading: boolean;
  casesError: string | null;
  currentCase: CaseInfo | null;
  contextExpanded: boolean;   // L0 / L1 progressive disclosure toggle
  fetchCases: () => Promise<void>;
  setCurrentCase: (c: CaseInfo | null) => void;
  toggleContext: () => void;
  setContextExpanded: (expanded: boolean) => void;
}

export const useCaseStore = create<CaseState>((set) => ({
  cases: MOCK_CASES,
  casesLoading: false,
  casesError: null,
  currentCase: {
    caseId: "CASE-2026-0801",
    clientName: "Chen Wei (陈伟)",
    lender: "NAB Bank",
    loanAmount: 850000,
    stage: "有条件批准 (Conditional)",
    checklistDone: 8,
    checklistTotal: 12,
    checklistProgress: 67,
    summary: "NAB 审贷团队发出有条件批复文件，附带 3 项补件 OS 要求（需 8 天内补充及签署）。",
    deadline: "8 天内 (Finance Due)",
    lvr: 80,
  },
  contextExpanded: false,
  fetchCases: async () => {
    set({ casesLoading: true, casesError: null });
    const useMock = import.meta.env.VITE_USE_MOCK !== 'false';
    if (useMock) {
      set({
        cases: MOCK_CASES,
        casesLoading: false,
        casesError: null,
      });
      return;
    }

    try {
      const list = await listCases();
      const mapped = list.map(mapCaseResponse);
      set({
        cases: mapped,
        casesLoading: false,
        casesError: null,
      });
    } catch {
      set({
        casesLoading: false,
        casesError: '案件加载失败，请检查后端服务',
      });
    }
  },
  setCurrentCase: (c) => set({ currentCase: c }),
  toggleContext: () => set((state) => ({ contextExpanded: !state.contextExpanded })),
  setContextExpanded: (expanded) => set({ contextExpanded: expanded }),
}));
