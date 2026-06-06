ALTER TABLE public.project_task_comments
  ADD COLUMN IF NOT EXISTS acknowledged_by text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS project_task_comments_acknowledged_by_idx
  ON public.project_task_comments USING gin (acknowledged_by);