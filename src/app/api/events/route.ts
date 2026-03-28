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
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const user = session.user as { id: string; role: string };
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let alive = true;

      const send = (data: unknown) => {
        if (!alive) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          alive = false;
        }
      };

      // ── Subscribe to event bus ────────────────────────────
      const unsubscribe = eventBus.subscribe((event: ServerEvent) => {
        if (!alive) return;

        // Filter: if event targets a specific user, skip others
        if (event.targetUserId && event.targetUserId !== user.id) return;

        // Filter: if event targets specific roles, skip non-matching
        if (event.targetRoles && !event.targetRoles.includes(user.role)) return;

        send({ type: event.type, payload: event.payload, timestamp: event.timestamp });
      });

      // ── Heartbeat + notification polling ──────────────────
      // Still poll notifications every 10s as a fallback,
      // but the event bus delivers instant pushes for most events.
      const heartbeat = setInterval(async () => {
        if (!alive) {
          clearInterval(heartbeat);
          return;
        }

        try {
          const unreadCount = await prisma.notification.count({
            where: { userId: user.id, isRead: false },
          });

          send({ type: 'heartbeat', unreadCount, timestamp: new Date().toISOString() });
        } catch {
          // DB error — just skip this heartbeat
        }
      }, 10000);

      // Send initial connection event
      send({ type: 'connected', userId: user.id, role: user.role, timestamp: new Date().toISOString() });

      // Cleanup when client disconnects
      const cleanup = () => {
        alive = false;
        clearInterval(heartbeat);
        unsubscribe();
      };

      // ReadableStream cancel handler
      controller.close = new Proxy(controller.close, {
        apply(target, thisArg, args) {
          cleanup();
          return Reflect.apply(target, thisArg, args);
        },
      });

      // Also set up an abort check
      const checkAlive = setInterval(() => {
        if (!alive) {
          clearInterval(checkAlive);
          cleanup();
        }
      }, 30000);
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
