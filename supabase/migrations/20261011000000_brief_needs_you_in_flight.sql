-- Today page re-layout (CRE-388): the brief's own markdown "Needs You"
-- section is scratched in favor of structured rows that merge into the
-- live "Needs you now" panel, and a new "In flight / stuck" card gets the
-- same structured treatment. Two nullable jsonb siblings to `sections`,
-- same optional/fallback pattern as calendar_events (CRE-358) and
-- money_stats/pipeline/done_items/approvals (CRE-366) — a brief that
-- doesn't send a field keeps rendering the old markdown section for it.
--
-- Written to be re-runnable: this project takes migrations from both this
-- repo and Lovable's own agent, so every statement here must tolerate
-- being applied twice.

alter table public.briefs add column if not exists needs_you jsonb;
alter table public.briefs add column if not exists in_flight jsonb;
