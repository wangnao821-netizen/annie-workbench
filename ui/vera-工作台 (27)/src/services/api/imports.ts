import { request } from '../http';
import { ImportRecord } from '../../types/api';

export function listImports(params?: { source?: string; limit?: number }): Promise<ImportRecord[]> {
  const q = new URLSearchParams();
  if (params?.source) q.set('source', params.source);
  if (params?.limit) q.set('limit', String(params.limit));
  const qs = q.toString();
  return request<ImportRecord[]>(`/api/imports/${qs ? `?${qs}` : ''}`);
}
