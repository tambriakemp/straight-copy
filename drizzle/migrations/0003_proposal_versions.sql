-- Proposal versions (CRE-287).
--
-- Dr. Kahin's portal showed two "Menovia Phase 2" cards, both sent — the
-- original (no commercial terms) and the $5,000 reupload — with no way to
-- tell which one was current. She could still sign the old one, which skips
-- the deposit automation entirely. This gives a proposal a successor:
-- `supersedes_id` points at the proposal it replaces, `version_group_id`
-- threads every version of "the same proposal" together, and `version` is
-- its place in that thread. Uploading "a new version of X" (or the admin
-- "mark superseded" action, for pairing two rows that already exist) sets
-- the old row's status to 'superseded' and links the two into one group.
--
-- Idempotent throughout: this database takes migrations from both this repo
-- and Lovable's agent, so assume every statement may already have run.

ALTER TABLE public.client_proposals
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS version_group_id UUID,
  ADD COLUMN IF NOT EXISTS supersedes_id UUID REFERENCES public.client_proposals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_proposals_version_group ON public.client_proposals (version_group_id, version DESC);

-- Every row is the head of its own one-row group until something supersedes
-- it or it supersedes something — set here rather than as a column DEFAULT
-- because the default value (the row's own id) doesn't exist until insert.
CREATE OR REPLACE FUNCTION public.set_proposal_version_group()
RETURNS trigger AS $$
BEGIN
  IF NEW.version_group_id IS NULL THEN
    NEW.version_group_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_client_proposals_version_group ON public.client_proposals;
CREATE TRIGGER trg_client_proposals_version_group
  BEFORE INSERT ON public.client_proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_proposal_version_group();

-- Backfill: every existing row becomes its own group of one.
UPDATE public.client_proposals SET version_group_id = id WHERE version_group_id IS NULL;

-- 'superseded' joins the other terminal-ish statuses. A superseded proposal
-- is never shown to the client (see CLIENT_HIDDEN_STATUSES in proposal-sign)
-- and can never be signed (see the `sign` action's status guard) — it stays
-- visible to admins, collapsed under whichever version replaced it.
ALTER TABLE public.client_proposals DROP CONSTRAINT IF EXISTS client_proposals_status_chk;
ALTER TABLE public.client_proposals
  ADD CONSTRAINT client_proposals_status_chk
  CHECK (status IN ('draft', 'ready', 'sent', 'signed', 'voided', 'declined', 'superseded'));

COMMENT ON COLUMN public.client_proposals.version_group_id IS
  'Threads every version of "the same proposal" together. Defaults to the row''s own id (a group of one) via trg_client_proposals_version_group.';
COMMENT ON COLUMN public.client_proposals.supersedes_id IS
  'The proposal this version replaced, if any. Set alongside version_group_id by the `supersede` action.';