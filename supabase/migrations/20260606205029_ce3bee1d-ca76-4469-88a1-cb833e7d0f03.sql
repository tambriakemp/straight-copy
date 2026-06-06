
-- 1. Remove sensitive admin-only tables from Realtime publication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='project_tasks') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.project_tasks';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='project_task_epics') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.project_task_epics';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='social_post_batches') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.social_post_batches';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='social_posts') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.social_posts';
  END IF;
END $$;

-- 2. Add service role policy on mcp_oauth_clients (edge function uses service role)
DROP POLICY IF EXISTS "Service role manages mcp_oauth_clients" ON public.mcp_oauth_clients;
CREATE POLICY "Service role manages mcp_oauth_clients"
ON public.mcp_oauth_clients
FOR ALL
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 3. Remove anon insert path on onboarding_submissions; server uses service role exclusively
DROP POLICY IF EXISTS "Anyone can submit onboarding with valid invite" ON public.onboarding_submissions;
