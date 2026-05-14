ALTER TABLE public.client_projects DROP CONSTRAINT IF EXISTS client_projects_type_check;
ALTER TABLE public.client_projects ADD CONSTRAINT client_projects_type_check
  CHECK (type IN ('automation_build','site_preview','app_development','web_development','marketing'));

UPDATE public.client_projects
SET type = 'web_development', updated_at = now()
WHERE id = '4ea66fdf-edf9-403a-aa04-cc2afc969151';