import { request } from '../http';
import { InboxMessageResponse } from '../../types/api';

export function listInbox(): Promise<InboxMessageResponse[]> {
  return request<InboxMessageResponse[]>('/api/inbox/');
}

export function analyzeEmail(msgId: string): Promise<InboxMessageResponse> {
  return request<InboxMessageResponse>(`/api/inbox/${encodeURIComponent(msgId)}/analyze`, {
    method: 'POST',
  });
}

export function muteSender(msgId: string): Promise<InboxMessageResponse> {
  return request<InboxMessageResponse>(`/api/inbox/${encodeURIComponent(msgId)}/mute`, {
    method: 'POST',
  });
}
