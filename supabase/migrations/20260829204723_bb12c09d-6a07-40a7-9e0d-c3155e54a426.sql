DROP POLICY IF EXISTS "anyone can record analytics events" ON public.analytics_events;

CREATE POLICY "anyone can record valid analytics events"
ON public.analytics_events
FOR INSERT
TO anon, authenticated
WITH CHECK (
  event_name IN ('page_view', 'signup_started', 'signup_step', 'signup_completed')
  AND length(session_id) BETWEEN 1 AND 64
  AND (path IS NULL OR length(path) <= 512)
  AND (referrer IS NULL OR length(referrer) <= 1024)
  AND (user_agent IS NULL OR length(user_agent) <= 512)
  AND jsonb_typeof(meta) = 'object'
  AND pg_column_size(meta) <= 2048
);