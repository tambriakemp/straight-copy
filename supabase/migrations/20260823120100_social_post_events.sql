-- Everything CoPost tells us about a post after we hand it over.
--
-- Idempotent throughout — two writers, see 20260823120000.
--
-- Written before anything is interpreted, deliberately. The same reasoning as
-- queue_fire_log: without a raw record there is no way to tell a webhook that
-- never arrived from one that arrived and was misread, and those two have very
-- different fixes.
--
-- It is also the instrument for pinning down CoPost's actual payload shape,
-- which is not documented anywhere we can reach. Point CoPost at the endpoint,
-- read `payload` here, then write the parser against what actually turns up.

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

ALTER TABLE public.social_post_events
  ADD COLUMN IF NOT EXISTS schedule_id       uuid,
  ADD COLUMN IF NOT EXISTS client_project_id uuid,
  ADD COLUMN IF NOT EXISTS copost_post_id    text,
  ADD COLUMN IF NOT EXISTS event             text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS signature_valid   boolean,
  ADD COLUMN IF NOT EXISTS received_at       timestamptz NOT NULL DEFAULT now();

COMMENT ON TABLE public.social_post_events IS
  'Raw CoPost webhook callbacks, logged before interpretation. The only way to tell a callback that never arrived from one that arrived and was misread.';

CREATE INDEX IF NOT EXISTS social_post_events_schedule_idx
  ON public.social_post_events (schedule_id, received_at DESC);

CREATE INDEX IF NOT EXISTS social_post_events_copost_idx
  ON public.social_post_events (copost_post_id)
  WHERE copost_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS social_post_events_recent_idx
  ON public.social_post_events (received_at DESC);

GRANT SELECT ON public.social_post_events TO authenticated;
GRANT ALL ON public.social_post_events TO service_role;

ALTER TABLE public.social_post_events ENABLE ROW LEVEL SECURITY;

-- Read-only for admins. Rows are written by the webhook under the service
-- role and are an audit trail; nothing should be editing them by hand.
DROP POLICY IF EXISTS "Admins read social_post_events" ON public.social_post_events;
CREATE POLICY "Admins read social_post_events"
  ON public.social_post_events FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
