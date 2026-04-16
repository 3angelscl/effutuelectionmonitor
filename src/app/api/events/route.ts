/**
 * Unified Server-Sent Events endpoint.
 *
 * Clients connect once and receive all relevant real-time events
 * (results, turnout, notifications, chat, incidents, etc.)
 * filtered by their user ID and role.
 *
 * Replaces per-resource polling with push-based updates.
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { eventBus, ServerEvent } from '@/lib/events';
import {
  scheduleAutoCheckout,
  cancelAutoCheckout,
  checkoutStaleAgentsOnStartup,
} from '@/lib/auto-checkout';
import { addConnection, removeConnection } from '@/lib/presence';

// Run startup cleanup once - handles stale CHECK_INs from previous server restarts
checkoutStaleAgentsOnStartup();

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const user = session.user as { id: string; role: string };
  const encoder = new TextEncoder();

  // Track this connection (for presence). For agents, also cancel any pending
  // auto-checkout since a live SSE connection means the agent is present.
  addConnection(user.id);
  if (user.role === 'AGENT') {
    cancelAutoCheckout(user.id);
  }

  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let alive = true;
      let cleanedUp = false;

      const send = (data: unknown) => {
        if (!alive) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          alive = false;
        }
      };

      const unsubscribe = eventBus.subscribe((event: ServerEvent) => {
        if (!alive) return;

        // Filter: if event targets a specific user, skip others
        if (event.targetUserId && event.targetUserId !== user.id) return;

        // Filter: if event targets specific roles, skip non-matching
        if (event.targetRoles && !event.targetRoles.includes(user.role)) return;

        send({ type: event.type, payload: event.payload, timestamp: event.timestamp });
      });

      // Sends a lightweight ping every 25s to keep the TCP connection alive.
      // Notification counts are pushed via the event bus (notification:new)
      // rather than polled here, so no DB query is needed per heartbeat.
      const heartbeat = setInterval(() => {
        if (!alive) {
          cleanup();
          return;
        }
        send({ type: 'heartbeat', timestamp: new Date().toISOString() });
      }, 25000);

      // Send initial connection event
      send({ type: 'connected', userId: user.id, role: user.role, timestamp: new Date().toISOString() });

      const handleAbort = () => {
        cleanup();
      };

      // Periodic check to detect disconnected clients and clean up resources.
      // When a send() fails (client disconnected), alive is set to false,
      // and this interval detects it and runs cleanup.
      const checkAlive = setInterval(() => {
        if (!alive) {
          cleanup();
        }
      }, 30000);

      // Cleanup all timers and subscriptions
      cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;

        alive = false;
        clearInterval(heartbeat);
        clearInterval(checkAlive);
        unsubscribe();
        request.signal.removeEventListener('abort', handleAbort);

        // Decrement connection count; schedule auto-checkout (agents only)
        // when the last tab closes.
        const remaining = removeConnection(user.id);
        if (remaining === 0 && user.role === 'AGENT') {
          scheduleAutoCheckout(user.id);
        }
      };

      request.signal.addEventListener('abort', handleAbort, { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
