import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "gg_analytics_session";

const BOT_UA =
  /(bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|pinterest|whatsapp|telegrambot|headlesschrome|phantomjs|puppeteer|playwright|lighthouse|curl|wget|python-requests|axios|go-http-client|pingdom|semrush|ahrefs|petalbot|gptbot|claudebot|ccbot|bytespider)/i;

/** Stable id for the current browser session (resets on tab close). */
export function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "anonymous";
  }
}

/** Best-effort client-side bot heuristic (server re-checks the user agent too). */
export function looksLikeBot(): boolean {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent || "";
  if (!ua) return true;
  if ((navigator as any).webdriver) return true;
  return BOT_UA.test(ua);
}

export type AnalyticsEvent =
  | "page_view"
  | "signup_started"
  | "signup_step"
  | "signup_completed";

/** Fire-and-forget event recording. Never throws, never blocks the UI. */
export async function trackEvent(
  eventName: AnalyticsEvent,
  meta: Record<string, unknown> = {},
  path?: string,
): Promise<void> {
  try {
    await supabase.from("analytics_events").insert({
      session_id: getSessionId(),
      event_name: eventName,
      path: path ?? (typeof window !== "undefined" ? window.location.pathname : null),
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      is_bot: looksLikeBot(),
      meta: meta as any,
    });
  } catch {
    /* analytics must never break the app */
  }
}
