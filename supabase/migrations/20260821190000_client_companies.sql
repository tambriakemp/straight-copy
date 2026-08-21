-- Companies: a client can be more than one business.
--
-- Bree: "A client can have more than one company/business. Khadra Kahin has 3
-- different businesses that I am working on for her and any of these business
-- can have different type of projects."
--
-- The old shape said otherwise. `clients.business_name` is a single text column,
-- so one person running three businesses had to be one row with one name — and
-- everything hanging off that client inherited it. That is exactly how a
-- proposal for Aviya Telemed came to be filed under Menovia, and why an agent
-- reading the data faithfully wrote "Email Dr. Kahin at Menovia to re-share the
-- Aviya Telemed proposal". The agent was right. The schema was wrong.
--
--   clients            the person and the relationship
--     client_companies   the businesses they run
--       client_contacts    who to speak to at that business
--       client_projects    the work, for that business
--
-- ADDITIVE ON PURPOSE. `business_name` is read in 64 files across 20+ edge
-- functions; dropping it here would break the portal, every agent gatherer and
-- most of the admin in one commit. So it stays, kept in step with the primary
-- company by trigger, and the readers move over afterwards. The column is
-- deprecated from this migration onward, not deleted.
--
-- Idempotent throughout: this database takes migrations from this repo and from
-- Lovable's agent.

-- 1. The businesses ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_companies (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name         text NOT NULL,
  email        text,
  phone        text,
  website      text,
  notes        text,
  -- The one whose name stands in for the client in any list that still shows a
  -- single business. Exactly one per client, enforced below.
  is_primary   boolean NOT NULL DEFAULT false,
  archived     boolean NOT NULL DEFAULT false,
  order_index  integer NOT NULL DEFAULT 0,
  -- SureContact models companies too, so the sync has somewhere to write back.
  surecontact_company_uuid text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_companies_client_idx
  ON public.client_companies (client_id, order_index);

-- One primary per client. A partial unique index rather than a check, so the
-- database refuses a second primary instead of trusting every writer to unset
-- the old one first.
CREATE UNIQUE INDEX IF NOT EXISTS client_companies_one_primary_idx
  ON public.client_companies (client_id) WHERE is_primary;

ALTER TABLE public.client_companies ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_companies TO authenticated;
GRANT ALL ON public.client_companies TO service_role;

DROP POLICY IF EXISTS "Admins manage client_companies" ON public.client_companies;
CREATE POLICY "Admins manage client_companies"
  ON public.client_companies FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role manages client_companies" ON public.client_companies;
CREATE POLICY "Service role manages client_companies"
  ON public.client_companies FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 2. What hangs off a company ------------------------------------------------
-- Nullable, because everything that exists today predates companies and must
-- keep working un-migrated. client_id stays on both: it is the ownership edge
-- RLS and the portal are built on, and deriving it through a nullable company
-- would make every one of those policies conditional.
ALTER TABLE public.client_contacts
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.client_companies(id) ON DELETE SET NULL;
ALTER TABLE public.client_projects
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.client_companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS client_contacts_company_idx ON public.client_contacts (company_id);
CREATE INDEX IF NOT EXISTS client_projects_company_idx ON public.client_projects (company_id);

-- 3. Backfill ----------------------------------------------------------------
-- One company per existing client, from the name they already had. Deliberately
-- conservative: every existing project goes to that company, even where a
-- project name hints it belongs to a different business. Splitting Aviya Telemed
-- out of Menovia is a judgement about the real world, and guessing it here is
-- how the data gets quietly wrong in a second way. The UI is where that move
-- happens, by someone who knows.
INSERT INTO public.client_companies (client_id, name, email, phone, is_primary, order_index)
SELECT c.id,
       COALESCE(NULLIF(btrim(c.business_name), ''), NULLIF(btrim(c.contact_name), ''), 'Untitled company'),
       c.contact_email,
       c.contact_phone,
       true,
       0
  FROM public.clients c
 WHERE NOT EXISTS (
   SELECT 1 FROM public.client_companies cc WHERE cc.client_id = c.id
 );

UPDATE public.client_projects p
   SET company_id = cc.id
  FROM public.client_companies cc
 WHERE cc.client_id = p.client_id AND cc.is_primary AND p.company_id IS NULL;

UPDATE public.client_contacts ct
   SET company_id = cc.id
  FROM public.client_companies cc
 WHERE cc.client_id = ct.client_id AND cc.is_primary AND ct.company_id IS NULL;

-- 4. Keep the deprecated column honest ---------------------------------------
-- Until every reader has moved to companies, `clients.business_name` has to go
-- on being right. Renaming the primary company without this would leave 60-odd
-- call sites showing the old name — including client-facing email and the
-- portal. The trigger is the bridge, and it is what makes this migration safe
-- to ship before any of those files change.
CREATE OR REPLACE FUNCTION public.sync_client_business_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_primary THEN
    UPDATE public.clients
       SET business_name = NEW.name, updated_at = now()
     WHERE id = NEW.client_id
       AND business_name IS DISTINCT FROM NEW.name;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_client_companies_sync_name ON public.client_companies;
CREATE TRIGGER trg_client_companies_sync_name
  AFTER INSERT OR UPDATE OF name, is_primary ON public.client_companies
  FOR EACH ROW EXECUTE FUNCTION public.sync_client_business_name();

COMMENT ON TABLE public.client_companies IS
  'The businesses a client runs. One client, many companies; projects and contacts hang off a company.';
COMMENT ON COLUMN public.clients.business_name IS
  'DEPRECATED — kept in step with the primary client_companies row by trigger. Read client_companies instead.';
COMMENT ON COLUMN public.client_projects.company_id IS
  'Which of the client''s businesses this project is for. Nullable until every project has been assigned.';

-- 5. Promote the businesses Bree already named -------------------------------
-- `client_projects.business_name` is a free-text column she has been filling in
-- with "Which business this project is for" — the concept improvised in the
-- only place the schema allowed. It is real data, entered by hand, and it names
-- the three Kahin businesses exactly: Menovia, Aviya Telemed, Michigan Health
-- Specialist. So the split comes from what she typed rather than from a guess
-- about project names.
--
-- Matched case-insensitively on the trimmed name, and only exactly. "Cre8
-- Visions" does not collapse into "Cre8 Visions, LLC" — they may well be the
-- personal brand and the company, and deciding that here is precisely the sort
-- of inference that puts wrong data somewhere nobody thinks to look. Near
-- duplicates are left standing for a person to merge.
INSERT INTO public.client_companies (client_id, name, is_primary, order_index)
SELECT DISTINCT p.client_id, btrim(p.business_name), false, 1
  FROM public.client_projects p
 WHERE NULLIF(btrim(p.business_name), '') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.client_companies cc
      WHERE cc.client_id = p.client_id
        AND lower(btrim(cc.name)) = lower(btrim(p.business_name))
   );

UPDATE public.client_projects p
   SET company_id = cc.id
  FROM public.client_companies cc
 WHERE cc.client_id = p.client_id
   AND lower(btrim(cc.name)) = lower(btrim(p.business_name))
   AND NULLIF(btrim(p.business_name), '') IS NOT NULL;

COMMENT ON COLUMN public.client_projects.business_name IS
  'DEPRECATED — superseded by company_id. Kept until the write paths move over.';
