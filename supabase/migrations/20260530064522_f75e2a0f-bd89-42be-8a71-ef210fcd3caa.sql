
CREATE TABLE public.project_task_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  dedup_key text NOT NULL DEFAULT ''
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_task_activity TO authenticated;
GRANT ALL ON public.project_task_activity TO service_role;

ALTER TABLE public.project_task_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage project_task_activity"
  ON public.project_task_activity FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Service role manages project_task_activity"
  ON public.project_task_activity FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_project_task_activity_task ON public.project_task_activity(task_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.log_project_task_status_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'complete' THEN
    INSERT INTO public.project_task_activity(task_id, occurred_at, kind, message)
    VALUES (NEW.id, coalesce(NEW.completed_at, now()), 'completed', 'Task marked complete');
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.project_task_activity(task_id, occurred_at, kind, message, metadata)
    VALUES (NEW.id, now(),
            CASE WHEN NEW.status = 'complete' THEN 'completed' ELSE 'status_change' END,
            'Status: ' || OLD.status::text || ' → ' || NEW.status::text,
            jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_project_task_status_activity ON public.project_tasks;
CREATE TRIGGER trg_log_project_task_status_activity
  AFTER INSERT OR UPDATE OF status ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_project_task_status_activity();

CREATE OR REPLACE FUNCTION public.log_email_event_for_clients_tasks(
  _client_id uuid, _item_key text, _kind text, _message text, _occurred_at timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_task_id uuid; v_dedup text := _kind || ':email_tracking';
BEGIN
  IF _occurred_at IS NULL THEN RETURN; END IF;
  FOR v_task_id IN
    SELECT pt.id FROM public.project_tasks pt
      JOIN public.client_projects cp ON cp.id = pt.client_project_id
     WHERE cp.client_id = _client_id AND pt.journey_item_key = _item_key
  LOOP
    DELETE FROM public.project_task_activity
      WHERE task_id = v_task_id AND dedup_key = v_dedup;
    INSERT INTO public.project_task_activity(task_id, occurred_at, kind, message, dedup_key)
    VALUES (v_task_id, _occurred_at, _kind, _message, v_dedup);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_email_tracking_to_task_activity(_client_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record;
BEGIN
  SELECT * INTO t FROM public.client_email_tracking WHERE client_id = _client_id;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM public.log_email_event_for_clients_tasks(_client_id, 'intake.welcome_email_sent',        'sent',   'Welcome email sent',                t.welcome_sent_at);
  PERFORM public.log_email_event_for_clients_tasks(_client_id, 'intake.welcome_email_sent',        'opened', 'Welcome email opened',              t.welcome_opened_at);
  PERFORM public.log_email_event_for_clients_tasks(_client_id, 'intake.welcome_opened',            'opened', 'Welcome email opened',              t.welcome_opened_at);
  PERFORM public.log_email_event_for_clients_tasks(_client_id, 'intake.scope_summary_sent',        'sent',   'Scope summary email sent',          t.scope_sent_at);
  PERFORM public.log_email_event_for_clients_tasks(_client_id, 'intake.scope_summary_sent',        'opened', 'Scope summary email opened',        t.scope_opened_at);
  PERFORM public.log_email_event_for_clients_tasks(_client_id, 'intake.kickoff_confirmation_sent', 'sent',   'Kickoff confirmation email sent',   t.kickoff_sent_at);
  PERFORM public.log_email_event_for_clients_tasks(_client_id, 'intake.kickoff_confirmation_sent', 'opened', 'Kickoff confirmation email opened', t.kickoff_opened_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_email_tracking_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.sync_email_tracking_to_task_activity(NEW.client_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_tracking_to_task_activity ON public.client_email_tracking;
CREATE TRIGGER trg_email_tracking_to_task_activity
  AFTER INSERT OR UPDATE ON public.client_email_tracking
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_email_tracking_activity();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT client_id FROM public.client_email_tracking LOOP
    PERFORM public.sync_email_tracking_to_task_activity(r.client_id);
  END LOOP;
END $$;

UPDATE public.project_task_epics
   SET name = '1. Intake'
 WHERE journey_stage_key = 'intake' AND name = 'Intake';

CREATE OR REPLACE FUNCTION public.ensure_intake_tasks_for_project(_client_project_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_id uuid; v_node_id uuid; v_epic_id uuid; v_checklist jsonb; v_item jsonb;
  v_idx int := 0; v_done boolean;
  v_status project_task_status; v_assignee project_task_assignee_kind; v_url text;
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
             status = CASE
               WHEN v_done THEN 'complete'::project_task_status
               WHEN pt.status = 'complete' THEN 'backlog'::project_task_status
               ELSE pt.status END,
             completed_at = CASE WHEN v_done THEN coalesce(pt.completed_at, now()) ELSE NULL END
       WHERE pt.client_project_id = _client_project_id AND pt.journey_item_key = v_item->>'key';
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

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT id FROM public.client_projects WHERE type='automation_build' LOOP
    PERFORM public.ensure_intake_tasks_for_project(p.id);
  END LOOP;
END $$;
