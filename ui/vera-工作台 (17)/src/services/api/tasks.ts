import { request } from '../http';
import { TaskResponse, DispatchRequest, DelegateRequest, BossReplyRequest } from '../../types/api';

export type TaskFilter = 'today' | 'urgent' | 'all' | 'delegated';

export function listTasks(filter?: TaskFilter): Promise<TaskResponse[]> {
  const query = filter ? `?filter=${filter}` : '';
  return request<TaskResponse[]>(`/api/tasks/${query}`);
}

export function dispatchTask(taskId: number, body: DispatchRequest): Promise<TaskResponse> {
  return request<TaskResponse>(`/api/tasks/${taskId}/dispatch`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function delegateTask(taskId: number, body: DelegateRequest): Promise<TaskResponse> {
  return request<TaskResponse>(`/api/tasks/${taskId}/delegate`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function bossReply(taskId: number, body: BossReplyRequest): Promise<TaskResponse> {
  return request<TaskResponse>(`/api/tasks/${taskId}/boss-reply`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
