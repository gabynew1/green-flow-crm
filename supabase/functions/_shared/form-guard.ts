/**
 * Zero-dependency bot friction for public forms (Phase 1).
 *
 * Two cheap checks that run before any database work:
 *  1. Honeypot — a visually hidden input real users never fill.
 *  2. Minimum fill time — the form reports when it mounted; a submission
 *     faster than MIN_FILL_MS is scripted.
 *
 * The timestamp is not signed: signing would need a server round trip on every
 * form mount, which reintroduces exactly the invocation cost this plan removes.
 * It is sanity-bounded instead (not in the future, not absurdly old). These
 * checks stop naive scripts, not a determined attacker — Cloudflare Turnstile
 * in Phase 2 is the real gate, and it slots in ahead of these.
 *
 * Deliberately NOT used: User-Agent sniffing and IP/subnet bans (spoofable,
 * and CGNAT means banning a subnet can ban an entire office or mobile carrier).
 */

const MIN_FILL_MS = 2_000;
const MAX_FORM_AGE_MS = 6 * 60 * 60 * 1000; // 6h — generous for a slow signup

export type FormGuardResult = { ok: true } | { ok: false; reason: "honeypot" | "too_fast" };

export function checkFormGuard(body: unknown): FormGuardResult {
  const payload = (body ?? {}) as Record<string, unknown>;

  // 1. Honeypot
  const trap = payload.hp_field;
  if (typeof trap === "string" && trap.trim().length > 0) {
    return { ok: false, reason: "honeypot" };
  }

  // 2. Minimum fill time (only enforced when the client reported a mount time;
  //    a missing value must not lock out older clients mid-deploy).
  const startedAt = Number(payload.form_started_at);
  if (Number.isFinite(startedAt) && startedAt > 0) {
    const elapsed = Date.now() - startedAt;
    if (elapsed >= 0 && elapsed < MIN_FILL_MS) {
      return { ok: false, reason: "too_fast" };
    }
    if (elapsed < -MIN_FILL_MS || elapsed > MAX_FORM_AGE_MS) {
      // Clock skew or a replayed/forged value — treat as scripted.
      return { ok: false, reason: "too_fast" };
    }
  }

  return { ok: true };
}
