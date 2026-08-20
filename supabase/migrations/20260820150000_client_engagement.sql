-- Client Engagement Manager: the proposal lifecycle spine.
--
-- Idempotent throughout. This database takes migrations from two places (this
-- repo and Lovable's own agent), so every statement here has to be safe to run
-- a second time against a database where some of it already landed.

-- ---------------------------------------------------------------------------
-- 1. Proposals gain structured content and a send/follow-up state.
--    source_pdf_path stays as-is: an uploaded PDF and a generated proposal are
--    both valid, and a proposal may have either or both.
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_proposals
  ADD COLUMN IF NOT EXISTS content            jsonb,
  ADD COLUMN IF NOT EXISTS content_version    integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by_agent   uuid,
  ADD COLUMN IF NOT EXISTS sent_at            timestamptz,
  ADD COLUMN IF NOT EXISTS sent_to            text,
  ADD COLUMN IF NOT EXISTS send_message_id    text,
  ADD COLUMN IF NOT EXISTS first_opened_at    timestamptz,
  ADD COLUMN IF NOT EXISTS first_viewed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at   timestamptz,
  ADD COLUMN IF NOT EXISTS next_followup_at   timestamptz,
  ADD COLUMN IF NOT EXISTS followup_count     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meeting_link       text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_proposals_created_by_agent_fkey'
  ) AND EXISTS (SELECT 1 FROM pg_class WHERE relname = 'agents' AND relnamespace = 'public'::regnamespace)
  THEN
    ALTER TABLE public.client_proposals
      ADD CONSTRAINT client_proposals_created_by_agent_fkey
      FOREIGN KEY (created_by_agent) REFERENCES public.agents(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_client_proposals_followup
  ON public.client_proposals (next_followup_at)
  WHERE status = 'sent';

COMMENT ON COLUMN public.client_proposals.content IS
  'Structured proposal: {cover:{...}, sections:[{key,heading,body}]}. Section keys are the locked Cre8 Visions spine.';
COMMENT ON COLUMN public.client_proposals.send_message_id IS
  'Correlates SureContact engagement events back to this proposal.';

-- ---------------------------------------------------------------------------
-- 2. proposal_events — one ordered timeline per proposal.
--    Deliberately not a view over surecontact_events: half these moments never
--    touch email at all (drafted, viewed in portal, signed), and a view would
--    make the admin panel join four tables to answer one question.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proposal_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id  uuid NOT NULL REFERENCES public.client_proposals(id) ON DELETE CASCADE,
  client_id    uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  event_type   text NOT NULL,
  actor        text NOT NULL DEFAULT 'system',
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_events_proposal
  ON public.proposal_events (proposal_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposal_events_client
  ON public.proposal_events (client_id, occurred_at DESC);

ALTER TABLE public.proposal_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage proposal_events" ON public.proposal_events;
CREATE POLICY "Admins manage proposal_events"
  ON public.proposal_events FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role manages proposal_events" ON public.proposal_events;
CREATE POLICY "Service role manages proposal_events"
  ON public.proposal_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 3. Let SureContact engagement events point at the proposal they belong to.
-- ---------------------------------------------------------------------------
ALTER TABLE public.surecontact_events
  ADD COLUMN IF NOT EXISTS proposal_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'surecontact_events_proposal_id_fkey'
  ) THEN
    ALTER TABLE public.surecontact_events
      ADD CONSTRAINT surecontact_events_proposal_id_fkey
      FOREIGN KEY (proposal_id) REFERENCES public.client_proposals(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_surecontact_events_proposal
  ON public.surecontact_events (proposal_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Keep last_activity_at current without the writers having to remember.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_proposal_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.client_proposals
     SET last_activity_at = GREATEST(COALESCE(last_activity_at, NEW.occurred_at), NEW.occurred_at),
         first_opened_at  = CASE
             WHEN NEW.event_type = 'email_opened'    AND first_opened_at IS NULL THEN NEW.occurred_at
             ELSE first_opened_at END,
         first_viewed_at  = CASE
             WHEN NEW.event_type = 'viewed_in_portal' AND first_viewed_at IS NULL THEN NEW.occurred_at
             ELSE first_viewed_at END
   WHERE id = NEW.proposal_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_proposal_events_touch ON public.proposal_events;
CREATE TRIGGER trg_proposal_events_touch
  AFTER INSERT ON public.proposal_events
  FOR EACH ROW EXECUTE FUNCTION public.touch_proposal_activity();

-- ---------------------------------------------------------------------------
-- 5. The agent itself.
--    autonomy 'act_in_app': it may draft proposals, create projects and sync
--    contacts on its own, but anything that reaches a client waits for Bree.
-- ---------------------------------------------------------------------------
INSERT INTO public.agents (key, name, role, description, autonomy, schedule_cron, delivery, config, accent_color)
VALUES (
  'client-engagement',
  'Bria',
  'Client engagement manager',
  'Owns the client relationship from first proposal to signature. Keeps SureContact in step with the CRM, writes proposals to the Cre8 Visions structure, gets them in front of clients, and follows up when they go quiet.',
  'act_in_app',
  '0 13 * * 1-5',
  '{"in_app":true,"email":false,"tasks":true,"push":false}'::jsonb,
  '{"followup_after_days":4,"second_followup_after_days":9,"max_followups":3,"stale_after_days":21,"meeting_link":""}'::jsonb,
  '#8B7355'
)
ON CONFLICT (key) DO NOTHING;
