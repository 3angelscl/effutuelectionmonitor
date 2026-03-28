'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface NotificationEvent {
  unreadCount: number;
  latest: {
    id: string;
    type: string;
    title: string;
    message: string | null;
  } | null;
}

interface UseNotificationStreamOptions {
  onNotification?: (event: NotificationEvent) => void;
}

export function useNotificationStream(options?: UseNotificationStreamOptions) {
  const [unreadCount, setUnreadCount] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onNotificationRef = useRef(options?.onNotification);

  // Keep the callback ref up to date without re-triggering the effect
  useEffect(() => {
    onNotificationRef.current = options?.onNotification;
  }, [options?.onNotification]);

  const connect = useCallback(() => {
    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource('/api/notifications/stream');
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data: NotificationEvent = JSON.parse(event.data);
        setUnreadCount(data.unreadCount);
        if (onNotificationRef.current) {
          onNotificationRef.current(data);
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;

      // Auto-reconnect after 5 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 5000);
    };
  }, []);

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

  return { unreadCount };
}
