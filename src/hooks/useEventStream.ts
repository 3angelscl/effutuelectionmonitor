'use client';

/**
 * Client-side hook for the unified SSE event stream.
 *
 * Connects to /api/events and broadcasts received events
 * so that SWR hooks can revalidate on demand instead of polling.
 */

import { useEffect, useRef, useState } from 'react';
import { mutate as globalMutate } from 'swr';

export interface StreamEvent {
  type: string;
  payload?: Record<string, unknown>;
  timestamp: string;
  unreadCount?: number;
}

interface UseEventStreamOptions {
  onEvent?: (event: StreamEvent) => void;
  autoRevalidate?: boolean;
  eventMap?: Partial<Record<string, { keys: string[]; debounceMs: number }>>;
}

const EVENT_TO_SWR_KEYS: Record<string, { keys: string[]; debounceMs: number }> = {
  'turnout:updated': { keys: ['/api/stats/live-summary', '/api/snapshots'], debounceMs: 3000 },
  'results:submitted': { keys: ['/api/stats/live-summary', '/api/stats', '/api/results'], debounceMs: 2000 },
  'stats:updated': { keys: ['/api/stats/live-summary', '/api/stats'], debounceMs: 2000 },
  'station:updated': { keys: ['/api/stations', '/api/stats/live-summary', '/api/stats'], debounceMs: 500 },
  'notification:new': { keys: ['/api/notifications'], debounceMs: 0 },
  'chat:message': { keys: ['/api/chat'], debounceMs: 0 },
  'incident:created': { keys: ['/api/incidents'], debounceMs: 0 },
  'incident:updated': { keys: ['/api/incidents'], debounceMs: 0 },
  'election:changed': { keys: ['/api/elections', '/api/elections/active', '/api/stats/live-summary', '/api/stats'], debounceMs: 0 },
  'agent:checkin': { keys: ['/api/agents/performance', '/api/agent/checkin'], debounceMs: 0 },
};

export function useEventStream(options?: UseEventStreamOptions) {
  const [connected, setConnected] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const optionsRef = useRef(options);
  const debounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const autoRevalidate = options?.autoRevalidate !== false;
  const eventMap = options?.eventMap ?? EVENT_TO_SWR_KEYS;

  useEffect(() => {
    const debounceTimers = debounceTimersRef.current;
    let disposed = false;

    const connect = () => {
      if (disposed) return;

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const es = new EventSource('/api/events');
      eventSourceRef.current = es;

      es.onopen = () => {
        setConnected(true);
        reconnectAttemptsRef.current = 0;
      };

      es.onmessage = (event) => {
        try {
          const data: StreamEvent = JSON.parse(event.data);

          if (data.type === 'heartbeat' && typeof data.unreadCount === 'number') {
            setUnreadCount(data.unreadCount);
          }

          if (optionsRef.current?.onEvent) {
            optionsRef.current.onEvent(data);
          }

          if (autoRevalidate && data.type in eventMap) {
            const eventConfig = eventMap[data.type];
            if (!eventConfig) return;

            const flush = () => {
              for (const key of eventConfig.keys) {
                globalMutate(
                  (cacheKey) => typeof cacheKey === 'string' && cacheKey.startsWith(key),
                  undefined,
                  { revalidate: true },
                );
              }
            };

            if (eventConfig.debounceMs === 0) {
              flush();
            } else {
              const existing = debounceTimers.get(data.type);
              if (existing) clearTimeout(existing);
              debounceTimers.set(
                data.type,
                setTimeout(() => {
                  debounceTimers.delete(data.type);
                  flush();
                }, eventConfig.debounceMs),
              );
            }
          }
        } catch {
          // Ignore parse errors
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        setConnected(false);

        const attempts = reconnectAttemptsRef.current;
        const delay = Math.min(2000 * Math.pow(2, attempts), 30000);
        reconnectAttemptsRef.current += 1;

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      };
    };

    connect();

    return () => {
      disposed = true;

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      for (const timer of debounceTimers.values()) clearTimeout(timer);
      debounceTimers.clear();
    };
  }, [autoRevalidate, eventMap]);

  return { connected, unreadCount };
}
