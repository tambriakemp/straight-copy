-- The $249/mo social plan: a second payment processor, and a tier to sell.
--
-- Idempotent throughout — two writers, see 20260823120000.
--
-- SureCart is deliberately untouched. Everything here is additive: a client
-- bought through SureCart keeps exactly the columns and triggers it had.

-- ---------------------------------------------------------------------------
-- 1. A tier to sell.
--
--    clients_tier_check has only ever allowed launch and growth, so a social
--    client could not be inserted at all. Widening rather than reusing 'launch'
--    because the tier is what SureContact tags on — reusing it would file a
--    $249/mo social client as a Launch build in every sequence and report.
-- ---------------------------------------------------------------------------
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_tier_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_tier_check
  CHECK (tier = ANY (ARRAY['launch'::text, 'growth'::text, 'social'::text]));

-- ---------------------------------------------------------------------------
-- 2. A second processor.
--
--    The seven surecart_*/subscription_* columns on clients assume one
--    processor. Rather than a parallel set of seven stripe_* columns, only the
--    two identifiers Stripe actually needs are added, plus a discriminator
--    saying which processor owns this client's subscription. The existing
--    subscription_status / _canceled_at / _current_period_end columns are
--    processor-agnostic already and are reused as-is.
-- ---------------------------------------------------------------------------
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS stripe_customer_id     text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS payment_provider       text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_payment_provider_chk') THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_payment_provider_chk
      CHECK (payment_provider IS NULL OR payment_provider IN ('surecart', 'stripe'));
  END IF;
END $$;

COMMENT ON COLUMN public.clients.payment_provider IS
  'Which processor owns this client''s subscription. NULL for clients that predate the split — those are all SureCart.';

-- One client per Stripe subscription, and per Stripe customer. Partial so the
-- overwhelming majority of rows, which have neither, do not collide.
CREATE UNIQUE INDEX IF NOT EXISTS clients_stripe_subscription_idx
  ON public.clients (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS clients_stripe_customer_idx
  ON public.clients (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Per-project posting settings.
--
--    posts_per_week, preferred hours and the minimum gap live on the AGENT
--    today, so every client gets an identical schedule — and nothing anywhere
--    records a timezone, so a California client posts at 6am local. These make
--    the settings per-client, falling back to the agent's config when unset.
--
--    social_settings is jsonb rather than a column each because the shape is
--    still moving (channels, content pillars, no-gos) and none of it is
--    queried — it is read whole, once per run, by the gatherer.
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_projects
  ADD COLUMN IF NOT EXISTS timezone            text,
  ADD COLUMN IF NOT EXISTS subscription_status text,
  ADD COLUMN IF NOT EXISTS social_settings     jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.client_projects.timezone IS
  'IANA zone for scheduling, e.g. America/Los_Angeles. NULL means UTC.';
COMMENT ON COLUMN public.client_projects.subscription_status IS
  'Mirrored from the processor. Anything other than active or trialing pauses posting — see dispatch-social-schedule.';
COMMENT ON COLUMN public.client_projects.social_settings IS
  'Per-client posting preferences collected at checkout: posts_per_week, preferred_days, channels, promote, avoid.';

-- The dispatcher checks this on every send, so it is worth an index on the
-- projects that are not in good standing — a small set by definition.
CREATE INDEX IF NOT EXISTS client_projects_subscription_status_idx
  ON public.client_projects (subscription_status)
  WHERE subscription_status IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. The social journey.
--
--    journey_templates.tier is already used for more than tiers — there is an
--    app_development set in there — so a 'social' set follows the existing
--    grain rather than inventing a second mechanism.
--
--    EVERY item is owner 'auto' or 'client'. Not one is 'agency', and that is
--    the whole point: auto_complete_journey_node only fires the kickoff when
--    every non-kickoff item is done, so a single agency-owned item means the
--    node never completes and onboarding stalls forever. The launch and growth
--    intake sets each carry three such items, which is why they need a human.
-- ---------------------------------------------------------------------------
INSERT INTO public.journey_templates (tier, order_index, key, label, description, checklist)
VALUES
  ('social', 0, 'intake', 'Setup', 'Accounts connected and content flowing',
   jsonb_build_array(
     jsonb_build_object('key','intake.welcome_email_sent','label','Welcome email sent','owner','auto','done',false),
     jsonb_build_object('key','intake.portal_accessed','label','Portal opened','owner','client','done',false),
     jsonb_build_object('key','intake.copost_provisioned','label','CoPost project created and invite sent','owner','auto','done',false),
     jsonb_build_object('key','intake.copost_connected','label','CoPost invite accepted and Facebook, Instagram and TikTok connected','owner','client','done',false),
     jsonb_build_object('key','intake.photos_uploaded','label','First photos added to the CoPost media library','owner','client','done',false)
   )),
  ('social', 1, 'brand_voice', 'Brand Voice', 'Voice written from the checkout answers',
   jsonb_build_array(
     jsonb_build_object('key','brand_voice.document_generated','label','Brand voice written','owner','auto','auto_key','brand_voice_generated','done',false),
     jsonb_build_object('key','brand_voice.sent_to_client','label','Brand voice sent to the client','owner','auto','done',false)
   )),
  ('social', 2, 'active', 'Posting', 'Iris is scheduling and publishing', '[]'::jsonb)
ON CONFLICT (tier, key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Signup answers, captured before payment.
--
--    Stripe Checkout allows at most THREE custom fields, and the social plan
--    needs a dozen — timezone, cadence, channels, what to promote, what never
--    to say, consent. So the form is ours and runs before checkout, and the
--    session carries only a reference to the row it produced.
--
--    Capturing before payment rather than after has a second benefit: an
--    abandoned checkout still leaves the answers here, so it is a lead rather
--    than nothing.
--
--    This holds no card data and never will. Stripe sees the payment details;
--    we see an id.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.social_signups (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text NOT NULL,
  contact_name      text,
  business_name     text,
  phone             text,
  timezone          text,
  answers           jsonb NOT NULL DEFAULT '{}'::jsonb,
  consented_at      timestamptz,
  status            text NOT NULL DEFAULT 'pending',
  stripe_session_id text,
  client_id         uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_project_id uuid REFERENCES public.client_projects(id) ON DELETE SET NULL,
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.social_signups
  ADD COLUMN IF NOT EXISTS email             text,
  ADD COLUMN IF NOT EXISTS contact_name      text,
  ADD COLUMN IF NOT EXISTS business_name     text,
  ADD COLUMN IF NOT EXISTS phone             text,
  ADD COLUMN IF NOT EXISTS timezone          text,
  ADD COLUMN IF NOT EXISTS answers           jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS consented_at      timestamptz,
  ADD COLUMN IF NOT EXISTS status            text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS stripe_session_id text,
  ADD COLUMN IF NOT EXISTS client_id         uuid,
  ADD COLUMN IF NOT EXISTS client_project_id uuid,
  ADD COLUMN IF NOT EXISTS completed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS created_at        timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at        timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_signups_status_chk') THEN
    ALTER TABLE public.social_signups
      ADD CONSTRAINT social_signups_status_chk
      CHECK (status IN ('pending', 'paid', 'provisioned', 'abandoned'));
  END IF;
END $$;

-- One signup per Stripe session, so a redelivered webhook cannot provision twice.
CREATE UNIQUE INDEX IF NOT EXISTS social_signups_session_idx
  ON public.social_signups (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS social_signups_pending_idx
  ON public.social_signups (created_at DESC) WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_signups TO authenticated;
GRANT ALL ON public.social_signups TO service_role;

ALTER TABLE public.social_signups ENABLE ROW LEVEL SECURITY;

-- Admins read; the signup function writes as service_role. Deliberately no
-- anon policy: the form posts to an edge function, never straight to the table,
-- so nothing can enumerate or edit other people's answers.
DROP POLICY IF EXISTS "Admins read social_signups" ON public.social_signups;
CREATE POLICY "Admins read social_signups"
  ON public.social_signups FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS set_updated_at_social_signups ON public.social_signups;
CREATE TRIGGER set_updated_at_social_signups
  BEFORE UPDATE ON public.social_signups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 6. Do not post for a client who is not paying.
--
--    Replaces the version in 20260823120000 with one that skips projects out
--    of good standing.
--
--    The check belongs HERE rather than in the dispatcher, and that is not a
--    style preference. attempts is incremented at claim time, so a dispatcher
--    that claimed a past-due client's post and then declined to send it would
--    burn both attempts within ten minutes and fail the post permanently. A
--    row that is never claimed keeps its attempts and simply waits.
--
--    NULL means fine. Every marketing project that predates the social plan
--    has no subscription of its own, and those must keep posting.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_due_social_sends(_limit int DEFAULT 25)
RETURNS SETOF public.social_schedule
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.social_schedule s
     SET status     = 'sending',
         claimed_at = now(),
         attempts   = s.attempts + 1
   WHERE s.id IN (
     SELECT c.id
       FROM public.social_schedule c
       JOIN public.client_projects p ON p.id = c.client_project_id
      WHERE c.status = 'pending'
        AND c.scheduled_at <= now()
        AND c.attempts < c.max_attempts
        AND p.status = 'active'
        AND (p.subscription_status IS NULL
             OR p.subscription_status IN ('active', 'trialing'))
      ORDER BY c.scheduled_at
      FOR UPDATE OF c SKIP LOCKED
      LIMIT _limit
   )
  RETURNING s.*;
END $$;

REVOKE ALL ON FUNCTION public.claim_due_social_sends(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_social_sends(int) TO service_role;
