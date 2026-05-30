
-- Auto-advance next epic's backlog tasks to in_progress when an epic fully completes
CREATE OR REPLACE FUNCTION public.advance_next_epic_on_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _project uuid;
  _epic_id uuid;
  _epic_order int;
  _remaining int;
  _next_epic uuid;
BEGIN
  IF NEW.status <> 'complete' OR (TG_OP = 'UPDATE' AND OLD.status = 'complete') THEN
    RETURN NEW;
  END IF;
  IF NEW.epic_id IS NULL THEN RETURN NEW; END IF;

  SELECT e.client_project_id, e.id, e.order_index
    INTO _project, _epic_id, _epic_order
  FROM public.project_task_epics e WHERE e.id = NEW.epic_id;

  -- Check if any non-complete tasks remain in this epic
  SELECT count(*) INTO _remaining
  FROM public.project_tasks
  WHERE epic_id = _epic_id AND status <> 'complete';

  IF _remaining > 0 THEN RETURN NEW; END IF;

  -- Find next epic by order_index
  SELECT id INTO _next_epic
  FROM public.project_task_epics
  WHERE client_project_id = _project AND order_index > _epic_order
  ORDER BY order_index ASC
  LIMIT 1;

  IF _next_epic IS NULL THEN RETURN NEW; END IF;

  -- Promote backlog tasks in next epic to in_progress
  UPDATE public.project_tasks
  SET status = 'in_progress', updated_at = now()
  WHERE epic_id = _next_epic AND status = 'backlog';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_advance_next_epic ON public.project_tasks;
CREATE TRIGGER trg_advance_next_epic
AFTER INSERT OR UPDATE OF status ON public.project_tasks
FOR EACH ROW EXECUTE FUNCTION public.advance_next_epic_on_completion();

-- Backfill: for any epic whose tasks are all complete, push the next epic's backlog -> in_progress
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT e.id AS epic_id, e.client_project_id, e.order_index
    FROM public.project_task_epics e
    WHERE NOT EXISTS (
      SELECT 1 FROM public.project_tasks t
      WHERE t.epic_id = e.id AND t.status <> 'complete'
    )
    AND EXISTS (SELECT 1 FROM public.project_tasks t WHERE t.epic_id = e.id)
  LOOP
    UPDATE public.project_tasks
    SET status = 'in_progress', updated_at = now()
    WHERE status = 'backlog'
      AND epic_id = (
        SELECT id FROM public.project_task_epics
        WHERE client_project_id = r.client_project_id AND order_index > r.order_index
        ORDER BY order_index ASC LIMIT 1
      );
  END LOOP;
END $$;
