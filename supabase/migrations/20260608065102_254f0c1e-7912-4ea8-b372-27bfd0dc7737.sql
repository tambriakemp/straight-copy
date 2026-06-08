
CREATE OR REPLACE FUNCTION public.log_preview_approval_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_client_id uuid; v_project uuid; v_name text;
BEGIN
  SELECT cp.client_id, pp.client_project_id INTO v_client_id, v_project
    FROM public.preview_projects pp
    LEFT JOIN public.client_projects cp ON cp.id = pp.client_project_id
   WHERE pp.id = NEW.project_id LIMIT 1;
  SELECT coalesce(business_name, contact_name, 'Client') INTO v_name FROM public.clients WHERE id = v_client_id;
  INSERT INTO public.activity_events(kind, title, description, client_id, client_project_id, actor, metadata)
  VALUES (
    'preview_approved',
    coalesce(v_name, 'Client') || ' approved ' || NEW.kind || ' ' || NEW.path,
    NULL, v_client_id, v_project, NEW.approver_name,
    jsonb_build_object('preview_project_id', NEW.project_id, 'path', NEW.path, 'kind', NEW.kind)
  );
  RETURN NEW;
END $$;
