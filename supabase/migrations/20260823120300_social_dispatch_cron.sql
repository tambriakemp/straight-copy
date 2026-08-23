-- Schedule the social dispatcher and the reaper.
--
-- Same shape as 20260819040300: the shared secret lives in Vault, never in a
-- migration, and a missing secret logs a notice and does nothing — so applying
-- this before configuring it is harmless.
--
-- Apply this AFTER dispatch-social-schedule has been deployed. It is safe
-- either way (the claim happens inside the function, so a 404 burns no
-- attempts), but there is no reason to POST into a void.
--
-- One-time setup (run once, with the real secret):
--   SELECT vault.create_secret('<CLAUDE_WEBHOOK_SECRET value>', 'social_dispatch_secret');
-- To revert:
--   SELECT cron.unschedule('dispatch-social-schedule');
--   SELECT cron.unschedule('reap-stranded-social-sends');

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.fire_social_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn_url  text := 'https://zjxvcgcuukgqawczanud.supabase.co/functions/v1/dispatch-social-schedule';
  secret  text;
BEGIN
  SELECT decrypted_secret INTO secret
  FROM vault.decrypted_secrets
  WHERE name = 'social_dispatch_secret'
  LIMIT 1;

  IF secret IS NULL THEN
    RAISE NOTICE 'fire_social_dispatch skipped: vault secret social_dispatch_secret is not set';
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
    RAISE NOTICE 'fire_social_dispatch failed: %', sqlerrm;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fire_social_dispatch() FROM PUBLIC;

-- Every five minutes, not fifteen. Scheduling granularity is the whole point
-- of this feature: a post booked for 14:00 that goes out at 14:14 is a worse
-- product than one that goes out at 14:03. The dispatcher claims at most 25
-- due rows per tick and does nothing when there are none.
DO $$
BEGIN
  PERFORM cron.unschedule('dispatch-social-schedule');
EXCEPTION WHEN OTHERS THEN
  NULL;  -- job did not exist yet
END $$;

SELECT cron.schedule(
  'dispatch-social-schedule',
  '*/5 * * * *',
  $$SELECT public.fire_social_dispatch();$$
);

-- The reaper runs in the database rather than through a function, so it keeps
-- working when an edge function is undeployed or failing to boot — which is
-- exactly when sends get stranded in the first place.
DO $$
BEGIN
  PERFORM cron.unschedule('reap-stranded-social-sends');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'reap-stranded-social-sends',
  '*/10 * * * *',
  $$SELECT public.reap_stranded_social_sends();$$
);
