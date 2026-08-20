-- Talking to an agent directly.
--
-- Runs are the agent working on its own schedule. This is the other half: you
-- asking it something, or handing it a job now. Both end up in the same place --
-- a chat that wants a side effect proposes an agent_action exactly as a run
-- does, so there is still one approval surface and one audit trail.
--
-- Written idempotently: this database has taken migrations from two sources
-- (here and Lovable), so nothing may assume it is running exactly once, and
-- either side may have created these tables first.

CREATE TABLE IF NOT EXISTS public.agent_conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  title      text,                    -- derived from the opening message
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_conversations_agent
  ON public.agent_conversations (agent_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user','assistant')),
  content         text NOT NULL,
  -- Set when a turn produced proposals, so the transcript can link to them.
  run_id          uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  action_ids      uuid[] NOT NULL DEFAULT '{}',
  input_tokens      integer,
  output_tokens     integer,
  cache_read_tokens integer,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_conversation
  ON public.agent_messages (conversation_id, created_at);

ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage agent_conversations" ON public.agent_conversations;
CREATE POLICY "Admins manage agent_conversations" ON public.agent_conversations
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage agent_messages" ON public.agent_messages;
CREATE POLICY "Admins manage agent_messages" ON public.agent_messages
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_agent_conversations_touch ON public.agent_conversations;
CREATE TRIGGER trg_agent_conversations_touch BEFORE UPDATE ON public.agent_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- A chat turn is a run too, so the activity panel and cost accounting stay in
-- one place rather than splitting across two concepts.
ALTER TABLE public.agent_runs
  DROP CONSTRAINT IF EXISTS agent_runs_trigger_check;
ALTER TABLE public.agent_runs
  ADD CONSTRAINT agent_runs_trigger_check
  CHECK (trigger IN ('schedule','manual','event','chat'));

ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.agent_conversations(id) ON DELETE SET NULL;

-- ============================================================ convergence
-- Lovable created these same two tables out of band (20260820024940) with a
-- narrower shape. CREATE TABLE IF NOT EXISTS above therefore skips silently on
-- this database, which would leave the columns agent-chat writes missing and
-- every insert failing at runtime. Add them explicitly so the schema ends up
-- the same whichever migration got there first.
ALTER TABLE public.agent_conversations
  ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE public.agent_messages
  ADD COLUMN IF NOT EXISTS input_tokens      integer,
  ADD COLUMN IF NOT EXISTS output_tokens     integer,
  ADD COLUMN IF NOT EXISTS cache_read_tokens integer,
  ADD COLUMN IF NOT EXISTS run_id            uuid,
  ADD COLUMN IF NOT EXISTS action_ids        uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS error             text;

-- Lovable's version left role unconstrained; only two values are ever valid.
DO $$
BEGIN
  ALTER TABLE public.agent_messages
    ADD CONSTRAINT agent_messages_role_check CHECK (role IN ('user','assistant'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
