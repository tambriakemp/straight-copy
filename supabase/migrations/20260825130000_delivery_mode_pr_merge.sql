-- A third delivery mode: open a PR, then merge it.
--
-- Idempotent — two writers, see 20260823120000.
--
-- The Menovia queue has worked this way since it was set up: branch, PR, then
-- `gh pr merge --admin` in the same run. Two modes could not say that, and the
-- alternative was to record it as 'pr' and put "merge it anyway" in
-- build_notes — which would leave delivery_mode actively lying. A reader
-- seeing 'pr' would believe nothing lands without review.
--
--   pr        open a pull request and stop. Nobody merges but a person.
--   pr_merge  open a pull request and merge it in the same run. There is a
--             reviewable record, but it is not a gate.
--   push      commit straight to the branch. No record beyond the commit.
ALTER TABLE public.client_projects DROP CONSTRAINT IF EXISTS client_projects_delivery_mode_chk;
ALTER TABLE public.client_projects
  ADD CONSTRAINT client_projects_delivery_mode_chk
  CHECK (delivery_mode IN ('pr', 'pr_merge', 'push'));

COMMENT ON COLUMN public.client_projects.delivery_mode IS
  'How finished queue work lands: pr opens a pull request and stops, pr_merge opens and merges it, push commits straight to repo_branch. Defaults to pr — a client repo should not take an unreviewed commit.';
