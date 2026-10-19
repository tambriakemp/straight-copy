-- Schedule the Agency Portal list_tasks health sweep (portal-health-sweep),
-- CRE-535. list_tasks was 502ing under a Cloudflare origin timeout because
-- listTasks() in _shared/project-tasks.ts did an unscoped full-table scan
-- over project_task_attachments on every call; that's fixed in this same
-- change, but this sweep is the backstop the task also asked for: on a
-- timer, it re-runs listTasks against every active project, retries a
-- failing one a few times, and emails hello@cre8visions.com only if a
-- project is still failing after every retry. Reuses the existing
-- agent_dispatch_secret Vault entry — same secret dispatch-agent-runs,
-- dispatch-social-schedule, and the CRE-249 fire_* dispatchers already use,
-- so no new one-time setup is required.
-- To revert: SELECT cron.unschedule('portal-health-sweep');

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.fire_portal_health_sweep()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn_url text := 'https://zjxvcgcuukgqawczanud.supabase.co/functions/v1/portal-health-sweep';
  secret text;
BEGIN
  SELECT decrypted_secret INTO secret
  FROM vault.decrypted_secrets
  WHERE name = 'agent_dispatch_secret'
  LIMIT 1;

  IF secret IS NULL THEN
    RAISE NOTICE 'fire_portal_health_sweep skipped: vault secret agent_dispatch_secret is not set';
    RETURN;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-agent-secret', secret
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'fire_portal_health_sweep failed: %', sqlerrm;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fire_portal_health_sweep() FROM PUBLIC;

DO $$
BEGIN
  PERFORM cron.unschedule('portal-health-sweep');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Every 15 minutes.
SELECT cron.schedule(
  'portal-health-sweep',
  '*/15 * * * *',
  $$SELECT public.fire_portal_health_sweep();$$
);
