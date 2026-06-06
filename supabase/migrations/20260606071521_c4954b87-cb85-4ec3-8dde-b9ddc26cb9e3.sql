
CREATE TABLE public.project_task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  body text NOT NULL,
  mentions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_task_comments_task_id_idx ON public.project_task_comments(task_id, created_at DESC);
CREATE INDEX project_task_comments_mentions_idx ON public.project_task_comments USING GIN(mentions);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_task_comments TO authenticated;
GRANT ALL ON public.project_task_comments TO service_role;

ALTER TABLE public.project_task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage project_task_comments"
  ON public.project_task_comments
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Service role manages project_task_comments"
  ON public.project_task_comments
  FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER project_task_comments_updated_at
  BEFORE UPDATE ON public.project_task_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
