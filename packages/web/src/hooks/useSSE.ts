import { useEffect, useRef, useCallback } from 'react';

export type SSEEvent =
  | { type: 'generating' }
  | { type: 'story_complete'; storyId: string; title: string; pageCount: number }
  | { type: 'error'; message: string; recoverable: boolean };

export function useSSE(storyId: string | null, onEvent: (e: SSEEvent) => void) {
  const esRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const close = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
  }, []);

  useEffect(() => {
    if (!storyId) return;
    close();

    const es = new EventSource(`/api/stories/${storyId}/events`, { withCredentials: true });
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as SSEEvent;
        onEventRef.current(data);
        if (data.type === 'story_complete' || data.type === 'error') {
          es.close();
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      onEventRef.current({ type: 'error', message: 'Connection lost. Please try again.', recoverable: true });
      es.close();
    };

    return close;
  }, [storyId, close]);

  return { close };
}
