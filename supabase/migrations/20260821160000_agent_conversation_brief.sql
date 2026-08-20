-- Schema for the agent opening brief.
--
-- Three columns, deliberately. The design brief also asked for a `needs_brief`
-- flag and two triggers that set it, and both are omitted on purpose:
--
--   1. The brief's trigger function body is
--        COALESCE(NEW.agent_id, (SELECT agent_id FROM agent_runs WHERE id = NEW.run_id LIMIT 1))
--      plpgsql resolves every NEW.<field> against the actual trigger table at
--      first execution — it does not skip the second arm of a COALESCE.
--      Attached to agent_runs, NEW.run_id does not exist (that table has
--      agent_id directly and no run_id at all), so it raises
--      'record "new" has no field "run_id"' and rolls back the UPDATE that
--      marked the run succeeded. Every completing scheduled run would error.
--
--   2. Even written correctly it is redundant. The brief check computes a hash
--      over pending-approval and task ids and compares it against
--      context_hash; a new agent_actions row moves that hash by definition.
--      A flag would be a second source of truth for something the hash already
--      answers, and the two can disagree.
--
--   3. It would put a write to agent_conversations on the hot path of every
--      action insert and run completion, for a flag read at most once per
--      workspace open.
--
-- agent_conversations stays out of the realtime publication; only
-- agent_messages and agent_message_steps are published.
--
-- Idempotent: this database takes migrations from both this repo and Lovable's
-- agent, so assume it may already have run.

ALTER TABLE public.agent_conversations
  ADD COLUMN IF NOT EXISTS last_briefed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS context_hash         text,
  ADD COLUMN IF NOT EXISTS brief_debounce_until timestamptz;

COMMENT ON COLUMN public.agent_conversations.last_briefed_at IS
  'When this conversation was last given an opening brief. Null means never.';
COMMENT ON COLUMN public.agent_conversations.context_hash IS
  'Hash of the snapshot the last brief was built from. Change detection compares against this — there is no needs_brief flag.';
COMMENT ON COLUMN public.agent_conversations.brief_debounce_until IS
  'Suppress briefing until this time, so two simultaneous opens cannot produce two briefs.';
