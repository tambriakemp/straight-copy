-- CRE-413 bug fix (Bree, 2026-10-12): a rebuild push landing on a new slug
-- (e.g. west-pool-service -> west-pool-service-v2) was inserting a second
-- prospect_approvals row instead of updating the original in place — two
-- rows on /admin/approvals for one prospect. prospect-approvals-sync's push
-- action now resolves the existing row (by rebuilt_from_approval_id, or by
-- matching base slug) and updates it in place instead of inserting. This
-- column gives that in-place update somewhere to record "how many rebuild
-- cycles has this row been through" without a second row to count.
--
-- Written to tolerate being applied twice, same convention as every other
-- migration in this table's history.
ALTER TABLE public.prospect_approvals
  ADD COLUMN IF NOT EXISTS rebuild_round integer NOT NULL DEFAULT 0;
