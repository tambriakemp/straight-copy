-- Fire the coding queue only for work the queue can actually do.
--
-- The trigger checked status and blockers and nothing else, so a task assigned
-- to a person fired a coding run. "Press Send to client on the Menovia
-- Marketing Proposal" — assignee_kind 'agency' — sat in ready_for_claude doing
-- exactly that.
--
-- The wasted run exits silently, which looks harmless and is not: it spends a
-- run against the account's daily routine cap, and the five-minute debounce in
-- fire_queue_routine means a wasted fire SWALLOWS a real one landing behind it.
-- That is the actual cost, and it is invisible without the log rows below.
--
-- So every rejection is recorded as `not_queue_work` with the reason rather
-- than returning silently. A queue that quietly declines to fire is
-- indistinguishable from one that fired and found nothing, and telling those
-- two apart is the whole point of queue_fire_log.
--
-- Idempotent: CREATE OR REPLACE plus DROP/CREATE TRIGGER. Safe to re-apply.

CREATE OR REPLACE FUNCTION public.on_task_ready_for_claude()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $tg$
DECLARE
  proj      public.client_projects%ROWTYPE;
  has_proj  boolean;
  reject    text;
  blocked   boolean;
BEGIN
  IF NEW.status <> 'ready_for_claude' THEN
    RETURN NEW;
  END IF;

  -- Only on the transition into ready, not on every later edit of a task that
  -- is already sitting in the queue.
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Assigned to Claude, strictly. The column is named ready_for_claude, so an
  -- unassigned task there reads as intended for it — but that guess is what
  -- put a client email in a coding queue, and the cost of guessing wrong is a
  -- burnt run plus a swallowed real one. Somebody assigns it, or it waits.
  IF NEW.assignee_kind IS DISTINCT FROM 'claude'::public.project_task_assignee_kind THEN
    INSERT INTO public.queue_fire_log (client_project_id, task_id, outcome, detail)
    VALUES (NEW.client_project_id, NEW.id, 'not_queue_work',
            'assignee_kind is ' || coalesce(NEW.assignee_kind::text, 'null')
              || ', not claude');
    RETURN NEW;
  END IF;

  -- A task another run already holds is not waiting for a new one.
  IF NEW.claimed_by IS NOT NULL THEN
    INSERT INTO public.queue_fire_log (client_project_id, task_id, outcome, detail)
    VALUES (NEW.client_project_id, NEW.id, 'not_queue_work',
            'already claimed by ' || NEW.claimed_by);
    RETURN NEW;
  END IF;

  -- The board must be one the queue can work: enabled, and with somewhere to
  -- push. list_queue_projects applies the same two conditions, so a fire that
  -- passes here and a project that appears there stay in agreement.
  SELECT * INTO proj FROM public.client_projects
   WHERE id = NEW.client_project_id;

  -- Capture FOUND immediately. It is reset by the next statement executed, so
  -- reading it further down — inside the INSERT below, say — is a bug waiting
  -- for the day somebody adds a statement between the two.
  has_proj := FOUND;

  reject := CASE
    WHEN NOT has_proj                                     THEN 'project not found'
    WHEN NOT proj.queue_enabled                           THEN 'queue_enabled is false'
    WHEN proj.repo_url IS NULL OR btrim(proj.repo_url) = '' THEN 'project has no repo_url'
    ELSE NULL
  END;

  IF reject IS NOT NULL THEN
    INSERT INTO public.queue_fire_log (client_project_id, task_id, outcome, detail)
    VALUES (NEW.client_project_id, NEW.id, 'not_queue_work', reject);
    RETURN NEW;
  END IF;

  -- A task whose blockers are unfinished is one the routine would skip, so
  -- starting a run for it burns a session for nothing. This is not the same as
  -- `blocked` status: it is simply not this task's turn yet.
  SELECT EXISTS (
    SELECT 1 FROM public.project_tasks b
    WHERE b.id = ANY (NEW.blocked_by) AND b.status <> 'complete'
  ) INTO blocked;

  IF blocked THEN
    INSERT INTO public.queue_fire_log (client_project_id, task_id, outcome, detail)
    VALUES (NEW.client_project_id, NEW.id, 'not_queue_work',
            'blocked_by contains unfinished tasks');
    RETURN NEW;
  END IF;

  PERFORM public.fire_queue_routine(
    NEW.client_project_id,
    NEW.id,
    'Task "' || coalesce(NEW.name, '(unnamed)') || '" is ready for Claude on '
      || coalesce(proj.name, 'a project') || '. '
      || 'Work the ready_for_claude queue as usual; this text is only the wake-up reason.'
  );

  RETURN NEW;
END;
$tg$;

DROP TRIGGER IF EXISTS trg_fire_queue_on_ready ON public.project_tasks;
CREATE TRIGGER trg_fire_queue_on_ready
  AFTER INSERT OR UPDATE OF status ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.on_task_ready_for_claude();
