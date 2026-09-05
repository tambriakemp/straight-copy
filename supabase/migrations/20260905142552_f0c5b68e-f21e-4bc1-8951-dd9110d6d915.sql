-- Let a route fire a GitHub Actions workflow instead of a claude.ai routine.
--
-- Why: the coding worker currently has to be a claude.ai routine, which means
-- the whole pipeline depends on a schedule living outside this app, and every
-- agent token spent inside the app is billed to API credits. Claude Code
-- authenticated with a subscription OAuth token is billed to the Claude
-- subscription instead — but Claude Code is a binary, so it cannot run in an
-- edge function. It can run in GitHub Actions.
--
-- This changes only WHERE the fire goes. Routing, debouncing, logging and the
-- fire-and-forget guarantee are untouched, and `claude_routine` stays the
-- default, so every existing route behaves exactly as it did before this
-- migration.
--
-- For a github_dispatch route:
--   {prefix}_fire_url   https://api.github.com/repos/OWNER/REPO/dispatches
--   {prefix}_fire_token a GitHub token with repo scope on that repository
--
-- GitHub only accepts repository_dispatch for a workflow that exists on the
-- default branch, and it answers 204 with no body whether or not any workflow
-- listens — so a route that looks like it fired and does nothing means the
-- workflow is missing, not that the POST failed.
--
-- Idempotent: safe to re-apply.

ALTER TABLE public.queue_fire_routes
  ADD COLUMN IF NOT EXISTS target text NOT NULL DEFAULT 'claude_routine';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'queue_fire_routes_target_check'
       AND conrelid = 'public.queue_fire_routes'::regclass
  ) THEN
    ALTER TABLE public.queue_fire_routes
      ADD CONSTRAINT queue_fire_routes_target_check
      CHECK (target IN ('claude_routine', 'github_dispatch'));
  END IF;
END $$;

COMMENT ON COLUMN public.queue_fire_routes.target IS
  'claude_routine: POST the routine trigger URL (Anthropic headers, {text} body). '
  'github_dispatch: POST a GitHub repository_dispatch event so a workflow does the coding.';

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
  req_headers jsonb;
  req_body    jsonb;
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

  -- Per route, not per board. One worker run sweeps every ready board, so a
  -- second fire inside the debounce window would only duplicate work.
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

  IF route.target = 'github_dispatch' THEN
    -- GitHub rejects a request with no User-Agent outright, and ignores an
    -- unknown api-version rather than failing, so both are sent explicitly.
    req_headers := jsonb_build_object(
      'Content-Type',          'application/json',
      'Accept',                'application/vnd.github+json',
      'Authorization',         'Bearer ' || fire_token,
      'X-GitHub-Api-Version',  '2022-11-28',
      'User-Agent',            'straight-copy-queue');
    -- client_payload is a wake-up call, not a work order: the workflow asks the
    -- board what is ready, exactly as the routine does. Passing the task here
    -- and trusting it would race with anything queued a second later.
    req_body := jsonb_build_object(
      'event_type', 'queue_ready',
      'client_payload', jsonb_build_object(
        'reason',            p_reason,
        'client_project_id', p_client_project_id,
        'task_id',           p_task_id));
  ELSE
    req_headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'Authorization',     'Bearer ' || fire_token,
      'anthropic-beta',    'experimental-cc-routine-2026-04-01',
      'anthropic-version', '2023-06-01');
    req_body := jsonb_build_object('text', p_reason);
  END IF;

  BEGIN
    PERFORM net.http_post(url := fire_url, headers := req_headers, body := req_body);
    INSERT INTO public.queue_fire_log (client_project_id, task_id, route_id, outcome, detail)
    VALUES (p_client_project_id, p_task_id, route.id, 'fired',
            route.target || ': ' || p_reason);
  EXCEPTION WHEN OTHERS THEN
    -- Fire-and-forget. A failed POST must never roll back the task edit that
    -- caused it.
    INSERT INTO public.queue_fire_log (client_project_id, task_id, route_id, outcome, detail)
    VALUES (p_client_project_id, p_task_id, route.id, 'error', sqlerrm);
  END;
END $$;