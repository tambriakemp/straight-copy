-- Schedule the per-project Paperclip task-count sync (sync-paperclip-project-tasks).
-- Same shape as 20261005190000_sync_paperclip_pending_cron.sql: reuses the
-- paperclip_pending_sync_secret Vault entry (the CLAUDE_WEBHOOK_SECRET value);
-- a missing secret logs a notice and does nothing. Idempotent.
-- To revert: SELECT cron.unschedule('sync-paperclip-project-tasks');

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.fire_sync_paperclip_project_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn_url  text := 'https://zjxvcgcuukgqawczanud.supabase.co/functions/v1/sync-paperclip-project-tasks';
  secret  text;
BEGIN
  SELECT decrypted_secret INTO secret
  FROM vault.decrypted_secrets
  WHERE name = 'paperclip_pending_sync_secret'
  LIMIT 1;

  IF secret IS NULL THEN
    RAISE NOTICE 'fire_sync_paperclip_project_tasks skipped: vault secret paperclip_pending_sync_secret is not set';
    RETURN;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := fn_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-agent-secret', secret),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'fire_sync_paperclip_project_tasks failed: %', sqlerrm;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fire_sync_paperclip_project_tasks() FROM PUBLIC;

DO $$
BEGIN
  PERFORM cron.unschedule('sync-paperclip-project-tasks');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Hourly at :07, deliberately off the :00/:30 rush.
SELECT cron.schedule(
  'sync-paperclip-project-tasks',
  '7 * * * *',
  $$SELECT public.fire_sync_paperclip_project_tasks();$$
);
