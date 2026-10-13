-- CRE-413 Phase 2: rebuild_issue_closed_at column + round-2-safe trigger WHEN clause.
-- Idempotent (safe to apply twice).

ALTER TABLE public.prospect_approvals
  ADD COLUMN IF NOT EXISTS rebuild_issue_closed_at timestamptz;

DROP TRIGGER IF EXISTS prospect_approvals_fire_rebuild_issue ON public.prospect_approvals;
CREATE TRIGGER prospect_approvals_fire_rebuild_issue
AFTER UPDATE ON public.prospect_approvals
FOR EACH ROW
WHEN (
  NEW.status = 'rejected'
  AND OLD.status IS DISTINCT FROM 'rejected'
  AND (NEW.rebuild_issue_id IS NULL OR NEW.rebuild_status = 'ready_for_review')
)
EXECUTE FUNCTION public.fire_create_rebuild_issue();