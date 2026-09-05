// What the developer agent can see, and what it can do about it.
//
// This agent is the only one whose actions start something expensive: moving a
// task into ready_for_claude fires trg_fire_queue_on_ready, which spends a
// coding session. Three things have to hold or the whole loop is decorative —
// it must see the work that is a candidate for the queue, it must be told which
// boards the queue can actually run, and a scheduled run must stamp itself so
// it does not fire again fifteen minutes later.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  projectQueueReady, willBePickedUp,
} from "../../supabase/functions/_shared/agents/task-fields";

// context.ts itself cannot be imported here — it reaches an `npm:` specifier
// that the app's tsconfig cannot resolve, the constraint CLAUDE.md records. So
// the judgement it encodes lives in pure helpers that are tested directly, and
// the wiring is checked against the source.
const CONTEXT = readFileSync(
  join(__dirname, "../../supabase/functions/_shared/agents/context.ts"),
  "utf8",
);

describe("what the queue can actually run", () => {
  it("calls a project ready only when the trigger would fire for it", () => {
    // Exactly the two conditions trg_fire_queue_on_ready checks. Promoting a
    // task on a board that fails either one logs not_queue_work and nothing
    // runs, so the agent has to be able to see it before it moves anything.
    expect(projectQueueReady({ queue_enabled: true, repo_url: "https://github.com/x/y" })).toBe(true);
    expect(projectQueueReady({ queue_enabled: false, repo_url: "https://github.com/x/y" })).toBe(false);
    expect(projectQueueReady({ queue_enabled: true, repo_url: "" })).toBe(false);
    expect(projectQueueReady({ queue_enabled: true, repo_url: "   " })).toBe(false);
    expect(projectQueueReady({ queue_enabled: true, repo_url: null })).toBe(false);
    expect(projectQueueReady({})).toBe(false);
  });

  it("only counts a task as collectable when it is Claude's and unclaimed", () => {
    // A task in ready_for_claude assigned to the agency looks queued and is
    // not — the failure this repo already has queue_fire_log rows for.
    expect(willBePickedUp({ assignee_kind: "claude", claimed_by: null })).toBe(true);
    expect(willBePickedUp({ assignee_kind: "agency", claimed_by: null })).toBe(false);
    expect(willBePickedUp({ assignee_kind: "claude", claimed_by: "run-7" })).toBe(false);
    expect(willBePickedUp({})).toBe(false);
  });
});

describe("developer context wiring", () => {
  it("reads the backlog, so there is something to promote", () => {
    // Without this the agent could only grade what was already queued. It had
    // no way to see the work waiting to go in, which is the half of the job
    // that keeps the queue fed.
    expect(CONTEXT).toMatch(/\.eq\("status", "backlog"\)/);
    expect(CONTEXT).toContain("backlog_candidates");
  });

  it("reads the columns that decide whether a promotion would fire", () => {
    const gatherer = CONTEXT.slice(
      CONTEXT.indexOf("export async function developerContext"),
      CONTEXT.indexOf("export async function engagementContext"),
    );
    expect(gatherer.length).toBeGreaterThan(500);
    expect(gatherer).toContain("queue_enabled");
    expect(gatherer).toContain("repo_url");
    expect(gatherer).toContain("projectQueueReady");
    expect(gatherer).toContain("willBePickedUp");
    expect(gatherer).toContain("assignee_kind");
  });
});

describe("scheduled runs stamp themselves", () => {
  // Source-level on purpose: agent-run cannot be imported here (npm: and Deno),
  // and the bug was structural rather than logical. The tool-loop branch
  // returned before the single `last_run_at` write at the bottom of the
  // function, and migration 20260821000000 put tool_loop: true on every agent —
  // so last_run_at stayed null, isDue() kept matching the same passed slot, and
  // every scheduled agent re-fired on every dispatcher tick all day.
  const src = readFileSync(
    join(__dirname, "../../supabase/functions/agent-run/index.ts"),
    "utf8",
  );

  it("writes last_run_at on both paths out of a successful run", () => {
    const writes = src.match(/last_run_at:\s*new Date\(\)\.toISOString\(\)/g) ?? [];
    expect(writes.length).toBe(2);
  });

  it("writes it before the tool-loop branch returns", () => {
    const branch = src.indexOf("tool_loop === true");
    const legacy = src.indexOf("const { finding, usage } = await runAgentModel");
    expect(branch).toBeGreaterThan(-1);
    expect(legacy).toBeGreaterThan(branch);
    const inBranch = src.slice(branch, legacy);
    expect(inBranch).toContain("last_run_at");
  });
});
