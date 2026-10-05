-- Prospect approvals: the weekly outreach batch Bree reviews before the
-- Monday send (CRE-244). Replaces the standalone /var/www/approvals Python
-- server on the Paperclip VPS (basic-auth, root-owned data.json, no create
-- path — see CRE-91/CRE-100 history) with a table Nicole can push into and
-- Bree can decide on directly in the admin dashboard, behind her existing
-- admin login.
--
-- Written to be re-runnable: this project takes migrations from both this
-- repo and Lovable's own agent, so every statement here must tolerate being
-- applied twice.

create table if not exists public.prospect_approvals (
  id uuid primary key default gen_random_uuid(),
  batch text not null,
  slug text not null,
  company text not null,
  city text,
  trade text,
  contact_name text,
  contact_email text,
  hook text,
  preview_url text,
  preview_image_url text,
  email_subject text,
  email_body text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  notes text,
  decided_at timestamptz,
  decided_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch, slug)
);

create index if not exists prospect_approvals_status_idx on public.prospect_approvals (status);
create index if not exists prospect_approvals_batch_idx on public.prospect_approvals (batch);

alter table public.prospect_approvals enable row level security;

-- Unlike briefs/paperclip_pending_items (edge-function-write-only, admin
-- read-only), Bree decides directly from the browser here — approve, reject,
-- bulk-approve, notes — so this table needs full admin read+write, the same
-- shape as client_audits and app_secrets.
drop policy if exists "admin read prospect_approvals" on public.prospect_approvals;
create policy "admin read prospect_approvals" on public.prospect_approvals for select
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

drop policy if exists "admin write prospect_approvals" on public.prospect_approvals;
create policy "admin write prospect_approvals" on public.prospect_approvals for all
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));
