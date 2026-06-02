ALTER TABLE public.client_projects
  ADD COLUMN IF NOT EXISTS primary_contact_id uuid
  REFERENCES public.client_contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_projects_primary_contact_id
  ON public.client_projects(primary_contact_id);