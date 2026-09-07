// Where does this agent run: in the edge function, or in GitHub Actions?
//
// Pulled out of dispatch-agent-runs so the decision and the request shape are
// testable without a Deno runtime, a database or a network. The dispatcher
// itself is then only plumbing.

/** The part of an agents row this module cares about. */
export type DispatchableAgent = {
  id: string;
  key: string;
  run_via?: string | null;
};

/** Env pair that has to be present for an external run to be possible. */
export type ExternalDispatchConfig = {
  /** owner/repo holding agent-worker.yml on its default branch. */
  repo: string;
  /** GitHub token with repo scope on that repository. */
  token: string;
};

/**
 * Read the external dispatch config out of an env bag.
 *
 * Returns null when either half is missing. Deliberately not an error: an agent
 * flagged github_actions with no secrets configured falls back to the edge path,
 * which is the behaviour it had before the flag existed. A half-configured
 * setup should degrade, not stop the agent.
 */
export function externalDispatchConfig(
  env: { get(name: string): string | undefined },
): ExternalDispatchConfig | null {
  const repo = env.get("AGENT_DISPATCH_REPO")?.trim();
  const token = env.get("AGENT_DISPATCH_TOKEN")?.trim();
  if (!repo || !token) return null;
  return { repo, token };
}

/**
 * True when this agent should be run by the Actions worker.
 *
 * Unknown values read as 'edge'. A typo in run_via must not stop an agent from
 * running at all, and the CHECK constraint on the column is the thing that
 * keeps typos out in the first place.
 */
export function runsExternally(agent: DispatchableAgent): boolean {
  return agent.run_via === "github_actions";
}

export type DispatchRequest = {
  url: string;
  headers: Record<string, string>;
  body: string;
};

/**
 * Build the repository_dispatch call that wakes the agent worker.
 *
 * The payload is a wake-up call, not a work order. It names the agent to run and
 * why, and the worker reads everything else — mission, prompt, tools — from the
 * repository and the board. Passing the work itself would let this dispatch and
 * the worker's own view of the board disagree.
 */
export function dispatchRequest(args: {
  config: ExternalDispatchConfig;
  agent: DispatchableAgent;
  reason: string;
}): DispatchRequest {
  const { config, agent, reason } = args;
  return {
    url: `https://api.github.com/repos/${config.repo}/dispatches`,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/vnd.github+json",
      // GitHub rejects a request with no User-Agent outright.
      "User-Agent": "straight-copy-agents",
      "Authorization": `Bearer ${config.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      event_type: "agent_run_ready",
      client_payload: {
        agent_key: agent.key,
        agent_id: agent.id,
        reason,
      },
    }),
  };
}

/**
 * GitHub answers 204 with an empty body whether or not a workflow is listening,
 * and only ever matches a workflow on the default branch. So a 204 means "the
 * event was accepted", never "the agent ran" — which is exactly why the
 * dispatcher records the status it got rather than declaring success.
 */
export function dispatchAccepted(status: number): boolean {
  return status === 204;
}
