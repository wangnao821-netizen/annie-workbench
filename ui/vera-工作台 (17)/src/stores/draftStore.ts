import { create } from 'zustand';
import { DraftResponse, DraftVersionResponse } from '../types/api';
import { ApiError } from '../services/http';
import {
  getDraft,
  getDraftVersions,
  refineDraft as apiRefineDraft,
  confirmDraft as apiConfirmDraft,
  rollbackDraft as apiRollbackDraft,
} from '../services/api/drafts';
import { useToastStore } from './toastStore';

interface DraftState {
  draft: DraftResponse | null;
  versions: DraftVersionResponse[];
  loading: boolean;
  error: string | null;
  fetchDraft: (actionId: number) => Promise<void>;
  refineDraft: (actionId: number, instruction: string) => Promise<void>;
  confirmDraft: (actionId: number) => Promise<void>;
  rollbackDraft: (actionId: number, version: number) => Promise<void>;
  reset: () => void;
}

const MOCK_DRAFT: DraftResponse = {
  id: 101,
  action_id: 1,
  subject: '【补件提醒】PERSON_1 房屋贷款申请需补充材料说明',
  body_zh: '尊敬的 PERSON_1 阁下：您的贷款（申请额 $850,000）审核已进入尾声，请提供最新的 NOA 及 2 期工资单以加速定批。',
  body_en: 'Dear PERSON_1, regarding your loan application of $850,000, please provide your latest NOA and 2 recent payslips.',
  status: 'draft',
  version: 2,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const MOCK_VERSIONS: DraftVersionResponse[] = [
  {
    version: 1,
    subject: '【补件提醒】PERSON_1 房屋贷款申请需补充材料说明',
    body_zh: '尊敬的 PERSON_1 阁下：您的贷款（申请额 $850,000）审核已进入尾声，请提供最新的 NOA 及 2 期工资单以加速定批。',
    body_en: 'Dear PERSON_1, regarding your loan application of $850,000, please provide your latest NOA and 2 recent payslips.',
    source: 'ai',
    updated_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    version: 2,
    subject: '【补件提醒】PERSON_1 房屋贷款申请需补充材料说明 [修正]',
    body_zh: '尊敬的 PERSON_1 阁下：您的贷款（申请额 $850,000）审核已进入尾声，请提供最新的 NOA 及 2 期工资单以加速定批。感谢您的配合。',
    body_en: 'Dear PERSON_1, regarding your loan application of $850,000, please provide your latest NOA and 2 recent payslips. Thank you.',
    source: 'refine',
    updated_at: new Date().toISOString(),
  },
];

export const useDraftStore = create<DraftState>((set, get) => ({
  draft: null,
  versions: [],
  loading: false,
  error: null,

  fetchDraft: async (actionId: number) => {
    set({ loading: true, error: null });
    const useMock = import.meta.env.VITE_USE_MOCK !== 'false';
    if (useMock) {
      set({
        draft: { ...MOCK_DRAFT, action_id: actionId },
        versions: MOCK_VERSIONS,
        loading: false,
        error: null,
      });
      return;
    }

    try {
      const [draftRes, versionsRes] = await Promise.all([
        getDraft(actionId),
        getDraftVersions(actionId),
      ]);
      set({
        draft: draftRes,
        versions: versionsRes,
        loading: false,
        error: null,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // 任务还没有草稿 —— 不是后端故障，按空态处理
        set({ draft: null, versions: [], loading: false, error: null });
        return;
      }
      set({
        loading: false,
        error: '草稿加载失败，请检查后端服务',
      });
    }
  },

  refineDraft: async (actionId: number, instruction: string) => {
    const useMock = import.meta.env.VITE_USE_MOCK !== 'false';
    const { draft, versions } = get();

    if (useMock) {
      const newVersionNum = (draft?.version || 1) + 1;
      const newSubject = draft?.subject.includes('[修正]')
        ? draft.subject
        : `${draft?.subject || '草稿'} [修正]`;
      const newBodyZh = `${draft?.body_zh || ''} (指令: ${instruction})`;
      const updatedDraft: DraftResponse = {
        ...(draft || MOCK_DRAFT),
        action_id: actionId,
        subject: newSubject,
        body_zh: newBodyZh,
        version: newVersionNum,
        updated_at: new Date().toISOString(),
      };
      const newVerItem: DraftVersionResponse = {
        version: newVersionNum,
        subject: newSubject,
        body_zh: newBodyZh,
        body_en: draft?.body_en || '',
        source: 'refine',
        updated_at: new Date().toISOString(),
      };
      set({
        draft: updatedDraft,
        versions: [...versions, newVerItem],
      });
      useToastStore.getState().showToast('success', 'AI 已按指令修正草稿');
      return;
    }

    try {
      const res = await apiRefineDraft(actionId, { instruction });
      const versionsRes = await getDraftVersions(actionId);
      set({ draft: res, versions: versionsRes });
      useToastStore.getState().showToast('success', 'AI 已按指令修正草稿');
    } catch {
      useToastStore.getState().showToast('error', '草稿修正失败，请重试');
    }
  },

  confirmDraft: async (actionId: number) => {
    const useMock = import.meta.env.VITE_USE_MOCK !== 'false';
    const { draft } = get();

    if (useMock) {
      if (draft) {
        set({ draft: { ...draft, status: 'confirmed' } });
      }
      useToastStore.getState().showToast('success', '草稿已确认，待发送');
      return;
    }

    try {
      const res = await apiConfirmDraft(actionId);
      set({ draft: res });
      useToastStore.getState().showToast('success', '草稿已确认，待发送');
    } catch {
      useToastStore.getState().showToast('error', '确认草稿失败，请重试');
    }
  },

  rollbackDraft: async (actionId: number, version: number) => {
    const useMock = import.meta.env.VITE_USE_MOCK !== 'false';
    const { draft, versions } = get();

    if (useMock) {
      const targetVer = versions.find((v) => v.version === version);
      if (targetVer && draft) {
        set({
          draft: {
            ...draft,
            subject: targetVer.subject,
            body_zh: targetVer.body_zh,
            body_en: targetVer.body_en,
            version: targetVer.version,
            updated_at: targetVer.updated_at,
          },
        });
      }
      useToastStore.getState().showToast('info', `已回退至版本 v${version}`);
      return;
    }

    try {
      const res = await apiRollbackDraft(actionId, version);
      const versionsRes = await getDraftVersions(actionId);
      set({ draft: res, versions: versionsRes });
      useToastStore.getState().showToast('info', `已回退至版本 v${version}`);
    } catch {
      useToastStore.getState().showToast('error', '版本回退失败，请重试');
    }
  },

  reset: () => set({ draft: null, versions: [], loading: false, error: null }),
}));
