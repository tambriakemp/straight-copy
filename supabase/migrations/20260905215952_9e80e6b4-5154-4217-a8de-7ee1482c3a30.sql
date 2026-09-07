ALTER TABLE public.client_projects
  ALTER COLUMN delivery_mode SET DEFAULT 'pr_merge';

COMMENT ON COLUMN public.client_projects.delivery_mode IS
  'How finished work lands: pr_merge (default) opens a pull request and merges '
  'it in the same run; pr opens one and stops for a human; push commits '
  'straight to repo_branch. Set pr per-project where somebody genuinely '
  'reviews before merge.';

UPDATE public.client_projects
   SET delivery_mode = 'pr_merge'
 WHERE delivery_mode = 'pr'
   AND repo_url IS NOT NULL;

UPDATE public.queue_fire_routes
   SET secret_prefix = 'gha_queue',
       target = 'github_dispatch'
 WHERE client_project_id IS NULL
   AND target <> 'github_dispatch'
   AND EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'gha_queue_fire_url')
   AND EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'gha_queue_fire_token');

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