import { request } from '../http';
import { ChatRequest, ChatResponse, ChatMessageResponse } from '../../types/api';

export function sendChat(body: ChatRequest): Promise<ChatResponse> {
  return request<ChatResponse>('/api/chat/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getChatHistory(caseId: string): Promise<ChatMessageResponse[]> {
  return request<ChatMessageResponse[]>(`/api/chat/${encodeURIComponent(caseId)}/history`);
}
