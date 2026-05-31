
-- Stage 5 Automation 01 — sequential task progression
-- 1. advance_automation_01_in_progress(project_id):
--    Finds the lowest order_index non-complete task in the automation_01 epic
--    and sets it to 'in_progress'. All OTHER non-complete tasks in that epic
--    are forced back to 'backlog' so only one task is in_progress at a time.
-- 2. Trigger on journey_nodes: when automation_01 enters in_progress, kick off
--    the first task.
-- 3. Trigger on project_tasks: when an automation_01 task transitions to
--    complete, advance the next task.

CREATE OR REPLACE FUNCTION public.advance_automation_01_in_progress(_client_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_epic_id uuid;
  v_next_task_id uuid;
  v_node_status text;
BEGIN
  -- Only auto-advance while the journey node is actively in_progress.
  SELECT status INTO v_node_status
    FROM public.journey_nodes
   WHERE client_project_id = _client_project_id AND key = 'automation_01'
   LIMIT 1;
  IF v_node_status IS DISTINCT FROM 'in_progress' THEN
    RETURN;
  END IF;

  SELECT id INTO v_epic_id
    FROM public.project_task_epics
   WHERE client_project_id = _client_project_id
     AND journey_stage_key = 'automation_01'
   LIMIT 1;
  IF v_epic_id IS NULL THEN RETURN; END IF;

  -- The next task = lowest order_index task in epic 5 that isn't complete.
  SELECT id INTO v_next_task_id
    FROM public.project_tasks
   WHERE client_project_id = _client_project_id
     AND epic_id = v_epic_id
     AND status <> 'complete'
   ORDER BY order_index ASC, created_at ASC
   LIMIT 1;

  IF v_next_task_id IS NULL THEN
    RETURN; -- all tasks complete
  END IF;

  -- Force any *other* non-complete tasks in this epic back to backlog so only
  -- one task is in_progress at a time.
  UPDATE public.project_tasks
     SET status = 'backlog'::project_task_status
   WHERE client_project_id = _client_project_id
     AND epic_id = v_epic_id
     AND id <> v_next_task_id
     AND status NOT IN ('complete'::project_task_status, 'backlog'::project_task_status);

  -- Promote the next task to in_progress (if not already).
  UPDATE public.project_tasks
     SET status = 'in_progress'::project_task_status
   WHERE id = v_next_task_id
     AND status <> 'in_progress'::project_task_status;
END;
$$;

-- Trigger 1: when automation_01 journey_node enters in_progress, kick off the first task.
CREATE OR REPLACE FUNCTION public.trg_automation_01_advance_on_node()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.key = 'automation_01'
     AND NEW.status = 'in_progress'
     AND COALESCE(OLD.status, '') <> 'in_progress'
     AND NEW.client_project_id IS NOT NULL
  THEN
    PERFORM public.advance_automation_01_in_progress(NEW.client_project_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS automation_01_advance_on_node ON public.journey_nodes;
CREATE TRIGGER automation_01_advance_on_node
AFTER UPDATE OF status ON public.journey_nodes
FOR EACH ROW EXECUTE FUNCTION public.trg_automation_01_advance_on_node();

-- Trigger 2: when an automation_01 task completes, advance the next one.
-- Fires AFTER so the just-completed task is visible to the advance function.
CREATE OR REPLACE FUNCTION public.trg_automation_01_advance_on_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.journey_item_key IS NULL
     OR NEW.journey_item_key NOT LIKE 'automation_01.%' THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'complete'::project_task_status
     AND (OLD.status IS DISTINCT FROM NEW.status)
  THEN
    PERFORM public.advance_automation_01_in_progress(NEW.client_project_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS automation_01_advance_on_task ON public.project_tasks;
CREATE TRIGGER automation_01_advance_on_task
AFTER UPDATE OF status ON public.project_tasks
FOR EACH ROW EXECUTE FUNCTION public.trg_automation_01_advance_on_task();

-- Backfill: for any project whose automation_01 node is already in_progress,
-- promote the first non-complete task now.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT client_project_id FROM public.journey_nodes
     WHERE key = 'automation_01' AND status = 'in_progress'
       AND client_project_id IS NOT NULL
  LOOP
    PERFORM public.advance_automation_01_in_progress(r.client_project_id);
  END LOOP;
END $$;
