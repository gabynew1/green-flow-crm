CREATE TABLE public.analytics_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id text NOT NULL,
  event_name text NOT NULL,
  path text,
  referrer text,
  user_agent text,
  is_bot boolean NOT NULL DEFAULT false,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT INSERT ON public.analytics_events TO anon;
GRANT INSERT, SELECT ON public.analytics_events TO authenticated;
GRANT ALL ON public.analytics_events TO service_role;

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can record analytics events"
  ON public.analytics_events FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "super admins can read analytics events"
  ON public.analytics_events FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE INDEX analytics_events_created_idx ON public.analytics_events (created_at DESC);
CREATE INDEX analytics_events_name_created_idx ON public.analytics_events (event_name, created_at DESC);
CREATE INDEX analytics_events_session_idx ON public.analytics_events (session_id);

CREATE OR REPLACE FUNCTION public.fn_analytics_flag_bot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.user_agent IS NULL OR NEW.user_agent = '' THEN
    NEW.is_bot := true;
  ELSIF NEW.user_agent ~* '(bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|pinterest|vkshare|whatsapp|telegrambot|headlesschrome|phantomjs|puppeteer|playwright|lighthouse|curl|wget|python-requests|axios|go-http-client|monitor|pingdom|uptime|semrush|ahrefs|mj12|dotbot|petalbot|gptbot|claudebot|ccbot|bytespider)' THEN
    NEW.is_bot := true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_analytics_flag_bot
BEFORE INSERT ON public.analytics_events
FOR EACH ROW EXECUTE FUNCTION public.fn_analytics_flag_bot();

CREATE OR REPLACE FUNCTION public.fn_analytics_overview(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _since timestamptz;
  _result jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _days := GREATEST(COALESCE(_days, 30), 1);
  _since := now() - (_days || ' days')::interval;

  SELECT jsonb_build_object(
    'days', _days,
    'page_views_human', (
      SELECT count(*) FROM analytics_events
      WHERE created_at >= _since AND event_name = 'page_view' AND NOT is_bot),
    'page_views_bot', (
      SELECT count(*) FROM analytics_events
      WHERE created_at >= _since AND event_name = 'page_view' AND is_bot),
    'unique_visitors', (
      SELECT count(DISTINCT session_id) FROM analytics_events
      WHERE created_at >= _since AND event_name = 'page_view' AND NOT is_bot),
    'signups_started', (
      SELECT count(DISTINCT session_id) FROM analytics_events
      WHERE created_at >= _since AND event_name = 'signup_started' AND NOT is_bot),
    'signups_completed', (
      SELECT count(DISTINCT session_id) FROM analytics_events
      WHERE created_at >= _since AND event_name = 'signup_completed' AND NOT is_bot),
    'signups_abandoned', (
      SELECT count(*) FROM (
        SELECT session_id FROM analytics_events
        WHERE created_at >= _since AND event_name = 'signup_started' AND NOT is_bot
        EXCEPT
        SELECT session_id FROM analytics_events
        WHERE created_at >= _since AND event_name = 'signup_completed'
      ) q),
    'abandon_by_step', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'step')
      FROM (
        SELECT jsonb_build_object('step', last_step, 'count', count(*)) AS x
        FROM (
          SELECT DISTINCT ON (e.session_id) e.session_id,
                 COALESCE(e.meta->>'step_label', e.meta->>'step', 'unknown') AS last_step
          FROM analytics_events e
          WHERE e.created_at >= _since AND e.event_name IN ('signup_started','signup_step') AND NOT e.is_bot
            AND NOT EXISTS (
              SELECT 1 FROM analytics_events c
              WHERE c.session_id = e.session_id AND c.event_name = 'signup_completed')
          ORDER BY e.session_id, e.created_at DESC
        ) s
        GROUP BY last_step
      ) agg
    ), '[]'::jsonb),
    'daily', COALESCE((
      SELECT jsonb_agg(d ORDER BY d->>'day')
      FROM (
        SELECT jsonb_build_object(
                 'day', to_char(date_trunc('day', created_at), 'YYYY-MM-DD'),
                 'human', count(*) FILTER (WHERE NOT is_bot),
                 'bot', count(*) FILTER (WHERE is_bot)
               ) AS d
        FROM analytics_events
        WHERE created_at >= _since AND event_name = 'page_view'
        GROUP BY date_trunc('day', created_at)
      ) dd
    ), '[]'::jsonb),
    'top_paths', COALESCE((
      SELECT jsonb_agg(p)
      FROM (
        SELECT jsonb_build_object('path', COALESCE(path, '/'), 'views', count(*)) AS p
        FROM analytics_events
        WHERE created_at >= _since AND event_name = 'page_view' AND NOT is_bot
        GROUP BY COALESCE(path, '/')
        ORDER BY count(*) DESC
        LIMIT 8
      ) tp
    ), '[]'::jsonb),
    'new_accounts', COALESCE((
      SELECT jsonb_agg(a ORDER BY a->>'created_at' DESC)
      FROM (
        SELECT jsonb_build_object(
                 'user_id', pr.user_id,
                 'full_name', pr.full_name,
                 'email', pr.email,
                 'company_name', COALESCE(pr.company_name, t.name),
                 'tenant_name', t.name,
                 'tier', t.subscription_tier,
                 'kind', CASE WHEN pr.tenant_id IS NOT NULL THEN 'provider' ELSE 'client' END,
                 'created_at', pr.created_at
               ) AS a
        FROM profiles pr
        LEFT JOIN tenants t ON t.id = pr.tenant_id
        WHERE pr.created_at >= _since
        ORDER BY pr.created_at DESC
        LIMIT 25
      ) na
    ), '[]'::jsonb),
    'new_accounts_count', (SELECT count(*) FROM profiles WHERE created_at >= _since),
    'new_companies_count', (SELECT count(*) FROM tenants WHERE created_at >= _since)
  ) INTO _result;

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_analytics_overview(integer) TO authenticated;