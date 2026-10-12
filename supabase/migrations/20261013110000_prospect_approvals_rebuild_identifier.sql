-- CRE-393 bug fix (Bree, 2026-10-12 8:46am CT): Decide-card Approve clicks on
-- prospect rebuild-review cards (e.g. CRE-417 "Camille's West Pool Service
-- v2", CRE-416 "Camille's Blackwell Fencing v2") never reached the
-- prospect_approvals row the card was actually about -- decide-action only
-- logged a decide_actions audit row and relayed to Ara. create-rebuild-issue
-- already stamps the Paperclip issue's UUID onto rebuild_issue_id, but a
-- Decide card's task_ids only ever carries the human-readable identifier
-- ("CRE-417"), so there was no column decide-action could match against
-- without an extra Paperclip API round-trip on every single pick. This one
-- gives it a direct match.
--
-- Written to tolerate being applied twice, same convention as every other
-- migration in this table's history.
ALTER TABLE public.prospect_approvals
  ADD COLUMN IF NOT EXISTS rebuild_issue_identifier text;

CREATE INDEX IF NOT EXISTS prospect_approvals_rebuild_issue_identifier_idx
  ON public.prospect_approvals (rebuild_issue_identifier)
  WHERE rebuild_issue_identifier IS NOT NULL;
