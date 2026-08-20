-- Agent replies survive leaving the page.
--
-- Before this, the whole model call happened inside the HTTP request and the
-- "Thinking…" indicator was React state. Navigate away, refresh, or lose the
-- connection and the answer was gone — and because the assistant row was only
-- written after the call returned, a request that timed out or truncated left
-- nothing at all, or an empty bubble.
--
-- The row is now created up front as 'pending' and filled in afterwards, so the
-- conversation itself is the progress indicator.

ALTER TABLE public.agent_messages
  ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'complete',
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_messages_status_chk'
  ) THEN
    ALTER TABLE public.agent_messages
      ADD CONSTRAINT agent_messages_status_chk
      CHECK (status IN ('pending', 'complete', 'failed'));
  END IF;
END $$;

-- Finding what is still in flight has to be cheap: the chat polls it as a
-- backstop whenever realtime has not delivered.
CREATE INDEX IF NOT EXISTS idx_agent_messages_pending
  ON public.agent_messages (conversation_id, created_at)
  WHERE status = 'pending';

COMMENT ON COLUMN public.agent_messages.status IS
  'pending while the model is still working, complete once written, failed if the turn errored or was truncated.';

-- Clean up what the old code left behind: assistant messages with no content
-- were truncated or timed-out turns, and they render as an empty bubble that
-- looks like the agent is stuck.
UPDATE public.agent_messages
   SET status = 'failed',
       error = COALESCE(error, 'The reply was cut off before it was saved. Send the message again.')
 WHERE role = 'assistant'
   AND status = 'complete'
   AND COALESCE(btrim(content), '') = '';

-- Realtime, so a finished reply appears without the page asking for it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'agent_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_messages;
  END IF;
END $$;

-- REPLICA IDENTITY FULL so an UPDATE carries the whole row, not just the key —
-- the chat needs the content that arrived, not a notification that it did.
ALTER TABLE public.agent_messages REPLICA IDENTITY FULL;
