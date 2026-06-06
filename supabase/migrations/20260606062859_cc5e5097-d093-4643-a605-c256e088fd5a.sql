
ALTER TABLE public.client_projects
  ADD COLUMN IF NOT EXISTS progress_report_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS progress_report_recipient_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS progress_report_last_sent_at timestamptz;

CREATE TABLE IF NOT EXISTS public.project_progress_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_project_id uuid NOT NULL REFERENCES public.client_projects(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  summary_markdown text,
  summary_html text,
  task_ids uuid[] NOT NULL DEFAULT '{}',
  recipients text[] NOT NULL DEFAULT '{}',
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_progress_reports TO authenticated;
GRANT ALL ON public.project_progress_reports TO service_role;

ALTER TABLE public.project_progress_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage progress reports"
  ON public.project_progress_reports
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Service role manages progress reports"
  ON public.project_progress_reports
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_progress_reports_project ON public.project_progress_reports (client_project_id, created_at DESC);
