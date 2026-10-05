-- Schedule the Paperclip "needs you now" sync (CRE-235 §4 / CRE-248).
--
-- CRE-241's migrations added the sync-paperclip-pending edge function and its
-- tables but never scheduled it — confirmed on CRE-248 by searching every
-- migration in this repo for `cron.schedule`/`sync-paperclip-pending` and
-- finding nothing. Same shape as 20260823120300_social_dispatch_cron.sql and
-- 20260819040300_agents_cron.sql: the shared secret lives in Vault, never in
-- a migration, and a missing secret logs a notice and does nothing, so
-- applying this before configuring the secret is harmless.
--
-- One-time setup (run once, with the real secret — the same CLAUDE_WEBHOOK_SECRET
-- value already used for social_dispatch_secret/agent_dispatch_secret):
--   SELECT vault.create_secret('<CLAUDE_WEBHOOK_SECRET value>', 'paperclip_pending_sync_secret');
-- To revert:
--   SELECT cron.unschedule('sync-paperclip-pending');

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.fire_sync_paperclip_pending()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn_url  text := 'https://zjxvcgcuukgqawczanud.supabase.co/functions/v1/sync-paperclip-pending';
  secret  text;
BEGIN
  SELECT decrypted_secret INTO secret
  FROM vault.decrypted_secrets
  WHERE name = 'paperclip_pending_sync_secret'
  LIMIT 1;

  IF secret IS NULL THEN
    RAISE NOTICE 'fire_sync_paperclip_pending skipped: vault secret paperclip_pending_sync_secret is not set';
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
    -- Fire-and-forget: a dispatch failure must never break the cron worker.
    RAISE NOTICE 'fire_sync_paperclip_pending failed: %', sqlerrm;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fire_sync_paperclip_pending() FROM PUBLIC;

-- Every 10 minutes, matching the cadence CRE-235's plan and the function's
-- own header comment already promised.
DO $$
BEGIN
  PERFORM cron.unschedule('sync-paperclip-pending');
EXCEPTION WHEN OTHERS THEN
  NULL;  -- job did not exist yet
END $$;

SELECT cron.schedule(
  'sync-paperclip-pending',
  '*/10 * * * *',
  $$SELECT public.fire_sync_paperclip_pending();$$
);
