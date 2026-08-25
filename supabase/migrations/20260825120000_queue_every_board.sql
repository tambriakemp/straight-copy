-- The coding queue, for every board rather than one.
--
-- Idempotent throughout — two writers, see 20260823120000.
--
-- Three things were wired independently and none agreed: queue_fire_routes had
-- one row (Cre8 Visions Agency), queue_enabled was true on exactly one other
-- project (BreeOS), and the worker was hardcoded to a third (Menovia). The
-- board that could start a run was not in the sweep, and the board in the
-- sweep could not start one.

-- ---------------------------------------------------------------------------
-- 1. Push or open a PR, per project.
--
--    Client repos should never take an unreviewed commit; our own can. There
--    was nothing anywhere expressing that, so it defaults to the safe side.
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_projects
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'pr';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_projects_delivery_mode_chk') THEN
    ALTER TABLE public.client_projects
      ADD CONSTRAINT client_projects_delivery_mode_chk
      CHECK (delivery_mode IN ('pr', 'push'));
  END IF;
END $$;

COMMENT ON COLUMN public.client_projects.delivery_mode IS
  'How finished queue work lands: pr opens a pull request, push commits to repo_branch. Defaults to pr — a client repo should not take an unreviewed commit.';

-- ---------------------------------------------------------------------------
-- 2. A default route, so a new board works without being registered.
--
--    client_project_id was the PRIMARY KEY, which is why there was no way to
--    express "everything else". It becomes an ordinary nullable column with a
--    surrogate key, and a single row with a NULL project is the default.
--
--    Per-project rows still win, so a client needing its own routine or its
--    own credentials keeps one.
-- ---------------------------------------------------------------------------
ALTER TABLE public.queue_fire_routes
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

DO $$
BEGIN
  -- Swap the primary key onto the surrogate, once.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'queue_fire_routes_pkey'
       AND conrelid = 'public.queue_fire_routes'::regclass
       AND pg_get_constraintdef(oid) LIKE '%client_project_id%'
  ) THEN
    ALTER TABLE public.queue_fire_routes DROP CONSTRAINT queue_fire_routes_pkey;
    ALTER TABLE public.queue_fire_routes ADD CONSTRAINT queue_fire_routes_pkey PRIMARY KEY (id);
  END IF;
END $$;

ALTER TABLE public.queue_fire_routes ALTER COLUMN client_project_id DROP NOT NULL;

-- At most one route per board, and at most one default.
CREATE UNIQUE INDEX IF NOT EXISTS queue_fire_routes_project_idx
  ON public.queue_fire_routes (client_project_id)
  WHERE client_project_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS queue_fire_routes_default_idx
  ON public.queue_fire_routes ((true))
  WHERE client_project_id IS NULL;

COMMENT ON COLUMN public.queue_fire_routes.client_project_id IS
  'The board this route serves, or NULL for the default that serves every board without one of its own.';

-- The log records which route fired, because the debounce now keys on it.
-- Added before the function below, which reads it.
ALTER TABLE public.queue_fire_log
  ADD COLUMN IF NOT EXISTS route_id uuid;

CREATE INDEX IF NOT EXISTS queue_fire_log_route_fired_idx
  ON public.queue_fire_log (route_id, fired_at DESC)
  WHERE outcome = 'fired';

-- ---------------------------------------------------------------------------
-- 3. Fire the default when a board has none, and say so when there is neither.
--
--    Two changes beyond the fallback.
--
--    The debounce now keys on the ROUTE, not the project. It used to ask "has
--    this board fired recently", which was right when every board had its own
--    routine — but with one shared route, ten boards getting work would each
--    see their own empty window and start ten runs. The routine sweeps every
--    board in one pass, so one run finds all of it.
--
--    And a missing route now logs `no_route`. The old version returned
--    silently, so a board that could never fire was indistinguishable in the
--    log from one where nothing had happened — which is exactly the confusion
--    that hid this for weeks.
-- ---------------------------------------------------------------------------
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
  -- The board's own route first; the default only if it has none.
  SELECT * INTO route FROM public.queue_fire_routes
   WHERE client_project_id = p_client_project_id AND enabled LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO route FROM public.queue_fire_routes
     WHERE client_project_id IS NULL AND enabled LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    INSERT INTO public.queue_fire_log (client_project_id, task_id, outcome, detail)
    VALUES (p_client_project_id, p_task_id, 'no_route',
            'no route for this board and no default route is configured');
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

  -- Per route, not per board. See the note above.
  SELECT max(l.fired_at) INTO last_fire
    FROM public.queue_fire_log l
   WHERE l.outcome = 'fired' AND l.route_id = route.id;

  IF last_fire IS NOT NULL
     AND last_fire > now() - make_interval(secs => route.debounce_seconds) THEN
    INSERT INTO public.queue_fire_log (client_project_id, task_id, route_id, outcome, detail)
    VALUES (p_client_project_id, p_task_id, route.id, 'debounced',
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
        'anthropic-version', '2023-06-01'),
      body := jsonb_build_object('text', p_reason));
    INSERT INTO public.queue_fire_log (client_project_id, task_id, route_id, outcome, detail)
    VALUES (p_client_project_id, p_task_id, route.id, 'fired', p_reason);
  EXCEPTION WHEN OTHERS THEN
    -- Fire-and-forget. A failed POST must never roll back the task edit that
    -- caused it; the cron backstop will pick the work up instead.
    INSERT INTO public.queue_fire_log (client_project_id, task_id, route_id, outcome, detail)
    VALUES (p_client_project_id, p_task_id, route.id, 'error', sqlerrm);
  END;
END $$;
