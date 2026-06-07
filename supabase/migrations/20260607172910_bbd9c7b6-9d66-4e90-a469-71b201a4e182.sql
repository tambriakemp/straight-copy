ALTER TABLE public.project_tasks REPLICA IDENTITY FULL;
ALTER TABLE public.project_task_epics REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_task_epics;