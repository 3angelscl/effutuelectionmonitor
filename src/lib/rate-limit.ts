import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

interface RateLimiterOptions {
  /** Time window in milliseconds */
  windowMs: number;
  /** Max requests per window */
  max: number;
}

/**
 * Creates a rate limiter backed by Upstash Redis if credentials are provided in the environment.
 * Falls back to an in-memory sliding window for single-process local development.
 * 
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
 *   const { success } = await limiter.check(key);
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const { windowMs, max } = options;

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const redis = Redis.fromEnv();
    // Upstash Ratelimit parses strings like "10 s" or "15 m". We convert incoming windowMs to seconds.
    const windowSeconds = Math.max(1, Math.floor(windowMs / 1000));
    
    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(max, `${windowSeconds} s`),
      analytics: false,
    });

    return {
      async check(key: string): Promise<{ success: boolean; remaining: number; resetAt: number }> {
        const result = await limiter.limit(key);
        return {
          success: result.success,
          remaining: result.remaining,
          resetAt: result.reset,
        };
      },
    };
  }

  // Graceful Fallback: Local In-Memory Rate Limiter
  console.warn('[RateLimit] Upstash Redis credentials not found. Falling back to local in-memory rate limiter.');
  
  interface RateLimitEntry {
    count: number;
    resetAt: number;
  }
  
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
    async check(key: string): Promise<{ success: boolean; remaining: number; resetAt: number }> {
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
