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
  ('social', 0, 'intake', 'Setup', 'Accounts connected and the first posts written',
   jsonb_build_array(
     jsonb_build_object('key','intake.welcome_email_sent','label','Welcome email sent','owner','auto','done',false),
     jsonb_build_object('key','intake.copost_provisioned','label','CoPost project created, client invited, trigger URL saved','owner','agency','done',false),
     jsonb_build_object('key','intake.copost_connected','label','Client accepted the CoPost invite and connected their accounts','owner','client','done',false),
     jsonb_build_object('key','intake.first_posts_generated','label','First batch of posts written','owner','auto','done',false),
     jsonb_build_object('key','intake.autonomy_released','label','First posts reviewed and the client cleared to post unattended','owner','agency','done',false)
   )),
  ('social', 1, 'brand_voice', 'Brand Voice', 'Voice written from the checkout answers',
   jsonb_build_array(
     jsonb_build_object('key','brand_voice.document_generated','label','Brand voice written','owner','auto','auto_key','brand_voice_generated','done',false)
   )),
  ('social', 2, 'active', 'Posting', 'Iris is scheduling and publishing', '[]'::jsonb)
ON CONFLICT (tier, key) DO NOTHING;

-- A note on the two 'agency' items above, because the launch and growth intakes
-- deliberately avoid them.
--
-- auto_complete_journey_node only completes a node when every item is done, so
-- an agency item that nobody ever ticks stalls the journey forever — which is
-- exactly what summary_reviewed and social_audit do on the other tiers.
--
-- These two are different: creating the CoPost project and releasing a client
-- from the new-client hold are real work that actually gets done, and both are
-- things a human must decide. Making them 'auto' would mean the board never
-- showed the one manual step in the whole flow.
--
-- Client photos are deliberately NOT a checklist item. Posts are generated on
-- our side from our own bucket; anything a client adds to their CoPost media
-- library is theirs to manage and must not block onboarding.
