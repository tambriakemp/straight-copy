-- Two things the client portal's project page needs, and one the admin
-- Logins tab needs back from it.
--
-- 1. The phase ladder on "Where things stand". The portal was showing
--    only the single active node, because that is all get_portal_client
--    returns — so the card said "Now: Design" with nothing before or
--    after it, which is a status, not a sense of where you are.
--
-- 2. client_logins gains a project. A login the CLIENT shares from the
--    portal belongs to the project they shared it for; a login the
--    agency holds for the client as a whole does not. The admin tab
--    needs to tell them apart, and the portal must never be able to
--    touch the second kind.
--
-- Idempotent: this database takes migrations from this repo and from
-- Lovable's agent, so assume it may already have been applied.

-- ---------- 1. phases ----------
create or replace function public.portal_project_phases(_client_project_id uuid)
returns table (
  id uuid,
  key text,
  label text,
  order_index integer,
  status text,
  started_at timestamptz,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with proj as (
    select id, client_id, type from public.client_projects where id = _client_project_id
  )
  select jn.id, jn.key, jn.label, jn.order_index, jn.status, jn.started_at, jn.completed_at
    from public.journey_nodes jn
    join proj p on p.client_id = jn.client_id
   where jn.client_project_id = p.id
      -- Client-wide nodes are the launch/growth journey. They belong to
      -- the automation project and to nothing else: showing "Brand Kit"
      -- as a phase of an app build is how the portal used to advertise
      -- work that project never had.
      or (jn.client_project_id is null and p.type = 'automation_build')
   order by jn.order_index asc
$$;

revoke all on function public.portal_project_phases(uuid) from public;
grant execute on function public.portal_project_phases(uuid) to anon, authenticated, service_role;

comment on function public.portal_project_phases(uuid) is
  'Portal-safe read of a project''s journey nodes, in order, for the "Where things stand" ladder.';

-- ---------- 2. client_logins.client_project_id ----------
alter table public.client_logins
  add column if not exists client_project_id uuid
    references public.client_projects(id) on delete set null;

create index if not exists idx_client_logins_project
  on public.client_logins(client_project_id, sort_order, created_at);

-- The list view has to carry it too, or the admin tab cannot label a row
-- and the portal cannot scope one.
--
-- DROP then CREATE, not CREATE OR REPLACE. Replace can only APPEND a
-- column; adding one in the middle reads to Postgres as renaming the
-- column that was already in that position, and it refuses:
--   42P16: cannot change name of view column "label" to "client_project_id"
-- Dropping a view costs nothing — there is no data in it — but it does
-- drop the grants with it, which is why they are re-issued below.
drop view if exists public.client_logins_list;

create view public.client_logins_list
with (security_invoker = true) as
  select id, client_id, client_project_id, label, url, username, note,
         sort_order, created_at, updated_at,
         (encrypted_password is not null) as has_password
    from public.client_logins;

grant select on public.client_logins_list to authenticated;
grant select on public.client_logins_list to service_role;

-- The column grant is explicit on this table (the ciphertext is revoked
-- from `authenticated`), so a new column has to be added to it by hand
-- or PostgREST refuses to select it.
grant select (client_project_id) on public.client_logins to authenticated;

-- set_client_login gains the project. Same contract as before: the key
-- is passed in and never stored, EXECUTE is service_role only, and a
-- blank password on an edit means "leave it alone".
create or replace function public.set_client_login(
  _id uuid,
  _client_id uuid,
  _label text,
  _url text,
  _username text,
  _password text,
  _note text default null,
  _created_by uuid default null,
  _enc_key text default null,
  _client_project_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
DECLARE v_enc bytea; v_id uuid;
BEGIN
  IF _password IS NOT NULL AND length(_password) > 0 THEN
    IF _enc_key IS NULL OR length(_enc_key) = 0 THEN
      RAISE EXCEPTION 'encryption key required';
    END IF;
    v_enc := pgp_sym_encrypt(_password, _enc_key);
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.client_logins
      (client_id, client_project_id, label, url, username, encrypted_password, note, created_by)
      VALUES (_client_id, _client_project_id, _label, _url, _username, v_enc, _note, _created_by)
      RETURNING id INTO v_id;
  ELSE
    UPDATE public.client_logins
       SET label = _label,
           url = _url,
           username = _username,
           client_project_id = COALESCE(_client_project_id, client_project_id),
           encrypted_password = COALESCE(v_enc, encrypted_password),
           note = _note,
           updated_at = now()
     WHERE id = _id AND client_id = _client_id
     RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

revoke all on function public.set_client_login(uuid, uuid, text, text, text, text, text, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.set_client_login(uuid, uuid, text, text, text, text, text, uuid, text, uuid) to service_role;
