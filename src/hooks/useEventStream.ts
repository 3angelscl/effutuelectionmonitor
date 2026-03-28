'use client';

/**
 * Client-side hook for the unified SSE event stream.
 *
 * Connects to /api/events and broadcasts received events
 * so that SWR hooks can revalidate on demand instead of polling.
 *
 * Usage:
 *   // In a layout or top-level component:
 *   const { connected, unreadCount } = useEventStream({
 *     onEvent: (event) => {
 *       if (event.type === 'results:submitted') mutateResults();
 *     },
 *   });
 *
 *   // Or use the global revalidation approach:
 *   const { connected, unreadCount } = useEventStream();
 *   // Then in any component, use useRealtimeSWR() instead of useSWR()
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { mutate as globalMutate } from 'swr';

export interface StreamEvent {
  type: string;
  payload?: Record<string, unknown>;
  timestamp: string;
  unreadCount?: number;
}

interface UseEventStreamOptions {
  /** Called for every event received */
  onEvent?: (event: StreamEvent) => void;
  /** Whether to auto-revalidate SWR keys based on event types. Default: true */
  autoRevalidate?: boolean;
}

/**
 * Map event types to SWR URL keys that should be revalidated.
 */
const EVENT_TO_SWR_KEYS: Record<string, string[]> = {
  'results:submitted': ['/api/stats', '/api/results'],
  'turnout:updated': ['/api/stats', '/api/snapshots'],
  'notification:new': ['/api/notifications'],
  'chat:message': ['/api/chat'],
  'incident:created': ['/api/incidents'],
  'incident:updated': ['/api/incidents'],
  'election:changed': ['/api/elections', '/api/elections/active', '/api/stats'],
  'station:updated': ['/api/stations', '/api/stats'],
  'agent:checkin': ['/api/agents/performance', '/api/agent/checkin'],
  'stats:updated': ['/api/stats'],
};

export function useEventStream(options?: UseEventStreamOptions) {
  const [connected, setConnected] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const autoRevalidate = options?.autoRevalidate !== false;

  const connect = useCallback(() => {
    // Close existing
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

        // Update unread count from heartbeats
        if (data.type === 'heartbeat' && typeof data.unreadCount === 'number') {
          setUnreadCount(data.unreadCount);
        }

        // Trigger callback
        if (optionsRef.current?.onEvent) {
          optionsRef.current.onEvent(data);
        }

        // Auto-revalidate relevant SWR keys
        if (autoRevalidate && data.type in EVENT_TO_SWR_KEYS) {
          const keys = EVENT_TO_SWR_KEYS[data.type];
          for (const key of keys) {
            // Revalidate exact match and any key that starts with this prefix
            globalMutate(
              (k) => typeof k === 'string' && k.startsWith(key),
              undefined,
              { revalidate: true },
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

      // Exponential backoff: 2s, 4s, 8s, 16s, max 30s
      const attempts = reconnectAttemptsRef.current;
      const delay = Math.min(2000 * Math.pow(2, attempts), 30000);
      reconnectAttemptsRef.current++;

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };
  }, [autoRevalidate]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [connect]);

  return { connected, unreadCount };
}
