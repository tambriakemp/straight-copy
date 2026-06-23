
-- Table
CREATE TABLE public.social_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_project_id uuid NOT NULL REFERENCES public.client_projects(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  width int,
  height int,
  caption text,
  hashtags text[] NOT NULL DEFAULT '{}',
  caption_status text NOT NULL DEFAULT 'pending',
  caption_error text,
  copost_status text NOT NULL DEFAULT 'idle',
  copost_sent_at timestamptz,
  copost_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_images TO authenticated;
GRANT ALL ON public.social_images TO service_role;

ALTER TABLE public.social_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage social_images"
  ON public.social_images FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX idx_social_images_project ON public.social_images(client_project_id, created_at DESC);
CREATE INDEX idx_social_images_copost_status ON public.social_images(copost_status);

CREATE TRIGGER set_updated_at_social_images
  BEFORE UPDATE ON public.social_images
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.social_images;

-- Storage RLS for the new bucket (bucket created via tool)
CREATE POLICY "Admins read social-images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'social-images' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins upload social-images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'social-images' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins update social-images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'social-images' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins delete social-images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'social-images' AND public.is_admin(auth.uid()));
