
-- ============================================================
-- Social media post & carousel builder
-- ============================================================

CREATE TABLE IF NOT EXISTS public.social_post_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_project_id uuid NOT NULL REFERENCES public.client_projects(id) ON DELETE CASCADE,
  created_by uuid,
  status text NOT NULL DEFAULT 'drafting',
  brief text,
  platform text,
  single_count integer NOT NULL DEFAULT 0,
  carousel_count integer NOT NULL DEFAULT 0,
  slides_per_carousel integer NOT NULL DEFAULT 5,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_post_batches TO authenticated;
GRANT ALL ON public.social_post_batches TO service_role;

ALTER TABLE public.social_post_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage social_post_batches"
  ON public.social_post_batches FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Service role manages social_post_batches"
  ON public.social_post_batches FOR ALL TO public
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS social_post_batches_project_idx
  ON public.social_post_batches(client_project_id, created_at DESC);

-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.social_post_batches(id) ON DELETE CASCADE,
  client_project_id uuid NOT NULL REFERENCES public.client_projects(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  format text NOT NULL DEFAULT 'single',
  status text NOT NULL DEFAULT 'draft',
  caption text,
  hashtags text[] NOT NULL DEFAULT '{}',
  slides jsonb NOT NULL DEFAULT '[]'::jsonb,
  copost_post_id text,
  published_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_posts TO authenticated;
GRANT ALL ON public.social_posts TO service_role;

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage social_posts"
  ON public.social_posts FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Service role manages social_posts"
  ON public.social_posts FOR ALL TO public
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS social_posts_batch_idx
  ON public.social_posts(batch_id, order_index);

-- ------------------------------------------------------------
-- updated_at trigger
-- ------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_social_post_batches_touch ON public.social_post_batches;
CREATE TRIGGER trg_social_post_batches_touch
BEFORE UPDATE ON public.social_post_batches
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_social_posts_touch ON public.social_posts;
CREATE TRIGGER trg_social_posts_touch
BEFORE UPDATE ON public.social_posts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- Storage bucket (private) for rendered images
-- ------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('social-posts', 'social-posts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins read social-posts objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'social-posts' AND is_admin(auth.uid()));

CREATE POLICY "Admins write social-posts objects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'social-posts' AND is_admin(auth.uid()));

CREATE POLICY "Admins update social-posts objects"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'social-posts' AND is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'social-posts' AND is_admin(auth.uid()));

CREATE POLICY "Admins delete social-posts objects"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'social-posts' AND is_admin(auth.uid()));
