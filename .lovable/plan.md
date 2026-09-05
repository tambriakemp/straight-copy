# Apply migration and redeploy all edge functions

## Goal
Apply one pending migration, then redeploy every edge function so nothing runs on mismatched `_shared/` code (model-params.ts, claude.ts, loop.ts, dispatch-target.ts changed since last full deploy). No application code changes.

## Current state
- `git fetch` + `git log HEAD..origin/main` returned empty — there are no unpulled commits; the working tree is already the latest main.
- Migration file `supabase/migrations/20260905220000_merge_by_default_and_actions_for_every_board.sql` exists and is written to be re-runnable.
- 62 edge function directories exist (excluding `_shared`).

## Steps
1. **Run the migration** via the migration tool. It will:
   - Set `client_projects.delivery_mode` default to `pr_merge` (work lands as a merged PR rather than an unmerged one, so it is visible in the deployed app).
   - Move existing repo-connected projects from `pr` to `pr_merge`.
   - Point the default queue route at GitHub Actions instead of the claude.ai routine (guarded on the Vault secrets existing), so every board runs on the Claude subscription rather than API credits.
   - Remove per-project queue routes that are exact duplicates of the new default.
2. **Redeploy all 62 edge functions** in batches (deploy tool takes an array; will send in chunks to avoid one oversized call). `_shared/` ships with each deploy.
3. **Verify**: query `agent_messages` / `agent_runs` after a fresh agent turn to confirm `duration_ms`/`iterations` populate, and check the migration took effect (`delivery_mode` default, `queue_fire_routes.target = 'github_dispatch'`).

## No code changes
Only the migration runs and functions redeploy. Nothing in `src/` or `supabase/functions/` is edited.

## Technical details
- Migration is idempotent per its own header (Lovable re-applies migrations as fresh copies).
- The queue-route update only fires if Vault secrets `gha_queue_fire_url` and `gha_queue_fire_token` exist; otherwise the default route stays on the claude.ai routine.
