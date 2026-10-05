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
-- A pg_cron job pointed straight at one of these function URLs from before
-- this migration (created outside git) would now just fail the new secret
-- check silently — and if left in place alongside the new fire-* job below,
-- it would mean two jobs firing the same report (e.g. a duplicate Friday
-- progress email). So each DO block below is not optional: it scans
-- cron.job for any pre-existing job hitting its target URL under a
-- different name, logs what it found (flagging one that embeds a
-- service-role key, since that is strictly more powerful than the shared
-- secret this migration moves callers to), reuses its schedule instead of
-- the default if one is found, unschedules it, then (re)creates the fire-*
-- job on whichever schedule won.

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

-- Default cadence matches dispatch-weekly-progress-reports/index.ts (Friday
-- 21:00 UTC), but a pre-existing job's own schedule wins if one is found —
-- see the header comment above.
DO $$
DECLARE
  old_job record;
  chosen_schedule text := '0 21 * * 5';
  found_old boolean := false;
BEGIN
  FOR old_job IN
    SELECT jobid, jobname, schedule, command
    FROM cron.job
    WHERE command ILIKE '%dispatch-weekly-progress-reports%'
      AND jobname IS DISTINCT FROM 'fire-weekly-progress-reports'
  LOOP
    found_old := true;
    chosen_schedule := old_job.schedule;
    RAISE NOTICE 'CRE-249: unscheduling pre-existing cron job "%" (id %, schedule "%") that called dispatch-weekly-progress-reports directly%; fire-weekly-progress-reports will take over on that same schedule.',
      old_job.jobname, old_job.jobid, old_job.schedule,
      CASE WHEN old_job.command ILIKE '%service_role%' OR old_job.command ILIKE '%service-role%' THEN ' using a service-role key' ELSE '' END;
    PERFORM cron.unschedule(old_job.jobid);
  END LOOP;

  IF NOT found_old THEN
    RAISE NOTICE 'CRE-249: no pre-existing cron job found calling dispatch-weekly-progress-reports directly; scheduling fire-weekly-progress-reports on the default cadence %.', chosen_schedule;
  END IF;

  BEGIN
    PERFORM cron.unschedule('fire-weekly-progress-reports');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'fire-weekly-progress-reports',
    chosen_schedule,
    $job$SELECT public.fire_weekly_progress_reports();$job$
  );
END $$;

-- Default cadence matches dispatch-web-dev-scheduled/index.ts (every 15
-- minutes); a pre-existing job's own schedule wins if one is found.
DO $$
DECLARE
  old_job record;
  chosen_schedule text := '*/15 * * * *';
  found_old boolean := false;
BEGIN
  FOR old_job IN
    SELECT jobid, jobname, schedule, command
    FROM cron.job
    WHERE command ILIKE '%dispatch-web-dev-scheduled%'
      AND jobname IS DISTINCT FROM 'fire-web-dev-scheduled'
  LOOP
    found_old := true;
    chosen_schedule := old_job.schedule;
    RAISE NOTICE 'CRE-249: unscheduling pre-existing cron job "%" (id %, schedule "%") that called dispatch-web-dev-scheduled directly%; fire-web-dev-scheduled will take over on that same schedule.',
      old_job.jobname, old_job.jobid, old_job.schedule,
      CASE WHEN old_job.command ILIKE '%service_role%' OR old_job.command ILIKE '%service-role%' THEN ' using a service-role key' ELSE '' END;
    PERFORM cron.unschedule(old_job.jobid);
  END LOOP;

  IF NOT found_old THEN
    RAISE NOTICE 'CRE-249: no pre-existing cron job found calling dispatch-web-dev-scheduled directly; scheduling fire-web-dev-scheduled on the default cadence %.', chosen_schedule;
  END IF;

  BEGIN
    PERFORM cron.unschedule('fire-web-dev-scheduled');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'fire-web-dev-scheduled',
    chosen_schedule,
    $job$SELECT public.fire_web_dev_scheduled_dispatch();$job$
  );
END $$;

-- Default cadence matches poll-email-status/index.ts (every 15 minutes); a
-- pre-existing job's own schedule wins if one is found.
DO $$
DECLARE
  old_job record;
  chosen_schedule text := '*/15 * * * *';
  found_old boolean := false;
BEGIN
  FOR old_job IN
    SELECT jobid, jobname, schedule, command
    FROM cron.job
    WHERE command ILIKE '%poll-email-status%'
      AND jobname IS DISTINCT FROM 'fire-email-status-poll'
  LOOP
    found_old := true;
    chosen_schedule := old_job.schedule;
    RAISE NOTICE 'CRE-249: unscheduling pre-existing cron job "%" (id %, schedule "%") that called poll-email-status directly%; fire-email-status-poll will take over on that same schedule.',
      old_job.jobname, old_job.jobid, old_job.schedule,
      CASE WHEN old_job.command ILIKE '%service_role%' OR old_job.command ILIKE '%service-role%' THEN ' using a service-role key' ELSE '' END;
    PERFORM cron.unschedule(old_job.jobid);
  END LOOP;

  IF NOT found_old THEN
    RAISE NOTICE 'CRE-249: no pre-existing cron job found calling poll-email-status directly; scheduling fire-email-status-poll on the default cadence %.', chosen_schedule;
  END IF;

  BEGIN
    PERFORM cron.unschedule('fire-email-status-poll');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'fire-email-status-poll',
    chosen_schedule,
    $job$SELECT public.fire_email_status_poll();$job$
  );
END $$;
