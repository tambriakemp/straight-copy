
CREATE TABLE IF NOT EXISTS public.social_design_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_project_id uuid NOT NULL REFERENCES public.client_projects(id) ON DELETE CASCADE,
  created_by uuid,
  name text NOT NULL,
  format_support text NOT NULL DEFAULT 'both', -- 'single' | 'carousel' | 'both'
  html_source text NOT NULL,
  design_notes text,
  slide_count integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_design_templates TO authenticated;
GRANT ALL ON public.social_design_templates TO service_role;

ALTER TABLE public.social_design_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage social_design_templates"
  ON public.social_design_templates FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Service role manages social_design_templates"
  ON public.social_design_templates FOR ALL TO public
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS social_design_templates_project_idx
  ON public.social_design_templates(client_project_id, active);

DROP TRIGGER IF EXISTS trg_social_design_templates_touch ON public.social_design_templates;
CREATE TRIGGER trg_social_design_templates_touch
BEFORE UPDATE ON public.social_design_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Optional template selection on a batch.
ALTER TABLE public.social_post_batches
  ADD COLUMN IF NOT EXISTS design_template_id uuid REFERENCES public.social_design_templates(id) ON DELETE SET NULL;

-- Store which template was used on each generated post so regenerate/redesign can re-use it.
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS design_template_id uuid REFERENCES public.social_design_templates(id) ON DELETE SET NULL;

-- Track which copy provider produced the post (anthropic | lovable).
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS copy_provider text;
