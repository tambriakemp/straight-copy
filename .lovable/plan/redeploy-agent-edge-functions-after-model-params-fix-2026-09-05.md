# Redeploy agent edge functions after model-params fix

## Goal
Pick up the latest main (already includes PR #53, which adds `model-params.ts` and updates `claude.ts`/`loop.ts`), then redeploy every edge function that bundles the changed `_shared/agents` code so agent runs stop failing with `adaptive thinking is not supported on this model`.

## Current state
- Latest local commit: `b81afba` — "Send each model the thinking parameters it accepts (#53)".
- `git log HEAD..origin/main` is empty; no unpulled commits, so the pull will be a no-op.
- The changed `_shared/agents` module is imported by:
  - `agent-chat`
  - `agent-run`
  - `agents-api`
  - `dispatch-agent-runs`
  - `dispatch-social-schedule`
- `agency-mcp` does not import from `_shared/agents` directly, but will be redeployed as requested since it is safe to do so.

## Steps
1. Pull origin/main to ensure the working tree is current (expected no-op).
2. Redeploy the six functions with no code changes:
   - `agent-chat`
   - `agent-run`
   - `agents-api`
   - `dispatch-agent-runs`
   - `dispatch-social-schedule`
   - `agency-mcp`
3. Verify by creating a task assigned to an agent and promoting it to the coding queue; confirm the agent run returns without a `400 invalid_request_error` about adaptive thinking.

## No database changes
No migrations will be created or run.