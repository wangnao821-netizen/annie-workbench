import { request } from '../http';
import {
  CaseResponse,
  ChecklistItemResponse,
  TimelineEventResponse,
  CaseFileResponse,
  SubmissionCheckResponse,
  CreateCaseRequest,
  CreateCaseResponse,
  ArchivedCase,
  CaseContext,
  ContextEventRequest,
  ContextEventResponse,
} from '../../types/api';

export function listCases(stage?: string): Promise<CaseResponse[]> {
  const query = stage ? `?stage=${encodeURIComponent(stage)}` : '';
  return request<CaseResponse[]>(`/api/cases/${query}`);
}

export function listArchivedCases(limit = 100): Promise<ArchivedCase[]> {
  return request<ArchivedCase[]>(`/api/cases/archived/?limit=${limit}`);
}

export function createCase(body: CreateCaseRequest): Promise<CreateCaseResponse> {
  return request<CreateCaseResponse>('/api/cases/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getCase(caseId: string): Promise<CaseResponse> {
  return request<CaseResponse>(`/api/cases/${encodeURIComponent(caseId)}`);
}

export function getChecklist(caseId: string): Promise<ChecklistItemResponse[]> {
  return request<ChecklistItemResponse[]>(`/api/cases/${encodeURIComponent(caseId)}/checklist`);
}

export function confirmChecklistItem(caseId: string, itemId: string): Promise<ChecklistItemResponse> {
  return request<ChecklistItemResponse>(`/api/cases/${encodeURIComponent(caseId)}/checklist/${encodeURIComponent(itemId)}/confirm`, {
    method: 'POST',
  });
}

export function revokeChecklistItem(caseId: string, itemId: string): Promise<ChecklistItemResponse> {
  return request<ChecklistItemResponse>(`/api/cases/${encodeURIComponent(caseId)}/checklist/${encodeURIComponent(itemId)}/revoke`, {
    method: 'POST',
  });
}

export function getTimeline(caseId: string): Promise<TimelineEventResponse[]> {
  return request<TimelineEventResponse[]>(`/api/cases/${encodeURIComponent(caseId)}/timeline`);
}

export function getCaseFiles(caseId: string): Promise<CaseFileResponse[]> {
  return request<CaseFileResponse[]>(`/api/cases/${encodeURIComponent(caseId)}/files`);
}

export function getSubmissionCheck(caseId: string): Promise<SubmissionCheckResponse> {
  return request<SubmissionCheckResponse>(`/api/cases/${encodeURIComponent(caseId)}/submission-check`);
}

export function getCaseContext(caseId: string): Promise<CaseContext> {
  return request<CaseContext>(`/api/cases/${encodeURIComponent(caseId)}/context`);
}

export function createContextEvent(caseId: string, body: ContextEventRequest): Promise<ContextEventResponse> {
  return request<ContextEventResponse>(`/api/cases/${encodeURIComponent(caseId)}/context-events`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

