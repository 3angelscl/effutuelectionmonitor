/**
 * User presence tracking.
 *
 * A user is considered "online" if they have at least one active SSE
 * connection open (see `src/app/api/events/route.ts`). The SSE route
 * increments/decrements this map as connections open and close.
 *
 * Pinned to globalThis so the map survives hot-reloads and shared bundles.
 */

const g = globalThis as unknown as {
  sseConnections: Map<string, number> | undefined;
};
if (!g.sseConnections) g.sseConnections = new Map();

const sseConnections: Map<string, number> = g.sseConnections;

/** Record a new SSE connection for the given user. Returns the new count. */
export function addConnection(userId: string): number {
  const next = (sseConnections.get(userId) ?? 0) + 1;
  sseConnections.set(userId, next);
  return next;
}

/** Remove one SSE connection for the given user. Returns the remaining count. */
export function removeConnection(userId: string): number {
  const remaining = Math.max(0, (sseConnections.get(userId) ?? 1) - 1);
  if (remaining === 0) sseConnections.delete(userId);
  else sseConnections.set(userId, remaining);
  return remaining;
}

/** The set of userIds with at least one open SSE connection. */
export function getOnlineUserIds(): Set<string> {
  const ids = new Set<string>();
  for (const [id, count] of sseConnections.entries()) {
    if (count > 0) ids.add(id);
  }
  return ids;
}
