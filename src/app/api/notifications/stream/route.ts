import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { eventBus, ServerEvent } from '@/lib/events';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userId = (session.user as { id: string; role: string }).id;
  const userRole = (session.user as { id: string; role: string }).role;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Stream closed
        }
      };

      // Send initial notification count on connect
      prisma.notification
        .count({ where: { userId, isRead: false } })
        .then((unreadCount) => {
          sendEvent({ unreadCount, latest: null });
        })
        .catch(() => {
          // Ignore DB errors on initial load
        });

      // Subscribe to EventBus for real-time notification events
      const unsubscribe = eventBus.subscribe((event: ServerEvent) => {
        // Only forward notification events targeted at this user
        if (event.type !== 'notification:new') return;

        // Check targeting: if event targets a specific user, only send to that user
        if (event.targetUserId && event.targetUserId !== userId) return;

        // Check role targeting
        if (event.targetRoles && !event.targetRoles.includes(userRole)) return;

        // Fetch fresh unread count and latest notification
        prisma.notification
          .count({ where: { userId, isRead: false } })
          .then(async (unreadCount) => {
            const latest = await prisma.notification.findFirst({
              where: { userId, isRead: false },
              orderBy: { createdAt: 'desc' },
              select: { id: true, type: true, title: true, message: true },
            });
            sendEvent({
              unreadCount,
              latest: latest
                ? { id: latest.id, type: latest.type, title: latest.title, message: latest.message }
                : null,
            });
          })
          .catch(() => {
            // Ignore DB errors
          });
      });

      // Send periodic heartbeat to keep connection alive (every 30s)
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
          unsubscribe();
        }
      }, 30000);

      // Clean up when stream is cancelled
      const originalCancel = controller.close.bind(controller);
      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };

      // Use AbortSignal if available, otherwise rely on error handling
      try {
        controller.enqueue(encoder.encode(': connected\n\n'));
      } catch {
        cleanup();
      }

      // Store cleanup for when the stream errors out
      (controller as unknown as { _cleanup: () => void })._cleanup = cleanup;
    },
    cancel() {
      // Stream was cancelled by the client
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
