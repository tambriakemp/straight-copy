-- External-URL preview support
alter table public.preview_projects
  add column if not exists source_type text not null default 'upload',
  add column if not exists external_base_url text,
  add column if not exists last_crawled_at timestamptz;

alter table public.preview_projects drop constraint if exists preview_projects_source_type_check;
alter table public.preview_projects
  add constraint preview_projects_source_type_check
  check (source_type in ('upload','external_url'));

create table if not exists public.preview_external_pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.preview_projects(id) on delete cascade,
  path text not null,
  label text,
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, path)
);
alter table public.preview_external_pages enable row level security;
create policy "Admins manage preview_external_pages" on public.preview_external_pages
  for all to authenticated using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
create policy "Service role manages preview_external_pages" on public.preview_external_pages
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create table if not exists public.preview_page_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.preview_projects(id) on delete cascade,
  path text not null,
  author_name text,
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.preview_page_comments enable row level security;
create policy "Admins manage preview_page_comments" on public.preview_page_comments
  for all to authenticated using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
create policy "Service role manages preview_page_comments" on public.preview_page_comments
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create index if not exists preview_page_comments_proj_path_idx
  on public.preview_page_comments (project_id, path, created_at desc);
create index if not exists preview_external_pages_proj_order_idx
  on public.preview_external_pages (project_id, order_index);