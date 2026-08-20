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
  folderPath?: string | null;
  folderMode?: string | null;
  hasBossPending?: boolean;
  assessorName?: string | null;
  lenderRef?: string | null;
  activeBlocker?: string | null;
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
  cases: [],
  casesLoading: false,
  casesError: null,
  currentCase: null,
  contextExpanded: false,
  fetchCases: async () => {
    set({ casesLoading: true, casesError: null });
    const useMock = import.meta.env.VITE_USE_MOCK !== 'false';
    if (useMock) {
      const updatedList = [...MOCK_CASES];
      set((state) => {
        let updatedCurrent = state.currentCase;
        if (updatedCurrent) {
          const match = updatedList.find((c) => c.caseId === updatedCurrent?.caseId);
          if (match) updatedCurrent = { ...match };
        }
        return {
          cases: updatedList,
          currentCase: updatedCurrent,
          casesLoading: false,
          casesError: null,
        };
      });
      return;
    }

    try {
      const list = await listCases();
      const mapped = list.map(mapCaseResponse);
      set((state) => {
        let updatedCurrent = state.currentCase;
        if (updatedCurrent) {
          const match = mapped.find((c) => c.caseId === updatedCurrent?.caseId);
          if (match) updatedCurrent = { ...match };
        }
        return {
          cases: mapped,
          currentCase: updatedCurrent,
          casesLoading: false,
          casesError: null,
        };
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
