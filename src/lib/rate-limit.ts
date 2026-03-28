/**
 * Simple in-memory rate limiter.
 * Tracks requests per key (e.g. IP or email) within a sliding window.
 *
 * ⚠️  SINGLE-PROCESS ONLY — counters are stored in Node.js heap memory.
 *     In a multi-process deployment (PM2 cluster, Kubernetes replicas, etc.)
 *     each process maintains independent counters, so a client can multiply
 *     their effective rate by the number of running processes.
 *     For horizontally-scaled production use, replace with a Redis-backed
 *     implementation (e.g. @upstash/ratelimit with a Lua sliding-window script).
 *
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
 *   const { success } = limiter.check(key);
 *   if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimiterOptions {
  /** Time window in milliseconds */
  windowMs: number;
  /** Max requests per window */
  max: number;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const { windowMs, max } = options;
  const store = new Map<string, RateLimitEntry>();

  // Clean up expired entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref();

  return {
    check(key: string): { success: boolean; remaining: number; resetAt: number } {
      const now = Date.now();
      const entry = store.get(key);

      if (!entry || now > entry.resetAt) {
        // New window
        store.set(key, { count: 1, resetAt: now + windowMs });
        return { success: true, remaining: max - 1, resetAt: now + windowMs };
      }

      entry.count++;
      if (entry.count > max) {
        return { success: false, remaining: 0, resetAt: entry.resetAt };
      }

      return { success: true, remaining: max - entry.count, resetAt: entry.resetAt };
    },
  };
}
