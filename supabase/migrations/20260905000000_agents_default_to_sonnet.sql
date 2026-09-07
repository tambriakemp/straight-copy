-- Cost: the agents table defaulted to claude-opus-5, so every agent created
-- since 20260819040000 has been running the most expensive model on a schedule,
-- inside a tool loop, every time it fires. Six agents doing board grooming --
-- read the queue, comment, move a status, write acceptance criteria -- do not
-- need Opus for it. Opus stays available; it just stops being what you get by
-- accident.
--
-- claude-sonnet-4-5 is already the model used elsewhere in this repo
-- (generate-social-posts, web-dev-discovery-chat), so this is not a new
-- dependency.
--
-- To put an individual agent back on Opus, this is the whole change:
--   update public.agents set model = 'claude-opus-5' where key = 'developer';

alter table public.agents
  alter column model set default 'claude-sonnet-4-5';

-- Only rows still sitting on the old default are touched. An agent someone
-- deliberately moved to another model keeps it.
update public.agents
   set model = 'claude-sonnet-4-5'
 where model = 'claude-opus-5';
