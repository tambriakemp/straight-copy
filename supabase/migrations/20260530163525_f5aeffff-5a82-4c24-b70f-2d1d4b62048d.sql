-- 1. Set acceptance criteria on the "Required accounts created and access submitted via portal" task
UPDATE public.project_tasks
   SET acceptance_criteria = jsonb_build_array(
         jsonb_build_object('id', gen_random_uuid()::text, 'text', 'SureContact account created', 'done', false),
         jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Copost invite accepted and social accounts connected — Facebook, Instagram, Pinterest, TikTok', 'done', false),
         jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Claude Pro account created (Growth tier only)', 'done', false),
         jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Website access submitted via portal secure note', 'done', false)
       )
 WHERE journey_item_key = 'intake.accounts_submitted';

-- 2. Add "Project accounts setup" agency task to every project's intake epic
INSERT INTO public.project_tasks
  (client_project_id, epic_id, name, description, status, assignee_kind, order_index, auto_key, acceptance_criteria)
SELECT cp.id,
       e.id,
       'Project accounts setup',
       'Stand up the agency-side tooling for this client.',
       'backlog'::project_task_status,
       'agency'::project_task_assignee_kind,
       100,
       'intake.project_accounts_setup',
       jsonb_build_array(
         jsonb_build_object('id', gen_random_uuid()::text, 'text', 'HeyGen project created for client', 'done', false),
         jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Ottokit workflow duplicated for client', 'done', false),
         jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Copost project created and invite sent', 'done', false)
       )
  FROM public.client_projects cp
  JOIN public.project_task_epics e
    ON e.client_project_id = cp.id AND e.journey_stage_key = 'intake'
 WHERE NOT EXISTS (
   SELECT 1 FROM public.project_tasks pt
    WHERE pt.client_project_id = cp.id AND pt.auto_key = 'intake.project_accounts_setup'
 );

-- 3. Extend ensure_intake_tasks_for_project so future projects get the new task + acceptance criteria
CREATE OR REPLACE FUNCTION public.ensure_intake_tasks_for_project(_client_project_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_id uuid; v_node_id uuid; v_epic_id uuid; v_checklist jsonb; v_item jsonb;
  v_idx int := 0; v_done boolean;
  v_status project_task_status; v_assignee project_task_assignee_kind; v_url text;
  v_criteria jsonb;
BEGIN
  SELECT client_id INTO v_client_id FROM public.client_projects WHERE id = _client_project_id;
  IF v_client_id IS NULL THEN RETURN; END IF;

  SELECT id, checklist INTO v_node_id, v_checklist
    FROM public.journey_nodes
   WHERE client_project_id = _client_project_id AND key = 'intake' LIMIT 1;
  IF v_node_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_epic_id FROM public.project_task_epics
   WHERE client_project_id = _client_project_id AND journey_stage_key = 'intake' LIMIT 1;
  IF v_epic_id IS NULL THEN
    INSERT INTO public.project_task_epics (client_project_id, name, order_index, journey_stage_key)
      VALUES (_client_project_id, '1. Intake', 0, 'intake') RETURNING id INTO v_epic_id;
  ELSE
    UPDATE public.project_task_epics SET name = '1. Intake', order_index = 0 WHERE id = v_epic_id;
  END IF;

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
    v_url := NULL;
    IF v_item->>'key' = 'intake.onboarding_completed' THEN
      v_url := '/portal/' || v_client_id::text || '?focus=onboarding';
    END IF;

    v_criteria := NULL;
    IF v_item->>'key' = 'intake.accounts_submitted' THEN
      v_criteria := jsonb_build_array(
        jsonb_build_object('id', gen_random_uuid()::text, 'text', 'SureContact account created', 'done', false),
        jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Copost invite accepted and social accounts connected — Facebook, Instagram, Pinterest, TikTok', 'done', false),
        jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Claude Pro account created (Growth tier only)', 'done', false),
        jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Website access submitted via portal secure note', 'done', false)
      );
    END IF;

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
             url = coalesce(pt.url, v_url),
             acceptance_criteria = CASE
               WHEN v_criteria IS NOT NULL AND (pt.acceptance_criteria IS NULL OR pt.acceptance_criteria = '[]'::jsonb)
                 THEN v_criteria
               ELSE pt.acceptance_criteria
             END,
             status = CASE
               WHEN v_done THEN 'complete'::project_task_status
               WHEN pt.status = 'complete' THEN 'backlog'::project_task_status
               ELSE pt.status END,
             completed_at = CASE WHEN v_done THEN coalesce(pt.completed_at, now()) ELSE NULL END
       WHERE pt.client_project_id = _client_project_id AND pt.journey_item_key = v_item->>'key';
    ELSE
      INSERT INTO public.project_tasks
        (client_project_id, epic_id, name, status, assignee_kind, order_index,
         journey_item_key, auto_key, url, completed_at, acceptance_criteria)
      VALUES
        (_client_project_id, v_epic_id, v_item->>'label', v_status, v_assignee, v_idx,
         v_item->>'key', v_item->>'auto_key', v_url,
         CASE WHEN v_done THEN now() ELSE NULL END,
         coalesce(v_criteria, '[]'::jsonb));
    END IF;

    v_idx := v_idx + 1;
  END LOOP;

  -- Ensure the "Project accounts setup" agency task exists once per project
  IF NOT EXISTS (
    SELECT 1 FROM public.project_tasks
     WHERE client_project_id = _client_project_id AND auto_key = 'intake.project_accounts_setup'
  ) THEN
    INSERT INTO public.project_tasks
      (client_project_id, epic_id, name, description, status, assignee_kind, order_index, auto_key, acceptance_criteria)
    VALUES
      (_client_project_id, v_epic_id, 'Project accounts setup',
       'Stand up the agency-side tooling for this client.',
       'backlog'::project_task_status, 'agency'::project_task_assignee_kind, 100,
       'intake.project_accounts_setup',
       jsonb_build_array(
         jsonb_build_object('id', gen_random_uuid()::text, 'text', 'HeyGen project created for client', 'done', false),
         jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Ottokit workflow duplicated for client', 'done', false),
         jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Copost project created and invite sent', 'done', false)
       ));
  END IF;
END;
$$;