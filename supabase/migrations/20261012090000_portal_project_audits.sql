-- The client portal needs to read a project's audit reports, and it has
-- no Supabase session to read them with.
--
-- client_audits is admin-RLS-only, which is right: the row carries the
-- report's PASSWORD, and the portal is reached by a link. So the portal
-- does not get a policy — it gets this function, which returns the
-- fields a client may see and never the password, and only for reports
-- that have been both reviewed and shared.
--
-- SECURITY DEFINER with a pinned search_path, granted to anon and
-- authenticated. It takes a client_project_id, so holding a portal link
-- gets you that project's shared reports and nothing else.
create or replace function public.portal_project_audits(_client_project_id uuid)
returns table (
  id uuid,
  slug text,
  kind text,
  client_name text,
  cover_note text,
  report_url text,
  reviewed_at timestamptz,
  shared_at timestamptz,
  created_at timestamptz,
  version_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id, a.slug, a.kind, a.client_name, a.cover_note, a.report_url,
    a.reviewed_at, a.shared_at, a.created_at,
    greatest(1, (
      select count(*)::int from public.audit_report_versions v
       where v.client_audit_id = a.id
    )) as version_count
  from public.client_audits a
  where a.client_project_id = _client_project_id
    -- Reviewed AND shared. Reviewed means someone here read it; shared
    -- means it went out. An audit that is written but unchecked is not a
    -- thing to show anybody.
    and a.reviewed_at is not null
    and a.shared_at is not null
  order by a.created_at desc
$$;

revoke all on function public.portal_project_audits(uuid) from public;
grant execute on function public.portal_project_audits(uuid) to anon, authenticated, service_role;

comment on function public.portal_project_audits(uuid) is
  'Portal-safe read of a project''s shared audit reports. Never returns the report password.';
