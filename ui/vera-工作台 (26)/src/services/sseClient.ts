export interface ServerEvent {
  type: 'task_created' | 'task_updated' | 'case_updated' | 'heartbeat';
  data: Record<string, unknown>;
}

export function subscribeEvents(
  onEvent: (e: ServerEvent) => void,
  onStatusChange?: (connected: boolean) => void
): () => void {
  const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  
  let es: EventSource | null = null;
  try {
    es = new EventSource(`${BASE_URL}/api/events/stream`);

    es.onopen = () => {
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
      console.warn('[SSE] Connection lost, reconnecting...');
    };
  } catch (err) {
    onStatusChange?.(false);
    console.warn('[SSE] Failed to initialize EventSource:', err);
  }

  return () => {
    if (es) {
      es.close();
    }
  };
}

