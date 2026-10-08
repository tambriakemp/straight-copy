-- Weekly calendar card on the brief (CRE-358). `calendar_events` is a
-- nullable sibling to `sections` on the existing `briefs` table — a brief
-- that doesn't send it keeps rendering the old markdown "Calendar" section
-- (see Today.tsx). Shape: an array of
-- { id, title, type: rental|business|live|home, start_date, end_date?,
--   start_time?, end_time?, time_label?, status: confirmed|canceled|tentative,
--   note? }, dates/times in America/Chicago. Validated loosely by
-- post-brief; stored as-is, same pattern as `sections`.
--
-- Written to be re-runnable: this project takes migrations from both this
-- repo and Lovable's own agent, so every statement here must tolerate
-- being applied twice.

alter table public.briefs add column if not exists calendar_events jsonb;
