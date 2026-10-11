-- The Clients list distinguishes our own books from a client's: the canvas
-- gives Cre8 Visions an "Internal" pill and an ink avatar rather than the
-- green "Active" every real client gets.
--
-- A column rather than a name match in the UI. Matching "Cre8 Visions" on
-- every render is the same failure mode as writing an agent's name into a
-- string: it keeps rendering perfectly after a rename and nothing tells you
-- it stopped being true. This runs the match once, and from then on the row
-- is the record.
--
-- Idempotent: this database takes migrations from this repo and from
-- Lovable's agent, so assume it may already have been applied.

alter table public.clients
  add column if not exists internal boolean not null default false;

comment on column public.clients.internal is
  'Our own books rather than a client''s. Drives the Internal pill and the ink avatar on /admin/clients.';

-- Seed today''s truth once. `where not internal` so re-running cannot undo a
-- hand correction, and so this is a no-op on every run after the first.
update public.clients
   set internal = true
 where internal = false
   and business_name ilike 'cre8 visions%';
