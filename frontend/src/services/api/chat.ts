import { request, getApiBaseUrl, ApiError } from '../http';
import { ChatRequest, ChatResponse, ChatMessageResponse, CardActionRequest, CardActionResponse, ToolCard } from '../../types/api';

export interface ChatStreamStepData {
  label: string;
  status: 'running' | 'generating' | 'done' | string;
}

export interface ChatStreamToolStartData {
  tool: string;
  label: string;
}

export interface ChatStreamTextChunkData {
  chunk: string;
}

export interface ChatStreamDoneData {
  reply: string;
  tool_cards?: ToolCard[];
  recorded_facts?: any[];
  suggested_actions?: string[];
}

export interface ChatStreamErrorData {
  error: string;
  detail?: string;
}

export type ChatStreamEvent =
  | { event: 'step'; data: ChatStreamStepData }
  | { event: 'tool_start'; data: ChatStreamToolStartData }
  | { event: 'text_chunk'; data: ChatStreamTextChunkData }
  | { event: 'done'; data: ChatStreamDoneData }
  | { event: 'error'; data: ChatStreamErrorData };

export interface ChatStreamCallbacks {
  onStep?: (label: string, status: string) => void;
  onToolStart?: (tool: string, label: string) => void;
  onTextChunk?: (chunk: string) => void;
  onDone?: (data: ChatResponse) => void;
  onError?: (err: Error) => void;
}

function dispatchStreamEvent(event: string, data: any, callbacks: ChatStreamCallbacks) {
  switch (event) {
    case 'step':
      callbacks.onStep?.(data.label || '', data.status || '');
      break;
    case 'tool_start':
      callbacks.onToolStart?.(data.tool || '', data.label || '');
      break;
    case 'text_chunk':
      callbacks.onTextChunk?.(data.chunk || '');
      break;
    case 'done':
      callbacks.onDone?.({
        reply: data.reply || '',
        suggested_actions: data.suggested_actions || [],
        tool_cards: data.tool_cards || [],
      });
      break;
    case 'error': {
      const errMsg = data.error || data.detail || '流处理错误';
      callbacks.onError?.(new ApiError(0, errMsg));
      break;
    }
    default:
      if (data.chunk !== undefined) {
        callbacks.onTextChunk?.(data.chunk);
      } else if (data.reply !== undefined) {
        callbacks.onDone?.({
          reply: data.reply,
          suggested_actions: data.suggested_actions || [],
          tool_cards: data.tool_cards || [],
        });
      } else if (data.tool && data.label) {
        callbacks.onToolStart?.(data.tool, data.label);
      } else if (data.label && data.status) {
        callbacks.onStep?.(data.label, data.status);
      }
      break;
  }
}

export async function sendChatStream(
  body: ChatRequest,
  callbacks: ChatStreamCallbacks
): Promise<void> {
  const base = await getApiBaseUrl();
  const url = `${base}/api/chat/stream`;

  console.log(`[HTTP Stream Request] POST /api/chat/stream`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorDetail = 'Unknown Error';
      try {
        const errJson = await response.json();
        errorDetail = errJson.detail || errJson.message || response.statusText;
      } catch {
        errorDetail = response.statusText;
      }
      const err = new ApiError(response.status, errorDetail);
      callbacks.onError?.(err);
      throw err;
    }

    if (!response.body) {
      const err = new ApiError(0, '响应体为空');
      callbacks.onError?.(err);
      throw err;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    const processBlock = (block: string) => {
      if (!block.trim()) return;
      let currentEvent = '';
      let currentData = '';

      const lines = block.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.slice(6).trim();
        } else if (trimmed.startsWith('data:')) {
          const dataContent = trimmed.slice(5).trim();
          currentData += dataContent;
        }
      }

      if (!currentData) return;

      try {
        const parsed = JSON.parse(currentData);
        dispatchStreamEvent(currentEvent, parsed, callbacks);
      } catch (e) {
        console.warn('[SSE] Failed to parse SSE json data:', currentData, e);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const normalizedBuffer = buffer.replace(/\r\n/g, '\n');
      const parts = normalizedBuffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const block of parts) {
        processBlock(block);
      }
    }

    if (buffer.trim()) {
      processBlock(buffer);
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    const err = error instanceof Error ? error : new ApiError(0, String(error));
    callbacks.onError?.(err);
    throw err;
  }
}

export function sendChat(body: ChatRequest): Promise<ChatResponse> {
  return request<ChatResponse>('/api/chat/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getChatHistory(caseId: string): Promise<ChatMessageResponse[]> {
  return request<ChatMessageResponse[]>(`/api/chat/${encodeURIComponent(caseId)}/history`);
}

export function sendCardAction(body: CardActionRequest): Promise<CardActionResponse> {
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    const cleanKey = body.flow_key.replace(/^flow_/, '');
    const cardType = `flow_${cleanKey}`;
    const isConfirm = body.action === 'confirm';
    const nextVer = body.action === 'branch' ? 'V1-B' : body.action === 'version' ? 'V2' : 'V1';
    const branchLabel = body.branch_label || (body.action === 'branch' ? 'B' : 'main');

    return Promise.resolve({
      reply: isConfirm ? '已将所选沟通草稿确认并入库存入草稿箱。' : '已为你生成新版本的共创沟通草稿，请查看。',
      presentation: 'dialog',
      tool_cards: [
        {
          type: cardType as any,
          title: cleanKey === 'chaser' ? '补件催件流程' : cleanKey === 'os_reply' ? 'OS 审贷回复流程' : '跟进沟通流程',
          payload: {
            schema_version: 1,
            card_type: 'draft_email',
            action: body.action,
            status: isConfirm ? 'confirmed_draft' : 'draft',
            state: {
              version: nextVer,
              branch_label: branchLabel,
              message_id: body.parent_message_id ? String(body.parent_message_id) : 'msg-12',
            },
            result: {
              versions: [
                {
                  version: 'V1',
                  branch_label: 'main',
                  message_id: 'msg-12',
                  subject: (body.extra?.subject as string) || 'Follow-up on Application',
                  body: (body.extra?.body as string) || 'Dear Assessor,\n\nPlease find attached details.',
                },
                ...(body.action !== 'confirm'
                  ? [
                      {
                        version: nextVer,
                        branch_label: branchLabel,
                        message_id: 'msg-13',
                        subject: (body.extra?.subject as string) || 'Follow-up on Application',
                        body: (body.extra?.body as string)
                          ? `${body.extra?.body}\n\n[Updated ${body.action === 'branch' ? 'Branch B' : 'Version 2'}]`
                          : 'Dear Assessor,\n\nHere is the updated version.',
                      },
                    ]
                  : []),
              ],
            },
          },
        },
      ],
    });
  }

  return request<CardActionResponse>('/api/agent/cards/action', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

