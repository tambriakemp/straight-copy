-- Scheduled social posting, and per-client autonomy.
--
-- Idempotent throughout: this database takes migrations from this repo and from
-- Lovable's agent, so assume every statement may already have run and that a
-- table this creates may already exist in a slightly different shape.

-- ---------------------------------------------------------------------------
-- 0. The social-images bucket.
--
--    20260623234750 added RLS policies for it but never created it — the
--    bucket was made by hand through the dashboard, so a fresh database has
--    the policies and no bucket. DO NOTHING on conflict: if it already exists
--    its visibility is whatever it was set to, and this must never silently
--    flip a bucket public.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('social-images', 'social-images', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1. Per-client autonomy.
--
--    Named generically rather than social_autonomy: the concept is "how much
--    rope does an agent have on THIS client", and only agents that opt into
--    the resolver consult it. A generic name costs nothing and reads honestly
--    if a second agent ever wants it.
--
--    NULL means "whatever the agent's own setting says". It is a column and
--    not a key in agents.config because it governs whether a real client's
--    posts go out unattended: that deserves a CHECK constraint and an FK that
--    cascades, not an unvalidated blob that strands grants behind deleted
--    projects.
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_projects
  ADD COLUMN IF NOT EXISTS agent_autonomy text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_projects_agent_autonomy_chk'
  ) THEN
    ALTER TABLE public.client_projects
      ADD CONSTRAINT client_projects_agent_autonomy_chk
      CHECK (agent_autonomy IS NULL
             OR agent_autonomy IN ('propose', 'act_in_app', 'autonomous'));
  END IF;
END $$;

COMMENT ON COLUMN public.client_projects.agent_autonomy IS
  'Overrides the acting agent''s own autonomy for work on this project. NULL inherits. Only agents that opt in consult it — today that is the social media manager.';

CREATE INDEX IF NOT EXISTS idx_client_projects_agent_autonomy
  ON public.client_projects (agent_autonomy)
  WHERE agent_autonomy IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. The new-client hold.
--
--    Iris runs `autonomous`, so a brand new marketing project would inherit
--    that and start posting to a client nobody has heard her write for yet.
--    This holds every new marketing project at act_in_app, which makes the
--    hold automatic and RELEASING it the deliberate act. That is the safe
--    direction: forgetting to hold a client is silent, forgetting to release
--    one is obvious the first time a post waits for approval.
--
--    BEFORE INSERT only. An existing project's setting is never touched, and
--    an insert that names a level explicitly is left alone.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hold_new_marketing_project()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'marketing' AND NEW.agent_autonomy IS NULL THEN
    NEW.agent_autonomy := 'act_in_app';
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.hold_new_marketing_project() IS
  'Holds a new marketing project at act_in_app so its first posts wait for a human, whatever the agent''s own autonomy is. Clear the column to inherit.';

DROP TRIGGER IF EXISTS trg_hold_new_marketing_project ON public.client_projects;
CREATE TRIGGER trg_hold_new_marketing_project
  BEFORE INSERT ON public.client_projects
  FOR EACH ROW EXECUTE FUNCTION public.hold_new_marketing_project();

-- ---------------------------------------------------------------------------
-- 3. Status vocabularies, constrained.
--
--    Neither table has ever had a CHECK, so a typo inserts silently and the
--    row simply stops matching any query that looks for it.
--
--    Guarded by a probe rather than added blind: a CHECK that fails on
--    existing data aborts the whole migration, and this database has a second
--    writer. A notice is recoverable; a failed deploy is not.
--
--    Vocabularies read off the code that writes them, not guessed —
--    generate-social-posts:190, BatchDetail.tsx:56, send-to-copost:127,135.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_posts_status_chk') THEN
    IF EXISTS (
      SELECT 1 FROM public.social_posts
       WHERE status NOT IN ('draft', 'approved', 'published', 'error')
    ) THEN
      RAISE NOTICE 'social_posts_status_chk skipped: rows exist outside the vocabulary';
    ELSE
      ALTER TABLE public.social_posts
        ADD CONSTRAINT social_posts_status_chk
        CHECK (status IN ('draft', 'approved', 'published', 'error'));
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_images_copost_status_chk') THEN
    IF EXISTS (
      SELECT 1 FROM public.social_images
       WHERE copost_status NOT IN ('idle', 'sending', 'sent', 'error')
    ) THEN
      RAISE NOTICE 'social_images_copost_status_chk skipped: rows exist outside the vocabulary';
    ELSE
      ALTER TABLE public.social_images
        ADD CONSTRAINT social_images_copost_status_chk
        CHECK (copost_status IN ('idle', 'sending', 'sent', 'error'));
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. social_schedule — one row per intended send.
--
--    Deliberately not scheduled_at/attempts columns on social_posts and
--    social_images. Two reasons.
--
--    There are two independent pipelines with different status vocabularies
--    and different claim semantics, so columns would mean two partial indexes,
--    two claim idioms, two retry paths and two reapers.
--
--    And `attempts` is a property of an attempt to publish, not of the
--    content. On the content row, "this image" and "the third time we tried to
--    publish this image" become the same record, which makes re-scheduling the
--    same evergreen photo next month impossible without destroying the first
--    attempt's history.
--
--    Precedent for a separate queue table: web_dev_scheduled_emails
--    (20260601183054) with send_after / sent_at / attempts and a partial index.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.social_schedule (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_project_id uuid NOT NULL REFERENCES public.client_projects(id) ON DELETE CASCADE,
  social_post_id    uuid REFERENCES public.social_posts(id)  ON DELETE CASCADE,
  social_image_id   uuid REFERENCES public.social_images(id) ON DELETE CASCADE,
  scheduled_at      timestamptz NOT NULL,
  status            text NOT NULL DEFAULT 'pending',
  attempts          integer NOT NULL DEFAULT 0,
  max_attempts      integer NOT NULL DEFAULT 2,   -- the first try plus one retry
  claimed_at        timestamptz,
  sent_at           timestamptz,
  copost_post_id    text,
  last_error        text,
  created_by_agent  uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  agent_action_id   uuid REFERENCES public.agent_actions(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Belt and braces. If the other writer created this table first with a
-- different shape, CREATE TABLE IF NOT EXISTS silently no-ops and the block
-- below is what actually guarantees the columns exist.
ALTER TABLE public.social_schedule
  ADD COLUMN IF NOT EXISTS client_project_id uuid,
  ADD COLUMN IF NOT EXISTS social_post_id    uuid,
  ADD COLUMN IF NOT EXISTS social_image_id   uuid,
  ADD COLUMN IF NOT EXISTS scheduled_at      timestamptz,
  ADD COLUMN IF NOT EXISTS status            text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS attempts          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts      integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS claimed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at           timestamptz,
  ADD COLUMN IF NOT EXISTS copost_post_id    text,
  ADD COLUMN IF NOT EXISTS last_error        text,
  ADD COLUMN IF NOT EXISTS created_by_agent  uuid,
  ADD COLUMN IF NOT EXISTS agent_action_id   uuid,
  ADD COLUMN IF NOT EXISTS created_at        timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at        timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_schedule_status_chk') THEN
    ALTER TABLE public.social_schedule
      ADD CONSTRAINT social_schedule_status_chk
      CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled'));
  END IF;

  -- Exactly one target. A row pointing at both a post and an image, or at
  -- neither, is a bug that would otherwise surface as a silent no-send.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_schedule_target_chk') THEN
    ALTER TABLE public.social_schedule
      ADD CONSTRAINT social_schedule_target_chk
      CHECK (num_nonnulls(social_post_id, social_image_id) = 1);
  END IF;
END $$;

COMMENT ON TABLE public.social_schedule IS
  'One row per intended send to CoPost. Separate from the content tables because attempts, claim and error belong to the attempt, not to the photo.';

-- The double-post guard. A re-proposed action, a double-click on approve, or
-- two overlapping runs all collide here rather than booking the same post
-- twice. The state is in the index predicate rather than the key so that a
-- sent or cancelled row still allows the same photo to be scheduled again
-- later — which is the whole point of evergreen content.
CREATE UNIQUE INDEX IF NOT EXISTS social_schedule_one_live_post_idx
  ON public.social_schedule (social_post_id)
  WHERE social_post_id IS NOT NULL AND status IN ('pending', 'sending');

CREATE UNIQUE INDEX IF NOT EXISTS social_schedule_one_live_image_idx
  ON public.social_schedule (social_image_id)
  WHERE social_image_id IS NOT NULL AND status IN ('pending', 'sending');

CREATE INDEX IF NOT EXISTS social_schedule_due_idx
  ON public.social_schedule (scheduled_at) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS social_schedule_project_idx
  ON public.social_schedule (client_project_id, scheduled_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_schedule TO authenticated;
GRANT ALL ON public.social_schedule TO service_role;

ALTER TABLE public.social_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage social_schedule" ON public.social_schedule;
CREATE POLICY "Admins manage social_schedule"
  ON public.social_schedule FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS set_updated_at_social_schedule ON public.social_schedule;
CREATE TRIGGER set_updated_at_social_schedule
  BEFORE UPDATE ON public.social_schedule
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 5. Follower snapshots.
--
--    Append-only, one row per platform per day, deliberately source-agnostic.
--    Where the number comes from — CoPost, a per-client Meta token, a figure
--    typed in by hand — is recorded rather than assumed, because the answer
--    differs per platform and will change. The first row for a platform is
--    that client's baseline; growth is arithmetic over the series, so nothing
--    needs a "baseline" flag that could go stale.
--
--    Shipped now even though nothing writes it yet: the table costs nothing
--    and means no rework once the source question is settled.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.social_follower_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_project_id uuid NOT NULL REFERENCES public.client_projects(id) ON DELETE CASCADE,
  platform          text NOT NULL,
  follower_count    integer NOT NULL,
  captured_at       timestamptz NOT NULL DEFAULT now(),
  source            text NOT NULL DEFAULT 'unknown',
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.social_follower_snapshots
  ADD COLUMN IF NOT EXISTS client_project_id uuid,
  ADD COLUMN IF NOT EXISTS platform          text,
  ADD COLUMN IF NOT EXISTS follower_count    integer,
  ADD COLUMN IF NOT EXISTS captured_at       timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS source            text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS created_at        timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_follower_snapshots_platform_chk') THEN
    ALTER TABLE public.social_follower_snapshots
      ADD CONSTRAINT social_follower_snapshots_platform_chk
      CHECK (platform IN ('instagram', 'facebook', 'tiktok', 'pinterest', 'linkedin', 'x', 'youtube'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_follower_snapshots_count_chk') THEN
    ALTER TABLE public.social_follower_snapshots
      ADD CONSTRAINT social_follower_snapshots_count_chk
      CHECK (follower_count >= 0);
  END IF;
END $$;

-- One snapshot per platform per day. A poll that runs twice updates nothing
-- and inserts nothing, so a retry cannot bend the growth curve.
CREATE UNIQUE INDEX IF NOT EXISTS social_follower_snapshots_daily_idx
  ON public.social_follower_snapshots (client_project_id, platform, (captured_at::date));

CREATE INDEX IF NOT EXISTS social_follower_snapshots_series_idx
  ON public.social_follower_snapshots (client_project_id, platform, captured_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_follower_snapshots TO authenticated;
GRANT ALL ON public.social_follower_snapshots TO service_role;

ALTER TABLE public.social_follower_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage social_follower_snapshots" ON public.social_follower_snapshots;
CREATE POLICY "Admins manage social_follower_snapshots"
  ON public.social_follower_snapshots FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- 6. Claiming due sends.
--
--    An RPC rather than the conditional PostgREST update used in
--    send-images-to-copost, for three reasons it cannot do: compare attempts
--    against max_attempts (two columns), bound the batch, and SKIP LOCKED.
--
--    attempts is incremented at CLAIM time, not at failure time. A dispatcher
--    that dies mid-send still burns its attempt, so a post that reliably kills
--    the isolate cannot loop forever.
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
      WHERE c.status = 'pending'
        AND c.scheduled_at <= now()
        AND c.attempts < c.max_attempts
      ORDER BY c.scheduled_at
      FOR UPDATE SKIP LOCKED
      LIMIT _limit
   )
  RETURNING s.*;
END $$;

REVOKE ALL ON FUNCTION public.claim_due_social_sends(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_social_sends(int) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Un-stranding.
--
--    Two holes, one of them pre-existing. A schedule row claimed by an isolate
--    that died sits in 'sending' forever. And send-images-to-copost has always
--    had the same hole: it claims a row into copost_status='sending' and
--    nothing puts it back if the function dies between the claim and the
--    result.
--
--    Deliberately SQL rather than an edge function. Edge functions here only
--    reach production when Lovable's agent deploys them, and a reaper that
--    needs a deploy to work is a reaper that is missing exactly when it is
--    needed.
--
--    social_images has no claimed_at, but the updated_at trigger fires on the
--    claiming UPDATE, so updated_at IS the claim time. That is why this works
--    without adding a column to a table two other functions write.
--
--    Fifteen minutes is comfortably past a run of at most 25 HTTP calls, so
--    this only ever catches a genuine death, never a slow tick — the same
--    reasoning as reap_abandoned_agent_messages.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reap_stranded_social_sends()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reaped integer;
  images integer;
BEGIN
  UPDATE public.social_schedule
     SET status     = CASE WHEN attempts < max_attempts THEN 'pending' ELSE 'failed' END,
         claimed_at = NULL,
         last_error = COALESCE(last_error, 'The send was claimed and never reported back.')
   WHERE status = 'sending'
     AND claimed_at < now() - interval '15 minutes';
  GET DIAGNOSTICS reaped = ROW_COUNT;

  UPDATE public.social_images
     SET copost_status = 'error',
         copost_error  = COALESCE(copost_error, 'The send was claimed and never reported back.')
   WHERE copost_status = 'sending'
     AND updated_at < now() - interval '15 minutes';
  GET DIAGNOSTICS images = ROW_COUNT;

  RETURN reaped + images;
END $$;

COMMENT ON FUNCTION public.reap_stranded_social_sends() IS
  'Returns sends stuck in "sending" past 15 minutes to pending or failed. Their dispatcher died without writing a result.';

REVOKE ALL ON FUNCTION public.reap_stranded_social_sends() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reap_stranded_social_sends() TO service_role;
