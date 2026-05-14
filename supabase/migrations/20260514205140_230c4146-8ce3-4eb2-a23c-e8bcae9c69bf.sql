CREATE TABLE public.preview_approvals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.preview_projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('page', 'asset')),
  path TEXT NOT NULL,
  approver_name TEXT,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, kind, path)
);

CREATE INDEX idx_preview_approvals_project ON public.preview_approvals(project_id);

ALTER TABLE public.preview_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage preview_approvals"
  ON public.preview_approvals FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Service role manages preview_approvals"
  ON public.preview_approvals FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');