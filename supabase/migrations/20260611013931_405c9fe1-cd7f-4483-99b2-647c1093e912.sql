-- Remove admin-only tables from Realtime publication (RLS does not gate broadcast payloads)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='project_tasks') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.project_tasks';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='project_task_epics') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.project_task_epics';
  END IF;
END $$;

-- Lock down Realtime channel subscriptions: only admins may subscribe via realtime.messages
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read realtime messages" ON realtime.messages;
CREATE POLICY "Admins can read realtime messages"
ON realtime.messages
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can write realtime messages" ON realtime.messages;
CREATE POLICY "Admins can write realtime messages"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));
