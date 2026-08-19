-- Agent layer: named workers with a mission, a schedule, and a run history.
--
-- The design rule that shapes everything here: an agent NEVER causes a side
-- effect directly. Every consequence it wants -- create a task, send an email,
-- tick a checklist -- is written as an `agent_actions` row first. Whether that
-- row executes immediately or waits for approval is decided by the agent's
-- `autonomy` setting. That gives one audit trail, one approval surface, and one
-- place to change your mind about how much rope any agent gets.

-- ============================================================ agents
CREATE TABLE public.agents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text NOT NULL UNIQUE,      -- stable id used by the runtime registry
  name          text NOT NULL,
  role          text NOT NULL,             -- one-line "job title", shown in the UI
  description   text,
  enabled       boolean NOT NULL DEFAULT true,

  -- How much rope this agent gets:
  --   propose     -- writes findings + proposed actions; nothing executes itself
  --   act_in_app  -- reversible in-app actions auto-execute; outward-facing ones wait
  --   autonomous  -- everything auto-executes, including outward-facing actions
  autonomy      text NOT NULL DEFAULT 'propose'
                  CHECK (autonomy IN ('propose','act_in_app','autonomous')),

  model         text NOT NULL DEFAULT 'claude-opus-5',
  effort        text NOT NULL DEFAULT 'high'
                  CHECK (effort IN ('low','medium','high','xhigh','max')),
  system_prompt text,                      -- optional override of the registry default

  schedule_cron text,                      -- 5-field cron, UTC. NULL = manual only.
  timezone      text NOT NULL DEFAULT 'UTC',
  -- {"in_app":true,"email":false,"tasks":true,"push":false}
  delivery      jsonb NOT NULL DEFAULT '{"in_app":true}'::jsonb,
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,

  last_run_at   timestamptz,
  next_run_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agents_due ON public.agents (next_run_at)
  WHERE enabled = true AND schedule_cron IS NOT NULL;

-- ============================================================ agent_runs
CREATE TABLE public.agent_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running','succeeded','failed','skipped')),
  trigger       text NOT NULL DEFAULT 'schedule'
                  CHECK (trigger IN ('schedule','manual','event')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,

  headline      text,                      -- one-line verdict for list views
  summary       text,                      -- the readable brief (markdown)
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,   -- structured findings
  error         text,

  -- Same nullable-FK treatment as activity_events, so a run can be scoped to
  -- whatever it was about and joined from either side.
  client_id         uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  venture_id        uuid REFERENCES public.ventures(id) ON DELETE SET NULL,
  venture_launch_id uuid REFERENCES public.venture_launches(id) ON DELETE SET NULL,

  input_tokens      integer,
  output_tokens     integer,
  cache_read_tokens integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_runs_agent ON public.agent_runs (agent_id, started_at DESC);
CREATE INDEX idx_agent_runs_recent ON public.agent_runs (started_at DESC);

-- ============================================================ agent_actions
-- Every side effect an agent wants, as a row. This is the approval surface.
CREATE TABLE public.agent_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  agent_id    uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,

  kind        text NOT NULL,               -- create_task | draft_email | post_note | ...
  -- outward-facing actions reach a real person, so they need approval unless
  -- the agent is fully autonomous
  outward     boolean NOT NULL DEFAULT false,
  title       text NOT NULL,
  description text,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,

  status      text NOT NULL DEFAULT 'proposed'
                CHECK (status IN ('proposed','approved','executed','rejected','failed')),
  executed_at timestamptz,
  result      jsonb,
  error       text,
  decided_by  uuid,                        -- admin_users.user_id who approved/rejected
  decided_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_actions_run ON public.agent_actions (run_id);
CREATE INDEX idx_agent_actions_pending ON public.agent_actions (status, created_at DESC)
  WHERE status = 'proposed';

-- ============================================================ push_subscriptions
-- Web Push endpoints. Payload-less pushes only (see _shared/agents/push.ts for
-- why), so nothing sensitive is ever stored or transmitted here.
CREATE TABLE public.push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  user_agent text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_subscriptions_user ON public.push_subscriptions (user_id);

-- ============================================================ activity_events
ALTER TABLE public.activity_events
  ADD COLUMN agent_id     uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  ADD COLUMN agent_run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL;

-- ============================================================ triggers
CREATE TRIGGER trg_agents_touch BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================ pending approvals view
-- The dashboard badge reads this rather than counting rows client-side.
CREATE VIEW public.agent_pending_actions_v AS
  SELECT
    aa.id, aa.run_id, aa.agent_id, aa.kind, aa.outward,
    aa.title, aa.description, aa.payload, aa.created_at,
    a.name AS agent_name, a.key AS agent_key
  FROM public.agent_actions aa
  JOIN public.agents a ON a.id = aa.agent_id
  WHERE aa.status = 'proposed'
  ORDER BY aa.created_at DESC;
