-- CRE-803: CP-6 cutover. After the CP-6 import, Paperclip and /admin would
-- both hold clients, projects, proposals and money, and
-- fire_sync_paperclip_project_tasks pushing /admin task counts into Paperclip
-- on an hourly cron becomes a second writer over the Paperclip side of that
-- data. Paperclip is the source of truth as of Bree's decision on 27 October
-- 2026, so the push stops.
--
-- The function stays in place; only the schedule is removed, so this is
-- reversible. To put it back:
--   SELECT cron.schedule(
--     'sync-paperclip-project-tasks',
--     '7 * * * *',
--     $$SELECT public.fire_sync_paperclip_project_tasks();$$
--   );
--
-- Guarded the same way 20261011190000 guards its schedule call: this
-- database takes migrations from two sources, so unscheduling a job that is
-- already gone must not fail the migration.

DO $$
BEGIN
  PERFORM cron.unschedule('sync-paperclip-project-tasks');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
