import { request } from '../http';
import { DraftResponse, DraftVersionResponse, DraftRefineRequest } from '../../types/api';

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
