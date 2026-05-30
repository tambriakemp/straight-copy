
-- ============================================================================
-- Stage 4 (Brain Setup) → 5-task checklist + mirrored tasks w/ acceptance criteria
-- ============================================================================

-- 1. New brain_setup template (growth tier only).
UPDATE public.journey_templates
SET checklist = '[
  {"key":"brain_setup.generate_artifacts","label":"Generate Brain Artifacts","owner":"auto","done":false},
  {"key":"brain_setup.generate_skills","label":"Generate Skill Files","owner":"auto","done":false},
  {"key":"brain_setup.deliver_assets","label":"Deliver Brain Assets to Client Portal","owner":"auto","done":false},
  {"key":"brain_setup.client_setup","label":"Client Brain Setup","owner":"client","done":false},
  {"key":"brain_setup.verification","label":"Brain Verification and Optional Setup Call","owner":"agency","done":false}
]'::jsonb
WHERE tier = 'growth' AND key = 'brain_setup';

-- 2. Reshape existing brain_setup journey_nodes. All sub-criteria reset to false
--    (the old 15-item list doesn't map cleanly to the new 5-task structure).
UPDATE public.journey_nodes
   SET checklist = '[
         {"key":"brain_setup.generate_artifacts","label":"Generate Brain Artifacts","owner":"auto","done":false},
         {"key":"brain_setup.generate_skills","label":"Generate Skill Files","owner":"auto","done":false},
         {"key":"brain_setup.deliver_assets","label":"Deliver Brain Assets to Client Portal","owner":"auto","done":false},
         {"key":"brain_setup.client_setup","label":"Client Brain Setup","owner":"client","done":false},
         {"key":"brain_setup.verification","label":"Brain Verification and Optional Setup Call","owner":"agency","done":false}
       ]'::jsonb,
       status = CASE WHEN status = 'complete' THEN 'pending' ELSE status END,
       completed_at = NULL
 WHERE key = 'brain_setup';

-- 3. Helper: acceptance criteria per brain_setup task key.
CREATE OR REPLACE FUNCTION public.brain_setup_criteria_for(_key text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _key
    WHEN 'brain_setup.generate_artifacts' THEN jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Ideal Customer Profile generated and reviewed', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Offer Suite generated and reviewed', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Lead Intake SOP generated and reviewed', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Client Onboarding SOP generated and reviewed', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Content Creation SOP generated and reviewed', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Weekly Review Checklist generated and reviewed', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Pricing Decision Guide generated and reviewed', 'done', false)
    )
    WHEN 'brain_setup.generate_skills' THEN jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'content-writer.md uploaded', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'sop-builder.md generated and reviewed', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'email-responder.md generated and reviewed', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'offer-builder.md generated and reviewed', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'weekly-review.md generated and reviewed', 'done', false)
    )
    WHEN 'brain_setup.deliver_assets' THEN jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'All 7 artifacts packaged and uploaded to client portal', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'All 5 skill files packaged and uploaded to client portal', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Setup video link added to portal', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Client notified via SureContact that Brain assets are ready', 'done', false)
    )
    WHEN 'brain_setup.client_setup' THEN jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Client has watched the setup video', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Claude Project created on client''s own account', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Project instructions pasted (brand voice QRC)', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'All artifacts and skill files uploaded', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Client confirms Brain is set up via portal', 'done', false)
    )
    WHEN 'brain_setup.verification' THEN jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Agency runs 3 test prompts in client''s Brain to verify setup', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Test prompt 1 passed — caption in client voice', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Test prompt 2 passed — onboarding SOP recalled correctly', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Test prompt 3 passed — pricing objection handled correctly', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Setup call scheduled if client had difficulty (optional — 30 min, agency or team member)', 'done', false)
    )
    ELSE '[]'::jsonb
  END;
$$;

-- 4. ensure_brain_setup_tasks_for_project — mirrors checklist into project_tasks
--    with acceptance criteria per task. Preserves existing acceptance_criteria
--    state when the task already exists.
CREATE OR REPLACE FUNCTION public.ensure_brain_setup_tasks_for_project(_client_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid; v_node_id uuid; v_epic_id uuid; v_checklist jsonb; v_item jsonb;
  v_idx int := 0; v_done boolean;
  v_status project_task_status; v_assignee project_task_assignee_kind;
  v_criteria jsonb; v_key text;
BEGIN
  SELECT client_id INTO v_client_id FROM public.client_projects WHERE id = _client_project_id;
  IF v_client_id IS NULL THEN RETURN; END IF;

  SELECT id, checklist INTO v_node_id, v_checklist
    FROM public.journey_nodes
   WHERE client_project_id = _client_project_id AND key = 'brain_setup' LIMIT 1;
  IF v_node_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_epic_id FROM public.project_task_epics
   WHERE client_project_id = _client_project_id AND journey_stage_key = 'brain_setup' LIMIT 1;
  IF v_epic_id IS NULL THEN
    INSERT INTO public.project_task_epics (client_project_id, name, order_index, journey_stage_key)
      VALUES (_client_project_id, '4. Brain Setup', 3, 'brain_setup') RETURNING id INTO v_epic_id;
  ELSE
    UPDATE public.project_task_epics SET name = '4. Brain Setup', order_index = 3 WHERE id = v_epic_id;
  END IF;

  -- Delete obsolete brain_setup tasks (keys no longer in the new template).
  DELETE FROM public.project_tasks
   WHERE client_project_id = _client_project_id
     AND journey_item_key LIKE 'brain_setup.%'
     AND journey_item_key NOT IN (
       'brain_setup.generate_artifacts','brain_setup.generate_skills',
       'brain_setup.deliver_assets','brain_setup.client_setup','brain_setup.verification'
     );

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(v_checklist, '[]'::jsonb))
  LOOP
    v_key := v_item->>'key';
    v_done := coalesce((v_item->>'done')::boolean, false);
    v_status := CASE WHEN v_done THEN 'complete'::project_task_status ELSE 'backlog'::project_task_status END;
    v_assignee := CASE coalesce(v_item->>'owner', 'unassigned')
                    WHEN 'auto'   THEN 'auto'::project_task_assignee_kind
                    WHEN 'client' THEN 'client'::project_task_assignee_kind
                    WHEN 'agency' THEN 'agency'::project_task_assignee_kind
                    ELSE 'unassigned'::project_task_assignee_kind
                  END;
    v_criteria := public.brain_setup_criteria_for(v_key);

    IF EXISTS (
      SELECT 1 FROM public.project_tasks
       WHERE client_project_id = _client_project_id AND journey_item_key = v_key
    ) THEN
      UPDATE public.project_tasks pt
         SET name = v_item->>'label',
             epic_id = v_epic_id,
             assignee_kind = v_assignee,
             order_index = v_idx,
             auto_key = v_item->>'auto_key',
             acceptance_criteria = CASE
               WHEN pt.acceptance_criteria IS NULL OR pt.acceptance_criteria = '[]'::jsonb
                 THEN v_criteria
               ELSE pt.acceptance_criteria
             END,
             status = CASE
               WHEN v_done THEN 'complete'::project_task_status
               WHEN pt.status = 'complete' THEN 'backlog'::project_task_status
               ELSE pt.status END,
             completed_at = CASE WHEN v_done THEN coalesce(pt.completed_at, now()) ELSE NULL END
       WHERE pt.client_project_id = _client_project_id AND pt.journey_item_key = v_key;
    ELSE
      INSERT INTO public.project_tasks
        (client_project_id, epic_id, name, status, assignee_kind, order_index,
         journey_item_key, auto_key, completed_at, acceptance_criteria)
      VALUES
        (_client_project_id, v_epic_id, v_item->>'label', v_status, v_assignee, v_idx,
         v_key, v_item->>'auto_key',
         CASE WHEN v_done THEN now() ELSE NULL END,
         v_criteria);
    END IF;

    v_idx := v_idx + 1;
  END LOOP;
END;
$$;

-- 5. Extend dispatcher trigger so brain_setup nodes also seed tasks.
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
  ELSIF NEW.key = 'brain_setup' THEN
    PERFORM public.ensure_brain_setup_tasks_for_project(NEW.client_project_id);
  END IF;
  RETURN NEW;
END;
$$;

-- 6. Bidirectional sync triggers for brain_setup.
CREATE OR REPLACE FUNCTION public.sync_brain_setup_tasks_from_journey()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_item jsonb; v_done boolean; v_key text;
BEGIN
  IF NEW.key <> 'brain_setup' OR NEW.client_project_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.checklist IS NOT DISTINCT FROM OLD.checklist THEN RETURN NEW; END IF;

  PERFORM public.ensure_brain_setup_tasks_for_project(NEW.client_project_id);

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

DROP TRIGGER IF EXISTS trg_sync_brain_setup_tasks_from_journey ON public.journey_nodes;
CREATE TRIGGER trg_sync_brain_setup_tasks_from_journey
AFTER INSERT OR UPDATE ON public.journey_nodes
FOR EACH ROW EXECUTE FUNCTION public.sync_brain_setup_tasks_from_journey();

CREATE OR REPLACE FUNCTION public.sync_brain_setup_journey_from_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_done boolean; v_node_checklist jsonb; v_updated jsonb; v_item_done boolean;
BEGIN
  IF NEW.journey_item_key IS NULL OR NEW.journey_item_key NOT LIKE 'brain_setup.%' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  v_new_done := (NEW.status = 'complete');

  SELECT checklist INTO v_node_checklist
    FROM public.journey_nodes
   WHERE client_project_id = NEW.client_project_id AND key = 'brain_setup'
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
     WHERE client_project_id = NEW.client_project_id AND key = 'brain_setup';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_brain_setup_journey_from_task ON public.project_tasks;
CREATE TRIGGER trg_sync_brain_setup_journey_from_task
AFTER INSERT OR UPDATE ON public.project_tasks
FOR EACH ROW EXECUTE FUNCTION public.sync_brain_setup_journey_from_task();

-- 7. Backfill brain_setup tasks for all existing automation_build projects.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT cp.id FROM public.client_projects cp
      JOIN public.journey_nodes jn ON jn.client_project_id = cp.id AND jn.key = 'brain_setup'
     WHERE cp.type = 'automation_build'
  LOOP
    PERFORM public.ensure_brain_setup_tasks_for_project(p.id);
  END LOOP;
END $$;
