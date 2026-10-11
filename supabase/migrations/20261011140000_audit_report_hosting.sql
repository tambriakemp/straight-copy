-- CRE-225: public /audit/<slug> report hosting. Builds on client_audits
-- (from 20261005120000_briefs_core.sql / CRE-235), which already holds each
-- client's slug, password and a report_url column that migration's own
-- comment flagged as "shared with CRE-225's public page". This migration
-- adds the append-only version history behind that pointer and the two
-- small tables audit-serve needs to rate-limit password attempts and track
-- issued viewing sessions.
--
-- Written to be re-runnable: this project takes migrations from both this
-- repo and Lovable's own agent, so every statement here must tolerate being
-- applied twice.

create table if not exists public.audit_report_versions (
  id uuid primary key default gen_random_uuid(),
  client_audit_id uuid not null references public.client_audits(id) on delete cascade,
  storage_path text not null,
  audited_at timestamptz not null,
  created_at timestamptz not null default now()
);
comment on table public.audit_report_versions is 'One row per published audit report, never overwritten -- audit-upload inserts a new row on every re-audit; audit-serve always reads the most recent one for a slug.';

-- Rate limiting for audit-serve's password check: 5 attempts per (slug, ip)
-- per 15 minutes. An append-only log, counted in the function rather than a
-- stateful counter, so there is nothing to reset or get out of sync.
create table if not exists public.audit_login_attempts (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  ip text not null,
  created_at timestamptz not null default now()
);
comment on table public.audit_login_attempts is 'Append-only log of audit-serve password attempts, read by audit-serve itself to rate-limit (5 per slug+ip per 15 min). No client-facing use.';

-- Short-lived viewing session issued by audit-serve after a correct
-- password, so AuditReport.tsx can re-fetch the report without re-prompting
-- for a few hours. A table instead of a signed token so a row can simply be
-- looked up (and, later, revoked) rather than needing a new signing secret.
create table if not exists public.audit_sessions (
  token uuid primary key default gen_random_uuid(),
  slug text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
comment on table public.audit_sessions is 'Short-lived (6h) tokens issued by audit-serve after a correct password; audit-serve looks one up on every report GET instead of verifying a signature.';

alter table public.audit_report_versions enable row level security;
alter table public.audit_login_attempts enable row level security;
alter table public.audit_sessions enable row level security;

-- Version history is admin-viewable (the /admin/audits page can grow a
-- history view per CRE-225's plan) but never written from the browser --
-- only audit-upload, on the service-role key, inserts a version, and the
-- service role bypasses RLS entirely.
drop policy if exists "admin read audit_report_versions" on public.audit_report_versions;
create policy "admin read audit_report_versions" on public.audit_report_versions for select
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

-- audit_login_attempts and audit_sessions carry no admin-facing use yet
-- (just IPs and opaque tokens) and are both read+written only by
-- audit-serve on the service-role key -- so neither gets a policy at all,
-- deny-all for anon/authenticated.

-- Storage for the actual report HTML. A dedicated bucket, separate from
-- preview-sites, so audit cleanup/sizing is independent of client previews.
insert into storage.buckets (id, name, public)
values ('audit-reports', 'audit-reports', false)
on conflict (id) do nothing;
