-- A client login may belong to one of that client's projects, or to none.
--
-- The column is `client_project_id`: the id of a `client_projects` row.
-- It is nullable on purpose. A login with no project is a login for the
-- client as a whole, and every login saved before this existed is one of
-- those. A second column named `project_id` would be a second place to
-- store the same fact.
--
-- `set_client_login` used to write `COALESCE(_client_project_id,
-- client_project_id)`, so choosing "No project" on an edit left the old
-- project in place. Null now means clear. Callers pass the value they
-- mean: the admin form sends null for no project, and a portal edit sends
-- the project already on the row.
--
-- Idempotent. This database takes migrations from this repo and from
-- Lovable's agent.

alter table public.client_logins
  add column if not exists client_project_id uuid
    references public.client_projects(id) on delete set null;

create index if not exists idx_client_logins_project
  on public.client_logins(client_project_id, sort_order, created_at);

-- The admin list reads this view. Drop then create: replacing a view cannot
-- insert a column into the middle of its list.
drop view if exists public.client_logins_list;

create view public.client_logins_list
with (security_invoker = true) as
  select id, client_id, client_project_id, label, url, username, note,
         sort_order, created_at, updated_at,
         (encrypted_password is not null) as has_password
    from public.client_logins;

grant select on public.client_logins_list to authenticated;
grant select on public.client_logins_list to service_role;
grant select (client_project_id) on public.client_logins to authenticated;

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
  IF _client_project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.client_projects
     WHERE id = _client_project_id AND client_id = _client_id
  ) THEN
    RAISE EXCEPTION 'project does not belong to this client';
  END IF;

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
           -- Null clears. The previous body kept the stored project whenever
           -- this argument was null, so "No project" could not be saved.
           client_project_id = _client_project_id,
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
