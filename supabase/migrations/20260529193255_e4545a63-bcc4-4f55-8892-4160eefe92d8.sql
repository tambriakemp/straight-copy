ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS acceptance_criteria text,
  ADD COLUMN IF NOT EXISTS design_url text,
  ADD COLUMN IF NOT EXISTS blocked_by uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS manual_prereqs text,
  ADD COLUMN IF NOT EXISTS size text,
  ADD COLUMN IF NOT EXISTS platform text;

ALTER TABLE public.project_tasks
  DROP CONSTRAINT IF EXISTS project_tasks_size_check;
ALTER TABLE public.project_tasks
  ADD CONSTRAINT project_tasks_size_check
  CHECK (size IS NULL OR size IN ('S','M','L'));

ALTER TABLE public.project_tasks
  DROP CONSTRAINT IF EXISTS project_tasks_platform_check;
ALTER TABLE public.project_tasks
  ADD CONSTRAINT project_tasks_platform_check
  CHECK (platform IS NULL OR platform IN ('web','native','backend','all'));