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
 * `debounceMs` > 0 coalesces rapid-fire events: the revalidation is
 * scheduled once and reset on each new event, so 100 turnout events in
 * 2 s produce exactly 1 API call after the burst settles.
 * Events with debounceMs = 0 revalidate immediately (low-frequency).
 */
const EVENT_TO_SWR_KEYS: Record<string, { keys: string[]; debounceMs: number }> = {
  'turnout:updated':   { keys: ['/api/stats', '/api/snapshots'],                        debounceMs: 3000 },
  'results:submitted': { keys: ['/api/stats', '/api/results'],                          debounceMs: 2000 },
  'stats:updated':     { keys: ['/api/stats'],                                          debounceMs: 2000 },
  'station:updated':   { keys: ['/api/stations', '/api/stats'],                         debounceMs: 500  },
  'notification:new':  { keys: ['/api/notifications'],                                  debounceMs: 0    },
  'chat:message':      { keys: ['/api/chat'],                                           debounceMs: 0    },
  'incident:created':  { keys: ['/api/incidents'],                                      debounceMs: 0    },
  'incident:updated':  { keys: ['/api/incidents'],                                      debounceMs: 0    },
  'election:changed':  { keys: ['/api/elections', '/api/elections/active', '/api/stats'], debounceMs: 0  },
  'agent:checkin':     { keys: ['/api/agents/performance', '/api/agent/checkin'],        debounceMs: 0    },
};

export function useEventStream(options?: UseEventStreamOptions) {
  const [connected, setConnected] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const optionsRef = useRef(options);
  // Per-event-type debounce timers — keyed by event type
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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

        // Auto-revalidate relevant SWR keys (with per-type debouncing)
        if (autoRevalidate && data.type in EVENT_TO_SWR_KEYS) {
          const { keys, debounceMs } = EVENT_TO_SWR_KEYS[data.type];

          const flush = () => {
            for (const key of keys) {
              globalMutate(
                (k) => typeof k === 'string' && k.startsWith(key),
                undefined,
                { revalidate: true },
              );
            }
          };

          if (debounceMs === 0) {
            flush();
          } else {
            // Cancel any pending timer for this event type and reschedule
            const existing = debounceTimers.current.get(data.type);
            if (existing) clearTimeout(existing);
            debounceTimers.current.set(
              data.type,
              setTimeout(() => {
                debounceTimers.current.delete(data.type);
                flush();
              }, debounceMs),
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
      // Clear all pending debounce timers
      for (const t of debounceTimers.current.values()) clearTimeout(t);
      debounceTimers.current.clear();
    };
  }, [connect]);

  return { connected, unreadCount };
}
