
CREATE OR REPLACE FUNCTION public.client_exists_active(_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = _client_id AND coalesce(archived, false) = false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.client_exists_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_exists_active(uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Portal can upload account-access files" ON storage.objects;
DROP POLICY IF EXISTS "Portal can upload brand-kit files" ON storage.objects;

CREATE POLICY "Portal can upload account-access files"
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (
  bucket_id = 'client-assets'
  AND (storage.foldername(name))[1] = 'account-access'
  AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND public.client_exists_active(((storage.foldername(name))[2])::uuid)
);

CREATE POLICY "Portal can upload brand-kit files"
ON storage.objects FOR INSERT TO anon, authenticated
WITH CHECK (
  bucket_id = 'client-assets'
  AND (storage.foldername(name))[1] = 'brand-kit'
  AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND public.client_exists_active(((storage.foldername(name))[2])::uuid)
);
