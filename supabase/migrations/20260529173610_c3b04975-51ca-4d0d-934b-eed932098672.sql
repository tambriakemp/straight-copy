
-- Status + priority + assignee enums
CREATE TYPE public.project_task_status AS ENUM (
  'backlog', 'ready_for_claude', 'in_progress', 'needs_review', 'blocked', 'complete'
);
CREATE TYPE public.project_task_priority AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE public.project_task_assignee_kind AS ENUM ('unassigned', 'admin', 'claude');

-- Epics
CREATE TABLE public.project_task_epics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_project_id uuid NOT NULL,
  name text NOT NULL,
  color text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_project_task_epics_project ON public.project_task_epics(client_project_id, order_index);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_task_epics TO authenticated;
GRANT ALL ON public.project_task_epics TO service_role;

ALTER TABLE public.project_task_epics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage project_task_epics" ON public.project_task_epics
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Service role manages project_task_epics" ON public.project_task_epics
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_project_task_epics_updated
  BEFORE UPDATE ON public.project_task_epics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tasks
CREATE TABLE public.project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_project_id uuid NOT NULL,
  parent_task_id uuid REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  epic_id uuid REFERENCES public.project_task_epics(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  status public.project_task_status NOT NULL DEFAULT 'backlog',
  priority public.project_task_priority NOT NULL DEFAULT 'normal',
  assignee_kind public.project_task_assignee_kind NOT NULL DEFAULT 'unassigned',
  assignee_admin_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  url text,
  due_date date,
  tags text[] NOT NULL DEFAULT '{}',
  order_index integer NOT NULL DEFAULT 0,
  created_by uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_project_tasks_project_status ON public.project_tasks(client_project_id, status, order_index);
CREATE INDEX idx_project_tasks_parent ON public.project_tasks(parent_task_id);
CREATE INDEX idx_project_tasks_epic ON public.project_tasks(epic_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_tasks TO authenticated;
GRANT ALL ON public.project_tasks TO service_role;

ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage project_tasks" ON public.project_tasks
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Service role manages project_tasks" ON public.project_tasks
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_project_tasks_updated
  BEFORE UPDATE ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-stamp completed_at
CREATE OR REPLACE FUNCTION public.stamp_project_task_completion()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'complete' AND (OLD.status IS DISTINCT FROM 'complete') THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
  ELSIF NEW.status <> 'complete' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_project_tasks_completion
  BEFORE INSERT OR UPDATE OF status ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.stamp_project_task_completion();

-- Attachments
CREATE TABLE public.project_task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_project_task_attachments_task ON public.project_task_attachments(task_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_task_attachments TO authenticated;
GRANT ALL ON public.project_task_attachments TO service_role;

ALTER TABLE public.project_task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage project_task_attachments" ON public.project_task_attachments
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Service role manages project_task_attachments" ON public.project_task_attachments
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Storage bucket (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('project-task-attachments', 'project-task-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins read project-task-attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'project-task-attachments' AND is_admin(auth.uid()));
CREATE POLICY "Admins insert project-task-attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-task-attachments' AND is_admin(auth.uid()));
CREATE POLICY "Admins update project-task-attachments" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'project-task-attachments' AND is_admin(auth.uid()));
CREATE POLICY "Admins delete project-task-attachments" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'project-task-attachments' AND is_admin(auth.uid()));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_task_epics;
