import "server-only";

/**
 * Rate limiting.
 *
 * Production: a fixed-window counter in Upstash Redis (shared by every Vercel
 * instance), called over Upstash's REST API so it works in Node and Edge
 * runtimes without an SDK. Set UPSTASH_REDIS_REST_URL and
 * UPSTASH_REDIS_REST_TOKEN to enable it.
 *
 * Without those variables (local dev, tests) it falls back to an in-memory
 * counter, which only limits a single server instance.
 *
 * Cost: one Redis round trip (two pipelined commands) per protected request,
 * and only form submissions, uploads, logins and search use it, which stays
 * well inside Upstash's free tier for this site's traffic.
 */

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

export type RateLimitConfig = {
  /** Unique identifier for this limiter (e.g. "log-search", "submit-lead") */
  id: string;
  /** Maximum requests allowed within the window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
};

export type RateLimitResult = {
  success: boolean;
  remaining: number;
  resetAt: number;
};

/** In-memory fixed window. Per-instance only; kept for tests and as a fallback. */
export function checkRateLimit(ip: string, config: RateLimitConfig): RateLimitResult {
  cleanup();

  const key = `${config.id}:${ip}`;
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return { success: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs };
  }

  if (entry.count >= config.maxRequests) {
    return { success: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { success: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
}

function upstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

export function isSharedRateLimitEnabled() {
  return upstashConfig() !== null;
}

/**
 * Shared rate limit (Upstash Redis) with automatic in-memory fallback.
 * Fails open if Redis is unreachable, so an outage never blocks real users.
 */
export async function rateLimit(identifier: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const upstash = upstashConfig();
  if (!upstash) return checkRateLimit(identifier, config);

  const windowIndex = Math.floor(Date.now() / config.windowMs);
  const resetAt = (windowIndex + 1) * config.windowMs;
  const key = `rl:${config.id}:${identifier}:${windowIndex}`;

  try {
    const response = await fetch(`${upstash.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${upstash.token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", key],
        ["PEXPIRE", key, String(config.windowMs + 1000)],
      ]),
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) throw new Error(`Upstash ${response.status}`);
    const results = (await response.json()) as Array<{ result?: number; error?: string }>;
    const count = Number(results[0]?.result ?? 0);
    return {
      success: count <= config.maxRequests,
      remaining: Math.max(0, config.maxRequests - count),
      resetAt,
    };
  } catch (error) {
    console.error("Rate limiter unavailable, falling back to memory:", error instanceof Error ? error.message : error);
    return checkRateLimit(identifier, config);
  }
}

/**
 * Extract client IP from request headers.
 * Checks common proxy headers used by Vercel, Cloudflare, and nginx.
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

export const RATE_LIMITS = {
  logSearch: { id: "log-search", maxRequests: 30, windowMs: 60_000 },
  suggestions: { id: "suggestions", maxRequests: 60, windowMs: 60_000 },
  ownerImageUpload: { id: "owner-image-upload", maxRequests: 10, windowMs: 60_000 },
  ownerImageUploadDaily: { id: "owner-image-upload-day", maxRequests: 60, windowMs: 86_400_000 },
  submitLead: { id: "submit-lead", maxRequests: 5, windowMs: 60_000 },
  submitLeadDaily: { id: "submit-lead-day", maxRequests: 20, windowMs: 86_400_000 },
  submitOwnerLibrary: { id: "submit-owner-library", maxRequests: 3, windowMs: 60_000 },
  staffLogin: { id: "staff-login", maxRequests: 5, windowMs: 15 * 60_000 },
  ownerPlansUpdate: { id: "owner-plans-update", maxRequests: 10, windowMs: 60_000 },
  submitReview: { id: "submit-review", maxRequests: 3, windowMs: 60_000 },
  submitReviewDaily: { id: "submit-review-day", maxRequests: 10, windowMs: 86_400_000 },
  resolveLocation: { id: "resolve-location", maxRequests: 30, windowMs: 60_000 },
  placeSearch: { id: "place-search", maxRequests: 90, windowMs: 60_000 },
  placeSearchDaily: { id: "place-search-day", maxRequests: 500, windowMs: 86_400_000 },
  studySessionStart: { id: "study-start", maxRequests: 30, windowMs: 3_600_000 },
  studySessionFinish: { id: "study-finish", maxRequests: 30, windowMs: 3_600_000 },
} as const;
