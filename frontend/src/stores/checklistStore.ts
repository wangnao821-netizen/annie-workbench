import { create } from 'zustand';
import { ChecklistItemType } from '../types';
import {
  getChecklist,
  confirmChecklistItem,
  revokeChecklistItem,
  revokeFolderFile,
  regenerateChecklist as apiRegenerateChecklist,
  matchChecklistFiles as apiMatchChecklistFiles,
} from '../services/api/cases';
import { ChecklistMatchFilesResponse } from '../types/api';
import { mapChecklistItem } from '../services/checklistMapper';
import { useToastStore } from './toastStore';

interface ChecklistState {
  items: ChecklistItemType[];
  loading: boolean;
  isMatching: boolean;
  gatheringProgress: number;
  error: string | null;
  caseId: string | null;
  fetchChecklist: (caseId: string) => Promise<void>;
  regenerateChecklist: (caseId: string) => Promise<void>;
  matchFiles: (caseId: string) => Promise<ChecklistMatchFilesResponse>;
  toggleItem: (itemId: string, checked: boolean) => Promise<void>;
  revokeFileMatch: (caseId: string, fileId: string, itemId?: string) => Promise<void>;
  applyAutoMatch: (caseId: string, fileId: string, fileName: string, matchedItemIdsOrLabels: string[]) => void;
  reset: () => void;
}

const MOCK_CHECKLIST_ITEMS: ChecklistItemType[] = [
  {
    id: 'chk-1',
    label: '身份证明 (护照 / 驾照)',
    category: 'required',
    checked: true,
    status: 'received',
    fileMatched: 'ID DL.pdf',
    fileId: 'f-id-001',
    isAutoMatched: true,
  },
  {
    id: 'chk-2',
    label: '最新 2 期工资单 (Payslips)',
    category: 'required',
    checked: true,
    status: 'received',
    fileMatched: 'Payslip_2026_01.pdf',
    fileId: 'f-pay-002',
    isAutoMatched: true,
  },
  {
    id: 'chk-3',
    label: '2025 年 Notice of Assessment (NOA)',
    category: 'required',
    checked: false,
    status: 'missing',
    reason: '缺少 2025 财年税单，银行审查自雇收入需补充',
  },
  {
    id: 'chk-4',
    label: '最近 3 个月主银行账户流水',
    category: 'required',
    checked: true,
    status: 'received',
    fileMatched: 'Bank_Statement_90Days.pdf',
    fileId: 'f-stm-004',
    isAutoMatched: true,
  },
  {
    id: 'chk-5',
    label: '购房合同 (Contract of Sale)',
    category: 'required',
    checked: false,
    status: 'missing',
    reason: '尚未收到签署版购房合同原件',
  },
  {
    id: 'chk-6',
    label: '父母首付赠予信 (Gift Letter)',
    category: 'ai_suggested',
    checked: false,
    status: 'missing',
    reason: 'AI 识别大额资金划入，建议补充首付赠予声明',
  },
];

export const useChecklistStore = create<ChecklistState>((set, get) => ({
  items: [],
  loading: false,
  isMatching: false,
  gatheringProgress: 60,
  error: null,
  caseId: null,

  fetchChecklist: async (caseId: string) => {
    set({ loading: true, error: null, caseId });
    const useMock = import.meta.env.VITE_USE_MOCK !== 'false';
    if (useMock) {
      const checkedCount = MOCK_CHECKLIST_ITEMS.filter((i) => i.checked).length;
      const progress = Math.round((checkedCount / MOCK_CHECKLIST_ITEMS.length) * 100);
      set({
        items: MOCK_CHECKLIST_ITEMS,
        gatheringProgress: progress,
        loading: false,
        error: null,
      });
      return;
    }

    try {
      const res = await getChecklist(caseId);
      const mapped = res.map(mapChecklistItem);
      const checkedCount = mapped.filter((i) => i.checked).length;
      const progress = mapped.length > 0 ? Math.round((checkedCount / mapped.length) * 100) : 0;
      set({
        items: mapped,
        gatheringProgress: progress,
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

  regenerateChecklist: async (caseId: string) => {
    set({ loading: true, error: null, caseId });
    try {
      const res = await apiRegenerateChecklist(caseId);
      const mapped = res.map(mapChecklistItem);
      const checkedCount = mapped.filter((i) => i.checked).length;
      const progress = mapped.length > 0 ? Math.round((checkedCount / mapped.length) * 100) : 0;
      set({
        items: mapped,
        gatheringProgress: progress,
        loading: false,
        error: null,
      });
      useToastStore.getState().showToast('success', '清单已重新生成');
      window.dispatchEvent(new CustomEvent('checklist_updated', { detail: { caseId } }));
    } catch (err: any) {
      set({ loading: false });
      useToastStore.getState().showToast('error', err?.message || '清单重新生成失败');
      throw err;
    }
  },

  matchFiles: async (caseId: string) => {
    set({ isMatching: true });
    try {
      const res = await apiMatchChecklistFiles(caseId);
      const details = res.matched_details || [];

      set((state) => {
        const updatedItems = state.items.map((item) => {
          const matchedDetail = details.find(
            (d) =>
              String(d.checklist_id) === String(item.id) ||
              (d.item_name && item.label.toLowerCase().includes(d.item_name.toLowerCase())) ||
              (d.item_name && d.item_name.toLowerCase().includes(item.label.toLowerCase()))
          );

          if (matchedDetail) {
            return {
              ...item,
              checked: true,
              status: matchedDetail.status || 'received',
              fileMatched: matchedDetail.matched_file_name,
              fileId: matchedDetail.matched_file_id,
              isAutoMatched: true,
            };
          }
          return item;
        });

        const checkedCount = updatedItems.filter((i) => i.checked).length;
        const calcProgress = updatedItems.length > 0 ? Math.round((checkedCount / updatedItems.length) * 100) : 0;
        const progress = res.gathering_progress ?? calcProgress;

        return {
          items: updatedItems,
          gatheringProgress: progress,
          isMatching: false,
        };
      });

      useToastStore
        .getState()
        .showToast('success', `成功匹配并自动勾选 ${res.matched_count || details.length} 项材料！`);
      window.dispatchEvent(
        new CustomEvent('checklist_updated', {
          detail: { caseId, gathering_progress: res.gathering_progress },
        })
      );
      return res;
    } catch (err: any) {
      set({ isMatching: false });
      useToastStore.getState().showToast('error', `材料智能匹配失败: ${err?.message || '网络异常'}`);
      throw err;
    }
  },

  toggleItem: async (itemId: string, checked: boolean) => {
    const { caseId, items } = get();
    const useMock = import.meta.env.VITE_USE_MOCK !== 'false';

    if (useMock) {
      const updated = items.map((item) =>
        item.id === itemId ? { ...item, checked, status: checked ? 'received' : 'missing' } : item
      );
      const checkedCount = updated.filter((i) => i.checked).length;
      const progress = updated.length > 0 ? Math.round((checkedCount / updated.length) * 100) : 0;
      set({
        items: updated,
        gatheringProgress: progress,
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

      const updated = get().items.map((item) =>
        item.id === itemId ? updatedItem : item
      );
      const checkedCount = updated.filter((i) => i.checked).length;
      const progress = updated.length > 0 ? Math.round((checkedCount / updated.length) * 100) : 0;

      set({
        items: updated,
        gatheringProgress: progress,
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

  revokeFileMatch: async (caseId: string, fileId: string, itemId?: string) => {
    const useMock = import.meta.env.VITE_USE_MOCK !== 'false';
    try {
      if (!useMock) {
        await revokeFolderFile(caseId, fileId);
      }
      
      set((state) => {
        const updated = state.items.map((i) => {
          if ((itemId && i.id === itemId) || (fileId && i.fileId === fileId)) {
            return {
              ...i,
              checked: false,
              status: 'missing',
              isAutoMatched: false,
              fileMatched: undefined,
              fileId: undefined,
            };
          }
          return i;
        });
        const checkedCount = updated.filter((i) => i.checked).length;
        const progress = updated.length > 0 ? Math.round((checkedCount / updated.length) * 100) : 0;
        return {
          items: updated,
          gatheringProgress: progress,
        };
      });

      useToastStore.getState().showToast('success', '已撤销材料自动匹配，清单已同步更新');
      
      if (!useMock && get().caseId) {
        await get().fetchChecklist(get().caseId!);
      }
    } catch (err: any) {
      useToastStore.getState().showToast('error', `撤销匹配失败: ${err?.message || '未知错误'}`);
    }
  },

  applyAutoMatch: (_caseId: string, fileId: string, fileName: string, matchedItemIdsOrLabels: string[]) => {
    set((state) => {
      const updated = state.items.map((item) => {
        const isMatched = matchedItemIdsOrLabels.some(
          (m) => item.id === m || item.label.toLowerCase().includes(m.toLowerCase()) || m.toLowerCase().includes(item.label.toLowerCase())
        );
        if (isMatched) {
          return {
            ...item,
            checked: true,
            status: 'received',
            isAutoMatched: true,
            fileId,
            fileMatched: fileName,
          };
        }
        return item;
      });
      const checkedCount = updated.filter((i) => i.checked).length;
      const progress = updated.length > 0 ? Math.round((checkedCount / updated.length) * 100) : 0;
      return {
        items: updated,
        gatheringProgress: progress,
      };
    });
  },

  reset: () => set({ items: [], caseId: null, loading: false, isMatching: false, gatheringProgress: 0, error: null }),
}));
