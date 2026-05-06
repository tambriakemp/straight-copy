CREATE TABLE public.project_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_project_id uuid NOT NULL,
  label text NOT NULL,
  url text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_links_project ON public.project_links(client_project_id);

ALTER TABLE public.project_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage project_links" ON public.project_links
  FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Service role manages project_links" ON public.project_links
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER update_project_links_updated_at
  BEFORE UPDATE ON public.project_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.project_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_project_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_notes_project ON public.project_notes(client_project_id);

ALTER TABLE public.project_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage project_notes" ON public.project_notes
  FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Service role manages project_notes" ON public.project_notes
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER update_project_notes_updated_at
  BEFORE UPDATE ON public.project_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();