import { create } from 'zustand';
import { ChecklistItemType } from '../types';
import { getChecklist, confirmChecklistItem, revokeChecklistItem } from '../services/api/cases';
import { mapChecklistItem } from '../services/checklistMapper';
import { useToastStore } from './toastStore';

interface ChecklistState {
  items: ChecklistItemType[];
  loading: boolean;
  error: string | null;
  caseId: string | null;
  fetchChecklist: (caseId: string) => Promise<void>;
  toggleItem: (itemId: string, checked: boolean) => Promise<void>;
  reset: () => void;
}

const MOCK_CHECKLIST_ITEMS: ChecklistItemType[] = [
  {
    id: 'chk-1',
    label: '身份证明 (护照 / 驾照)',
    category: 'required',
    checked: true,
    fileMatched: 'passport_scan.pdf',
  },
  {
    id: 'chk-2',
    label: '最新 2 期工资单 (Payslips)',
    category: 'required',
    checked: true,
    fileMatched: 'payslip_2026_01.pdf',
  },
  {
    id: 'chk-3',
    label: '2025 年 Notice of Assessment (NOA)',
    category: 'required',
    checked: false,
    reason: '缺少 2025 财年税单，银行审查自雇收入需补充',
  },
  {
    id: 'chk-4',
    label: '最近 3 个月主银行账户流水',
    category: 'required',
    checked: true,
    fileMatched: 'bank_statement_3m.pdf',
  },
  {
    id: 'chk-5',
    label: '购房合同 (Contract of Sale)',
    category: 'required',
    checked: false,
    reason: '尚未收到签署版购房合同原件',
  },
  {
    id: 'chk-6',
    label: '父母首付赠予信 (Gift Letter)',
    category: 'ai_suggested',
    checked: false,
    reason: 'AI 识别大额资金划入，建议补充首付赠予声明',
  },
];

export const useChecklistStore = create<ChecklistState>((set, get) => ({
  items: [],
  loading: false,
  error: null,
  caseId: null,

  fetchChecklist: async (caseId: string) => {
    set({ loading: true, error: null, caseId });
    const useMock = import.meta.env.VITE_USE_MOCK !== 'false';
    if (useMock) {
      set({
        items: MOCK_CHECKLIST_ITEMS,
        loading: false,
        error: null,
      });
      return;
    }

    try {
      const res = await getChecklist(caseId);
      const mapped = res.map(mapChecklistItem);
      set({
        items: mapped,
        loading: false,
        error: null,
      });
    } catch {
      set({
        loading: false,
        error: '清单加载失败，请检查后端服务',
      });
    }
  },

  toggleItem: async (itemId: string, checked: boolean) => {
    const { caseId, items } = get();
    const useMock = import.meta.env.VITE_USE_MOCK !== 'false';

    if (useMock) {
      set({
        items: items.map((item) =>
          item.id === itemId ? { ...item, checked } : item
        ),
      });
      if (checked) {
        useToastStore.getState().showToast('success', '已标记收到此清单项');
      } else {
        useToastStore.getState().showToast('info', '已取消确认此清单项');
      }
      return;
    }

    if (!caseId) return;

    try {
      const apiFn = checked ? confirmChecklistItem : revokeChecklistItem;
      const updatedRes = await apiFn(caseId, itemId);
      const updatedItem = mapChecklistItem(updatedRes);

      set({
        items: get().items.map((item) =>
          item.id === itemId ? updatedItem : item
        ),
      });

      if (checked) {
        useToastStore.getState().showToast('success', '已标记收到此清单项');
      } else {
        useToastStore.getState().showToast('info', '已取消确认此清单项');
      }
    } catch {
      useToastStore.getState().showToast('error', '操作失败，请重试');
    }
  },

  reset: () => set({ items: [], caseId: null, loading: false, error: null }),
}));
