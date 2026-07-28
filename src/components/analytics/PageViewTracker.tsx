import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { trackEvent } from "@/lib/analytics";

/** Records one page_view per route change (deduped for the same path). */
export function PageViewTracker() {
  const location = useLocation();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    const path = location.pathname;
    if (lastPath.current === path) return;
    lastPath.current = path;
    void trackEvent("page_view", { search: location.search || null }, path);
  }, [location.pathname, location.search]);

  return null;
}
