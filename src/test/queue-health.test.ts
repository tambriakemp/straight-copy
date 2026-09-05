import { describe, expect, it } from "vitest";
import {
  CLAIM_TTL_MINUTES,
  targetLabel,
  countOutcomes,
  diagnose,
  isClaimStale,
  outcomeMeta,
  projectQueueState,
  routeForProject,
  withinHours,
  type FireLogRow,
  type ProjectRow,
  type RouteRow,
  type TaskRow,
} from "@/lib/queueHealth";

const NOW = new Date("2026-09-05T04:00:00Z");

function minutesAgo(n: number): string {
  return new Date(NOW.getTime() - n * 60_000).toISOString();
}

function project(over: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: "p1",
    name: "Agency Project",
    type: "app_development",
    queue_enabled: true,
    repo_url: "https://github.com/tambriakemp/straight-copy",
    repo_branch: "main",
    toolchain: "npm",
    delivery_mode: "pr",
    ...over,
  };
}

function route(over: Partial<RouteRow> = {}): RouteRow {
  return {
    id: "r1",
    client_project_id: null,
    secret_prefix: "agency_queue",
    enabled: true,
    debounce_seconds: 300,
    target: "claude_routine",
    ...over,
  };
}

function task(over: Partial<TaskRow> = {}): TaskRow {
  return {
    id: "t1",
    name: "Ship the thing",
    client_project_id: "p1",
    status: "ready_for_claude",
    assignee_kind: "claude",
    claimed_by: null,
    claimed_at: null,
    ...over,
  };
}

function fire(over: Partial<FireLogRow> = {}): FireLogRow {
  return {
    id: 1,
    client_project_id: "p1",
    task_id: "t1",
    outcome: "fired",
    detail: null,
    fired_at: minutesAgo(10),
    ...over,
  };
}

describe("routeForProject", () => {
  it("prefers the project's own route over the default", () => {
    const own = route({ id: "own", client_project_id: "p1", secret_prefix: "client_x" });
    expect(routeForProject("p1", [route(), own])?.id).toBe("own");
  });

  it("falls back to the default route", () => {
    expect(routeForProject("p1", [route()])?.secret_prefix).toBe("agency_queue");
  });

  it("ignores disabled routes, including a disabled project route", () => {
    const own = route({ id: "own", client_project_id: "p1", enabled: false });
    expect(routeForProject("p1", [own])).toBeNull();
    expect(routeForProject("p1", [own, route()])?.client_project_id).toBeNull();
  });

  it("returns null when no route covers the project", () => {
    expect(routeForProject("p9", [route({ client_project_id: "p1" })])).toBeNull();
  });
});

describe("targetLabel", () => {
  it("names both fire targets in words", () => {
    expect(targetLabel("claude_routine")).toBe("claude.ai routine");
    expect(targetLabel("github_dispatch")).toBe("GitHub Actions worker");
  });

  it("falls back to the raw value for a target added later", () => {
    expect(targetLabel("carrier_pigeon")).toBe("carrier_pigeon");
  });
});

describe("claim staleness", () => {
  it("treats a fresh claim as live", () => {
    expect(isClaimStale(minutesAgo(CLAIM_TTL_MINUTES - 1), NOW)).toBe(false);
  });

  it("treats a claim past the TTL as stale", () => {
    expect(isClaimStale(minutesAgo(CLAIM_TTL_MINUTES + 1), NOW)).toBe(true);
  });

  it("is not stale when there is no claim at all", () => {
    expect(isClaimStale(null, NOW)).toBe(false);
  });

  it("does not treat an unparseable timestamp as stale", () => {
    expect(isClaimStale("not a date", NOW)).toBe(false);
  });
});

describe("withinHours", () => {
  it("keeps rows inside the window and drops older ones", () => {
    const rows = [fire({ id: 1, fired_at: minutesAgo(30) }), fire({ id: 2, fired_at: minutesAgo(60 * 30) })];
    expect(withinHours(rows, 24, NOW).map((r) => r.id)).toEqual([1]);
  });

  it("drops rows with an unparseable timestamp rather than counting them as now", () => {
    expect(withinHours([fire({ fired_at: "nonsense" })], 24, NOW)).toHaveLength(0);
  });
});

describe("countOutcomes", () => {
  it("tallies by outcome", () => {
    expect(countOutcomes([fire(), fire({ id: 2 }), fire({ id: 3, outcome: "debounced" })])).toEqual({
      fired: 2,
      debounced: 1,
    });
  });
});

describe("outcomeMeta", () => {
  it("explains every outcome the trigger can log", () => {
    for (const o of ["fired", "debounced", "no_route", "no_secret", "error", "not_queue_work"]) {
      expect(outcomeMeta(o).meaning.length).toBeGreaterThan(20);
    }
  });

  it("degrades gracefully for an outcome added later", () => {
    expect(outcomeMeta("teleported").label).toBe("teleported");
  });
});

describe("projectQueueState", () => {
  it("splits ready tasks into waiting, in flight, stale and invisible", () => {
    const tasks = [
      task({ id: "waiting" }),
      task({ id: "live", claimed_by: "worker-1", claimed_at: minutesAgo(5) }),
      task({ id: "dead", claimed_by: "worker-2", claimed_at: minutesAgo(CLAIM_TTL_MINUTES + 30) }),
      task({ id: "wrong-assignee", assignee_kind: "agency" }),
      task({ id: "not-ready", status: "backlog" }),
      task({ id: "other-project", client_project_id: "p2" }),
    ];
    const state = projectQueueState(project(), [route()], tasks, NOW);

    expect(state.ready.map((t) => t.id).sort()).toEqual(["dead", "live", "waiting", "wrong-assignee"]);
    expect(state.waiting.map((t) => t.id)).toEqual(["waiting"]);
    expect(state.inFlight.map((t) => t.id)).toEqual(["live"]);
    expect(state.stale.map((t) => t.id)).toEqual(["dead"]);
    expect(state.invisible.map((t) => t.id)).toEqual(["wrong-assignee"]);
  });
});

describe("diagnose", () => {
  const base = { projects: [project()], tasks: [], now: NOW };

  it("calls out an empty route table as critical, with the insert", () => {
    const [finding] = diagnose({ ...base, log: [fire()], routes: [] });
    expect(finding.severity).toBe("critical");
    expect(finding.title).toContain("No enabled route");
    expect(finding.fix).toContain("insert into public.queue_fire_routes");
  });

  it("calls out queue-enabled boards left uncovered when there is no default route", () => {
    const finding = diagnose({
      ...base,
      projects: [project(), project({ id: "p2", name: "Client B" })],
      log: [fire()],
      routes: [route({ client_project_id: "p1" })],
    }).find((f) => f.title.includes("no route"));

    expect(finding?.severity).toBe("critical");
    expect(finding?.detail).toContain("Client B");
    expect(finding?.detail).not.toContain("Agency Project");
  });

  it("does not complain about routing when a default route covers everything", () => {
    const findings = diagnose({ ...base, log: [fire()], routes: [route()] });
    expect(findings.some((f) => f.title.toLowerCase().includes("route"))).toBe(false);
  });

  it("surfaces missing Vault secrets with the create_secret calls", () => {
    const finding = diagnose({
      ...base,
      routes: [route()],
      log: [fire({ outcome: "no_secret", detail: "vault secrets agency_queue_fire_url/_fire_token are not set" })],
    }).find((f) => f.title.includes("Vault"));

    expect(finding?.severity).toBe("critical");
    expect(finding?.fix).toContain("vault.create_secret");
    expect(finding?.detail).toContain("agency_queue_fire_url");
  });

  it("reports errors with the logged detail", () => {
    const finding = diagnose({
      ...base,
      routes: [route()],
      log: [fire({ outcome: "error", detail: "connection refused" })],
    }).find((f) => f.title.includes("errored"));

    expect(finding?.detail).toContain("connection refused");
  });

  it("explains not_queue_work as a possible undeployed fix", () => {
    const finding = diagnose({
      ...base,
      routes: [route()],
      log: [fire({ outcome: "not_queue_work" })],
    }).find((f) => f.title.includes("without being assigned"));

    expect(finding?.severity).toBe("warning");
    expect(finding?.detail).toContain("not deployed");
  });

  it("flags stale claims per board", () => {
    const finding = diagnose({
      ...base,
      routes: [route()],
      log: [fire()],
      tasks: [task({ claimed_by: "w", claimed_at: minutesAgo(CLAIM_TTL_MINUTES + 10) })],
    }).find((f) => f.title.includes("stale"));

    expect(finding?.severity).toBe("warning");
    expect(finding?.title).toContain("Agency Project");
  });

  it("flags ready tasks the queue cannot see", () => {
    const finding = diagnose({
      ...base,
      routes: [route()],
      log: [fire()],
      tasks: [task({ name: "Invisible task", assignee_kind: "agency" })],
    }).find((f) => f.title.includes("invisible"));

    expect(finding?.detail).toContain("Invisible task");
  });

  it("flags ready work on boards where the queue is switched off", () => {
    const finding = diagnose({
      ...base,
      projects: [project({ queue_enabled: false, name: "Dormant" })],
      routes: [route()],
      log: [fire()],
      tasks: [task()],
    }).find((f) => f.title.includes("no queue"));

    expect(finding?.severity).toBe("info");
    expect(finding?.detail).toContain("Dormant");
  });

  it("says so plainly when nothing has ever fired", () => {
    const finding = diagnose({ ...base, routes: [route()], log: [] }).find((f) =>
      f.title.includes("ever been attempted"),
    );
    expect(finding?.severity).toBe("warning");
  });

  it("distinguishes a quiet day from a broken queue", () => {
    const finding = diagnose({
      ...base,
      routes: [route()],
      log: [fire({ fired_at: minutesAgo(60 * 48) })],
    }).find((f) => f.title.includes("last 24 hours"));

    expect(finding?.severity).toBe("info");
  });

  it("explains an all-debounced day as route-level debouncing", () => {
    const finding = diagnose({
      ...base,
      routes: [route()],
      log: [fire({ outcome: "debounced" }), fire({ id: 2, outcome: "debounced" })],
    }).find((f) => f.title.includes("debounced"));

    expect(finding?.detail).toContain("keyed on the route");
  });

  it("returns a single ok finding on a healthy queue", () => {
    const findings = diagnose({
      ...base,
      routes: [route()],
      log: [fire()],
      tasks: [task({ claimed_by: "w", claimed_at: minutesAgo(3) })],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("ok");
    expect(findings[0].detail).toContain("1 fire in the last 24 hours");
  });

  it("sorts worst first", () => {
    const findings = diagnose({
      ...base,
      routes: [],
      log: [fire({ outcome: "not_queue_work" })],
      tasks: [task({ assignee_kind: "agency" })],
    });
    expect(findings[0].severity).toBe("critical");
    expect(findings.map((f) => f.severity)).toEqual([...findings.map((f) => f.severity)].sort());
  });
});
