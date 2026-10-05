-- CRE-249: dispatch-weekly-progress-reports, dispatch-web-dev-scheduled, and
-- poll-email-status are pg_cron targets with no caller check at all — any
-- request to the function URL would fan out real sends. None of their
-- pg_cron schedules were defined in this repo (they were set up directly
-- against the live project), so this migration both defines them here for
-- the first time and makes them call with the CLAUDE_WEBHOOK_SECRET shared
-- secret the edge functions now require. Same shape as fire_agent_dispatch /
-- fire_social_dispatch: reuses the existing agent_dispatch_secret vault
-- entry, so no new one-time setup is required.
--
-- If a pg_cron job already exists pointing straight at one of these function
-- URLs (created before this migration, outside git), it will now fail the
-- new secret check and simply log nothing useful — harmless, but worth a
-- one-time check:
--   SELECT jobid, jobname, schedule, command FROM cron.job
--   WHERE command ILIKE '%dispatch-weekly-progress-reports%'
--      OR command ILIKE '%dispatch-web-dev-scheduled%'
--      OR command ILIKE '%poll-email-status%';
-- Unschedule any stale entry that isn't one of the three created below
-- (fire-weekly-progress-reports / fire-web-dev-scheduled / fire-email-status-poll)
-- with SELECT cron.unschedule('<jobname>').

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.fire_weekly_progress_reports()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn_url text := 'https://zjxvcgcuukgqawczanud.supabase.co/functions/v1/dispatch-weekly-progress-reports';
  secret text;
BEGIN
  SELECT decrypted_secret INTO secret
  FROM vault.decrypted_secrets
  WHERE name = 'agent_dispatch_secret'
  LIMIT 1;

  IF secret IS NULL THEN
    RAISE NOTICE 'fire_weekly_progress_reports skipped: vault secret agent_dispatch_secret is not set';
    RETURN;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-agent-secret', secret
      ),
      body := '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'fire_weekly_progress_reports failed: %', sqlerrm;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fire_weekly_progress_reports() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.fire_web_dev_scheduled_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn_url text := 'https://zjxvcgcuukgqawczanud.supabase.co/functions/v1/dispatch-web-dev-scheduled';
  secret text;
BEGIN
  SELECT decrypted_secret INTO secret
  FROM vault.decrypted_secrets
  WHERE name = 'agent_dispatch_secret'
  LIMIT 1;

  IF secret IS NULL THEN
    RAISE NOTICE 'fire_web_dev_scheduled_dispatch skipped: vault secret agent_dispatch_secret is not set';
    RETURN;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-agent-secret', secret
      ),
      body := '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'fire_web_dev_scheduled_dispatch failed: %', sqlerrm;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fire_web_dev_scheduled_dispatch() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.fire_email_status_poll()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn_url text := 'https://zjxvcgcuukgqawczanud.supabase.co/functions/v1/poll-email-status';
  secret text;
BEGIN
  SELECT decrypted_secret INTO secret
  FROM vault.decrypted_secrets
  WHERE name = 'agent_dispatch_secret'
  LIMIT 1;

  IF secret IS NULL THEN
    RAISE NOTICE 'fire_email_status_poll skipped: vault secret agent_dispatch_secret is not set';
    RETURN;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-agent-secret', secret
      ),
      body := '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'fire_email_status_poll failed: %', sqlerrm;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fire_email_status_poll() FROM PUBLIC;

-- Weekly, Friday 21:00 UTC — matches the cadence documented in
-- dispatch-weekly-progress-reports/index.ts.
DO $$
BEGIN
  PERFORM cron.unschedule('fire-weekly-progress-reports');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'fire-weekly-progress-reports',
  '0 21 * * 5',
  $$SELECT public.fire_weekly_progress_reports();$$
);

-- Every 15 minutes — matches the cadence documented in
-- dispatch-web-dev-scheduled/index.ts.
DO $$
BEGIN
  PERFORM cron.unschedule('fire-web-dev-scheduled');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'fire-web-dev-scheduled',
  '*/15 * * * *',
  $$SELECT public.fire_web_dev_scheduled_dispatch();$$
);

-- Every 15 minutes — matches the cadence documented in
-- poll-email-status/index.ts.
DO $$
BEGIN
  PERFORM cron.unschedule('fire-email-status-poll');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'fire-email-status-poll',
  '*/15 * * * *',
  $$SELECT public.fire_email_status_poll();$$
);
