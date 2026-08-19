-- Ventures: non-client revenue streams (live trainings, newsletters, communities)
-- that sit as a PEER to `clients`, not inside it.
--
-- Core modeling rule enforced by this schema:
--   * revenue_entries  = cash. A transaction happened.
--   * metric_snapshots = a level read at a point in time (e.g. "412 paid subs today").
-- These are never summed together. Portfolio revenue reads `revenue_ledger_v`,
-- which unions paid project_invoices with revenue_entries. Snapshots are
-- deliberately absent from that view -- MRR is a run-rate, not collected cash.

-- ============================================================ ventures
CREATE TABLE public.ventures (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  text NOT NULL UNIQUE,
  name                  text NOT NULL,
  kind                  text NOT NULL DEFAULT 'other'
                          CHECK (kind IN ('training','newsletter','community','other')),
  status                text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','paused','archived')),
  currency              text NOT NULL DEFAULT 'usd',
  description           text,
  brand_color           text,
  platform              text CHECK (platform IN ('stripe','substack','skool','manual')),
  platform_account_ref  text,
  -- Ordered [{key,label}]. Per-venture on purpose: a training funnel is
  -- visit -> optin -> registered -> paid -> attended, a newsletter is
  -- visit -> free_sub -> paid_sub. A shared enum would force one onto the other.
  funnel_stages         jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Random token accepted by the public funnel-track endpoint. Never expose the uuid.
  public_ingest_key     text UNIQUE,
  goal_mrr_cents        integer,
  goal_members          integer,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ventures_status ON public.ventures (status);

-- ============================================================ venture_launches
-- One dated cohort. For Take the Keys this is one row per month.
CREATE TABLE public.venture_launches (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id         uuid NOT NULL REFERENCES public.ventures(id) ON DELETE CASCADE,
  name               text NOT NULL,
  slug               text NOT NULL,
  status             text NOT NULL DEFAULT 'planned'
                       CHECK (status IN ('planned','open','running','complete','canceled')),
  cart_open_at       timestamptz,
  cart_close_at      timestamptz,
  starts_at          timestamptz,
  ends_at            timestamptz,
  ticket_price_cents integer,
  goal_revenue_cents integer,
  goal_signups       integer,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venture_id, slug)
);

CREATE INDEX idx_venture_launches_venture ON public.venture_launches (venture_id, starts_at DESC);
CREATE INDEX idx_venture_launches_status  ON public.venture_launches (status);

-- ============================================================ revenue_entries (CASH)
CREATE TABLE public.revenue_entries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id     uuid NOT NULL REFERENCES public.ventures(id) ON DELETE CASCADE,
  launch_id      uuid REFERENCES public.venture_launches(id) ON DELETE SET NULL,
  occurred_at    timestamptz NOT NULL,
  amount_cents   integer NOT NULL,          -- negative for refunds
  currency       text NOT NULL DEFAULT 'usd',
  kind           text NOT NULL DEFAULT 'sale'
                   CHECK (kind IN ('sale','subscription','payout','refund','adjustment')),
  source         text NOT NULL DEFAULT 'manual'
                   CHECK (source IN ('stripe','manual','import')),
  external_id    text,                      -- Stripe payment_intent / charge id
  customer_email text,
  customer_name  text,
  description    text,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Idempotency for webhook retries: the same Stripe event can never insert twice.
CREATE UNIQUE INDEX idx_revenue_entries_external
  ON public.revenue_entries (source, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX idx_revenue_entries_venture ON public.revenue_entries (venture_id, occurred_at DESC);
CREATE INDEX idx_revenue_entries_launch  ON public.revenue_entries (launch_id) WHERE launch_id IS NOT NULL;

-- ============================================================ metric_snapshots (LEVELS)
CREATE TABLE public.metric_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id  uuid NOT NULL REFERENCES public.ventures(id) ON DELETE CASCADE,
  captured_on date NOT NULL,
  metric_key  text NOT NULL,   -- paid_members | free_members | mrr_cents | churn_rate_bps
  value       numeric NOT NULL,
  source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import','api')),
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- One reading per metric per day. Re-entering a day corrects it instead of duplicating.
  UNIQUE (venture_id, metric_key, captured_on)
);

CREATE INDEX idx_metric_snapshots_lookup ON public.metric_snapshots (venture_id, metric_key, captured_on DESC);

-- ============================================================ funnel_events
-- First-party funnel data. The Meta pixel fires and forgets; this is what makes
-- conversion measurable from our own database.
CREATE TABLE public.funnel_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id  uuid NOT NULL REFERENCES public.ventures(id) ON DELETE CASCADE,
  launch_id   uuid REFERENCES public.venture_launches(id) ON DELETE SET NULL,
  stage       text NOT NULL,        -- validated against ventures.funnel_stages at ingest
  occurred_at timestamptz NOT NULL DEFAULT now(),
  anon_id     text,
  email_hash  text,                 -- sha256(lower(email)); raw email is never stored here
  source      text NOT NULL DEFAULT 'web' CHECK (source IN ('web','stripe','import')),
  utm         jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_key   text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_funnel_events_key
  ON public.funnel_events (venture_id, event_key)
  WHERE event_key IS NOT NULL;
CREATE INDEX idx_funnel_events_lookup ON public.funnel_events (venture_id, launch_id, stage, occurred_at DESC);
CREATE INDEX idx_funnel_events_anon   ON public.funnel_events (venture_id, anon_id) WHERE anon_id IS NOT NULL;

-- ============================================================ launch checklists
-- A monthly training runs the same checklist every cycle. Mirrors the shape of
-- journey_templates / journey_nodes, but rooted on a launch instead of a client.
CREATE TABLE public.launch_checklist_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id    uuid NOT NULL REFERENCES public.ventures(id) ON DELETE CASCADE,
  key           text NOT NULL,
  label         text NOT NULL,
  description   text,
  order_index   integer NOT NULL DEFAULT 0,
  checklist     jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Days relative to launch start; negative = before. Drives due dates per cohort.
  offset_days   integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venture_id, key)
);

CREATE TABLE public.launch_checklist_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  launch_id    uuid NOT NULL REFERENCES public.venture_launches(id) ON DELETE CASCADE,
  template_id  uuid REFERENCES public.launch_checklist_templates(id) ON DELETE SET NULL,
  key          text NOT NULL,
  label        text NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','in_progress','complete','skipped')),
  order_index  integer NOT NULL DEFAULT 0,
  checklist    jsonb NOT NULL DEFAULT '[]'::jsonb,
  due_date     date,
  notes        text,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (launch_id, key)
);

CREATE INDEX idx_launch_checklist_items_launch ON public.launch_checklist_items (launch_id, order_index);

-- ============================================================ activity_events extension
-- The dashboard already renders ONE unified feed with a realtime subscription on
-- this table. Two nullable columns is far cheaper than a second feed, and beats
-- burying ids in metadata where they can't be joined or indexed.
ALTER TABLE public.activity_events
  ADD COLUMN venture_id        uuid REFERENCES public.ventures(id) ON DELETE CASCADE,
  ADD COLUMN venture_launch_id uuid REFERENCES public.venture_launches(id) ON DELETE SET NULL;

CREATE INDEX idx_activity_events_venture ON public.activity_events (venture_id) WHERE venture_id IS NOT NULL;

-- ============================================================ revenue_ledger_v
-- The single read path for "how much money came in". project_invoices stays the
-- source of truth for agency cash -- nothing is mirrored, so there is no trigger
-- to drift. metric_snapshots is deliberately NOT here: it is a level, not cash.
CREATE VIEW public.revenue_ledger_v AS
  SELECT
    'agency'::text          AS stream,
    NULL::uuid              AS venture_id,
    NULL::uuid              AS launch_id,
    pi.client_id            AS client_id,
    pi.paid_at              AS occurred_at,
    pi.amount_cents         AS amount_cents,
    pi.currency             AS currency,
    'invoice'::text         AS kind
  FROM public.project_invoices pi
  WHERE pi.status = 'paid' AND pi.paid_at IS NOT NULL
  UNION ALL
  SELECT
    'venture'::text,
    re.venture_id,
    re.launch_id,
    NULL::uuid,
    re.occurred_at,
    re.amount_cents,
    re.currency,
    re.kind
  FROM public.revenue_entries re;

-- ============================================================ updated_at triggers
-- Reuses the existing public.update_updated_at_column() helper
-- (supabase/migrations/20260424015831_*.sql) rather than adding a duplicate.
CREATE TRIGGER trg_ventures_touch          BEFORE UPDATE ON public.ventures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_venture_launches_touch  BEFORE UPDATE ON public.venture_launches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_launch_checklist_touch  BEFORE UPDATE ON public.launch_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================ latest_metric_snapshots_v
-- "The current reading for each metric on each venture."
-- Both the portfolio roll-up and the ventures roster need exactly this. Without
-- it they would have to pull the whole snapshot history and reduce it in JS,
-- which grows unbounded as daily entries accumulate.
CREATE VIEW public.latest_metric_snapshots_v AS
  SELECT DISTINCT ON (venture_id, metric_key)
    venture_id, metric_key, value, captured_on, source
  FROM public.metric_snapshots
  ORDER BY venture_id, metric_key, captured_on DESC;
