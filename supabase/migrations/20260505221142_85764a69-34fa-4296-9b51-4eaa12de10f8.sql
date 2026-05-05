
-- Preview sandbox tables
create table public.preview_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_label text,
  slug text not null unique,
  storage_prefix text not null,
  entry_path text not null default 'index.html',
  is_multi_page boolean not null default false,
  feedback_enabled boolean not null default true,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.preview_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.preview_projects(id) on delete cascade,
  path text not null,
  content_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  unique (project_id, path)
);

create table public.preview_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.preview_projects(id) on delete cascade,
  page_path text not null default 'index.html',
  selector text not null,
  x_pct numeric not null default 50,
  y_pct numeric not null default 50,
  viewport_width int,
  author_name text,
  body text not null,
  status text not null default 'open',
  pin_number int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index preview_comments_project_idx on public.preview_comments(project_id, page_path);

create table public.preview_comment_replies (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.preview_comments(id) on delete cascade,
  author_name text,
  body text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.preview_projects enable row level security;
alter table public.preview_files enable row level security;
alter table public.preview_comments enable row level security;
alter table public.preview_comment_replies enable row level security;

create policy "Admins manage preview_projects" on public.preview_projects
  for all to authenticated using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
create policy "Service role manages preview_projects" on public.preview_projects
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy "Admins manage preview_files" on public.preview_files
  for all to authenticated using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
create policy "Service role manages preview_files" on public.preview_files
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy "Admins manage preview_comments" on public.preview_comments
  for all to authenticated using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
create policy "Service role manages preview_comments" on public.preview_comments
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy "Admins manage preview_comment_replies" on public.preview_comment_replies
  for all to authenticated using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
create policy "Service role manages preview_comment_replies" on public.preview_comment_replies
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- updated_at triggers
create trigger preview_projects_updated_at before update on public.preview_projects
  for each row execute function public.update_updated_at_column();
create trigger preview_comments_updated_at before update on public.preview_comments
  for each row execute function public.update_updated_at_column();

-- Pin number sequence per project
create or replace function public.next_preview_pin(_project_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select coalesce(max(pin_number), 0) + 1 into n
    from public.preview_comments where project_id = _project_id;
  return n;
end; $$;

-- Storage bucket
insert into storage.buckets (id, name, public) values ('preview-sites', 'preview-sites', false)
  on conflict (id) do nothing;

create policy "Admins read preview-sites" on storage.objects
  for select to authenticated using (bucket_id = 'preview-sites' and is_admin(auth.uid()));
create policy "Admins write preview-sites" on storage.objects
  for insert to authenticated with check (bucket_id = 'preview-sites' and is_admin(auth.uid()));
create policy "Admins update preview-sites" on storage.objects
  for update to authenticated using (bucket_id = 'preview-sites' and is_admin(auth.uid()));
create policy "Admins delete preview-sites" on storage.objects
  for delete to authenticated using (bucket_id = 'preview-sites' and is_admin(auth.uid()));
