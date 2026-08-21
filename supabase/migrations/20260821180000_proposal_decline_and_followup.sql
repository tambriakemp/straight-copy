-- A client can say no, and a proposal is chased after two days rather than four.
--
-- Two changes that belong together: without a decline, "no" and "silence" look
-- identical in the data, so a client who has already said no keeps landing in
-- the follow-up buckets and getting nudged. Shortening the window to 48 hours
-- makes that worse, not better — so the way out has to exist first.
--
-- Idempotent throughout: this database takes migrations from this repo and from
-- Lovable's agent, so assume any statement here may already have been applied.

-- 1. The columns behind a decline -------------------------------------------
ALTER TABLE public.client_proposals
  ADD COLUMN IF NOT EXISTS declined_at    timestamptz,
  -- Optional on purpose. Forcing a reason to decline is how you get "n/a", and
  -- the fact of the decline is worth more than a coerced sentence.
  ADD COLUMN IF NOT EXISTS decline_reason text;

-- 2. 'declined' becomes a legal status ---------------------------------------
-- Distinct from 'voided': voided is the agency withdrawing the document,
-- declined is the client turning it down. Collapsing them would lose the only
-- number that says how often we are losing work.
ALTER TABLE public.client_proposals DROP CONSTRAINT IF EXISTS client_proposals_status_chk;
ALTER TABLE public.client_proposals
  ADD CONSTRAINT client_proposals_status_chk
  CHECK (status IN ('draft', 'sent', 'signed', 'voided', 'declined'));

-- A declined proposal is never followed up again. Clearing the schedule here
-- rather than only in application code means a decline written by any path —
-- the portal, an admin, a future import — drops out of the buckets.
UPDATE public.client_proposals
   SET next_followup_at = NULL
 WHERE status = 'declined' AND next_followup_at IS NOT NULL;

-- 3. Forty-eight hours -------------------------------------------------------
-- Bree: "check for proposals that are outstanding for 48 hours". The config is
-- the place for this, not the prompt — `engagementContext` reads it per agent
-- and only falls back to its own default when the key is absent.
UPDATE public.agents
   SET config = COALESCE(config, '{}'::jsonb)
              || jsonb_build_object(
                   'followup_after_days', 2,
                   -- The second chase moves in proportion rather than staying
                   -- at nine days, which would leave a week of silence between
                   -- the first nudge and the second.
                   'second_followup_after_days', 5
                 )
 WHERE key = 'client-engagement';

-- 4. Finding the outstanding ones --------------------------------------------
-- The follow-up sweep asks for sent, unsigned proposals ordered by how long
-- they have been quiet. Partial, because signed and declined rows are exactly
-- what it never wants.
CREATE INDEX IF NOT EXISTS client_proposals_outstanding_idx
  ON public.client_proposals (last_activity_at NULLS FIRST, sent_at)
  WHERE status = 'sent';

COMMENT ON COLUMN public.client_proposals.declined_at IS
  'When the client declined. Distinct from voided, which is the agency withdrawing it.';
COMMENT ON COLUMN public.client_proposals.decline_reason IS
  'Optional free text the client gave when declining. Never required.';
