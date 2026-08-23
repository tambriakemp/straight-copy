ALTER TABLE public.client_projects ADD COLUMN IF NOT EXISTS agent_autonomy text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_projects_agent_autonomy_chk') THEN
    ALTER TABLE public.client_projects
      ADD CONSTRAINT client_projects_agent_autonomy_chk
      CHECK (agent_autonomy IS NULL OR agent_autonomy IN ('propose', 'act_in_app', 'autonomous'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_client_projects_agent_autonomy
  ON public.client_projects (agent_autonomy) WHERE agent_autonomy IS NOT NULL;

CREATE OR REPLACE FUNCTION public.hold_new_marketing_project()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.type = 'marketing' AND NEW.agent_autonomy IS NULL THEN
    NEW.agent_autonomy := 'act_in_app';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_hold_new_marketing_project ON public.client_projects;
CREATE TRIGGER trg_hold_new_marketing_project
  BEFORE INSERT ON public.client_projects
  FOR EACH ROW EXECUTE FUNCTION public.hold_new_marketing_project();

CREATE TABLE IF NOT EXISTS public.social_schedule (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_project_id uuid NOT NULL REFERENCES public.client_projects(id) ON DELETE CASCADE,
  social_post_id    uuid REFERENCES public.social_posts(id)  ON DELETE CASCADE,
  social_image_id   uuid REFERENCES public.social_images(id) ON DELETE CASCADE,
  scheduled_at      timestamptz NOT NULL,
  status            text NOT NULL DEFAULT 'pending',
  attempts          integer NOT NULL DEFAULT 0,
  max_attempts      integer NOT NULL DEFAULT 2,
  claimed_at        timestamptz,
  sent_at           timestamptz,
  copost_post_id    text,
  last_error        text,
  created_by_agent  uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  agent_action_id   uuid REFERENCES public.agent_actions(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_schedule_status_chk') THEN
    ALTER TABLE public.social_schedule ADD CONSTRAINT social_schedule_status_chk
      CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_schedule_target_chk') THEN
    ALTER TABLE public.social_schedule ADD CONSTRAINT social_schedule_target_chk
      CHECK (num_nonnulls(social_post_id, social_image_id) = 1);
  END IF;
END $$;

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
CREATE POLICY "Admins manage social_schedule" ON public.social_schedule FOR ALL
  TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS set_updated_at_social_schedule ON public.social_schedule;
CREATE TRIGGER set_updated_at_social_schedule
  BEFORE UPDATE ON public.social_schedule
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.social_follower_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_project_id uuid NOT NULL REFERENCES public.client_projects(id) ON DELETE CASCADE,
  platform          text NOT NULL,
  follower_count    integer NOT NULL,
  captured_at       timestamptz NOT NULL DEFAULT now(),
  source            text NOT NULL DEFAULT 'unknown',
  created_at        timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_follower_snapshots_platform_chk') THEN
    ALTER TABLE public.social_follower_snapshots ADD CONSTRAINT social_follower_snapshots_platform_chk
      CHECK (platform IN ('instagram', 'facebook', 'tiktok', 'pinterest', 'linkedin', 'x', 'youtube'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_follower_snapshots_count_chk') THEN
    ALTER TABLE public.social_follower_snapshots ADD CONSTRAINT social_follower_snapshots_count_chk
      CHECK (follower_count >= 0);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS social_follower_snapshots_daily_idx
  ON public.social_follower_snapshots (client_project_id, platform, ((captured_at AT TIME ZONE 'UTC')::date));
CREATE INDEX IF NOT EXISTS social_follower_snapshots_series_idx
  ON public.social_follower_snapshots (client_project_id, platform, captured_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_follower_snapshots TO authenticated;
GRANT ALL ON public.social_follower_snapshots TO service_role;
ALTER TABLE public.social_follower_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage social_follower_snapshots" ON public.social_follower_snapshots;
CREATE POLICY "Admins manage social_follower_snapshots" ON public.social_follower_snapshots FOR ALL
  TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.claim_due_social_sends(_limit int DEFAULT 25)
RETURNS SETOF public.social_schedule
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.social_schedule s
     SET status = 'sending', claimed_at = now(), attempts = s.attempts + 1
   WHERE s.id IN (
     SELECT c.id FROM public.social_schedule c
      WHERE c.status = 'pending' AND c.scheduled_at <= now() AND c.attempts < c.max_attempts
      ORDER BY c.scheduled_at FOR UPDATE SKIP LOCKED LIMIT _limit
   )
  RETURNING s.*;
END $$;

REVOKE ALL ON FUNCTION public.claim_due_social_sends(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_social_sends(int) TO service_role;

CREATE OR REPLACE FUNCTION public.reap_stranded_social_sends()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  reaped integer;
  images integer;
BEGIN
  UPDATE public.social_schedule
     SET status = CASE WHEN attempts < max_attempts THEN 'pending' ELSE 'failed' END,
         claimed_at = NULL,
         last_error = COALESCE(last_error, 'The send was claimed and never reported back.')
   WHERE status = 'sending' AND claimed_at < now() - interval '15 minutes';
  GET DIAGNOSTICS reaped = ROW_COUNT;

  UPDATE public.social_images
     SET copost_status = 'error',
         copost_error = COALESCE(copost_error, 'The send was claimed and never reported back.')
   WHERE copost_status = 'sending' AND updated_at < now() - interval '15 minutes';
  GET DIAGNOSTICS images = ROW_COUNT;

  RETURN reaped + images;
END $$;

REVOKE ALL ON FUNCTION public.reap_stranded_social_sends() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reap_stranded_social_sends() TO service_role;

CREATE TABLE IF NOT EXISTS public.social_post_events (
  id                bigserial PRIMARY KEY,
  schedule_id       uuid REFERENCES public.social_schedule(id) ON DELETE SET NULL,
  client_project_id uuid REFERENCES public.client_projects(id) ON DELETE CASCADE,
  copost_post_id    text,
  event             text NOT NULL,
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_valid   boolean,
  received_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_post_events_schedule_idx
  ON public.social_post_events (schedule_id, received_at DESC);
CREATE INDEX IF NOT EXISTS social_post_events_copost_idx
  ON public.social_post_events (copost_post_id) WHERE copost_post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS social_post_events_recent_idx
  ON public.social_post_events (received_at DESC);

GRANT SELECT ON public.social_post_events TO authenticated;
GRANT ALL ON public.social_post_events TO service_role;
ALTER TABLE public.social_post_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read social_post_events" ON public.social_post_events;
CREATE POLICY "Admins read social_post_events" ON public.social_post_events FOR SELECT
  TO authenticated USING (public.is_admin(auth.uid()));