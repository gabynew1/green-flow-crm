
-- 1) Extend notification kind enum
ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'new_signup';
