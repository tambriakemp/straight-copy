-- A reason when a page is sent back.
--
-- preview_approval_events already records approve/unapprove per page, but
-- with no room for why. "Not approved" on its own is the least useful
-- thing a client can say — it means someone has to go and ask, which is
-- the round trip the feedback board exists to remove.
--
-- Nullable, because an approval needs no reason. Only a rejection does.
--
-- Idempotent: this database takes migrations from this repo and from
-- Lovable's agent, so assume it may already have been applied.

alter table public.preview_approval_events
  add column if not exists note text;

comment on column public.preview_approval_events.note is
  'Why a page was sent back. Set on changes_requested; null on approve.';

-- `action` is free text already ('approve' / 'unapprove'); the board adds
-- 'changes_requested', which is an unapprove that came with a reason.
