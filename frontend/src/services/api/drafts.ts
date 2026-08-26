import { request } from '../http';
import { DraftResponse, DraftVersionResponse, DraftRefineRequest, DraftListItem } from '../../types/api';

export function listDrafts(params?: { case_id?: string; status?: string; limit?: number }): Promise<DraftListItem[]> {
  const q = new URLSearchParams();
  if (params?.case_id) q.set('case_id', params.case_id);
  if (params?.status) q.set('status', params.status);
  if (params?.limit) q.set('limit', String(params.limit));
  const qs = q.toString();
  return request<DraftListItem[]>(`/api/drafts/${qs ? `?${qs}` : ''}`);
}

export function getDraftById(draftId: number): Promise<DraftResponse> {
  return request<DraftResponse>(`/api/drafts/by-id/${draftId}`);
}

export function getDraft(actionId: number): Promise<DraftResponse> {
  return request<DraftResponse>(`/api/drafts/${actionId}`);
}

export function refineDraft(actionId: number, body: DraftRefineRequest): Promise<DraftResponse> {
  return request<DraftResponse>(`/api/drafts/${actionId}/refine`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function confirmDraft(actionId: number): Promise<DraftResponse> {
  return request<DraftResponse>(`/api/drafts/${actionId}/confirm`, {
    method: 'POST',
  });
}

export function getDraftVersions(actionId: number): Promise<DraftVersionResponse[]> {
  return request<DraftVersionResponse[]>(`/api/drafts/${actionId}/versions`);
}

export function rollbackDraft(actionId: number, version: number): Promise<DraftResponse> {
  return request<DraftResponse>(`/api/drafts/${actionId}/rollback`, {
    method: 'POST',
    body: JSON.stringify({ version }),
  });
}

export function createManualDraft(body: { case_id: string; subject: string; body: string; track?: string }): Promise<DraftListItem> {
  return request<DraftListItem>('/api/drafts', {
    method: 'POST',
    body: JSON.stringify({
      case_id: body.case_id,
      subject: body.subject,
      body: body.body,
      track: body.track,
      draft_type: 'manual',
    }),
  });
}

