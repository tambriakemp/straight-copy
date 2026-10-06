CREATE TABLE IF NOT EXISTS public.payment_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  client_project_id UUID NOT NULL REFERENCES public.client_projects(id) ON DELETE CASCADE,
  proposal_id UUID UNIQUE REFERENCES public.client_proposals(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'Payment schedule',
  total_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  source TEXT NOT NULL CHECK (source IN ('proposal', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_schedules_project ON public.payment_schedules (client_project_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_client ON public.payment_schedules (client_id);

ALTER TABLE public.payment_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage payment_schedules" ON public.payment_schedules;
CREATE POLICY "Admins manage payment_schedules"
  ON public.payment_schedules FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role manages payment_schedules" ON public.payment_schedules;
CREATE POLICY "Service role manages payment_schedules"
  ON public.payment_schedules FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_payment_schedules_updated_at ON public.payment_schedules;
CREATE TRIGGER update_payment_schedules_updated_at
  BEFORE UPDATE ON public.payment_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.project_invoices
  ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES public.payment_schedules(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS proposal_id UUID REFERENCES public.client_proposals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trigger TEXT,
  ADD COLUMN IF NOT EXISTS due_days INTEGER;

ALTER TABLE public.project_invoices DROP CONSTRAINT IF EXISTS project_invoices_trigger_chk;
ALTER TABLE public.project_invoices
  ADD CONSTRAINT project_invoices_trigger_chk
  CHECK (trigger IS NULL OR trigger IN ('on_signature', 'on_completion', 'date'));

CREATE INDEX IF NOT EXISTS idx_project_invoices_schedule ON public.project_invoices (schedule_id, sequence);

DO $$
DECLARE
  proj RECORD;
  new_schedule_id UUID;
BEGIN
  FOR proj IN
    SELECT DISTINCT client_id, client_project_id
    FROM public.project_invoices
    WHERE schedule_id IS NULL
  LOOP
    INSERT INTO public.payment_schedules (client_id, client_project_id, title, total_cents, currency, status, source)
    SELECT
      proj.client_id,
      proj.client_project_id,
      'Payment schedule',
      SUM(amount_cents),
      COALESCE(MIN(currency), 'usd'),
      'active',
      'manual'
    FROM public.project_invoices
    WHERE client_project_id = proj.client_project_id AND schedule_id IS NULL
    RETURNING id INTO new_schedule_id;

    UPDATE public.project_invoices
      SET schedule_id = new_schedule_id
      WHERE client_project_id = proj.client_project_id AND schedule_id IS NULL;
  END LOOP;
END $$;

ALTER TABLE public.client_proposals
  ADD COLUMN IF NOT EXISTS total_cents INTEGER,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'usd',
  ADD COLUMN IF NOT EXISTS payment_due_days INTEGER,
  ADD COLUMN IF NOT EXISTS payment_terms JSONB;

ALTER TABLE public.client_proposals DROP CONSTRAINT IF EXISTS client_proposals_status_chk;
ALTER TABLE public.client_proposals
  ADD CONSTRAINT client_proposals_status_chk
  CHECK (status IN ('draft', 'ready', 'sent', 'signed', 'voided', 'declined'));

ALTER TABLE public.client_proposals
  ADD COLUMN IF NOT EXISTS source_pdf_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source_pdf_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS signed_pdf_sha256 TEXT;

COMMENT ON TABLE public.payment_schedules IS
  'A set of invoices belonging to one project. A project can have more than one (e.g. a signed proposal''s schedule alongside a manual one) — each is edited and sent independently.';
COMMENT ON COLUMN public.project_invoices.schedule_id IS
  'Which payment_schedules row this invoice belongs to. schedule/sequence writes are scoped to this id so one schedule can never touch another''s rows.';
COMMENT ON COLUMN public.client_proposals.payment_terms IS
  'Installment template captured at upload: [{label, trigger: on_signature|on_completion|date, amount_type: percent|fixed, amount_value, due_date?}]. Turned into real project_invoices rows once the proposal is signed.';
COMMENT ON COLUMN public.client_proposals.source_pdf_version IS
  'Bumped on every re-upload of the source PDF so a sent proposal''s file is never silently overwritten.';