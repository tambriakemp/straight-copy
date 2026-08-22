-- Fire the ready-for-claude queue routine the moment a task becomes ready,
-- instead of waiting up to three hours for the next cron tick.
--
-- Claude Code routines expose an API trigger: POST to a per-routine /fire
-- endpoint with a bearer token and it starts a run immediately. This wires
-- project_tasks to that endpoint.
--
-- Follows the precedent set by the email infrastructure and agents cron: the
-- URL and token live in Vault, never in a migration, so nothing sensitive
-- reaches git. With the secrets absent every path below is a no-op, so this
-- migration is safe to apply before the routine has an API trigger at all.
--
-- One-time setup, once the API trigger exists (see the routine's edit form on
-- claude.ai/code/routines -> Select a trigger -> Add another trigger -> API):
--
--   SELECT vault.create_secret(
--     'https://api.anthropic.com/v1/claude_code/routines/<trig_id>/fire',
--     'agency_queue_fire_url');
--   SELECT vault.create_secret('<the generated token>', 'agency_queue_fire_token');
--   INSERT INTO public.queue_fire_routes (client_project_id, secret_prefix)
--   VALUES ('b1700a2b-fe37-4fd8-ac08-2555218a9c2f', 'agency_queue')
--   ON CONFLICT (client_project_id) DO NOTHING;

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Which board fires which routine. A board with no row here fires nothing, so
-- adding a second queue later is an INSERT rather than a code change, and the
-- agency project id is not hardcoded into a trigger function.
CREATE TABLE IF NOT EXISTS public.queue_fire_routes (
  client_project_id  uuid PRIMARY KEY REFERENCES public.client_projects(id) ON DELETE CASCADE,
  secret_prefix      text NOT NULL,
  enabled            boolean NOT NULL DEFAULT true,
  debounce_seconds   integer NOT NULL DEFAULT 300,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.queue_fire_routes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage queue_fire_routes" ON public.queue_fire_routes;
CREATE POLICY "Admins manage queue_fire_routes" ON public.queue_fire_routes
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Service role manages queue_fire_routes" ON public.queue_fire_routes;
CREATE POLICY "Service role manages queue_fire_routes" ON public.queue_fire_routes
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Every decision this thing makes, recorded. Without it there is no way to
-- tell a routine that never fired from one that fired and did nothing.
CREATE TABLE IF NOT EXISTS public.queue_fire_log (
  id                 bigserial PRIMARY KEY,
  client_project_id  uuid,
  task_id            uuid,
  outcome            text NOT NULL,   -- fired | debounced | no_route | no_secret | error
  detail             text,
  fired_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS queue_fire_log_project_idx
  ON public.queue_fire_log (client_project_id, fired_at DESC);

ALTER TABLE public.queue_fire_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read queue_fire_log" ON public.queue_fire_log;
CREATE POLICY "Admins read queue_fire_log" ON public.queue_fire_log
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Service role manages queue_fire_log" ON public.queue_fire_log;
CREATE POLICY "Service role manages queue_fire_log" ON public.queue_fire_log
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.fire_queue_routine(
  p_client_project_id uuid,
  p_task_id           uuid DEFAULT NULL,
  p_reason            text DEFAULT 'A task is ready for Claude.'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  route      public.queue_fire_routes%ROWTYPE;
  fire_url   text;
  fire_token text;
  last_fire  timestamptz;
BEGIN
  SELECT * INTO route
  FROM public.queue_fire_routes
  WHERE client_project_id = p_client_project_id AND enabled
  LIMIT 1;

  IF NOT FOUND THEN
    -- Not an error: most boards do not have a routine behind them.
    RETURN;
  END IF;

  SELECT decrypted_secret INTO fire_url
  FROM vault.decrypted_secrets WHERE name = route.secret_prefix || '_fire_url' LIMIT 1;
  SELECT decrypted_secret INTO fire_token
  FROM vault.decrypted_secrets WHERE name = route.secret_prefix || '_fire_token' LIMIT 1;

  IF fire_url IS NULL OR fire_token IS NULL THEN
    INSERT INTO public.queue_fire_log (client_project_id, task_id, outcome, detail)
    VALUES (p_client_project_id, p_task_id, 'no_secret',
            'vault secrets ' || route.secret_prefix || '_fire_url/_fire_token are not set');
    RETURN;
  END IF;

  -- Debounce. Moving five tasks to ready in one go should start one run, not
  -- five racing sessions — the routine walks the whole queue itself, and every
  -- run counts against the account's daily routine cap.
  SELECT max(fired_at) INTO last_fire
  FROM public.queue_fire_log
  WHERE client_project_id = p_client_project_id AND outcome = 'fired';

  IF last_fire IS NOT NULL
     AND last_fire > now() - make_interval(secs => route.debounce_seconds) THEN
    INSERT INTO public.queue_fire_log (client_project_id, task_id, outcome, detail)
    VALUES (p_client_project_id, p_task_id, 'debounced',
            'last fire ' || to_char(last_fire, 'YYYY-MM-DD HH24:MI:SSTZ'));
    RETURN;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := fire_url,
      headers := jsonb_build_object(
        'Content-Type',      'application/json',
        'Authorization',     'Bearer ' || fire_token,
        'anthropic-beta',    'experimental-cc-routine-2026-04-01',
        'anthropic-version', '2023-06-01'
      ),
      body := jsonb_build_object('text', p_reason)
    );

    INSERT INTO public.queue_fire_log (client_project_id, task_id, outcome, detail)
    VALUES (p_client_project_id, p_task_id, 'fired', p_reason);
  EXCEPTION WHEN OTHERS THEN
    -- Fire-and-forget. A failed POST must never roll back the task edit that
    -- caused it; the cron backstop will pick the work up instead.
    INSERT INTO public.queue_fire_log (client_project_id, task_id, outcome, detail)
    VALUES (p_client_project_id, p_task_id, 'error', sqlerrm);
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fire_queue_routine(uuid, uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.on_task_ready_for_claude()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  blocked boolean;
BEGIN
  IF NEW.status <> 'ready_for_claude' THEN
    RETURN NEW;
  END IF;

  -- Only on the transition into ready, not on every later edit of a task that
  -- is already sitting in the queue.
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- A task whose blockers are unfinished is one the routine will skip, so
  -- starting a run for it burns a session for nothing.
  SELECT EXISTS (
    SELECT 1 FROM public.project_tasks b
    WHERE b.id = ANY (NEW.blocked_by) AND b.status <> 'complete'
  ) INTO blocked;

  IF blocked THEN
    RETURN NEW;
  END IF;

  PERFORM public.fire_queue_routine(
    NEW.client_project_id,
    NEW.id,
    'Task "' || coalesce(NEW.name, '(unnamed)') || '" is ready for Claude. '
      || 'Work the ready_for_claude queue as usual; this text is only the wake-up reason.'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fire_queue_on_ready ON public.project_tasks;
CREATE TRIGGER trg_fire_queue_on_ready
  AFTER INSERT OR UPDATE OF status ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.on_task_ready_for_claude();
