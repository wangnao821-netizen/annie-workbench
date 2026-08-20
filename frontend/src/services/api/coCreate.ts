import { request } from '../http';
import { CoCreateChatRequest, CoCreateResponse } from '../../types/api';

export function sendCoCreateChat(body: CoCreateChatRequest): Promise<CoCreateResponse> {
  return request<CoCreateResponse>('/api/agent/co-create/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
