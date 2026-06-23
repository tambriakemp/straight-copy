
-- 1) Harden portal storage upload policies
DROP POLICY IF EXISTS "Portal can upload brand-kit files" ON storage.objects;
DROP POLICY IF EXISTS "Portal can upload account-access files" ON storage.objects;

CREATE POLICY "Portal can upload brand-kit files"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'client-assets'
  AND (storage.foldername(name))[1] = 'brand-kit'
  AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND client_exists_active(((storage.foldername(name))[2])::uuid)
  -- require an unguessable random token segment in the filename (>= 16 hex/base36 chars)
  AND (storage.filename(name)) ~ '[A-Za-z0-9]{16,}'
  -- 25 MB cap
  AND COALESCE((metadata->>'size')::bigint, 0) <= 26214400
  -- mime allow-list
  AND COALESCE(metadata->>'mimetype', '') IN (
    'image/png','image/jpeg','image/jpg','image/gif','image/webp','image/svg+xml','image/heic','image/heif',
    'application/pdf',
    'application/zip','application/x-zip-compressed',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','text/csv'
  )
);

CREATE POLICY "Portal can upload account-access files"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'client-assets'
  AND (storage.foldername(name))[1] = 'account-access'
  AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND client_exists_active(((storage.foldername(name))[2])::uuid)
  AND (storage.filename(name)) ~ '[A-Za-z0-9]{16,}'
  AND COALESCE((metadata->>'size')::bigint, 0) <= 26214400
  AND COALESCE(metadata->>'mimetype', '') IN (
    'image/png','image/jpeg','image/jpg','image/gif','image/webp','image/svg+xml','image/heic','image/heif',
    'application/pdf',
    'application/zip','application/x-zip-compressed',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','text/csv'
  )
);

-- 2) Onboarding submissions: admin delete policy
DROP POLICY IF EXISTS "Admins can delete onboarding submissions" ON public.onboarding_submissions;
CREATE POLICY "Admins can delete onboarding submissions"
ON public.onboarding_submissions
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

-- 3) surecontact_events: explicit service_role insert/all
DROP POLICY IF EXISTS "Service role manages surecontact events" ON public.surecontact_events;
CREATE POLICY "Service role manages surecontact events"
ON public.surecontact_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
