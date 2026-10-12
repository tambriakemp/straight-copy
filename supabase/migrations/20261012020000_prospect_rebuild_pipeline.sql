-- CRE-413: auto rebuild-issue-per-rejection + rebuild status tracking.
--
-- Phase 1 (this migration): additive schema + internal plumbing only. Does
-- NOT touch Approvals.tsx and does not change what Bree sees on
-- /admin/approvals today — that page wiring (new status chips, "Rebuilt"
-- badge, "Rebuilds: N of M done" header) ships in a follow-up PR after the
-- 2026-10-12 9 AM CT send, per the CRE-413 task's explicit hold.
--
-- Mechanism, given Paperclip has no outbound "issue status changed" webhook
-- (confirmed twice: the per-company OpenAPI spec has no such endpoint, and
-- sync-paperclip-pending's own header comment already documented this after
-- CRE-235 — "Paperclip has no outbound webhook ... polling on a schedule is
-- the only option today"):
--   1. The moment Bree sends a preview back (prospect_approvals.status ->
--      'rejected'), a trigger fires create-rebuild-issue via pg_net, which
--      creates a '[Rebuild] <company> - <slug>' Paperclip issue assigned to
--      Nicole and stores its id back on this same row (rebuild_issue_id).
--      Idempotent: the trigger only fires on the pending->rejected edge, and
--      the function does an atomic claim (`rebuild_issue_id IS NULL`) before
--      creating anything, so a re-click or a duplicate trigger fire can
--      never create a second issue for the same rejection.
--   2. When Nicole resubmits a rebuilt version, her existing push into
--      prospect-approvals-sync (the same action she already calls) can carry
--      `rebuilt_from_approval_id` on the new row — that flips the OLD row to
--      rebuild_status 'ready_for_review' immediately, no polling needed, and
--      tags the NEW row for a "Rebuilt" badge once the UI reads rebuilt_from.
--   3. Everything else (todo->in_progress "Rebuilding", blocked "Stuck" +
--      reason) has no push signal available from Paperclip at all, so
--      sync-rebuild-status polls hourly (pg_cron) as the real, self-
--      sufficient fallback for those two states. rebuild-status-webhook is
--      also stood up as a receiver in case Ara/Nicole want to proactively
--      ping it for faster-than-hourly updates on those two states — purely
--      additive, not required for the feature to work end to end.

ALTER TABLE public.prospect_approvals
  ADD COLUMN IF NOT EXISTS rebuild_issue_id text,
  ADD COLUMN IF NOT EXISTS rebuild_status text
    CHECK (rebuild_status IN ('queued', 'rebuilding', 'ready_for_review', 'stuck')),
  ADD COLUMN IF NOT EXISTS rebuild_stuck_reason text,
  ADD COLUMN IF NOT EXISTS rebuilt_from uuid REFERENCES public.prospect_approvals(id);

CREATE INDEX IF NOT EXISTS prospect_approvals_rebuild_issue_id_idx
  ON public.prospect_approvals (rebuild_issue_id)
  WHERE rebuild_issue_id IS NOT NULL;

-- Fire-and-forget: ask create-rebuild-issue to create the Paperclip issue the
-- instant a row flips to 'rejected'. Guarded on both sides (trigger WHEN
-- clause here, atomic claim in the function) so a retry or a second UPDATE
-- can never create a duplicate issue.
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.fire_create_rebuild_issue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  secret text;
BEGIN
  -- Same Vault entry the two existing cron wrappers use
  -- (paperclip_pending_sync_secret == the CLAUDE_WEBHOOK_SECRET value) —
  -- kept in one place rather than introducing a second secret that has to
  -- be kept in sync with it by hand.
  SELECT decrypted_secret INTO secret
  FROM vault.decrypted_secrets
  WHERE name = 'paperclip_pending_sync_secret'
  LIMIT 1;
  IF secret IS NULL THEN
    RAISE NOTICE 'fire_create_rebuild_issue skipped: vault secret paperclip_pending_sync_secret is not set';
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := 'https://zjxvcgcuukgqawczanud.supabase.co/functions/v1/create-rebuild-issue',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-agent-secret', secret),
      body := jsonb_build_object('approval_id', NEW.id),
      timeout_milliseconds := 15000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'fire_create_rebuild_issue failed: %', sqlerrm;
  END;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fire_create_rebuild_issue() FROM PUBLIC;

DROP TRIGGER IF EXISTS prospect_approvals_fire_rebuild_issue ON public.prospect_approvals;
CREATE TRIGGER prospect_approvals_fire_rebuild_issue
AFTER UPDATE ON public.prospect_approvals
FOR EACH ROW
WHEN (NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' AND NEW.rebuild_issue_id IS NULL)
EXECUTE FUNCTION public.fire_create_rebuild_issue();

-- Receiver secret for rebuild-status-webhook, in case Ara/Nicole want a
-- faster-than-hourly push for the 'rebuilding'/'stuck' states (see header
-- comment). Random default so nobody has to invent a value; CRE-413's
-- comment thread has the handoff for whoever needs to read it back.
INSERT INTO public.app_secrets (key, value)
VALUES ('rebuild_status_webhook_secret', encode(gen_random_bytes(24), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- Hourly fallback sync (pg_cron), same shape as
-- 20261011190000_sync_paperclip_project_tasks_cron.sql: reuses the
-- paperclip_pending_sync_secret Vault entry (the CLAUDE_WEBHOOK_SECRET
-- value); a missing secret logs a notice and does nothing. Idempotent.
-- To revert: SELECT cron.unschedule('sync-rebuild-status');
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.fire_sync_rebuild_status()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn_url text := 'https://zjxvcgcuukgqawczanud.supabase.co/functions/v1/sync-rebuild-status';
  secret text;
BEGIN
  SELECT decrypted_secret INTO secret
  FROM vault.decrypted_secrets
  WHERE name = 'paperclip_pending_sync_secret'
  LIMIT 1;

  IF secret IS NULL THEN
    RAISE NOTICE 'fire_sync_rebuild_status skipped: vault secret paperclip_pending_sync_secret is not set';
    RETURN;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := fn_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-agent-secret', secret),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'fire_sync_rebuild_status failed: %', sqlerrm;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fire_sync_rebuild_status() FROM PUBLIC;

DO $$
BEGIN
  PERFORM cron.unschedule('sync-rebuild-status');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Hourly at :22, off the :00/:07/:30 rush already used by the other two.
SELECT cron.schedule(
  'sync-rebuild-status',
  '22 * * * *',
  $$SELECT public.fire_sync_rebuild_status();$$
);
