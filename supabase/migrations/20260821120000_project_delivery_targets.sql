-- Where a project's code lives, and where it deploys.
--
-- The ready-for-claude routine currently hard-codes one project id, one git
-- repo and one Lovable deploy target, which is why it only works for BreeOS. A
-- routine that sweeps every board cannot know those things — so the project row
-- has to carry them.
--
-- Also adds task claiming, so two overlapping runs cannot pick up the same
-- task. Idempotent throughout.

ALTER TABLE public.client_projects
  ADD COLUMN IF NOT EXISTS repo_url            text,
  ADD COLUMN IF NOT EXISTS repo_branch         text NOT NULL DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS deploy_provider     text,
  ADD COLUMN IF NOT EXISTS deploy_project_id   text,
  ADD COLUMN IF NOT EXISTS deploy_project_name text,
  ADD COLUMN IF NOT EXISTS toolchain           text NOT NULL DEFAULT 'npm',
  ADD COLUMN IF NOT EXISTS queue_enabled       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS build_notes         text;

COMMENT ON COLUMN public.client_projects.queue_enabled IS
  'Whether the ready-for-claude sweep should process this project. Off by default: a project with no repo has nothing to build.';
COMMENT ON COLUMN public.client_projects.build_notes IS
  'Anything a coding session needs to know for this project — design system, conventions, gotchas.';

-- A project is only sweepable when it has somewhere to push.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_projects_queue_needs_repo_chk'
  ) THEN
    ALTER TABLE public.client_projects
      ADD CONSTRAINT client_projects_queue_needs_repo_chk
      CHECK (NOT queue_enabled OR repo_url IS NOT NULL);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Task claiming.
--
-- Moving a task to in_progress is not a claim: two runs can both read it as
-- ready and both move it, and the second silently redoes the first's work. A
-- claim is a conditional UPDATE — whoever changes the row first wins, and the
-- loser is told so rather than finding out at push time.
-- ---------------------------------------------------------------------------
ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS claimed_by text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_project_tasks_claimed
  ON public.project_tasks (claimed_at)
  WHERE claimed_by IS NOT NULL;

/**
 * Claim one task for a worker, or return nothing if someone else has it.
 *
 * A stale claim expires: a run that dies mid-task would otherwise hold its
 * task forever, and a queue that silently stops draining is worse than one
 * that occasionally repeats a step.
 */
CREATE OR REPLACE FUNCTION public.claim_task(
  _task_id uuid,
  _worker  text,
  _stale_after interval DEFAULT interval '90 minutes'
)
RETURNS TABLE (id uuid, claimed boolean, held_by text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT t.id, t.claimed_by, t.claimed_at
      FROM public.project_tasks t
     WHERE t.id = _task_id
       FOR UPDATE
  ),
  taken AS (
    UPDATE public.project_tasks t
       SET claimed_by = _worker,
           claimed_at = now(),
           status     = 'in_progress'
      FROM candidate c
     WHERE t.id = c.id
       AND (
         c.claimed_by IS NULL
         OR c.claimed_by = _worker
         OR c.claimed_at < now() - _stale_after
       )
    RETURNING t.id
  )
  SELECT c.id,
         EXISTS (SELECT 1 FROM taken WHERE taken.id = c.id),
         c.claimed_by
    FROM candidate c;
END $$;

REVOKE ALL ON FUNCTION public.claim_task(uuid, text, interval) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_task(uuid, text, interval) TO authenticated, service_role;

/** Hand a task back when a run finishes with it, so the next sweep can see it. */
CREATE OR REPLACE FUNCTION public.release_task(_task_id uuid, _worker text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.project_tasks
     SET claimed_by = NULL, claimed_at = NULL
   WHERE id = _task_id
     AND (claimed_by = _worker OR claimed_by IS NULL);
$$;

REVOKE ALL ON FUNCTION public.release_task(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.release_task(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Turn the sweep on for the one project that already has a routine, so
-- behaviour is unchanged until each further project is configured by hand.
-- ---------------------------------------------------------------------------
UPDATE public.client_projects
   SET repo_url            = COALESCE(repo_url, 'https://github.com/tambriakemp/breeOS'),
       deploy_provider     = COALESCE(deploy_provider, 'lovable'),
       deploy_project_id   = COALESCE(deploy_project_id, 'f469fa4c-2fc1-4126-87a0-21647ed97e39'),
       deploy_project_name = COALESCE(deploy_project_name, 'breeos'),
       toolchain           = 'bun',
       queue_enabled       = true
 WHERE id = '4a65c635-fee1-4cec-9c63-2780f1b526d8';
