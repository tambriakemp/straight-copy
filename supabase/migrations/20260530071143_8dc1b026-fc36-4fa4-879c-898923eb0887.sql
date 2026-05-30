
ALTER TABLE public.project_task_attachments
  ADD COLUMN IF NOT EXISTS bucket text NOT NULL DEFAULT 'project-task-attachments';

UPDATE public.project_task_attachments
SET bucket = 'client-assets'
WHERE storage_path LIKE 'clients/%/brand-voice/%';
