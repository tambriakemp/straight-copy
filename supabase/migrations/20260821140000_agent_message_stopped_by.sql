-- Why a turn stopped, recorded on the row.
--
-- A blank assistant message saved as `complete` renders as a bubble that
-- neither moves nor explains itself, and twice now that has been read as "the
-- agent timed out". The status alone never said which it was. This column
-- carries the tool loop's stoppedBy value ("end_turn", "iterations", "budget",
-- "max_tokens", "refusal", "error") or, on the single-shot path, the model's
-- own stop_reason — so the next occurrence is diagnosable from the row rather
-- than reconstructed from logs that have since rotated.
--
-- Idempotent: this database takes migrations from both this repo and Lovable's
-- agent, so assume it may already have run.

ALTER TABLE public.agent_messages
  ADD COLUMN IF NOT EXISTS stopped_by text;

COMMENT ON COLUMN public.agent_messages.stopped_by IS
  'Why the turn ended: the tool loop''s stoppedBy, or the model''s stop_reason on the single-shot path. Null on rows written before this column existed.';

-- Finding the turns that ran out of road is the whole point, and they are a
-- small fraction of the table.
CREATE INDEX IF NOT EXISTS agent_messages_stopped_by_idx
  ON public.agent_messages (stopped_by)
  WHERE stopped_by IS NOT NULL;
