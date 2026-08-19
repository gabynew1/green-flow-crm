/**
 * In-isolate burst limiter (Phase 1).
 *
 * A sliding-window counter kept in the Deno isolate's memory. No Postgres, no
 * network, no table — so a flood of junk traffic can never exhaust the DB
 * connection pool just to be told "no".
 *
 * Known limitation: state lives per warm isolate, so limits are not
 * coordinated across concurrent isolates. This reliably stops the common case
 * (one script looping one endpoint) and is the correct place for the check.
 * Phase 2 swaps the backing store for Upstash Redis behind this same
 * interface — no call site changes.
 */

type Hit = { count: number; windowStart: number };

const buckets = new Map<string, Hit>();
const MAX_KEYS = 20_000;

export type LimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * @param key    bucket key, e.g. `signup:ip:<hash>`
 * @param limit  max hits allowed inside the window
 * @param windowSeconds window length
 */
export function checkLimit(key: string, limit: number, windowSeconds: number): LimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  const existing = buckets.get(key);
  if (!existing || now - existing.windowStart >= windowMs) {
    // Opportunistic eviction: only sweep when the map grows large, so the
    // happy path stays O(1).
    if (buckets.size > MAX_KEYS) sweep(now);
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((existing.windowStart + windowMs - now) / 1000),
    );
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

/** Applies several buckets at once; the first rejection wins. */
export function checkLimits(
  rules: { key: string; limit: number; windowSeconds: number }[],
): LimitResult & { key?: string } {
  let best: LimitResult = { allowed: true, remaining: Number.MAX_SAFE_INTEGER, retryAfterSeconds: 0 };
  for (const rule of rules) {
    const res = checkLimit(rule.key, rule.limit, rule.windowSeconds);
    if (!res.allowed) return { ...res, key: rule.key };
    if (res.remaining < best.remaining) best = res;
  }
  return best;
}

function sweep(now: number) {
  for (const [key, hit] of buckets) {
    // Anything older than an hour cannot still be inside any window we use.
    if (now - hit.windowStart > 3_600_000) buckets.delete(key);
  }
  if (buckets.size > MAX_KEYS) buckets.clear();
}

/** Best-effort client IP from the usual proxy headers. */
export function clientIp(req: Request): string | null {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

/** Hash before use as a key so no raw IP is held in memory or logged. */
export async function hashIdentifier(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function tooManyRequests(retryAfterSeconds: number, corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({
      error: "Too many requests. Please slow down and try again shortly.",
      retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

/**
 * Records a blocked request in `analytics_events` (existing table) so the
 * admin "Abuse & serverless" panel has data. Never throws.
 */
export async function logAbuseBlock(
  supabaseUrl: string,
  serviceKey: string,
  payload: { reason: string; endpoint: string; bucket?: string; meta?: Record<string, unknown> },
): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/rest/v1/analytics_events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        session_id: "server",
        event_name: "abuse_block",
        path: payload.endpoint,
        is_bot: true,
        meta: {
          reason: payload.reason,
          endpoint: payload.endpoint,
          bucket: payload.bucket ?? null,
          ...(payload.meta ?? {}),
        },
      }),
    });
  } catch (err) {
    console.error("logAbuseBlock failed", err);
  }
}
