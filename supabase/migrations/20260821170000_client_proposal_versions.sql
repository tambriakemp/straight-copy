-- History behind client_proposals.content_version.
--
-- The counter already existed but nothing sat behind it, so a revision was a
-- one-way door and "actually, put that back" was unanswerable. Bree says that
-- to Claude constantly and expects it to work; it should work here too.
--
-- One row per section write. A twelve-section document produces twelve rows,
-- which is cheap and means a run that dies halfway leaves a readable trail of
-- exactly how far it got.
--
-- Deliberately NOT added to supabase_realtime. Same reasoning already applied
-- to agent_message_transcripts: every row carries a full document snapshot, so
-- publishing this table would re-broadcast the whole document on every write —
-- heaviest on precisely the long proposals it exists for.
--
-- Restore is another write, not a delete: it copies an old snapshot forward as
-- a new version. History stays append-only, so undoing an undo works.
--
-- GROWTH: a proposal revised heavily over weeks accumulates snapshots of a
-- ~24,000-character document. Not a problem at current volume — there are two
-- proposals in the entire database — but the characteristic is noted here so
-- whoever hits it knows the omission was considered rather than missed.
--
-- Idempotent throughout: this database takes migrations from both this repo
-- and Lovable's agent, so assume every statement may already have run.

CREATE TABLE IF NOT EXISTS public.client_proposal_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id    uuid NOT NULL REFERENCES public.client_proposals(id) ON DELETE CASCADE,
  version        integer NOT NULL,
  content        jsonb NOT NULL,
  -- Exactly one of these is set: a person or an agent made the change.
  changed_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_agent uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  -- "Rewrote Investment & Pass-Throughs", "Restored version 4".
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_proposal_versions IS
  'Append-only snapshots of client_proposals.content, one per section write. Restoring copies a snapshot forward as a new version rather than deleting anything.';

-- The only query this table serves: the history of one proposal, newest first.
CREATE INDEX IF NOT EXISTS client_proposal_versions_proposal_idx
  ON public.client_proposal_versions (proposal_id, version DESC);

-- Two writers must never land on the same version number for one proposal.
CREATE UNIQUE INDEX IF NOT EXISTS client_proposal_versions_unique_version
  ON public.client_proposal_versions (proposal_id, version);

ALTER TABLE public.client_proposal_versions ENABLE ROW LEVEL SECURITY;

-- Mirrors client_proposals exactly, so history is never readable by anyone who
-- cannot already read the proposal itself.
DROP POLICY IF EXISTS "Admins manage proposal versions" ON public.client_proposal_versions;
CREATE POLICY "Admins manage proposal versions"
  ON public.client_proposal_versions
  FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role manages proposal versions" ON public.client_proposal_versions;
CREATE POLICY "Service role manages proposal versions"
  ON public.client_proposal_versions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
