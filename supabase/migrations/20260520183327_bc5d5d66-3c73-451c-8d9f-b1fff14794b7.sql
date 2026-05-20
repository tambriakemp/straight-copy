CREATE TABLE public.preview_approval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  kind text NOT NULL,
  path text NOT NULL,
  action text NOT NULL,
  approver_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_preview_approval_events_project ON public.preview_approval_events(project_id, created_at DESC);

ALTER TABLE public.preview_approval_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage preview_approval_events"
  ON public.preview_approval_events FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Service role manages preview_approval_events"
  ON public.preview_approval_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');