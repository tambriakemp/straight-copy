-- Payment schedules per proposal (CRE-267).
--
-- Today a project has exactly one implied schedule: project_invoices rows
-- carry no schedule reference, and `project-invoices` `schedule` deletes
-- every `scheduled` row on the project that isn't in the incoming payload.
-- Two schedules on one project would wipe each other. This introduces
-- payment_schedules as the real parent of a set of invoices, so a project
-- can carry more than one (e.g. a signed proposal's schedule plus a manual
-- one), and scopes every write to its own schedule_id.

CREATE TABLE IF NOT EXISTS public.payment_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  client_project_id UUID NOT NULL REFERENCES public.client_projects(id) ON DELETE CASCADE,
  -- Unique and nullable: a schedule created from a signed proposal can only
  -- ever have the one schedule for that proposal, but most schedules (today,
  -- all of them) are manual and have no proposal at all.
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

-- project_invoices: which schedule an invoice belongs to, which proposal
-- installment produced it (if any), and the trigger/grace period that
-- decided when it fires. `sequence` on `schedule` now counts within the
-- schedule, not the whole project.
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

-- Backfill: every project that already has invoices gets exactly one manual
-- schedule, and every one of its invoices is attached to it. Idempotent —
-- only projects with an unassigned invoice are touched.
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

-- Commercial terms captured on upload, so a signed proposal has everything
-- it needs to create its own schedule and invoices without anyone typing
-- numbers in by hand afterward. `payment_terms` is the installment template
-- (label, trigger, amount type/value) — the actual cents get computed
-- against `total_cents` at signature time, once we know the total is final.
ALTER TABLE public.client_proposals
  ADD COLUMN IF NOT EXISTS total_cents INTEGER,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'usd',
  ADD COLUMN IF NOT EXISTS payment_due_days INTEGER,
  ADD COLUMN IF NOT EXISTS payment_terms JSONB;

-- 'ready' sits between 'draft' and 'sent': terms are filled in and the PDF is
-- uploaded, but nothing has gone to the client yet. Uploading no longer jumps
-- straight to 'sent' — that status is only true once the Send email actually
-- goes out (see proposal-sign `notify`).
ALTER TABLE public.client_proposals DROP CONSTRAINT IF EXISTS client_proposals_status_chk;
ALTER TABLE public.client_proposals
  ADD CONSTRAINT client_proposals_status_chk
  CHECK (status IN ('draft', 'ready', 'sent', 'signed', 'voided', 'declined'));

-- Signed-PDF integrity (CRE-267 security fixes). A source PDF is never
-- overwritten once sent — re-uploads land at a new versioned path — and both
-- the source and signed bytes get a recorded hash so the signature
-- certificate can say exactly what was signed.
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
