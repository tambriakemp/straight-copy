-- Stage 1: Intake migration into Tasks tab

-- 1. Schema additions ------------------------------------------------------

ALTER TABLE public.project_task_epics
  ADD COLUMN IF NOT EXISTS journey_stage_key text,
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;

ALTER TABLE public.project_task_epics
  DROP CONSTRAINT IF EXISTS project_task_epics_project_stage_uniq;
ALTER TABLE public.project_task_epics
  ADD CONSTRAINT project_task_epics_project_stage_uniq
  UNIQUE (client_project_id, journey_stage_key);

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS journey_item_key text,
  ADD COLUMN IF NOT EXISTS auto_key text;

ALTER TABLE public.project_tasks
  DROP CONSTRAINT IF EXISTS project_tasks_project_journey_item_uniq;
ALTER TABLE public.project_tasks
  ADD CONSTRAINT project_tasks_project_journey_item_uniq
  UNIQUE (client_project_id, journey_item_key);

-- 2. Helper: backfill intake epic + tasks for one project ------------------

CREATE OR REPLACE FUNCTION public.ensure_intake_tasks_for_project(_client_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_node_id uuid;
  v_epic_id uuid;
  v_checklist jsonb;
  v_item jsonb;
  v_idx int := 0;
  v_done boolean;
  v_status project_task_status;
  v_assignee project_task_assignee_kind;
  v_url text;
BEGIN
  SELECT client_id INTO v_client_id
    FROM public.client_projects WHERE id = _client_project_id;
  IF v_client_id IS NULL THEN RETURN; END IF;

  SELECT id, checklist INTO v_node_id, v_checklist
    FROM public.journey_nodes
   WHERE client_project_id = _client_project_id AND key = 'intake'
   LIMIT 1;
  IF v_node_id IS NULL THEN RETURN; END IF;

  -- Upsert the Intake epic
  SELECT id INTO v_epic_id
    FROM public.project_task_epics
   WHERE client_project_id = _client_project_id AND journey_stage_key = 'intake'
   LIMIT 1;
  IF v_epic_id IS NULL THEN
    INSERT INTO public.project_task_epics (client_project_id, name, order_index, journey_stage_key)
      VALUES (_client_project_id, 'Intake', 0, 'intake')
    RETURNING id INTO v_epic_id;
  ELSE
    UPDATE public.project_task_epics
       SET name = 'Intake', order_index = 0
     WHERE id = v_epic_id;
  END IF;

  -- Upsert one task per checklist item, in original order
  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(v_checklist, '[]'::jsonb))
  LOOP
    v_done := coalesce((v_item->>'done')::boolean, false);
    v_status := CASE WHEN v_done THEN 'complete'::project_task_status
                     ELSE 'backlog'::project_task_status END;
    v_assignee := CASE coalesce(v_item->>'owner', 'unassigned')
                    WHEN 'auto'   THEN 'auto'::project_task_assignee_kind
                    WHEN 'client' THEN 'client'::project_task_assignee_kind
                    WHEN 'agency' THEN 'agency'::project_task_assignee_kind
                    ELSE 'unassigned'::project_task_assignee_kind
                  END;

    v_url := NULL;
    IF v_item->>'key' = 'intake.onboarding_completed' THEN
      v_url := '/portal/' || v_client_id::text || '?focus=onboarding';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.project_tasks
       WHERE client_project_id = _client_project_id
         AND journey_item_key = v_item->>'key'
    ) THEN
      UPDATE public.project_tasks pt
         SET name = v_item->>'label',
             epic_id = v_epic_id,
             assignee_kind = v_assignee,
             order_index = v_idx,
             auto_key = v_item->>'auto_key',
             url = coalesce(pt.url, v_url),
             status = CASE
               WHEN v_done THEN 'complete'::project_task_status
               WHEN pt.status = 'complete' THEN 'backlog'::project_task_status
               ELSE pt.status
             END,
             completed_at = CASE
               WHEN v_done THEN coalesce(pt.completed_at, now())
               ELSE NULL
             END
       WHERE pt.client_project_id = _client_project_id
         AND pt.journey_item_key = v_item->>'key';
    ELSE
      INSERT INTO public.project_tasks
        (client_project_id, epic_id, name, status, assignee_kind, order_index,
         journey_item_key, auto_key, url, completed_at)
      VALUES
        (_client_project_id, v_epic_id, v_item->>'label', v_status, v_assignee, v_idx,
         v_item->>'key', v_item->>'auto_key', v_url,
         CASE WHEN v_done THEN now() ELSE NULL END);
    END IF;

    v_idx := v_idx + 1;
  END LOOP;
END;
$$;

-- 3. Backfill all existing automation_build projects -----------------------

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT cp.id
      FROM public.client_projects cp
      JOIN public.journey_nodes jn ON jn.client_project_id = cp.id AND jn.key = 'intake'
     WHERE cp.type = 'automation_build'
  LOOP
    PERFORM public.ensure_intake_tasks_for_project(p.id);
  END LOOP;
END $$;

-- 4. Forward sync: journey_nodes.checklist -> project_tasks.status ---------

CREATE OR REPLACE FUNCTION public.sync_intake_tasks_from_journey()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_done boolean;
  v_key text;
BEGIN
  IF NEW.key <> 'intake' OR NEW.client_project_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.checklist IS NOT DISTINCT FROM OLD.checklist THEN
    RETURN NEW;
  END IF;

  PERFORM public.ensure_intake_tasks_for_project(NEW.client_project_id);

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(NEW.checklist, '[]'::jsonb))
  LOOP
    v_key := v_item->>'key';
    v_done := coalesce((v_item->>'done')::boolean, false);

    UPDATE public.project_tasks pt
       SET status = CASE
             WHEN v_done THEN 'complete'::project_task_status
             WHEN pt.status = 'complete' THEN 'backlog'::project_task_status
             ELSE pt.status
           END,
           completed_at = CASE
             WHEN v_done THEN coalesce(pt.completed_at, now())
             ELSE NULL
           END
     WHERE pt.client_project_id = NEW.client_project_id
       AND pt.journey_item_key = v_key
       AND ( (v_done AND pt.status <> 'complete')
          OR (NOT v_done AND pt.status = 'complete') );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_intake_tasks_from_journey ON public.journey_nodes;
CREATE TRIGGER trg_sync_intake_tasks_from_journey
AFTER INSERT OR UPDATE OF checklist ON public.journey_nodes
FOR EACH ROW
EXECUTE FUNCTION public.sync_intake_tasks_from_journey();

-- 5. Reverse sync: project_tasks.status -> journey_nodes.checklist ---------

CREATE OR REPLACE FUNCTION public.sync_intake_journey_from_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_done boolean;
  v_node_checklist jsonb;
  v_updated jsonb;
  v_item_done boolean;
BEGIN
  IF NEW.journey_item_key IS NULL OR NEW.journey_item_key NOT LIKE 'intake.%' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_new_done := (NEW.status = 'complete');

  SELECT checklist INTO v_node_checklist
    FROM public.journey_nodes
   WHERE client_project_id = NEW.client_project_id AND key = 'intake'
   FOR UPDATE;

  IF v_node_checklist IS NULL THEN RETURN NEW; END IF;

  SELECT coalesce((item->>'done')::boolean, false) INTO v_item_done
    FROM jsonb_array_elements(v_node_checklist) item
   WHERE item->>'key' = NEW.journey_item_key
   LIMIT 1;

  IF v_item_done IS DISTINCT FROM v_new_done THEN
    SELECT jsonb_agg(
             CASE WHEN item->>'key' = NEW.journey_item_key
                  THEN item || jsonb_build_object('done', v_new_done)
                  ELSE item END)
      INTO v_updated
      FROM jsonb_array_elements(v_node_checklist) item;

    UPDATE public.journey_nodes
       SET checklist = v_updated, updated_at = now()
     WHERE client_project_id = NEW.client_project_id AND key = 'intake';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_intake_journey_from_task ON public.project_tasks;
CREATE TRIGGER trg_sync_intake_journey_from_task
AFTER INSERT OR UPDATE OF status ON public.project_tasks
FOR EACH ROW
EXECUTE FUNCTION public.sync_intake_journey_from_task();

-- 6. Auto-create Intake epic + tasks for newly-seeded journey nodes --------

CREATE OR REPLACE FUNCTION public.ensure_intake_tasks_on_node_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.key = 'intake' AND NEW.client_project_id IS NOT NULL THEN
    PERFORM public.ensure_intake_tasks_for_project(NEW.client_project_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_intake_tasks_on_node_insert ON public.journey_nodes;
CREATE TRIGGER trg_ensure_intake_tasks_on_node_insert
AFTER INSERT ON public.journey_nodes
FOR EACH ROW
EXECUTE FUNCTION public.ensure_intake_tasks_on_node_insert();