-- Feedback rounds on a prospect approval (CRE-303 follow-up, Bree 11:01 AM CT
-- Oct 6): a prospect can go through several rebuild cycles, so one editable
-- notes field can't hold the history. Each Submit in the side panel's
-- composer becomes a new, read-only round here instead of overwriting the
-- last one.
--
-- Tied to prospect_key (the slug with any trailing -vN stripped), not to a
-- single prospect_approvals row, so a rebuild that lands as a new row
-- (acme-roofing-v2) still shows the rounds Bree left on acme-roofing (v1).
-- approval_id records which row the round was written from, for traceability,
-- but prospect_key is what every read and the round-numbering query use.
--
-- Written to be re-runnable: this project takes migrations from both this
-- repo and Lovable's own agent, so every statement here must tolerate being
-- applied twice.

create table if not exists public.prospect_approval_feedback (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null references public.prospect_approvals(id) on delete cascade,
  prospect_key text not null,
  round integer not null,
  preview_version text not null,
  notes text,
  created_at timestamptz not null default now(),
  created_by text,
  unique (prospect_key, round)
);

create index if not exists prospect_approval_feedback_prospect_key_idx
  on public.prospect_approval_feedback (prospect_key);
create index if not exists prospect_approval_feedback_approval_idx
  on public.prospect_approval_feedback (approval_id);

alter table public.prospect_approval_feedback enable row level security;

drop policy if exists "admin read prospect_approval_feedback" on public.prospect_approval_feedback;
create policy "admin read prospect_approval_feedback" on public.prospect_approval_feedback for select
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

drop policy if exists "admin write prospect_approval_feedback" on public.prospect_approval_feedback;
create policy "admin write prospect_approval_feedback" on public.prospect_approval_feedback for all
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

drop policy if exists "service role prospect_approval_feedback" on public.prospect_approval_feedback;
create policy "service role prospect_approval_feedback" on public.prospect_approval_feedback for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Attachments now belong to a feedback round (CRE-303 follow-up). Kept
-- nullable: prospect_id alone still identifies a file for any attachment
-- saved before this column existed.
alter table public.prospect_approval_attachments
  add column if not exists feedback_id uuid references public.prospect_approval_feedback(id) on delete cascade;

create index if not exists prospect_approval_attachments_feedback_idx
  on public.prospect_approval_attachments (feedback_id);