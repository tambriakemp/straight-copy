-- Allow anonymous (portal) uploads into the brand-kit/ folder of client-assets,
-- mirroring the existing account-access policy. Reads remain admin/service-role only.
DROP POLICY IF EXISTS "Portal can upload brand-kit files" ON storage.objects;
CREATE POLICY "Portal can upload brand-kit files"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'client-assets'
  AND (storage.foldername(name))[1] = 'brand-kit'
);