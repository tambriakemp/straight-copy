
-- ============================================================================
-- Stage 3 (Brand Kit) → 4-item checklist + mirrored tasks
-- ============================================================================

-- 1. New brand_kit template (growth tier only — only tier that has brand_kit).
UPDATE public.journey_templates
SET checklist = '[
  {"key":"brand_kit.submission","label":"Brand kit submission","owner":"client","auto_key":"brand_kit_submitted","done":false},
  {"key":"brand_kit.build_using_claude","label":"Build Brand Kit using Claude Design","owner":"agency","done":false},
  {"key":"brand_kit.send_to_client_for_approval","label":"Send Brand Kit to client for approval","owner":"agency","done":false},
  {"key":"brand_kit.approved","label":"Brand kit approved","owner":"client","auto_key":"brand_kit_approved","done":false}
]'::jsonb
WHERE tier = 'growth' AND key = 'brand_kit';

-- 2. Reshape existing brand_kit journey_nodes checklists, preserving "done" state.
DO $$
DECLARE
  r record;
  was_submission boolean;
  was_build boolean;
  was_send boolean;
  was_approved boolean;
  c_submitted_at timestamptz;
BEGIN
  FOR r IN
    SELECT jn.id, jn.client_id, jn.checklist
      FROM public.journey_nodes jn
     WHERE jn.key = 'brand_kit'
  LOOP
    -- "Submission" maps to: new key OR any of the legacy client-submitted items.
    SELECT
      bool_or(coalesce((item->>'done')::boolean,false) AND (
        item->>'key' = 'brand_kit.submission'
        OR item->>'key' IN (
          'brand_kit.brand_kit_logos','brand_kit.brand_kit_colors',
          'brand_kit.brand_kit_typography','brand_kit.brand_kit_references',
          'brand_kit.brand_kit_guidelines','brand_kit.portal_link_generated_and_sent_to_client'
        )
        OR item->>'auto_key' IN (
          'brand_kit_logos','brand_kit_colors','brand_kit_typography',
          'brand_kit_references','brand_kit_guidelines','brand_kit_submitted'
        )
      )),
      bool_or(coalesce((item->>'done')::boolean,false) AND (
        item->>'key' IN ('brand_kit.build_using_claude','brand_kit.build_brand_kit_using_claude_design')
      )),
      bool_or(coalesce((item->>'done')::boolean,false) AND (
        item->>'key' IN ('brand_kit.send_to_client_for_approval','brand_kit.send_brand_kit_to_client_for_approval')
      )),
      bool_or(coalesce((item->>'done')::boolean,false) AND (
        item->>'key' IN ('brand_kit.approved','brand_kit.brand_kit_approved')
        OR item->>'auto_key' = 'brand_kit_approved'
      ))
    INTO was_submission, was_build, was_send, was_approved
    FROM jsonb_array_elements(coalesce(r.checklist,'[]'::jsonb)) item;

    SELECT brand_kit_intake_submitted_at INTO c_submitted_at
      FROM public.clients WHERE id = r.client_id;

    UPDATE public.journey_nodes
       SET checklist = jsonb_build_array(
         jsonb_build_object('key','brand_kit.submission',
                            'label','Brand kit submission',
                            'owner','client','auto_key','brand_kit_submitted',
                            'done', coalesce(was_submission,false) OR c_submitted_at IS NOT NULL),
         jsonb_build_object('key','brand_kit.build_using_claude',
                            'label','Build Brand Kit using Claude Design',
                            'owner','agency',
                            'done', coalesce(was_build,false)),
         jsonb_build_object('key','brand_kit.send_to_client_for_approval',
                            'label','Send Brand Kit to client for approval',
                            'owner','agency',
                            'done', coalesce(was_send,false)),
         jsonb_build_object('key','brand_kit.approved',
                            'label','Brand kit approved',
                            'owner','client','auto_key','brand_kit_approved',
                            'done', coalesce(was_approved,false))
       )
     WHERE id = r.id;
  END LOOP;
END $$;

-- 3. Reset brand_kit status to 'pending' for clients whose brand_voice node isn't complete.
UPDATE public.journey_nodes bk
   SET status = 'pending', started_at = NULL, completed_at = NULL
  FROM public.journey_nodes bv
 WHERE bk.key = 'brand_kit'
   AND bv.key = 'brand_voice'
   AND bv.client_id = bk.client_id
   AND bv.status <> 'complete'
   AND bk.status <> 'pending';

-- 4. ensure_brand_kit_tasks_for_project — mirrors checklist into project_tasks.
CREATE OR REPLACE FUNCTION public.ensure_brand_kit_tasks_for_project(_client_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid; v_node_id uuid; v_epic_id uuid; v_checklist jsonb; v_item jsonb;
  v_idx int := 0; v_done boolean;
  v_status project_task_status; v_assignee project_task_assignee_kind;
BEGIN
  SELECT client_id INTO v_client_id FROM public.client_projects WHERE id = _client_project_id;
  IF v_client_id IS NULL THEN RETURN; END IF;

  SELECT id, checklist INTO v_node_id, v_checklist
    FROM public.journey_nodes
   WHERE client_project_id = _client_project_id AND key = 'brand_kit' LIMIT 1;
  IF v_node_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_epic_id FROM public.project_task_epics
   WHERE client_project_id = _client_project_id AND journey_stage_key = 'brand_kit' LIMIT 1;
  IF v_epic_id IS NULL THEN
    INSERT INTO public.project_task_epics (client_project_id, name, order_index, journey_stage_key)
      VALUES (_client_project_id, '3. Brand Kit', 2, 'brand_kit') RETURNING id INTO v_epic_id;
  ELSE
    UPDATE public.project_task_epics SET name = '3. Brand Kit', order_index = 2 WHERE id = v_epic_id;
  END IF;

  -- Delete obsolete brand_kit tasks (keys no longer present in template).
  DELETE FROM public.project_tasks
   WHERE client_project_id = _client_project_id
     AND journey_item_key LIKE 'brand_kit.%'
     AND journey_item_key NOT IN (
       'brand_kit.submission','brand_kit.build_using_claude',
       'brand_kit.send_to_client_for_approval','brand_kit.approved'
     );

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(v_checklist, '[]'::jsonb))
  LOOP
    v_done := coalesce((v_item->>'done')::boolean, false);
    v_status := CASE WHEN v_done THEN 'complete'::project_task_status ELSE 'backlog'::project_task_status END;
    v_assignee := CASE coalesce(v_item->>'owner', 'unassigned')
                    WHEN 'auto'   THEN 'auto'::project_task_assignee_kind
                    WHEN 'client' THEN 'client'::project_task_assignee_kind
                    WHEN 'agency' THEN 'agency'::project_task_assignee_kind
                    ELSE 'unassigned'::project_task_assignee_kind
                  END;

    IF EXISTS (
      SELECT 1 FROM public.project_tasks
       WHERE client_project_id = _client_project_id AND journey_item_key = v_item->>'key'
    ) THEN
      UPDATE public.project_tasks pt
         SET name = v_item->>'label',
             epic_id = v_epic_id,
             assignee_kind = v_assignee,
             order_index = v_idx,
             auto_key = v_item->>'auto_key',
             status = CASE
               WHEN v_done THEN 'complete'::project_task_status
               WHEN pt.status = 'complete' THEN 'backlog'::project_task_status
               ELSE pt.status END,
             completed_at = CASE WHEN v_done THEN coalesce(pt.completed_at, now()) ELSE NULL END
       WHERE pt.client_project_id = _client_project_id AND pt.journey_item_key = v_item->>'key';
    ELSE
      INSERT INTO public.project_tasks
        (client_project_id, epic_id, name, status, assignee_kind, order_index,
         journey_item_key, auto_key, completed_at)
      VALUES
        (_client_project_id, v_epic_id, v_item->>'label', v_status, v_assignee, v_idx,
         v_item->>'key', v_item->>'auto_key',
         CASE WHEN v_done THEN now() ELSE NULL END);
    END IF;

    v_idx := v_idx + 1;
  END LOOP;
END;
$$;

-- 5. Extend dispatcher trigger so brand_kit nodes also seed tasks.
CREATE OR REPLACE FUNCTION public.ensure_stage_tasks_on_node_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_project_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.key = 'intake' THEN
    PERFORM public.ensure_intake_tasks_for_project(NEW.client_project_id);
  ELSIF NEW.key = 'brand_voice' THEN
    PERFORM public.ensure_brand_voice_tasks_for_project(NEW.client_project_id);
  ELSIF NEW.key = 'brand_kit' THEN
    PERFORM public.ensure_brand_kit_tasks_for_project(NEW.client_project_id);
  END IF;
  RETURN NEW;
END;
$$;

-- 6. Bidirectional sync triggers for brand_kit.
CREATE OR REPLACE FUNCTION public.sync_brand_kit_tasks_from_journey()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_item jsonb; v_done boolean; v_key text;
BEGIN
  IF NEW.key <> 'brand_kit' OR NEW.client_project_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.checklist IS NOT DISTINCT FROM OLD.checklist THEN RETURN NEW; END IF;

  PERFORM public.ensure_brand_kit_tasks_for_project(NEW.client_project_id);

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(NEW.checklist, '[]'::jsonb))
  LOOP
    v_key := v_item->>'key';
    v_done := coalesce((v_item->>'done')::boolean, false);
    UPDATE public.project_tasks pt
       SET status = CASE
             WHEN v_done THEN 'complete'::project_task_status
             WHEN pt.status = 'complete' THEN 'backlog'::project_task_status
             ELSE pt.status END,
           completed_at = CASE WHEN v_done THEN coalesce(pt.completed_at, now()) ELSE NULL END
     WHERE pt.client_project_id = NEW.client_project_id
       AND pt.journey_item_key = v_key
       AND ((v_done AND pt.status <> 'complete') OR (NOT v_done AND pt.status = 'complete'));
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_brand_kit_tasks_from_journey ON public.journey_nodes;
CREATE TRIGGER trg_sync_brand_kit_tasks_from_journey
AFTER INSERT OR UPDATE ON public.journey_nodes
FOR EACH ROW EXECUTE FUNCTION public.sync_brand_kit_tasks_from_journey();

CREATE OR REPLACE FUNCTION public.sync_brand_kit_journey_from_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_done boolean; v_node_checklist jsonb; v_updated jsonb; v_item_done boolean;
BEGIN
  IF NEW.journey_item_key IS NULL OR NEW.journey_item_key NOT LIKE 'brand_kit.%' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  v_new_done := (NEW.status = 'complete');

  SELECT checklist INTO v_node_checklist
    FROM public.journey_nodes
   WHERE client_project_id = NEW.client_project_id AND key = 'brand_kit'
   FOR UPDATE;
  IF v_node_checklist IS NULL THEN RETURN NEW; END IF;

  SELECT coalesce((item->>'done')::boolean, false) INTO v_item_done
    FROM jsonb_array_elements(v_node_checklist) item
   WHERE item->>'key' = NEW.journey_item_key LIMIT 1;

  IF v_item_done IS DISTINCT FROM v_new_done THEN
    SELECT jsonb_agg(
             CASE WHEN item->>'key' = NEW.journey_item_key
                  THEN item || jsonb_build_object('done', v_new_done)
                  ELSE item END)
      INTO v_updated FROM jsonb_array_elements(v_node_checklist) item;

    UPDATE public.journey_nodes
       SET checklist = v_updated, updated_at = now()
     WHERE client_project_id = NEW.client_project_id AND key = 'brand_kit';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_brand_kit_journey_from_task ON public.project_tasks;
CREATE TRIGGER trg_sync_brand_kit_journey_from_task
AFTER INSERT OR UPDATE ON public.project_tasks
FOR EACH ROW EXECUTE FUNCTION public.sync_brand_kit_journey_from_task();

-- 7. Backfill brand_kit tasks for all automation_build projects.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT cp.id FROM public.client_projects cp
      JOIN public.journey_nodes jn ON jn.client_project_id = cp.id AND jn.key = 'brand_kit'
     WHERE cp.type = 'automation_build'
  LOOP
    PERFORM public.ensure_brand_kit_tasks_for_project(p.id);
  END LOOP;
END $$;
