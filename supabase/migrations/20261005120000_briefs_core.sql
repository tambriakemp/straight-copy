-- Briefs tab core schema (CRE-235). Twice-daily briefs land here as the
-- durable home instead of only existing in Grok Bot chat; a synced mirror of
-- open Paperclip approvals/inbox items surfaces what needs Bree right now;
-- and a per-client audit-password manager (shared with CRE-225) plus a
-- dashboard-generated secrets table round it out.
--
-- Written to be re-runnable: this project takes migrations from both this
-- repo and Lovable's own agent, so every statement here must tolerate being
-- applied twice.

create table if not exists public.briefs (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  period text not null check (period in ('morning','evening')),
  title text not null,
  sections jsonb not null,
  source text not null default 'ara',
  delivered_to_chat boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.paperclip_pending_items (
  id text primary key,
  kind text not null check (kind in ('approval','interaction')),
  title text not null,
  issue_identifier text,
  issue_url text,
  raw jsonb,
  synced_at timestamptz not null default now()
);

-- Shared with CRE-225's public /audit/<slug> report page: one row per
-- client, covering both this PR's admin-only password manager and that
-- page's password check (a service-role edge function, never the browser
-- reading this table directly with the anon key).
create table if not exists public.client_audits (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  slug text unique not null,
  password text not null,
  report_url text,
  status text not null default 'pending' check (status in ('pending','ready')),
  password_rotated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Dashboard-managed config and secrets: generated/viewed/rotated from the
-- Briefs tab's Settings card, never a Supabase Function env var and never
-- pasted into Lovable chat. See CRE-235 plan rev2 §3 and the fold-in note on
-- the issue (the Paperclip read key moved in here too, same pattern).
create table if not exists public.app_secrets (
  key text primary key,
  value text not null,
  rotated_at timestamptz not null default now()
);

alter table public.briefs enable row level security;
alter table public.paperclip_pending_items enable row level security;
alter table public.client_audits enable row level security;
alter table public.app_secrets enable row level security;

-- briefs and paperclip_pending_items stay read-only from the browser — they
-- are written only by edge functions on the service-role key, so a
-- compromised admin session can't forge a brief or a pending-item row.

drop policy if exists "admin read briefs" on public.briefs;
create policy "admin read briefs" on public.briefs for select
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

drop policy if exists "admin read paperclip_pending_items" on public.paperclip_pending_items;
create policy "admin read paperclip_pending_items" on public.paperclip_pending_items for select
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

-- client_audits and app_secrets are the two exceptions: Bree rotates a
-- client password and rotates/pastes a secret from the logged-in dashboard
-- itself, so both get full admin read+write.

drop policy if exists "admin read client_audits" on public.client_audits;
create policy "admin read client_audits" on public.client_audits for select
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));
drop policy if exists "admin write client_audits" on public.client_audits;
create policy "admin write client_audits" on public.client_audits for all
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

drop policy if exists "admin read app_secrets" on public.app_secrets;
create policy "admin read app_secrets" on public.app_secrets for select
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));
drop policy if exists "admin write app_secrets" on public.app_secrets;
create policy "admin write app_secrets" on public.app_secrets for all
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

-- Seed whichever clients already have (or are getting) an audit, so the
-- panel isn't empty on day one. Idempotent on slug; the seeded password is a
-- readable placeholder Bree is expected to rotate from the panel, not a real
-- credential.
insert into public.client_audits (client_name, slug, password, status)
values ('Menovia', 'menovia', 'placeholder-rotate-me', 'pending')
on conflict (slug) do nothing;
