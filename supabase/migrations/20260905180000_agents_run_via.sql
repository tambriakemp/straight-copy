-- Let an individual agent run in GitHub Actions instead of an edge function.
--
-- Why: an edge function can only reach Anthropic over HTTPS with an API key,
-- so every in-app agent run is billed to API credits. The only way to bill a
-- run to a Claude subscription is to authenticate as Claude Code, which is a
-- binary and needs a machine. GitHub Actions is that machine, and the coding
-- queue already proves the route.
--
-- This column only says WHERE an agent runs:
--   'edge'            (default) dispatch-agent-runs invokes agent-run, as today.
--   'github_actions'  dispatch-agent-runs posts a repository_dispatch instead,
--                     and agent-worker.yml runs the agent with Claude Code on
--                     the subscription OAuth token.
--
-- Nothing changes until an agent is deliberately switched, and the switch is
-- one statement in either direction:
--   update public.agents set run_via = 'github_actions' where key = 'developer';
--   update public.agents set run_via = 'edge'           where key = 'developer';
--
-- The dispatch also needs two secrets on the dispatch-agent-runs function,
-- AGENT_DISPATCH_REPO and AGENT_DISPATCH_TOKEN. Without them an agent marked
-- github_actions is left on the edge path rather than silently skipped, so a
-- half-finished setup degrades to the behaviour it had before instead of
-- stopping the agent.
--
-- Idempotent: safe to re-apply.

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS run_via text NOT NULL DEFAULT 'edge';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'agents_run_via_check'
       AND conrelid = 'public.agents'::regclass
  ) THEN
    ALTER TABLE public.agents
      ADD CONSTRAINT agents_run_via_check
      CHECK (run_via IN ('edge', 'github_actions'));
  END IF;
END $$;

COMMENT ON COLUMN public.agents.run_via IS
  'edge: agent-run inside Supabase, billed to Anthropic API credits. '
  'github_actions: repository_dispatch to agent-worker.yml, billed to the Claude subscription.';
