-- Dashboard rework: agent avatars, and a developer agent for the
-- ready_for_claude queue.
--
-- Written idempotently throughout. Lovable applied the avatar columns and a set
-- of storage policies out of band (20260820024332, 20260820024402), so this has
-- to be safe against a database where some of it already exists.

-- ============================================================ avatars
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS avatar_url text,
  -- Fallback tint for the monogram shown until a photo is uploaded, so each
  -- agent is still visually distinct on day one.
  ADD COLUMN IF NOT EXISTS accent_color text;

-- Private bucket. AgentAvatar signs a URL per render, so nothing about the
-- team is reachable without a session. DO NOTHING on conflict deliberately:
-- if the bucket already exists, its visibility is whatever it was set to and
-- this migration must not silently flip it.
INSERT INTO storage.buckets (id, name, public)
VALUES ('agent-avatars', 'agent-avatars', false)
ON CONFLICT (id) DO NOTHING;

-- Drop first so re-running cannot collide on the policy name.
DROP POLICY IF EXISTS "Public read agent-avatars"   ON storage.objects;
DROP POLICY IF EXISTS "Admins read agent-avatars"   ON storage.objects;
DROP POLICY IF EXISTS "Admins upload agent-avatars" ON storage.objects;
DROP POLICY IF EXISTS "Admins update agent-avatars" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete agent-avatars" ON storage.objects;

-- Signed-in admins may read (which is what signing a URL requires); only
-- admins may change anything. No anon read: these are private by design.
CREATE POLICY "Admins read agent-avatars"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'agent-avatars' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins upload agent-avatars"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'agent-avatars' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins update agent-avatars"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'agent-avatars' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins delete agent-avatars"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'agent-avatars' AND public.is_admin(auth.uid()));

-- Lovable's equivalents, removed so one bucket does not carry two overlapping
-- policy sets that have to be reasoned about together.
DROP POLICY IF EXISTS "Admins manage agent avatars"      ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read agent avatars" ON storage.objects;

-- ============================================================ accents
-- Only fill a blank, so a colour picked by hand is never overwritten.
UPDATE public.agents SET accent_color = '#9db8a6' WHERE key = 'revenue-analyst' AND accent_color IS NULL;
UPDATE public.agents SET accent_color = '#dbb172' WHERE key = 'launch-ops'      AND accent_color IS NULL;
UPDATE public.agents SET accent_color = '#c08f7a' WHERE key = 'client-triage'   AND accent_color IS NULL;

-- ============================================================ developer agent
-- Owns the ready_for_claude queue. Deliberately act_in_app: it may reorder,
-- annotate and re-specify tasks on its own, because all of that is visible and
-- reversible on the board. It never writes code and never contacts anyone.
INSERT INTO public.agents (key, name, role, description, autonomy, schedule_cron, delivery, config, accent_color)
VALUES (
  'developer',
  'Dev',
  'Engineering queue lead',
  'Owns the Ready for Claude queue. Judges whether each task is actually specified well enough to hand off, drafts the missing detail, orders the queue by dependency and impact, summarises what came back for review, and keeps stale or duplicate work from piling up.',
  'act_in_app',
  '0 11 * * 1-5',                                  -- weekdays 11:00 UTC, before the day starts
  '{"in_app":true,"email":false,"tasks":true,"push":false}'::jsonb,
  '{"queue_status":"ready_for_claude","review_status":"needs_review","stale_after_days":21,"max_queue_depth":15}'::jsonb,
  '#8fa8c4'
)
ON CONFLICT (key) DO NOTHING;
