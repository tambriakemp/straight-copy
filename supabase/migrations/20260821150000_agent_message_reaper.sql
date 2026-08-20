-- Nothing marks a turn whose backend died.
--
-- A chat turn returns 202 immediately and finishes under EdgeRuntime.waitUntil.
-- If that isolate is killed, hits the platform's background-task ceiling, or
-- throws outside the catch, the `pending` row is never updated. It sits pending
-- for ever, and the chat shows a bubble that never resolves.
--
-- Ten minutes is deliberately well past both the loop's own 240s budget and the
-- point at which the UI starts calling a turn overrun, so this only ever
-- catches genuine deaths, never a turn that is merely slow.
--
-- Idempotent throughout: this database takes migrations from both this repo and
-- Lovable's agent, so assume every statement may already have run.

CREATE OR REPLACE FUNCTION public.reap_abandoned_agent_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reaped integer;
BEGIN
  UPDATE public.agent_messages
     SET status       = 'failed',
         error        = 'This turn never reported back — the run was dropped before it finished. Nothing was saved; send it again.',
         stopped_by   = 'reaped',
         completed_at = now()
   WHERE status = 'pending'
     AND created_at < now() - interval '10 minutes';

  GET DIAGNOSTICS reaped = ROW_COUNT;
  RETURN reaped;
END;
$$;

COMMENT ON FUNCTION public.reap_abandoned_agent_messages() IS
  'Marks agent_messages still pending after 10 minutes as failed. Their edge function died without writing a result.';

-- pg_cron is already in use here for the other schedules.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Unschedule first so re-running this migration replaces the job rather than
-- stacking a second copy of it.
DO $$
BEGIN
  PERFORM cron.unschedule('reap-abandoned-agent-messages');
EXCEPTION
  WHEN OTHERS THEN NULL;  -- not scheduled yet, which is the normal first run
END;
$$;

SELECT cron.schedule(
  'reap-abandoned-agent-messages',
  '*/5 * * * *',
  $$SELECT public.reap_abandoned_agent_messages();$$
);
