/**
 * Server-side event bus for real-time broadcasting.
 *
 * In-process pub/sub — when any API mutates data, it calls
 * `broadcastEvent()` to push updates to all connected SSE clients.
 *
 * Architecture:
 *   API route mutates data  →  broadcastEvent('results:updated', payload)
 *   SSE endpoint            →  streams events to connected clients
 *   Client useEventStream() →  receives events, triggers SWR revalidation
 */

export type EventType =
  | 'stats:updated'
  | 'results:submitted'
  | 'results:approved'
  | 'turnout:updated'
  | 'notification:new'
  | 'chat:message'
  | 'incident:created'
  | 'incident:updated'
  | 'election:changed'
  | 'station:updated'
  | 'agent:checkin';

export interface ServerEvent {
  type: EventType;
  payload?: Record<string, unknown>;
  timestamp: string;
  /** If set, only this user receives the event */
  targetUserId?: string;
  /** If set, only these roles receive the event */
  targetRoles?: string[];
}

type Listener = (event: ServerEvent) => void;

class EventBus {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: ServerEvent) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener threw — remove it
        this.listeners.delete(listener);
      }
    }
  }

  get connectionCount() {
    return this.listeners.size;
  }
}

// Singleton — pinned to globalThis so it survives across:
//   - hot-reloads in dev
//   - multiple webpack chunks that each bundle this module separately in prod
const globalForEvents = globalThis as unknown as { eventBus: EventBus | undefined };
if (!globalForEvents.eventBus) {
  globalForEvents.eventBus = new EventBus();
}
export const eventBus = globalForEvents.eventBus;

/**
 * Broadcast an event to all connected SSE clients.
 *
 * Call this from any API route after a mutation:
 *   await broadcastEvent('results:submitted', { stationId, electionId });
 */
export function broadcastEvent(
  type: EventType,
  payload?: Record<string, unknown>,
  options?: { targetUserId?: string; targetRoles?: string[] },
) {
  eventBus.publish({
    type,
    payload,
    timestamp: new Date().toISOString(),
    targetUserId: options?.targetUserId,
    targetRoles: options?.targetRoles,
  });
}
