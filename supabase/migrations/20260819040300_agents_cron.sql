-- Schedule the agent dispatcher.
--
-- Follows the precedent set by the email infrastructure: the shared secret
-- lives in Vault, never in a migration, so nothing sensitive reaches git. If
-- the secret is missing the job logs a notice and does nothing, so applying
-- this migration before configuring the secret is harmless.
--
-- One-time setup (run once, with your real secret):
--   SELECT vault.create_secret('<CLAUDE_WEBHOOK_SECRET value>', 'agent_dispatch_secret');
-- To revert:
--   SELECT cron.unschedule('dispatch-agent-runs');

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.fire_agent_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn_url  text := 'https://zjxvcgcuukgqawczanud.supabase.co/functions/v1/dispatch-agent-runs';
  secret  text;
BEGIN
  SELECT decrypted_secret INTO secret
  FROM vault.decrypted_secrets
  WHERE name = 'agent_dispatch_secret'
  LIMIT 1;

  IF secret IS NULL THEN
    RAISE NOTICE 'fire_agent_dispatch skipped: vault secret agent_dispatch_secret is not set';
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
    RAISE NOTICE 'fire_agent_dispatch failed: %', sqlerrm;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fire_agent_dispatch() FROM PUBLIC;

-- Every 15 minutes. The dispatcher itself decides which agents are actually
-- due (see _shared/agents/schedule.ts), so this cadence only sets the
-- granularity of when a schedule can fire, not how often agents run.
DO $$
BEGIN
  PERFORM cron.unschedule('dispatch-agent-runs');
EXCEPTION WHEN OTHERS THEN
  NULL;  -- job did not exist yet
END $$;

SELECT cron.schedule(
  'dispatch-agent-runs',
  '*/15 * * * *',
  $$SELECT public.fire_agent_dispatch();$$
);
