-- Files on a project, in both directions.
--
-- The portal's Files tab has two lists: what Cre8 Visions shared with
-- the client, and what the client sent back. They are the same kind of
-- thing from opposite ends, so one table with a direction rather than
-- two tables that drift.
--
-- The bytes live in the existing private `client-assets` bucket, under
-- project-files/<client_id>/<project_id>/. Anonymous INSERT is allowed
-- into that prefix and nowhere else — the same shape as the existing
-- account-access/ and brand-kit/ policies. Reading is NOT anonymous:
-- the bucket is private and the portal gets short-lived signed URLs from
-- the client-files function, so a leaked storage path is not a leaked
-- file.
--
-- Idempotent: this database takes migrations from this repo and from
-- Lovable's agent, so assume it may already have been applied.

create table if not exists public.client_project_files (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  client_project_id uuid references public.client_projects(id) on delete cascade,
  name text not null,
  storage_path text not null,
  size_bytes bigint,
  mime text,
  -- 'to_client' = we shared it. 'from_client' = they sent it. The client
  -- may only ever delete their own, which is what this column decides.
  direction text not null default 'from_client',
  -- "Contracts", "Deliverables" — a heading, not a taxonomy.
  category text,
  uploaded_by_name text,
  -- A file we have not finished with yet is still ours to hold back.
  visible_to_client boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_project_files_project
  on public.client_project_files(client_project_id, created_at desc);
create index if not exists idx_client_project_files_client
  on public.client_project_files(client_id, created_at desc);

grant select, insert, update, delete on public.client_project_files to authenticated;
grant all on public.client_project_files to service_role;

alter table public.client_project_files enable row level security;

drop policy if exists "Admins manage client_project_files" on public.client_project_files;
create policy "Admins manage client_project_files"
  on public.client_project_files for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "Service role manages client_project_files" on public.client_project_files;
create policy "Service role manages client_project_files"
  on public.client_project_files for all to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Portal uploads, into that one prefix and no other.
drop policy if exists "Portal can upload project files" on storage.objects;
create policy "Portal can upload project files"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'client-assets'
  and (storage.foldername(name))[1] = 'project-files'
);
