/**
 * Centralised admin notification helper.
 *
 * Creates in-app DB notifications for every ADMIN / OFFICER user,
 * fires per-user web-push messages, and broadcasts a real-time SSE
 * event so open browser tabs update instantly — all in a fire-and-
 * forget pattern that never blocks the calling API route.
 */

import prisma from '@/lib/prisma';
import { sendPushToUser, type PushPayload } from '@/lib/push';
import { broadcastEvent } from '@/lib/events';

type NotificationType = 'RESULT_SUBMITTED' | 'ALERT' | 'SYSTEM' | 'CHAT' | 'BROADCAST';

export interface AdminNotifyOptions {
  type: NotificationType;
  title: string;
  message?: string;
  link?: string;
  /** Override the push payload. Defaults to title + message. */
  push?: Omit<PushPayload, 'tag'> & { tag?: string };
}

/**
 * Notify all ADMIN and OFFICER users of an event.
 *
 * Safe to call fire-and-forget:
 *   notifyAdmins({ ... }).catch(() => {});
 */
export async function notifyAdmins(opts: AdminNotifyOptions): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'OFFICER'] }, deletedAt: null },
    select: { id: true },
  });

  if (admins.length === 0) return;

  // Persist DB notification for every admin
  await prisma.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      type: opts.type,
      title: opts.title,
      message: opts.message ?? null,
      link: opts.link ?? null,
    })),
  });

  const pushPayload: PushPayload = {
    title: opts.push?.title ?? opts.title,
    body: opts.push?.body ?? opts.message,
    url: opts.push?.url ?? opts.link,
    tag: opts.push?.tag ?? opts.type,
  };

  // Push + SSE per admin — all fire-and-forget
  await Promise.all(
    admins.map(async (admin) => {
      // Web push (non-blocking — failures are swallowed)
      sendPushToUser(admin.id, pushPayload).catch(() => {});

      // SSE so any open admin tab picks it up instantly
      broadcastEvent(
        'notification:new',
        { userId: admin.id, type: opts.type },
        { targetUserId: admin.id },
      );
    }),
  );
}
