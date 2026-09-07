import { describe, expect, it } from "vitest";
import {
  dispatchAccepted,
  dispatchRequest,
  externalDispatchConfig,
  runsExternally,
  type DispatchableAgent,
} from "../../supabase/functions/_shared/agents/dispatch-target.ts";

const env = (bag: Record<string, string | undefined>) => ({
  get: (name: string) => bag[name],
});

const agent = (over: Partial<DispatchableAgent> = {}): DispatchableAgent => ({
  id: "11111111-1111-4111-8111-111111111111",
  key: "developer",
  run_via: "github_actions",
  ...over,
});

describe("externalDispatchConfig", () => {
  it("reads the pair when both halves are set", () => {
    const cfg = externalDispatchConfig(env({
      AGENT_DISPATCH_REPO: "tambriakemp/straight-copy",
      AGENT_DISPATCH_TOKEN: "ghp_example",
    }));
    expect(cfg).toEqual({ repo: "tambriakemp/straight-copy", token: "ghp_example" });
  });

  it("is null when either half is missing, so agents fall back to the edge path", () => {
    expect(externalDispatchConfig(env({ AGENT_DISPATCH_REPO: "a/b" }))).toBeNull();
    expect(externalDispatchConfig(env({ AGENT_DISPATCH_TOKEN: "t" }))).toBeNull();
    expect(externalDispatchConfig(env({}))).toBeNull();
  });

  it("treats whitespace-only secrets as missing", () => {
    expect(externalDispatchConfig(env({
      AGENT_DISPATCH_REPO: "   ",
      AGENT_DISPATCH_TOKEN: "ghp_example",
    }))).toBeNull();
  });

  it("trims, because a secret pasted with a trailing newline is the common case", () => {
    expect(externalDispatchConfig(env({
      AGENT_DISPATCH_REPO: "owner/repo\n",
      AGENT_DISPATCH_TOKEN: " ghp_example ",
    }))).toEqual({ repo: "owner/repo", token: "ghp_example" });
  });
});

describe("runsExternally", () => {
  it("is true only for github_actions", () => {
    expect(runsExternally(agent({ run_via: "github_actions" }))).toBe(true);
    expect(runsExternally(agent({ run_via: "edge" }))).toBe(false);
  });

  it("reads a missing or unknown value as edge, never as broken", () => {
    expect(runsExternally(agent({ run_via: null }))).toBe(false);
    expect(runsExternally(agent({ run_via: undefined }))).toBe(false);
    expect(runsExternally(agent({ run_via: "GitHub_Actions" }))).toBe(false);
    expect(runsExternally(agent({ run_via: "actions" }))).toBe(false);
  });
});

describe("dispatchRequest", () => {
  const cfg = { repo: "tambriakemp/straight-copy", token: "ghp_example" };

  it("posts to the repository dispatches endpoint", () => {
    const req = dispatchRequest({ config: cfg, agent: agent(), reason: "Scheduled run." });
    expect(req.url).toBe("https://api.github.com/repos/tambriakemp/straight-copy/dispatches");
  });

  it("sends the headers GitHub requires", () => {
    const req = dispatchRequest({ config: cfg, agent: agent(), reason: "Scheduled run." });
    expect(req.headers.Authorization).toBe("Bearer ghp_example");
    expect(req.headers.Accept).toBe("application/vnd.github+json");
    // GitHub rejects a dispatch with no User-Agent outright.
    expect(req.headers["User-Agent"]).toBeTruthy();
    expect(req.headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });

  it("names the agent and the reason, and nothing about the work itself", () => {
    const req = dispatchRequest({
      config: cfg,
      agent: agent({ key: "client-triage" }),
      reason: "Scheduled run for client-triage (0 * * * *).",
    });
    const body = JSON.parse(req.body);
    expect(body.event_type).toBe("agent_run_ready");
    expect(body.client_payload.agent_key).toBe("client-triage");
    expect(body.client_payload.agent_id).toBe(agent().id);
    expect(body.client_payload.reason).toContain("client-triage");
    // The worker reads the mission from the repo and the board. If the payload
    // carried the work, the dispatch and the worker could disagree about it.
    expect(Object.keys(body.client_payload).sort()).toEqual(["agent_id", "agent_key", "reason"]);
  });

  it("keeps the token out of the body", () => {
    const req = dispatchRequest({ config: cfg, agent: agent(), reason: "Scheduled run." });
    expect(req.body).not.toContain("ghp_example");
  });
});

describe("dispatchAccepted", () => {
  it("accepts only 204, the documented empty success", () => {
    expect(dispatchAccepted(204)).toBe(true);
    expect(dispatchAccepted(200)).toBe(false);
    expect(dispatchAccepted(401)).toBe(false);
    expect(dispatchAccepted(404)).toBe(false);
    expect(dispatchAccepted(422)).toBe(false);
  });
});
