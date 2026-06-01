ALTER TABLE public.client_projects ADD COLUMN IF NOT EXISTS source_order_id text;
CREATE UNIQUE INDEX IF NOT EXISTS client_projects_source_order_id_uidx
  ON public.client_projects(source_order_id) WHERE source_order_id IS NOT NULL;