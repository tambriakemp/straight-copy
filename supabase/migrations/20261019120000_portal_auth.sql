-- CRE-536: the client portal (/portal/:clientId) had no session at all.
-- Every page, RPC, and edge function it called trusted the raw :clientId
-- (and :projectId) from the URL as the only proof of who was asking —
-- same bug class CRE-249 already fixed for sync-client-to-surecontact.
-- The password manager was the worst of it: client-logins' handlePortal()
-- would read, overwrite or delete any client's shared credentials for
-- anyone holding (or guessing, or finding in browser history, or being
-- handed after an offboarding) a matching client_id + client_project_id.
--
-- This migration adds the identity side: a real link between an
-- auth.users row and the client(s) it may act as, plus the helper
-- function every RLS policy and every SECURITY DEFINER RPC below uses
-- instead of trusting its own argument.
--
-- Idempotent throughout: this database takes migrations from this repo
-- and from Lovable's own agent, so assume any of this may already exist.

-- 1. The link between a Supabase Auth user and the client(s) they may
-- act as in the portal. One row per invited contact; user_id is null
-- until they actually complete setup (status moves not_invited -> invited
-- -> active only then).
create table if not exists public.client_portal_users (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  contact_id uuid references public.client_contacts(id) on delete set null,
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'not_invited'
    check (status in ('not_invited', 'invited', 'active')),
  invited_at timestamptz,
  invited_by uuid references auth.users(id),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, email)
);

create index if not exists idx_client_portal_users_client
  on public.client_portal_users(client_id);
create index if not exists idx_client_portal_users_user
  on public.client_portal_users(user_id);

drop trigger if exists update_client_portal_users_updated_at on public.client_portal_users;
create trigger update_client_portal_users_updated_at
  before update on public.client_portal_users
  for each row
  execute function public.update_updated_at_column();

alter table public.client_portal_users enable row level security;

drop policy if exists "Admins manage client_portal_users" on public.client_portal_users;
create policy "Admins manage client_portal_users"
  on public.client_portal_users for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "Service role manages client_portal_users" on public.client_portal_users;
create policy "Service role manages client_portal_users"
  on public.client_portal_users for all to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- A portal user may read their own membership row(s) (which client(s) am
-- I), but never anyone else's and never write to it themselves.
drop policy if exists "Portal users read own membership" on public.client_portal_users;
create policy "Portal users read own membership"
  on public.client_portal_users for select to authenticated
  using (user_id = auth.uid());

-- 2. The one check every RLS policy and RPC below reduces to: is this
-- signed-in user an ACTIVE portal member of this client. Never anon.
create or replace function public.is_portal_member(_user_id uuid, _client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.client_portal_users
    where user_id = _user_id
      and client_id = _client_id
      and status = 'active'
  )
$$;

revoke all on function public.is_portal_member(uuid, uuid) from public;
grant execute on function public.is_portal_member(uuid, uuid) to authenticated, service_role;

-- Convenience wrapper used throughout: a portal member of this client, OR
-- an admin (the existing "preview as admin" path, e.g. Open portal from
-- the client's admin page), OR the service role. The service-role arm
-- matters because some of these RPCs (get_portal_client, in particular)
-- are called by edge functions through a service-role client purely to
-- check "does this client exist" — those callers have already resolved
-- the real caller's identity themselves (resolvePortalCaller) before
-- ever reaching here, the same split as every "Admins manage X" /
-- "Service role manages X" policy pair elsewhere in this schema. Never
-- anon either way.
create or replace function public.is_portal_member_or_admin(_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_portal_member(auth.uid(), _client_id)
      or public.is_admin(auth.uid())
      or auth.role() = 'service_role'
$$;

revoke all on function public.is_portal_member_or_admin(uuid) from public;
grant execute on function public.is_portal_member_or_admin(uuid) to authenticated, service_role;

-- 3. After login, the portal needs to resolve "who am I" without being
-- handed a client_id to check against (that would be circular) — so this
-- one has no argument at all. SECURITY DEFINER, reads auth.uid() only.
create or replace function public.portal_whoami()
returns table (
  client_id uuid,
  business_name text,
  contact_name text,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.business_name, c.contact_name, pu.status
  from public.client_portal_users pu
  join public.clients c on c.id = pu.client_id
  where pu.user_id = auth.uid()
    and pu.status = 'active'
    and coalesce(c.archived, false) = false
$$;

revoke all on function public.portal_whoami() from public;
grant execute on function public.portal_whoami() to authenticated;

-- 4. Tighten the existing portal RPCs that trusted their argument alone.
-- Same signature and shape, anon revoked, identity check added.

create or replace function public.get_portal_client(_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  c RECORD;
  active_node RECORD;
  result jsonb;
BEGIN
  IF NOT public.is_portal_member_or_admin(_client_id) THEN
    RETURN NULL;
  END IF;

  SELECT id, business_name, contact_name, tier, brand_kit_intake_submitted_at,
         build_start_date, delivery_date, delivery_video_url
    INTO c
    FROM public.clients
    WHERE id = _client_id AND archived = false
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT jn.id, jn.key, jn.label, jn.order_index, jn.status, jn.notes
    INTO active_node
    FROM public.journey_nodes jn
    LEFT JOIN public.client_projects cp ON cp.id = jn.client_project_id
    WHERE jn.client_id = _client_id
      AND jn.status NOT IN ('complete', 'client_submitted')
      AND (cp.id IS NULL OR cp.type <> 'app_development')
    ORDER BY jn.order_index ASC
    LIMIT 1;

  result := jsonb_build_object(
    'id', c.id,
    'business_name', c.business_name,
    'contact_name', c.contact_name,
    'tier', c.tier,
    'brand_kit_intake_submitted_at', c.brand_kit_intake_submitted_at,
    'build_start_date', c.build_start_date,
    'delivery_date', c.delivery_date,
    'delivery_video_url', c.delivery_video_url,
    'active_node', CASE WHEN active_node.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', active_node.id,
      'key', active_node.key,
      'label', active_node.label,
      'order_index', active_node.order_index,
      'status', active_node.status
    ) END
  );

  RETURN result;
END;
$function$;

revoke all on function public.get_portal_client(uuid) from public;
revoke execute on function public.get_portal_client(uuid) from anon;
grant execute on function public.get_portal_client(uuid) to authenticated, service_role;

create or replace function public.portal_project_phases(_client_project_id uuid)
returns table (
  id uuid, key text, label text, order_index integer,
  status text, started_at timestamptz, completed_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  with proj as (
    select id, client_id, type from public.client_projects where id = _client_project_id
  )
  select jn.id, jn.key, jn.label, jn.order_index, jn.status, jn.started_at, jn.completed_at
    from public.journey_nodes jn
    join proj p on p.client_id = jn.client_id
   where (jn.client_project_id = p.id
      or (jn.client_project_id is null and p.type = 'automation_build'))
     and public.is_portal_member_or_admin(p.client_id)
   order by jn.order_index asc
$$;

revoke all on function public.portal_project_phases(uuid) from public;
revoke execute on function public.portal_project_phases(uuid) from anon;
grant execute on function public.portal_project_phases(uuid) to authenticated, service_role;

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
  join public.client_projects cp on cp.id = a.client_project_id
  where a.client_project_id = _client_project_id
    and a.reviewed_at is not null
    and a.shared_at is not null
    and public.is_portal_member_or_admin(cp.client_id)
  order by a.created_at desc
$$;

revoke all on function public.portal_project_audits(uuid) from public;
revoke execute on function public.portal_project_audits(uuid) from anon;
grant execute on function public.portal_project_audits(uuid) to authenticated, service_role;

comment on function public.portal_project_audits(uuid) is
  'Portal-safe read of a project''s shared audit reports, scoped to the signed-in portal member (or admin). Never returns the report password.';

-- 5. client_contracts: RLS was already admin/service-role only (so the
-- anon read PortalProject.tsx made was already silently returning
-- nothing — not a hole, but not a working feature either). Add the
-- portal-member policy now that there's a real session to check.
drop policy if exists "Portal members read own contracts" on public.client_contracts;
create policy "Portal members read own contracts"
  on public.client_contracts for select to authenticated
  using (public.is_portal_member_or_admin(client_id));

-- Same deal for web_dev_discovery: GRANT already named authenticated, but
-- no RLS policy ever let a non-admin authenticated reader in, so the
-- portal's direct read of its own discovery-chat transcript has been
-- silently failing (caught, logged, swallowed) since this table shipped.
drop policy if exists "Portal members read own discovery" on public.web_dev_discovery;
create policy "Portal members read own discovery"
  on public.web_dev_discovery for select to authenticated
  using (public.is_portal_member_or_admin(client_id));

-- 6. Storage: the three "Portal can upload ..." policies on client-assets
-- accepted `anon` and checked only that the client_id folder segment named
-- an existing, active client — not that the uploader had anything to do
-- with that client. Replace all three with authenticated-only + membership.
drop policy if exists "Portal can upload account-access files" on storage.objects;
create policy "Portal can upload account-access files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'client-assets'
  and (storage.foldername(name))[1] = 'account-access'
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.is_portal_member_or_admin(((storage.foldername(name))[2])::uuid)
  and (storage.filename(name)) ~ '[A-Za-z0-9]{16,}'
  and coalesce((metadata->>'size')::bigint, 0) <= 26214400
  and coalesce(metadata->>'mimetype', '') in (
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

drop policy if exists "Portal can upload brand-kit files" on storage.objects;
create policy "Portal can upload brand-kit files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'client-assets'
  and (storage.foldername(name))[1] = 'brand-kit'
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.is_portal_member_or_admin(((storage.foldername(name))[2])::uuid)
  and (storage.filename(name)) ~ '[A-Za-z0-9]{16,}'
  and coalesce((metadata->>'size')::bigint, 0) <= 26214400
  and coalesce(metadata->>'mimetype', '') in (
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

drop policy if exists "Portal can upload project files" on storage.objects;
create policy "Portal can upload project files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'client-assets'
  and (storage.foldername(name))[1] = 'project-files'
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.is_portal_member_or_admin(((storage.foldername(name))[2])::uuid)
);

comment on table public.client_portal_users is
  'CRE-536: links an auth.users row to the client(s) it may act as in the portal. status not_invited -> invited -> active; user_id is set once the one-time setup link creates the auth user.';
