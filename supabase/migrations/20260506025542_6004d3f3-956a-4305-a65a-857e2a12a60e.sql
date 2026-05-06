
-- 1. client_projects table
CREATE TABLE public.client_projects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('automation_build','site_preview')),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','complete','archived')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_projects_client ON public.client_projects(client_id);
CREATE INDEX idx_client_projects_type ON public.client_projects(type);

ALTER TABLE public.client_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage client_projects"
  ON public.client_projects FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Service role manages client_projects"
  ON public.client_projects FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_client_projects_updated
  BEFORE UPDATE ON public.client_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Add client_project_id linking columns
ALTER TABLE public.preview_projects        ADD COLUMN client_project_id uuid REFERENCES public.client_projects(id) ON DELETE SET NULL;
ALTER TABLE public.journey_nodes           ADD COLUMN client_project_id uuid REFERENCES public.client_projects(id) ON DELETE SET NULL;
ALTER TABLE public.client_contracts        ADD COLUMN client_project_id uuid REFERENCES public.client_projects(id) ON DELETE SET NULL;
ALTER TABLE public.client_deliveries       ADD COLUMN client_project_id uuid REFERENCES public.client_projects(id) ON DELETE SET NULL;
ALTER TABLE public.client_checklist_items  ADD COLUMN client_project_id uuid REFERENCES public.client_projects(id) ON DELETE SET NULL;
ALTER TABLE public.client_automations      ADD COLUMN client_project_id uuid REFERENCES public.client_projects(id) ON DELETE SET NULL;

CREATE INDEX idx_preview_projects_client_project ON public.preview_projects(client_project_id);
CREATE INDEX idx_journey_nodes_client_project ON public.journey_nodes(client_project_id);

-- 3. Backfill: one automation_build project per existing client
WITH inserted AS (
  INSERT INTO public.client_projects (client_id, type, name, status)
  SELECT
    c.id,
    'automation_build',
    COALESCE(NULLIF(c.business_name,'') || ' — ' || INITCAP(c.tier) || ' build',
             INITCAP(c.tier) || ' build'),
    CASE WHEN c.archived THEN 'archived' ELSE 'active' END
  FROM public.clients c
  RETURNING id, client_id
)
UPDATE public.journey_nodes jn
   SET client_project_id = i.id
  FROM inserted i
 WHERE jn.client_id = i.client_id AND jn.client_project_id IS NULL;

-- Link the rest of per-client artifacts to that automation_build project
UPDATE public.client_contracts cc
   SET client_project_id = cp.id
  FROM public.client_projects cp
 WHERE cp.client_id = cc.client_id
   AND cp.type = 'automation_build'
   AND cc.client_project_id IS NULL;

UPDATE public.client_deliveries cd
   SET client_project_id = cp.id
  FROM public.client_projects cp
 WHERE cp.client_id = cd.client_id
   AND cp.type = 'automation_build'
   AND cd.client_project_id IS NULL;

UPDATE public.client_checklist_items ci
   SET client_project_id = cp.id
  FROM public.client_projects cp
 WHERE cp.client_id = ci.client_id
   AND cp.type = 'automation_build'
   AND ci.client_project_id IS NULL;

UPDATE public.client_automations ca
   SET client_project_id = cp.id
  FROM public.client_projects cp
 WHERE cp.client_id = ca.client_id
   AND cp.type = 'automation_build'
   AND ca.client_project_id IS NULL;

-- 4. Backfill: site_preview projects for previews whose client_label matches a client business_name
WITH matches AS (
  SELECT pp.id AS preview_id, c.id AS client_id, pp.name AS preview_name, pp.archived
    FROM public.preview_projects pp
    JOIN public.clients c
      ON lower(trim(pp.client_label)) = lower(trim(c.business_name))
   WHERE pp.client_project_id IS NULL
     AND pp.client_label IS NOT NULL
), created AS (
  INSERT INTO public.client_projects (client_id, type, name, status)
  SELECT m.client_id, 'site_preview', m.preview_name,
         CASE WHEN m.archived THEN 'archived' ELSE 'active' END
    FROM matches m
  RETURNING id, name, client_id
)
UPDATE public.preview_projects pp
   SET client_project_id = cr.id
  FROM created cr, matches m
 WHERE pp.id = m.preview_id
   AND cr.client_id = m.client_id
   AND cr.name = m.preview_name;

-- 5. Update seed trigger to auto-create the automation_build project AND stamp journey nodes with it
CREATE OR REPLACE FUNCTION public.seed_journey_nodes_for_client()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  proj_id uuid;
BEGIN
  -- Create default automation_build project for the new client
  INSERT INTO public.client_projects (client_id, type, name, status)
  VALUES (NEW.id,
          'automation_build',
          COALESCE(NULLIF(NEW.business_name,'') || ' — ' || INITCAP(NEW.tier) || ' build',
                   INITCAP(NEW.tier) || ' build'),
          'active')
  RETURNING id INTO proj_id;

  INSERT INTO public.journey_nodes (client_id, client_project_id, template_id, key, label, order_index, checklist)
  SELECT NEW.id, proj_id, t.id, t.key, t.label, t.order_index, t.checklist
  FROM public.journey_templates t
  WHERE t.tier = NEW.tier
  ON CONFLICT (client_id, key) DO NOTHING;
  RETURN NEW;
END;
$function$;
