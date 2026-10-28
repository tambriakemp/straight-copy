-- The portal_auth migration created client_portal_users with RLS but no
-- table grants, so neither the portal (reading its own membership) nor the
-- admin/service-role paths could reach it. RLS still decides which rows.
GRANT SELECT ON public.client_portal_users TO authenticated;
GRANT ALL ON public.client_portal_users TO service_role;