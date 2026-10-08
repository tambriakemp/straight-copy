-- Attachments on a prospect-approval decision (CRE-303 follow-up): lets Bree
-- drop screenshots of problem areas on a reject (or an optional approve note)
-- so whoever rebuilds the page can see exactly what she means.
--
-- One row per file, linked to the prospect. There is no separate decisions
-- table — prospect_approvals.notes/status/decided_at already get overwritten
-- on each new decision for a prospect, so an attachment "belongs to the
-- decision" the same way notes do: by belonging to the prospect row at the
-- time it was saved.
--
-- Written to be re-runnable: this project takes migrations from both this
-- repo and Lovable's own agent, so every statement here must tolerate being
-- applied twice.

create table if not exists public.prospect_approval_attachments (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospect_approvals(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists prospect_approval_attachments_prospect_idx
  on public.prospect_approval_attachments (prospect_id);

alter table public.prospect_approval_attachments enable row level security;

-- Same shape as prospect_approvals itself: Bree attaches directly from the
-- browser, so this needs full admin read+write, plus service-role for the
-- prospect-approvals-sync edge function's signed-url read-back.
drop policy if exists "admin read prospect_approval_attachments" on public.prospect_approval_attachments;
create policy "admin read prospect_approval_attachments" on public.prospect_approval_attachments for select
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

drop policy if exists "admin write prospect_approval_attachments" on public.prospect_approval_attachments;
create policy "admin write prospect_approval_attachments" on public.prospect_approval_attachments for all
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

drop policy if exists "service role prospect_approval_attachments" on public.prospect_approval_attachments;
create policy "service role prospect_approval_attachments" on public.prospect_approval_attachments for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Private bucket — never publicly readable. Reads only ever happen through a
-- short-lived signed URL (the admin browser session, or
-- prospect-approvals-sync's service-role read-back for Nicole).
-- (Bucket row already exists; creation handled via the storage API.)

drop policy if exists "Admins read prospect-approval-attachments" on storage.objects;
create policy "Admins read prospect-approval-attachments" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'prospect-approval-attachments'
    and exists (select 1 from public.admin_users au where au.user_id = auth.uid())
  );

drop policy if exists "Admins insert prospect-approval-attachments" on storage.objects;
create policy "Admins insert prospect-approval-attachments" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'prospect-approval-attachments'
    and exists (select 1 from public.admin_users au where au.user_id = auth.uid())
  );

drop policy if exists "Admins delete prospect-approval-attachments" on storage.objects;
create policy "Admins delete prospect-approval-attachments" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'prospect-approval-attachments'
    and exists (select 1 from public.admin_users au where au.user_id = auth.uid())
  );