-- Add company fields and provider_permission to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cui text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contact_phone text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS provider_permission text DEFAULT 'full_admin';

-- Create integrations table (placeholder for future Google integration)
CREATE TABLE IF NOT EXISTS integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  google_connected boolean NOT NULL DEFAULT false,
  google_email text,
  google_refresh_token text,
  google_access_token text,
  google_token_expires_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own integration" ON integrations FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);