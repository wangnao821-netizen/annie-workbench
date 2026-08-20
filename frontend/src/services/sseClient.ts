import { getApiBaseUrl } from './http';

export interface ServerEvent {
  type: 'task_created' | 'task_updated' | 'case_updated' | 'file_discovered' | 'heartbeat' | string;
  data: Record<string, unknown>;
}

export function subscribeEvents(
  onEvent: (e: ServerEvent) => void,
  onStatusChange?: (connected: boolean) => void
): () => void {
  const isMock = import.meta.env.VITE_USE_MOCK !== 'false';
  if (isMock) {
    onStatusChange?.(false);
    return () => {};
  }

  let es: EventSource | null = null;
  let retryCount = 0;
  let isClosed = false;

  (async () => {
    try {
      const BASE_URL = await getApiBaseUrl();
      if (isClosed) return;

      es = new EventSource(`${BASE_URL}/api/events/stream`);

      es.onopen = () => {
        retryCount = 0;
        onStatusChange?.(true);
      };

      es.onmessage = (msg) => {
        try {
          const event: ServerEvent = JSON.parse(msg.data);
          onEvent(event);
        } catch {
          /* ignore parse errors */
        }
      };

      es.onerror = () => {
        onStatusChange?.(false);
        retryCount++;
        // Stop continuous retry spam if server is unreachable after consecutive fails
        if (retryCount >= 3 && es) {
          es.close();
          es = null;
        }
      };
    } catch {
      onStatusChange?.(false);
    }
  })();

  return () => {
    isClosed = true;
    if (es) {
      es.close();
      es = null;
    }
  };
}

