/**
 * Server-side automatic check-out for agents.
 *
 * When an agent's SSE connection drops (browser closed, network down,
 * server restarted), a 5-minute countdown starts. If the agent does not
 * reconnect within that window, a CHECK_OUT record is written automatically.
 *
 * On server startup, agents with a stale CHECK_IN (> 5 min old, no SSE
 * reconnection) are also automatically checked out to clean up state left
 * behind by a previous server restart.
 */

import prisma from '@/lib/prisma';
import { broadcastEvent } from '@/lib/events';

const AUTO_CHECKOUT_DELAY_MS = 5 * 60 * 1000; // 5 minutes

// ── Pending timers ────────────────────────────────────────────────────────────
// Keyed by userId. Pinned to globalThis so hot-reloads don't leak timers.
const g = globalThis as unknown as {
  autoCheckoutTimers: Map<string, ReturnType<typeof setTimeout>> | undefined;
  autoCheckoutInitialised: boolean | undefined;
};

if (!g.autoCheckoutTimers) {
  g.autoCheckoutTimers = new Map();
}
const timers = g.autoCheckoutTimers;

// ── Public API ────────────────────────────────────────────────────────────────

/** Start a 5-minute countdown. If the agent reconnects, call cancelAutoCheckout. */
export function scheduleAutoCheckout(userId: string) {
  cancelAutoCheckout(userId);
  timers.set(
    userId,
    setTimeout(() => {
      timers.delete(userId);
      performAutoCheckout(userId).catch((err) =>
        console.error('[AutoCheckout] Error checking out agent:', userId, err),
      );
    }, AUTO_CHECKOUT_DELAY_MS),
  );
}

/** Cancel a pending countdown (call when agent reconnects or explicitly checks out). */
export function cancelAutoCheckout(userId: string) {
  const t = timers.get(userId);
  if (t) {
    clearTimeout(t);
    timers.delete(userId);
  }
}

// ── Core checkout logic ───────────────────────────────────────────────────────

async function performAutoCheckout(userId: string) {
  // Find agent's assigned station
  const station = await prisma.pollingStation.findFirst({
    where: { agentId: userId },
    select: { id: true, name: true, psCode: true },
  });
  if (!station) return;

  // Only write CHECK_OUT if the last record is a CHECK_IN
  const last = await prisma.agentCheckIn.findFirst({
    where: { userId, stationId: station.id },
    orderBy: { createdAt: 'desc' },
  });
  if (!last || last.type === 'CHECK_OUT') return;

  await prisma.agentCheckIn.create({
    data: { userId, stationId: station.id, type: 'CHECK_OUT' },
  });

  await prisma.activityLog.create({
    data: {
      userId,
      type: 'STATION_DEPARTURE',
      title: 'Auto checked out (disconnected)',
      detail: `${station.name} (${station.psCode}) — automatically checked out after 5 minutes without reconnection`,
      metadata: JSON.stringify({ stationId: station.id, auto: true }),
    },
  });

  broadcastEvent(
    'agent:checkin',
    { userId, stationId: station.id, type: 'CHECK_OUT', auto: true },
    { targetRoles: ['ADMIN'] },
  );

  console.info(`[AutoCheckout] Agent ${userId} auto checked-out from ${station.psCode}`);
}

// ── Startup cleanup ───────────────────────────────────────────────────────────
// Run once per server process to handle agents whose CHECK_IN was left open by
// a previous server restart (those SSE connections will never reconnect).

export async function checkoutStaleAgentsOnStartup() {
  if (g.autoCheckoutInitialised) return;
  g.autoCheckoutInitialised = true;

  try {
    const staleThreshold = new Date(Date.now() - AUTO_CHECKOUT_DELAY_MS);

    const stations = await prisma.pollingStation.findMany({
      where: { agentId: { not: null } },
      select: { id: true, agentId: true },
    });

    for (const station of stations) {
      if (!station.agentId) continue;
      const last = await prisma.agentCheckIn.findFirst({
        where: { userId: station.agentId, stationId: station.id },
        orderBy: { createdAt: 'desc' },
      });
      if (last && last.type === 'CHECK_IN' && last.createdAt < staleThreshold) {
        await performAutoCheckout(station.agentId);
      }
    }
  } catch (err) {
    console.error('[AutoCheckout] Startup cleanup error:', err);
  }
}
