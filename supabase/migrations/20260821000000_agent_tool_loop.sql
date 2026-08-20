-- Agents get tools, and the chat shows them being used. Idempotent throughout.

-- ---------------------------------------------------------------------------
-- 1. agent_message_steps — what the agent did, while it is doing it.
--
--    A child table rather than a column on agent_messages. That table is
--    REPLICA IDENTITY FULL so the chat receives the whole row on UPDATE, which
--    is right for a finished reply and fatal for progress: appending step N to
--    a jsonb array would re-broadcast the growing array plus the full message
--    body every time, which is quadratic in exactly the long turns this exists
--    to make visible. An append-only child table is one small INSERT per step.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_message_steps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid NOT NULL REFERENCES public.agent_messages(id) ON DELETE CASCADE,
  seq         integer NOT NULL,
  kind        text NOT NULL,
  tool_name   text,
  label       text NOT NULL,
  status      text NOT NULL DEFAULT 'running',
  detail      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_message_steps_kind_chk
    CHECK (kind IN ('thinking', 'tool', 'action', 'note')),
  CONSTRAINT agent_message_steps_status_chk
    CHECK (status IN ('running', 'ok', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_agent_message_steps_message
  ON public.agent_message_steps (message_id, seq);

ALTER TABLE public.agent_message_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read agent_message_steps" ON public.agent_message_steps;
CREATE POLICY "Admins read agent_message_steps"
  ON public.agent_message_steps FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role manages agent_message_steps" ON public.agent_message_steps;
CREATE POLICY "Service role manages agent_message_steps"
  ON public.agent_message_steps FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'agent_message_steps'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_message_steps;
  END IF;
END $$;

-- Left at REPLICA IDENTITY DEFAULT on purpose: an INSERT payload already
-- carries the whole new row, and these rows are never updated in place.

-- ---------------------------------------------------------------------------
-- 2. What the turn cost, for tuning the budgets.
-- ---------------------------------------------------------------------------
ALTER TABLE public.agent_messages
  ADD COLUMN IF NOT EXISTS tool_calls  integer,
  ADD COLUMN IF NOT EXISTS iterations  integer,
  ADD COLUMN IF NOT EXISTS duration_ms integer;

-- ---------------------------------------------------------------------------
-- 3. Turn the loop on, per agent, so a misbehaving one can be dropped back to
--    the old path from the settings UI without a deploy.
-- ---------------------------------------------------------------------------
UPDATE public.agents
   SET config = COALESCE(config, '{}'::jsonb) || '{"tool_loop": true}'::jsonb
 WHERE NOT (COALESCE(config, '{}'::jsonb) ? 'tool_loop');
