-- CRE-413 Phase 2 (Devin, 2026-10-13): page wiring surfaces two gaps found
-- while reading the Phase 1 pipeline.
--
-- 1. "Rebuilds: N of M done" needs to know when a rebuild issue is actually
--    closed, not just its current state. rebuild_status's 'ready_for_review'
--    deliberately covers both "still open, already resubmitted" and "closed,
--    already resubmitted" (see mapIssueStatus in _shared/rebuildStatus.ts) --
--    batch progress needs the second one specifically, so it gets its own
--    column rather than overloading rebuild_status.
--
-- 2. The round-1-only bug: the trigger's WHEN clause and create-rebuild-issue's
--    atomic claim both required rebuild_issue_id IS NULL. That column is set
--    once and never cleared, so a prospect rejected a SECOND time (after
--    Camille already resubmitted once) could never get a new rebuild issue --
--    the trigger wouldn't even fire. Silent, forever, exactly the kind of
--    automation failure this task exists to prevent. By the time a second
--    rejection is possible, the row must have gone status: rejected -> pending
--    via prospect-approvals-sync's rebuilt_from_approval_id push, which always
--    sets rebuild_status = 'ready_for_review' first -- so "rebuild_issue_id
--    IS NULL OR rebuild_status = 'ready_for_review'" is the correct claim
--    condition for every round, not just the first.
--
-- Written to tolerate being applied twice, same convention as every other
-- migration in this table's history.

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
