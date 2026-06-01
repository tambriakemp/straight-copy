ALTER TABLE public.project_tasks ADD COLUMN IF NOT EXISTS email_template jsonb;

CREATE TABLE IF NOT EXISTS public.web_dev_scheduled_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  send_after timestamptz NOT NULL,
  sent_at timestamptz,
  last_error text,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.web_dev_scheduled_emails TO authenticated;
GRANT ALL ON public.web_dev_scheduled_emails TO service_role;

ALTER TABLE public.web_dev_scheduled_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage web_dev_scheduled_emails"
ON public.web_dev_scheduled_emails FOR ALL TO authenticated
USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Service role manages web_dev_scheduled_emails"
ON public.web_dev_scheduled_emails FOR ALL TO public
USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_web_dev_scheduled_pending
ON public.web_dev_scheduled_emails(send_after) WHERE sent_at IS NULL;