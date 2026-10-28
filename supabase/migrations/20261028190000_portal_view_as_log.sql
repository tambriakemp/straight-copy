-- CRE-811: who looked at whose portal, and when.
--
-- "Open portal" on a client's /admin page now mints a short-lived signed
-- token instead of asserting ?as=admin in the URL. Bree's condition on the
-- card was that each view-as be logged -- who, which client, when -- so this
-- is that log, and `functions/portal-view-as` refuses to mint if it cannot
-- write to it. A grant nobody can audit is not a grant this codebase issues.
--
-- TWO EVENTS PER TOKEN, AT MOST.
--   'minted'   -- an admin asked for a look. Written by portal-view-as.
--   'redeemed' -- the token was actually used. Written by _shared/webhook-auth.
-- The second is the one that answers "did they look", and it is written on
-- first use only: the unique index below is what turns one-insert-per-request
-- into one row, so a client flipping between four portal screens leaves one
-- redemption, not twelve.

CREATE TABLE IF NOT EXISTS public.portal_view_as_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  -- The token's own id. Not unique on its own: one token has both events.
  jti TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('minted', 'redeemed')),
  -- Which admin surface signed it: this project's /admin, or the Client
  -- Portal plugin's client page in Paperclip.
  issuer TEXT NOT NULL CHECK (issuer IN ('admin', 'plugin')),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  -- Null for a plugin-issued token: the actor is a Paperclip user and has no
  -- auth.users row here. `actor_label` carries them in either case, which is
  -- why it is NOT NULL and this is not.
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_label TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per (token, event). `webhook-auth.ts` inserts a redemption on every
-- request and treats 23505 as success, so this index is load-bearing rather
-- than hygienic: without it the table grows per request.
CREATE UNIQUE INDEX IF NOT EXISTS portal_view_as_log_jti_event_key
  ON public.portal_view_as_log (jti, event);

-- "Who has been in this client's portal lately", which is the question.
CREATE INDEX IF NOT EXISTS portal_view_as_log_client_idx
  ON public.portal_view_as_log (client_id, created_at DESC);

ALTER TABLE public.portal_view_as_log ENABLE ROW LEVEL SECURITY;

-- Admins read it; nothing with a browser writes it. Both edge functions that
-- do hold the service role, which bypasses RLS -- so there is deliberately no
-- INSERT policy for `authenticated`. An audit log an admin could write to by
-- hand is an audit log.
DROP POLICY IF EXISTS "Admins read portal_view_as_log" ON public.portal_view_as_log;
CREATE POLICY "Admins read portal_view_as_log"
  ON public.portal_view_as_log FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

COMMENT ON TABLE public.portal_view_as_log IS
  'CRE-811: admin view-as-client grants. One ''minted'' row when an admin asks, one ''redeemed'' row the first time the token is used.';
