-- Re-assert security_invoker on client_logins_list.
--
-- The view was created WITH (security_invoker = true) so it runs as the
-- caller and the RLS policy on client_logins applies. The drag-to-reorder
-- work recreated it with CREATE OR REPLACE VIEW to add sort_order and did
-- not repeat that clause.
--
-- Whether CREATE OR REPLACE preserves reloptions or resets them is not a
-- thing worth depending on, because of what it costs if it resets: a view
-- without security_invoker runs as its OWNER, which bypasses RLS on the
-- table underneath — every client's logins readable by any authenticated
-- user who can select the view. So this states it outright.
--
-- Idempotent and safe to run whatever state the view is in; the column
-- list matches the reorder work's version, sort_order included.

CREATE OR REPLACE VIEW public.client_logins_list
WITH (security_invoker = true) AS
  SELECT id, client_id, label, url, username, note, created_at, updated_at,
         (encrypted_password IS NOT NULL) AS has_password,
         sort_order
    FROM public.client_logins;

GRANT SELECT ON public.client_logins_list TO authenticated;
GRANT SELECT ON public.client_logins_list TO service_role;

-- The ciphertext stays unreadable through PostgREST either way.
REVOKE SELECT (encrypted_password) ON public.client_logins FROM authenticated;
