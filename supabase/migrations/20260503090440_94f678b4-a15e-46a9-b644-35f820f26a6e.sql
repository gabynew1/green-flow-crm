SELECT cron.schedule(
  'lifecycle-email-drip',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://xmklfvepyiiiurokpvub.supabase.co/functions/v1/lifecycle-email-drip',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);