-- Stage 5 Automation 01 — foundation migration
-- 1. pgcrypto for symmetric encryption of per-client secrets
-- 2. project_secrets table (encrypted storage for SureContact API key + MCP URL)
-- 3. Helper functions to set / read project secrets (SECURITY DEFINER, server-only)
-- 4. Replace automation_01 journey template with the new 9-item checklist
-- 5. ensure_automation_01_tasks_for_project + bidirectional sync triggers
-- 6. fire_automation_01_build + status trigger
-- 7. Backfill existing automation_build projects

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- 1. project_secrets table ----------
CREATE TABLE IF NOT EXISTS public.project_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_project_id uuid NOT NULL REFERENCES public.client_projects(id) ON DELETE CASCADE,
  key text NOT NULL,
  encrypted_value bytea NOT NULL,
  hint text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_project_id, key)
);

GRANT SELECT ON public.project_secrets TO authenticated;
GRANT ALL ON public.project_secrets TO service_role;

ALTER TABLE public.project_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read project_secrets metadata" ON public.project_secrets;
CREATE POLICY "Admins read project_secrets metadata"
  ON public.project_secrets FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role manages project_secrets" ON public.project_secrets;
CREATE POLICY "Service role manages project_secrets"
  ON public.project_secrets FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_project_secrets_project_key
  ON public.project_secrets(client_project_id, key);

-- ---------- 2. Encryption helpers ----------
-- The PROJECT_SECRETS_KEY env var holds the symmetric key. We read it
-- via current_setting('app.project_secrets_key', true) which edge functions
-- set per-session before calling set/get. This avoids storing the key in DB.
CREATE OR REPLACE FUNCTION public.set_project_secret(
  _client_project_id uuid,
  _key text,
  _value text,
  _hint text DEFAULT NULL,
  _created_by uuid DEFAULT NULL,
  _enc_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_enc bytea; v_id uuid;
BEGIN
  IF _enc_key IS NULL OR length(_enc_key) = 0 THEN
    RAISE EXCEPTION 'encryption key required';
  END IF;
  v_enc := pgp_sym_encrypt(_value, _enc_key);
  INSERT INTO public.project_secrets (client_project_id, key, encrypted_value, hint, created_by)
    VALUES (_client_project_id, _key, v_enc, _hint, _created_by)
  ON CONFLICT (client_project_id, key) DO UPDATE
    SET encrypted_value = EXCLUDED.encrypted_value,
        hint = COALESCE(EXCLUDED.hint, public.project_secrets.hint),
        updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_project_secret(
  _client_project_id uuid,
  _key text,
  _enc_key text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_enc bytea;
BEGIN
  SELECT encrypted_value INTO v_enc
    FROM public.project_secrets
   WHERE client_project_id = _client_project_id AND key = _key
   LIMIT 1;
  IF v_enc IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(v_enc, _enc_key);
END;
$$;

REVOKE ALL ON FUNCTION public.set_project_secret(uuid, text, text, text, uuid, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_project_secret(uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_project_secret(uuid, text, text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_project_secret(uuid, text, text) TO service_role;

-- ---------- 3. New automation_01 checklist (both tiers) ----------
-- 9 items: 1,3,4,5,6,9 = auto; 2,7,8 = agency
UPDATE public.journey_templates
   SET checklist = jsonb_build_array(
     jsonb_build_object('id', 'a01-1', 'key', 'automation_01.lead_magnet_generated',           'label', 'Lead magnet PDF generated in client brand voice',  'owner', 'auto',   'done', false),
     jsonb_build_object('id', 'a01-2', 'key', 'automation_01.surecontact_api_key_added',       'label', 'SureContact API key + MCP URL added',                'owner', 'agency', 'done', false),
     jsonb_build_object('id', 'a01-3', 'key', 'automation_01.surecontact_list_created',        'label', 'SureContact list + tags created in client account',  'owner', 'auto',   'done', false),
     jsonb_build_object('id', 'a01-4', 'key', 'automation_01.nurture_emails_written',          'label', '5 nurture emails written (branded HTML)',            'owner', 'auto',   'done', false),
     jsonb_build_object('id', 'a01-5', 'key', 'automation_01.nurture_sequence_built',          'label', 'Nurture sequence built and triggered by new-lead tag','owner', 'auto',   'done', false),
     jsonb_build_object('id', 'a01-6', 'key', 'automation_01.landing_page_assets_generated',   'label', 'Landing page copy + brand snippet generated',        'owner', 'auto',   'done', false),
     jsonb_build_object('id', 'a01-7', 'key', 'automation_01.landing_page_built',              'label', 'Landing page built (MCP or agency-manual)',          'owner', 'auto',   'done', false),
     jsonb_build_object('id', 'a01-8', 'key', 'automation_01.flow_tested',                     'label', 'Full opt-in flow tested end-to-end',                 'owner', 'agency', 'done', false),
     jsonb_build_object('id', 'a01-9', 'key', 'automation_01.landing_page_sent_to_client',     'label', 'Landing page URL sent to client',                    'owner', 'auto',   'done', false)
   )
 WHERE key = 'automation_01';

-- ---------- 4. Acceptance criteria per item ----------
CREATE OR REPLACE FUNCTION public.automation_01_criteria_for(_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT CASE _key
    WHEN 'automation_01.lead_magnet_generated' THEN jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Branded PDF generated and attached to task', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Uses client brand colors, fonts, and logo', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Public download URL stored on attachment', 'done', false)
    )
    WHEN 'automation_01.surecontact_api_key_added' THEN jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Agency added the client''s SureContact API key', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Agency added the client''s SureContact MCP URL', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Both stored encrypted in project_secrets', 'done', false)
    )
    WHEN 'automation_01.surecontact_list_created' THEN jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'List "<Business Name> Leads" created in client''s SureContact', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Tags seeded: new-lead, lead-magnet-delivered, qualified, not-a-fit, converted, nurture', 'done', false)
    )
    WHEN 'automation_01.nurture_emails_written' THEN jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid()::text, 'text', '5 emails written in client brand voice', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Each email is full branded HTML (not plain text)', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Email 1 includes the lead magnet download link', 'done', false)
    )
    WHEN 'automation_01.nurture_sequence_built' THEN jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Sequence created in client''s SureContact', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Triggered when "new-lead" tag is added to a contact', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'All 5 emails enrolled with the correct delays', 'done', false)
    )
    WHEN 'automation_01.landing_page_assets_generated' THEN jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Landing page copy block generated (headline, subhead, bullets, CTA)', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Brand snippet generated (colors, fonts, logo, lead magnet name)', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Both attached to task as downloadable assets', 'done', false)
    )
    WHEN 'automation_01.landing_page_built' THEN jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Landing page built in SureContact (MCP-automated when available, otherwise agency-manual)', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Published URL pasted into the task URL field', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Opt-in form posts to SureContact and tags new contact with new-lead', 'done', false)
    )
    WHEN 'automation_01.flow_tested' THEN jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Test opt-in submitted from landing page', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Email 1 received with working lead magnet link', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Contact appears in SureContact with new-lead tag', 'done', false)
    )
    WHEN 'automation_01.landing_page_sent_to_client' THEN jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Email sent to client with landing page URL', 'done', false),
      jsonb_build_object('id', gen_random_uuid()::text, 'text', 'Landing page URL visible in client portal', 'done', false)
    )
    ELSE '[]'::jsonb
  END;
$$;

-- ---------- 5. ensure_automation_01_tasks_for_project ----------
CREATE OR REPLACE FUNCTION public.ensure_automation_01_tasks_for_project(_client_project_id uuid)
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
  v_valid_keys text[] := ARRAY[
    'automation_01.lead_magnet_generated',
    'automation_01.surecontact_api_key_added',
    'automation_01.surecontact_list_created',
    'automation_01.nurture_emails_written',
    'automation_01.nurture_sequence_built',
    'automation_01.landing_page_assets_generated',
    'automation_01.landing_page_built',
    'automation_01.flow_tested',
    'automation_01.landing_page_sent_to_client'
  ];
BEGIN
  SELECT client_id INTO v_client_id FROM public.client_projects WHERE id = _client_project_id;
  IF v_client_id IS NULL THEN RETURN; END IF;

  SELECT id, checklist INTO v_node_id, v_checklist
    FROM public.journey_nodes
   WHERE client_project_id = _client_project_id AND key = 'automation_01' LIMIT 1;
  IF v_node_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_epic_id FROM public.project_task_epics
   WHERE client_project_id = _client_project_id AND journey_stage_key = 'automation_01' LIMIT 1;
  IF v_epic_id IS NULL THEN
    INSERT INTO public.project_task_epics (client_project_id, name, order_index, journey_stage_key)
      VALUES (_client_project_id, '5. Automation 01', 4, 'automation_01') RETURNING id INTO v_epic_id;
  ELSE
    UPDATE public.project_task_epics SET name = '5. Automation 01', order_index = 4 WHERE id = v_epic_id;
  END IF;

  -- Drop tasks with stale automation_01 keys (e.g. old Ottokit checklist).
  DELETE FROM public.project_tasks
   WHERE client_project_id = _client_project_id
     AND journey_item_key LIKE 'automation_01.%'
     AND NOT (journey_item_key = ANY(v_valid_keys));

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
    v_criteria := public.automation_01_criteria_for(v_key);

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

-- ---------- 6. Extend dispatcher trigger ----------
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
  ELSIF NEW.key = 'automation_01' THEN
    PERFORM public.ensure_automation_01_tasks_for_project(NEW.client_project_id);
  END IF;
  RETURN NEW;
END;
$$;

-- ---------- 7. Bidirectional sync triggers for automation_01 ----------
CREATE OR REPLACE FUNCTION public.sync_automation_01_tasks_from_journey()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_item jsonb; v_done boolean; v_key text;
BEGIN
  IF NEW.key <> 'automation_01' OR NEW.client_project_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.checklist IS NOT DISTINCT FROM OLD.checklist THEN RETURN NEW; END IF;

  PERFORM public.ensure_automation_01_tasks_for_project(NEW.client_project_id);

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

DROP TRIGGER IF EXISTS trg_sync_automation_01_tasks_from_journey ON public.journey_nodes;
CREATE TRIGGER trg_sync_automation_01_tasks_from_journey
AFTER INSERT OR UPDATE ON public.journey_nodes
FOR EACH ROW EXECUTE FUNCTION public.sync_automation_01_tasks_from_journey();

CREATE OR REPLACE FUNCTION public.sync_automation_01_journey_from_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_done boolean; v_node_checklist jsonb; v_updated jsonb; v_item_done boolean;
BEGIN
  IF NEW.journey_item_key IS NULL OR NEW.journey_item_key NOT LIKE 'automation_01.%' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  v_new_done := (NEW.status = 'complete');

  SELECT checklist INTO v_node_checklist
    FROM public.journey_nodes
   WHERE client_project_id = NEW.client_project_id AND key = 'automation_01'
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
     WHERE client_project_id = NEW.client_project_id AND key = 'automation_01';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_automation_01_journey_from_task ON public.project_tasks;
CREATE TRIGGER trg_sync_automation_01_journey_from_task
AFTER INSERT OR UPDATE ON public.project_tasks
FOR EACH ROW EXECUTE FUNCTION public.sync_automation_01_journey_from_task();

-- ---------- 8. Fire build-automation-01 edge function when node enters in_progress ----------
CREATE OR REPLACE FUNCTION public.fire_automation_01_build(_client_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn_url text := 'https://zjxvcgcuukgqawczanud.supabase.co/functions/v1/build-automation-01';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqeHZjZ2N1dWtncWF3Y3phbnVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NDQyMDEsImV4cCI6MjA5MTUyMDIwMX0.NoraGciOY8UjOvGarwCfQaZXtoBSBjRBzc-4t2PWCU4';
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key
      ),
      body := jsonb_build_object('clientProjectId', _client_project_id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'fire_automation_01_build failed for project %: %', _client_project_id, sqlerrm;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_automation_01_in_progress()
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
    PERFORM public.fire_automation_01_build(NEW.client_project_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS automation_01_in_progress_fire ON public.journey_nodes;
CREATE TRIGGER automation_01_in_progress_fire
AFTER UPDATE OF status ON public.journey_nodes
FOR EACH ROW EXECUTE FUNCTION public.trg_automation_01_in_progress();

-- ---------- 9. Re-sync existing journey_node checklists from the new template ----------
-- For existing automation_01 nodes, overlay the new checklist preserving any
-- 'done' flags from items whose key still exists. Then ensure_* will rebuild
-- tasks accordingly.
DO $$
DECLARE
  v_template jsonb;
  v_node record;
  v_merged jsonb;
  v_item jsonb;
  v_existing_done boolean;
BEGIN
  SELECT checklist INTO v_template FROM public.journey_templates
    WHERE key = 'automation_01' LIMIT 1;
  IF v_template IS NULL THEN RETURN; END IF;

  FOR v_node IN
    SELECT id, checklist, client_project_id FROM public.journey_nodes WHERE key = 'automation_01'
  LOOP
    v_merged := '[]'::jsonb;
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_template)
    LOOP
      SELECT coalesce((old_item->>'done')::boolean, false) INTO v_existing_done
        FROM jsonb_array_elements(coalesce(v_node.checklist, '[]'::jsonb)) old_item
       WHERE old_item->>'key' = v_item->>'key' LIMIT 1;
      v_merged := v_merged || jsonb_build_array(
        v_item || jsonb_build_object('done', coalesce(v_existing_done, false))
      );
    END LOOP;

    UPDATE public.journey_nodes
       SET checklist = v_merged, updated_at = now()
     WHERE id = v_node.id;

    IF v_node.client_project_id IS NOT NULL THEN
      PERFORM public.ensure_automation_01_tasks_for_project(v_node.client_project_id);
    END IF;
  END LOOP;
END $$;
