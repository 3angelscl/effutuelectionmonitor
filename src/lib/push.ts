/**
 * Web Push notification service.
 *
 * Configure via environment variables:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY   — VAPID public key (also exposed to client)
 *   VAPID_PRIVATE_KEY              — VAPID private key (server-only)
 *   VAPID_SUBJECT                  — mailto: or https: contact URI
 */

import webpush from 'web-push';
import prisma from '@/lib/prisma';

let _initialized = false;

function init() {
  if (_initialized) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@effutu.gov.gh';
  if (!publicKey || !privateKey) return;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  _initialized = true;
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}

/** Send a push notification to a single subscription endpoint. Returns false if the subscription is stale. */
async function sendToEndpoint(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: PushPayload,
): Promise<boolean> {
  init();
  if (!_initialized) return false;
  try {
    await webpush.sendNotification(
      { endpoint, keys: { p256dh, auth } },
      JSON.stringify(payload),
    );
    return true;
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    // 404 / 410 means the subscription is gone — caller should delete it
    if (status === 404 || status === 410) return false;
    // Log but don't rethrow — push failures should never break the main flow
    console.error('[Push] send error:', (err as Error).message);
    return true; // keep subscription, may be a transient error
  }
}

/** Send a push notification to all active subscriptions for a user. Stale subscriptions are cleaned up automatically. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;

  const staleIds: string[] = [];
  await Promise.all(
    subs.map(async (sub) => {
      const ok = await sendToEndpoint(sub.endpoint, sub.p256dh, sub.auth, payload);
      if (!ok) staleIds.push(sub.id);
    }),
  );

  if (staleIds.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: staleIds } } });
  }
}

/** Send a push notification to all subscribed agents. */
export async function sendPushToAllAgents(payload: PushPayload): Promise<void> {
  const subs = await prisma.pushSubscription.findMany({
    where: { user: { role: 'AGENT', deletedAt: null } },
  });
  if (subs.length === 0) return;

  const staleIds: string[] = [];
  await Promise.all(
    subs.map(async (sub) => {
      const ok = await sendToEndpoint(sub.endpoint, sub.p256dh, sub.auth, payload);
      if (!ok) staleIds.push(sub.id);
    }),
  );

  if (staleIds.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: staleIds } } });
  }
}
