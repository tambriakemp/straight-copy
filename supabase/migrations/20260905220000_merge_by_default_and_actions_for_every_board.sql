-- Two defaults change, now that the Actions worker has proven itself on a real
-- run (three tasks, two client repos, 2026-09-05).
--
-- 1. delivery_mode defaults to 'pr_merge' instead of 'pr'.
--    'pr' was the cautious default from before any of this had run. It has a
--    cost that only shows up in practice: this app is deployed by Lovable from
--    main, so an unmerged PR is invisible in the product. Work that cannot be
--    looked at cannot be reviewed, which is the opposite of what a review gate
--    is for. Merging keeps the pull request as the record and leaves a revert
--    one click away.
--
-- 2. The default queue route fires GitHub Actions instead of the claude.ai
--    routine, so every board — including boards created later, which inherit
--    the default route by having no row of their own — runs on the Claude
--    subscription rather than on API credits.
--
-- Written to be re-runnable: Lovable re-applies migrations as fresh copies with
-- new timestamps rather than marking them applied, so anything here can and will
-- execute more than once.

-- 1. Merge by default -------------------------------------------------------

ALTER TABLE public.client_projects
  ALTER COLUMN delivery_mode SET DEFAULT 'pr_merge';

COMMENT ON COLUMN public.client_projects.delivery_mode IS
  'How finished work lands: pr_merge (default) opens a pull request and merges '
  'it in the same run; pr opens one and stops for a human; push commits '
  'straight to repo_branch. Set pr per-project where somebody genuinely '
  'reviews before merge.';

-- Existing boards move too. Only ones wired to a repo: a project with no
-- repo_url has no delivery to speak of, and changing it would be noise.
UPDATE public.client_projects
   SET delivery_mode = 'pr_merge'
 WHERE delivery_mode = 'pr'
   AND repo_url IS NOT NULL;

-- 2. Every board on the subscription ---------------------------------------

-- The default route is the row with no client_project_id; per-project rows win
-- over it. Guarded on the Vault secrets actually existing, because a route
-- pointing at secrets that are absent fires nothing and logs no_secret — worse
-- than the claude.ai routine it would have replaced.
UPDATE public.queue_fire_routes
   SET secret_prefix = 'gha_queue',
       target = 'github_dispatch'
 WHERE client_project_id IS NULL
   AND target <> 'github_dispatch'
   AND EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'gha_queue_fire_url')
   AND EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'gha_queue_fire_token');

-- The per-project row added by hand to pilot one board is now identical to the
-- default, and a duplicate of a default is a place for the two to drift apart.
-- Only removes rows that match the default exactly, so a genuinely different
-- per-project route survives.
DELETE FROM public.queue_fire_routes r
 WHERE r.client_project_id IS NOT NULL
   AND EXISTS (
     SELECT 1
       FROM public.queue_fire_routes d
      WHERE d.client_project_id IS NULL
        AND d.secret_prefix = r.secret_prefix
        AND d.target = r.target
        AND d.debounce_seconds = r.debounce_seconds
   );
