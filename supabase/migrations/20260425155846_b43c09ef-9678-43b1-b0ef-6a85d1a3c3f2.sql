-- 1. Add client_account_access jsonb column to clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS client_account_access jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Append "Required accounts created and access submitted via portal" to intake templates
-- Growth
UPDATE public.journey_templates
SET checklist = checklist || '[{"id":"g-intake-6","label":"Required accounts created and access submitted via portal","owner":"client","done":false,"auto_key":"accounts_submitted"}]'::jsonb
WHERE tier = 'growth'
  AND key = 'intake'
  AND NOT (checklist @> '[{"auto_key":"accounts_submitted"}]'::jsonb);

-- Launch
UPDATE public.journey_templates
SET checklist = checklist || '[{"id":"l-intake-6","label":"Required accounts created and access submitted via portal","owner":"client","done":false,"auto_key":"accounts_submitted"}]'::jsonb
WHERE tier = 'launch'
  AND key = 'intake'
  AND NOT (checklist @> '[{"auto_key":"accounts_submitted"}]'::jsonb);

-- 3. Back-fill existing journey_nodes (intake) that don't yet have the item
UPDATE public.journey_nodes n
SET checklist = n.checklist || jsonb_build_array(
  jsonb_build_object(
    'id', CASE WHEN c.tier = 'growth' THEN 'g-intake-6' ELSE 'l-intake-6' END,
    'label', 'Required accounts created and access submitted via portal',
    'owner', 'client',
    'done', false,
    'auto_key', 'accounts_submitted'
  )
)
FROM public.clients c
WHERE n.client_id = c.id
  AND n.key = 'intake'
  AND NOT (n.checklist @> '[{"auto_key":"accounts_submitted"}]'::jsonb);

-- 4. Storage policies for client-assets bucket (account-access folder)
-- Allow anonymous (portal) uploads ONLY into the account-access/ folder
DROP POLICY IF EXISTS "Portal can upload account-access files" ON storage.objects;
CREATE POLICY "Portal can upload account-access files"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'client-assets'
  AND (storage.foldername(name))[1] = 'account-access'
);

-- Admins (and service role) can read all client-assets
DROP POLICY IF EXISTS "Admins read client-assets" ON storage.objects;
CREATE POLICY "Admins read client-assets"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'client-assets' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role manages client-assets" ON storage.objects;
CREATE POLICY "Service role manages client-assets"
ON storage.objects
FOR ALL
TO public
USING (bucket_id = 'client-assets' AND auth.role() = 'service_role')
WITH CHECK (bucket_id = 'client-assets' AND auth.role() = 'service_role');