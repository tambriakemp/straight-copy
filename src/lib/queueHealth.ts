// Reading the coding queue's mind.
//
// Every fire attempt has been logged to queue_fire_log since 20260822220000,
// and nothing has ever read it. So the only way to answer "did the board
// actually tell Claude to do that?" was to open a SQL console, which in
// practice meant nobody asked, and a queue that had silently stopped firing
// looked exactly like a queue with no work to do.
//
// The rules live here rather than in the page component so they can be tested.
// Everything is pure: rows in, findings out, no Supabase, no clock except the
// `now` you pass.

export interface FireLogRow {
  id: number;
  client_project_id: string | null;
  task_id: string | null;
  outcome: string;
  detail: string | null;
  fired_at: string;
}

export interface RouteRow {
  id: string;
  client_project_id: string | null;
  secret_prefix: string;
  enabled: boolean;
  debounce_seconds: number;
  /** claude_routine (POST a routine trigger) or github_dispatch (fire a workflow). */
  target: string;
}

export interface ProjectRow {
  id: string;
  name: string;
  type: string;
  queue_enabled: boolean;
  repo_url: string | null;
  repo_branch: string;
  toolchain: string;
  delivery_mode: string;
}

export interface TaskRow {
  id: string;
  name: string;
  client_project_id: string;
  status: string;
  assignee_kind: string;
  claimed_by: string | null;
  claimed_at: string | null;
}

/** How long a claim survives before another worker may take the task. */
export const CLAIM_TTL_MINUTES = 90;

export type Tone = "good" | "warn" | "bad" | "muted";

/**
 * What each logged outcome means in words, because `no_route` on its own has
 * never told anyone what to do about it.
 */
export const OUTCOME_META: Record<string, { label: string; tone: Tone; meaning: string }> = {
  fired: {
    label: "Fired",
    tone: "good",
    meaning: "The board reached the coding worker. Whether the work landed is a separate question.",
  },
  debounced: {
    label: "Debounced",
    tone: "muted",
    meaning:
      "Suppressed because the same route fired recently. Normal when several tasks are queued at once — the worker picks up everything ready, so one fire covers them all.",
  },
  no_route: {
    label: "No route",
    tone: "bad",
    meaning: "No enabled row in queue_fire_routes covers this project, so there was nowhere to send it.",
  },
  no_secret: {
    label: "No secret",
    tone: "bad",
    meaning: "The route exists but its Vault secrets are missing, so the request had no URL or token.",
  },
  error: {
    label: "Error",
    tone: "bad",
    meaning: "The POST itself failed. The task edit still saved — firing is deliberately fire-and-forget.",
  },
  not_queue_work: {
    label: "Not queue work",
    tone: "warn",
    meaning:
      "The task reached ready_for_claude but was not assigned to Claude, so the queue ignored it. Agent-created tasks did this until the assignee_kind fix shipped.",
  },
};

export const TARGET_LABEL: Record<string, string> = {
  claude_routine: "claude.ai routine",
  github_dispatch: "GitHub Actions worker",
};

export function targetLabel(target: string): string {
  return TARGET_LABEL[target] ?? target;
}

export function outcomeMeta(outcome: string) {
  return (
    OUTCOME_META[outcome] ?? {
      label: outcome,
      tone: "muted" as Tone,
      meaning: "Unrecognised outcome — added to the trigger after this panel was written.",
    }
  );
}

/** Which route serves a project: its own row if there is one, else the default. */
export function routeForProject(projectId: string, routes: RouteRow[]): RouteRow | null {
  const enabled = routes.filter((r) => r.enabled);
  return (
    enabled.find((r) => r.client_project_id === projectId) ??
    enabled.find((r) => r.client_project_id === null) ??
    null
  );
}

export function countOutcomes(log: FireLogRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of log) out[row.outcome] = (out[row.outcome] ?? 0) + 1;
  return out;
}

export function withinHours(log: FireLogRow[], hours: number, now: Date): FireLogRow[] {
  const cutoff = now.getTime() - hours * 3600_000;
  return log.filter((r) => {
    const t = Date.parse(r.fired_at);
    return Number.isFinite(t) && t >= cutoff;
  });
}

export function claimAgeMinutes(claimedAt: string | null, now: Date): number | null {
  if (!claimedAt) return null;
  const t = Date.parse(claimedAt);
  if (!Number.isFinite(t)) return null;
  return Math.floor((now.getTime() - t) / 60_000);
}

export function isClaimStale(claimedAt: string | null, now: Date): boolean {
  const age = claimAgeMinutes(claimedAt, now);
  return age !== null && age > CLAIM_TTL_MINUTES;
}

export interface ProjectQueueState {
  project: ProjectRow;
  route: RouteRow | null;
  ready: TaskRow[];
  /** Ready, assigned to Claude, and nobody is holding it. */
  waiting: TaskRow[];
  /** Ready and claimed, claim still fresh. */
  inFlight: TaskRow[];
  /** Ready and claimed, claim past its TTL — a worker died mid-task. */
  stale: TaskRow[];
  /** Ready but not assigned to Claude, so the queue cannot see them. */
  invisible: TaskRow[];
}

export function projectQueueState(
  project: ProjectRow,
  routes: RouteRow[],
  tasks: TaskRow[],
  now: Date,
): ProjectQueueState {
  const ready = tasks.filter(
    (t) => t.client_project_id === project.id && t.status === "ready_for_claude",
  );
  const forClaude = ready.filter((t) => t.assignee_kind === "claude");
  return {
    project,
    route: routeForProject(project.id, routes),
    ready,
    waiting: forClaude.filter((t) => !t.claimed_by),
    inFlight: forClaude.filter((t) => t.claimed_by && !isClaimStale(t.claimed_at, now)),
    stale: forClaude.filter((t) => t.claimed_by && isClaimStale(t.claimed_at, now)),
    invisible: ready.filter((t) => t.assignee_kind !== "claude"),
  };
}

export type Severity = "critical" | "warning" | "info" | "ok";

export interface Finding {
  severity: Severity;
  title: string;
  detail: string;
  /** Copy-pasteable remedy, when there is an exact one. */
  fix?: string;
}

export interface DiagnoseInput {
  log: FireLogRow[];
  routes: RouteRow[];
  projects: ProjectRow[];
  tasks: TaskRow[];
  now: Date;
}

/**
 * Everything wrong with the queue right now, worst first.
 *
 * Deliberately opinionated: a finding either names the exact remedy or it does
 * not appear. A panel that says "something may be misconfigured" is a panel
 * that gets ignored.
 */
export function diagnose(input: DiagnoseInput): Finding[] {
  const { log, routes, projects, tasks, now } = input;
  const findings: Finding[] = [];

  const enabledRoutes = routes.filter((r) => r.enabled);
  const defaultRoute = enabledRoutes.find((r) => r.client_project_id === null) ?? null;
  const queueProjects = projects.filter((p) => p.queue_enabled);
  const recent = withinHours(log, 24, now);
  const counts = countOutcomes(recent);

  if (enabledRoutes.length === 0) {
    findings.push({
      severity: "critical",
      title: "No enabled route, so nothing can fire",
      detail:
        "queue_fire_routes has no enabled row. The trigger runs, finds nowhere to send the task, and logs no_route. Every board is affected.",
      fix: "insert into public.queue_fire_routes (client_project_id, secret_prefix)\nvalues (null, 'agency_queue');",
    });
  } else if (!defaultRoute) {
    const uncovered = queueProjects.filter((p) => !routeForProject(p.id, routes));
    if (uncovered.length > 0) {
      findings.push({
        severity: "critical",
        title: `${uncovered.length} queue-enabled ${uncovered.length === 1 ? "board has" : "boards have"} no route`,
        detail: `There is no default route (a row with client_project_id null), and these boards have no row of their own: ${uncovered
          .map((p) => p.name)
          .join(", ")}. Their tasks will log no_route.`,
        fix: "insert into public.queue_fire_routes (client_project_id, secret_prefix)\nvalues (null, 'agency_queue');",
      });
    }
  }

  const secretless = new Set(
    recent.filter((r) => r.outcome === "no_secret").map((r) => r.detail ?? ""),
  );
  if (secretless.size > 0) {
    findings.push({
      severity: "critical",
      title: "A route's Vault secrets are missing",
      detail: `The route matched but had no URL or token to POST to, so nothing was sent. Logged detail: ${[...secretless].join(" | ")}`,
      fix: "select vault.create_secret('https://…routine trigger URL…', 'agency_queue_fire_url');\nselect vault.create_secret('…token…', 'agency_queue_fire_token');",
    });
  }

  const errors = recent.filter((r) => r.outcome === "error");
  if (errors.length > 0) {
    findings.push({
      severity: "critical",
      title: `${errors.length} fire ${errors.length === 1 ? "attempt" : "attempts"} errored in the last 24h`,
      detail: `The POST failed. Task edits still saved — firing is fire-and-forget by design, so a failed fire never blocks the board. Most recent: ${
        errors[0].detail ?? "no detail recorded"
      }`,
    });
  }

  const notQueueWork = recent.filter((r) => r.outcome === "not_queue_work");
  if (notQueueWork.length > 0) {
    findings.push({
      severity: "warning",
      title: `${notQueueWork.length} ${notQueueWork.length === 1 ? "task" : "tasks"} reached ready_for_claude without being assigned to Claude`,
      detail:
        "The queue only sees tasks with assignee_kind 'claude'. Agent-created tasks were hardcoded to 'agency' until that fix shipped — if these entries are newer than the deploy, the fix is merged but not deployed.",
    });
  }

  for (const project of queueProjects) {
    const state = projectQueueState(project, routes, tasks, now);
    if (state.stale.length > 0) {
      findings.push({
        severity: "warning",
        title: `${state.stale.length} stale ${state.stale.length === 1 ? "claim" : "claims"} on ${project.name}`,
        detail: `Claimed more than ${CLAIM_TTL_MINUTES} minutes ago and still in progress, which means a worker stopped mid-task. The next run may re-claim them; releasing them makes that immediate.`,
      });
    }
    if (state.invisible.length > 0) {
      findings.push({
        severity: "warning",
        title: `${state.invisible.length} ready ${state.invisible.length === 1 ? "task is" : "tasks are"} invisible to the queue on ${project.name}`,
        detail: `Sitting in ready_for_claude but assigned elsewhere, so list_queue_projects will not return them: ${state.invisible
          .map((t) => t.name)
          .join(", ")}`,
      });
    }
  }

  const readyElsewhere = projects.filter((p) => {
    if (p.queue_enabled) return false;
    return tasks.some((t) => t.client_project_id === p.id && t.status === "ready_for_claude");
  });
  if (readyElsewhere.length > 0) {
    findings.push({
      severity: "info",
      title: `${readyElsewhere.length} ${readyElsewhere.length === 1 ? "board has" : "boards have"} ready work but no queue`,
      detail: `Tasks are sitting in ready_for_claude on boards where the queue is switched off: ${readyElsewhere
        .map((p) => p.name)
        .join(", ")}. Turn the queue on in the project's delivery targets, or the tasks wait forever.`,
    });
  }

  if (log.length === 0) {
    findings.push({
      severity: "warning",
      title: "No fire has ever been attempted",
      detail:
        "queue_fire_log is empty, so no task has ever reached ready_for_claude on a queue-enabled board. Until one does, none of this is proven end to end.",
    });
  } else if (recent.length === 0) {
    findings.push({
      severity: "info",
      title: "Nothing fired in the last 24 hours",
      detail: `Last attempt was ${log[0].fired_at}. Quiet is normal if no task became ready — it only matters if you expected one to.`,
    });
  }

  if (
    recent.length > 0 &&
    (counts.fired ?? 0) === 0 &&
    (counts.debounced ?? 0) === recent.length
  ) {
    findings.push({
      severity: "info",
      title: "Everything in the last 24 hours was debounced",
      detail:
        "Debounce is keyed on the route, not the board — with one shared default route, a fire for any board suppresses fires for all of them for the debounce window. That is usually fine, because the worker sweeps every ready board when it wakes.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "ok",
      title: "Nothing wrong that this panel can see",
      detail: `${counts.fired ?? 0} ${(counts.fired ?? 0) === 1 ? "fire" : "fires"} in the last 24 hours, ${queueProjects.length} queue-enabled ${queueProjects.length === 1 ? "board" : "boards"}, every one of them routed.`,
    });
  }

  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2, ok: 3 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}
