ALTER TABLE public.client_projects DROP CONSTRAINT IF EXISTS client_projects_type_check;

ALTER TABLE public.client_projects
  ADD CONSTRAINT client_projects_type_check
  CHECK (type IN ('automation_build', 'site_preview', 'app_development'));