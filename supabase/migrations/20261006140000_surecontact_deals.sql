-- SureContact Sales Pipeline deal linkage (CRE-286).
--
-- One deal per client_project: the project is the sales opportunity, and
-- every proposal sent or revised against it (CRE-287's version_group_id
-- thread) updates that same deal instead of creating a new one each time.
-- client_project_id is NOT NULL on client_proposals, so every proposal
-- always resolves to exactly one project to key off.
--
-- surecontact_deal_stage mirrors the deal's last-known stage key (one of
-- new/qualifying/demoScheduled/proposalSent/inNegotiation/won/lost) so the
-- sync can tell a forward move from a backward one without a SureContact GET
-- on every send.
--
-- Idempotent throughout: this database takes migrations from this repo and
-- from Lovable's agent.
ALTER TABLE public.client_projects
  ADD COLUMN IF NOT EXISTS surecontact_deal_id UUID,
  ADD COLUMN IF NOT EXISTS surecontact_deal_stage TEXT;

COMMENT ON COLUMN public.client_projects.surecontact_deal_id IS
  'The SureContact Sales Pipeline deal uuid for this project''s opportunity. Set once, on the first proposal send; every later stage/amount update targets this same deal.';
COMMENT ON COLUMN public.client_projects.surecontact_deal_stage IS
  'Last-known stage key synced to SureContact (new/qualifying/demoScheduled/proposalSent/inNegotiation/won/lost). Lets the sync detect a backward move without calling SureContact first.';

-- Link Bree's hand-made "Menovia Phase 2" deal to the Menovia.ai project so
-- the first automated sync on that project updates it instead of creating a
-- duplicate. Matches via either Menovia Phase 2 proposal row — the 9/23
-- original (8b685031...) or the 10/6 reupload with the $5,000 total
-- (439b739c...) — since both should live on the same client_project_id.
-- Guarded to only act when both ids agree on exactly one project, so a
-- surprise mismatch leaves the column untouched instead of mis-linking.
DO $$
DECLARE
  target_project_ids uuid[];
BEGIN
  SELECT array_agg(DISTINCT client_project_id) INTO target_project_ids
  FROM public.client_proposals
  WHERE id IN ('8b685031-2aa8-4c93-8391-f7af3a595de1', '439b739c-4731-4e04-82ba-b4eca75ce3c0');

  IF target_project_ids IS NOT NULL AND array_length(target_project_ids, 1) = 1 THEN
    UPDATE public.client_projects
       SET surecontact_deal_id = '3c294784-d883-4535-9ef7-e2dbe9bac37b',
           surecontact_deal_stage = 'proposalSent'
     WHERE id = target_project_ids[1]
       AND surecontact_deal_id IS NULL;
  END IF;
END $$;
