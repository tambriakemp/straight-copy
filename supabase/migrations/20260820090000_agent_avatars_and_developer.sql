-- Dashboard rework: agent avatars, and a developer agent for the
-- ready_for_claude queue.

-- ============================================================ avatars
ALTER TABLE public.agents
  ADD COLUMN avatar_url text,
  -- Fallback tint for the monogram shown until a photo is uploaded, so each
  -- agent is still visually distinct on day one.
  ADD COLUMN accent_color text;

-- Public bucket: avatars are shown in an <img> on an authenticated page, and a
-- signed URL per render would be a lot of round trips for a face.
INSERT INTO storage.buckets (id, name, public)
VALUES ('agent-avatars', 'agent-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone may read (the bucket is public); only admins may change anything.
CREATE POLICY "Public read agent-avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'agent-avatars');

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

-- ============================================================ accents
UPDATE public.agents SET accent_color = '#9db8a6' WHERE key = 'revenue-analyst';
UPDATE public.agents SET accent_color = '#dbb172' WHERE key = 'launch-ops';
UPDATE public.agents SET accent_color = '#c08f7a' WHERE key = 'client-triage';

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
