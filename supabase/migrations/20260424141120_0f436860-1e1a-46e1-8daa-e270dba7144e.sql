-- 1. Create private bucket for client deliverables
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-assets', 'client-assets', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Admin-only RLS on storage.objects for this bucket
CREATE POLICY "Admins read client-assets"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'client-assets' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins insert client-assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'client-assets' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins update client-assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'client-assets' AND public.is_admin(auth.uid()))
WITH CHECK (bucket_id = 'client-assets' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins delete client-assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'client-assets' AND public.is_admin(auth.uid()));

CREATE POLICY "Service role manages client-assets"
ON storage.objects FOR ALL
TO public
USING (bucket_id = 'client-assets' AND auth.role() = 'service_role')
WITH CHECK (bucket_id = 'client-assets' AND auth.role() = 'service_role');

-- 3. New columns on clients for the Brand Voice PDF
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS brand_voice_pdf_path TEXT,
  ADD COLUMN IF NOT EXISTS brand_voice_pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS brand_voice_pdf_generated_at TIMESTAMPTZ;