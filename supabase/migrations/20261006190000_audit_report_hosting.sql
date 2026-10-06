-- CRE-225 sections 2+3: public /audit/<slug> report hosting on top of the
-- client_audits table CRE-235 already shipped (PR #62). That table covers
-- the admin password manager; this migration adds what the public page and
-- its upload/serve functions need on top of it.
--
-- Idempotent throughout — this project takes migrations from both this repo
-- and Lovable's own agent (see CLAUDE.md), so every statement must tolerate
-- being applied twice.

-- 0. gen_random_bytes (used below for the two seeded secrets) is pgcrypto,
--    not core Postgres. Already enabled by an earlier migration, but this
--    file must stand on its own if ever applied out of order.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Where the published report currently lives, and when it was last
--    (re-)published. Nullable: a client_audits row can exist (password
--    issued, status 'pending') before any report has been uploaded.
ALTER TABLE public.client_audits
  ADD COLUMN IF NOT EXISTS storage_path    text,
  ADD COLUMN IF NOT EXISTS last_audited_at timestamptz;

COMMENT ON COLUMN public.client_audits.storage_path IS
  'Path in the audit-reports storage bucket for the current report.html. One file per slug — a re-audit overwrites it; see CRE-225 for the versioning tradeoff this punts on.';
COMMENT ON COLUMN public.client_audits.last_audited_at IS
  'audited_at the publishing script reported, i.e. when the audit actually ran, not when it was uploaded.';

-- 2. Rate limiting for audit-serve's public password check (Ara's CRE-225
--    review point #2). Service-role only — no browser or admin access to
--    this table, so no RLS policy is added beyond enabling it (default deny
--    for anon/authenticated once enabled; service role bypasses RLS).
CREATE TABLE IF NOT EXISTS public.audit_login_attempts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL,
  ip           text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_login_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS audit_login_attempts_slug_ip_idx
  ON public.audit_login_attempts (slug, ip, attempted_at);

-- Old rows aren't rate-limit state once outside the window; nothing reads
-- them past that, so periodic cleanup is just housekeeping, not a limiter
-- bypass. Safe to fully drop — the 15-minute window is checked in-function.
DELETE FROM public.audit_login_attempts WHERE attempted_at < now() - interval '1 day';

-- 3. Private storage bucket for report HTML. No storage.objects policy is
--    added — same shape as preview-sites' service-role-only paths: nothing
--    in this bucket is ever read with the anon key, only via audit-serve on
--    the service-role client.
INSERT INTO storage.buckets (id, name, public)
VALUES ('audit-reports', 'audit-reports', false)
ON CONFLICT (id) DO NOTHING;

-- 4. Two dashboard-managed secrets, same pattern as briefs_ingest_secret
--    (generated/viewed/rotated from the Briefs tab Settings panel, never a
--    Supabase Function env var): one gates the VPS publish script, the other
--    signs audit-serve's short-lived access tokens after a correct password.
--    Seeded here with a real random value (not a placeholder) so the whole
--    pipeline works the moment this migration lands, with no blocking
--    round-trip through the dashboard first. Bree can rotate either anytime
--    from Settings; rotating audit_upload_secret breaks the VPS script until
--    it's given the new value, same tradeoff as briefs_ingest_secret.
INSERT INTO public.app_secrets (key, value)
VALUES ('audit_upload_secret', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_secrets (key, value)
VALUES ('audit_token_signing_secret', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;
