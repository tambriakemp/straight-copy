-- Brief / Needs-you-now checkboxes (CRE-335). Bree checks an item off on
-- the Today page or /admin/briefs instead of telling Ara in chat.
--
-- Read-only from the browser, same shape as briefs/paperclip_pending_items
-- in 20261005120000_briefs_core.sql: the complete-brief-item edge function
-- (service role) is the only writer, because checking an item also fires
-- the Ara webhook and, for an item tied to a Paperclip issue, posts a
-- comment there -- a bare table write from the browser would skip both.
--
-- item_id is the stable id proposed on CRE-335: the bare Paperclip
-- identifier (e.g. "CRE-335") when the item names one, the existing
-- composite id already used by the Needs-you-now list
-- (src/lib/needsYouNow.ts -- "invoice-<id>", "draft-<id>", etc.) for
-- data-driven items, or a brief-scoped "<brief_id>:<section>:<item>" key
-- for a morning/evening brief line that has neither (see the CRE-335 task
-- comment for the full contract, including what the brief-ingest routine
-- should send so a real cross-brief-stable id replaces that fallback).
--
-- Written to be re-runnable: this project takes migrations from both this
-- repo and Lovable's own agent, so every statement here must tolerate
-- being applied twice.

create table if not exists public.brief_item_completions (
  item_id text primary key,
  item_text text not null,
  issue_identifier text,
  brief_date date,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz not null default now(),
  note text
);

create index if not exists brief_item_completions_issue_idx
  on public.brief_item_completions (issue_identifier);

alter table public.brief_item_completions enable row level security;

drop policy if exists "admin read brief_item_completions" on public.brief_item_completions;
create policy "admin read brief_item_completions" on public.brief_item_completions for select
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));
