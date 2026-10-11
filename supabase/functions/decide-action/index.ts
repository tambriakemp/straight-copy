// Wires up the Today page's Decide buttons end to end (CRE-393 §B).
//
// Browser-initiated only, same caller gate as complete-brief-item. Two
// actions:
//
//   "ask"  -- "Ask a question" on a Decide card. Relays the question to Ara
//             (the Grok Bot webhook already in app_secrets as
//             ara_webhook_url/ara_webhook_key, same one complete-brief-item
//             uses) so she posts it on the linked Paperclip issue(s) and
//             wakes the owning agent.
//   "pick" -- any of the real decision buttons (Approve, Skip, Use
//             defaults, Cancel it, Keep, I ran it, Do it later, Merge, ...).
//             For every action_type except "merge" this is also a relay to
//             Ara: post "Bree chose "<option>" from Decide" on the linked
//             issue(s) and wake the agent. "merge" is the one type this
//             function handles itself end to end via the GitHub API —
//             see mergePr below.
//
// Why relay through Ara instead of posting to Paperclip directly: a prior
// version of complete-brief-item tried exactly that and got a 403
// (cross_issue_influence_run_context_required) — Paperclip's cross-issue
// guard requires a heartbeat run id to attribute an agent-key comment to,
// and a browser-triggered edge function has no run. There is no run-scoped
// credential to hand a Lovable function, so — same fix as that file —
// the comment is Ara's to post, not this function's.
//
// Every call is logged to decide_actions (service role) for an audit trail
// independent of whatever Ara/Paperclip end up showing.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { resolveCaller } from "../_shared/webhook-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function getSecret(sb: ReturnType<typeof serviceClient>, key: string) {
  const { data } = await sb.from("app_secrets").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

interface DecideBody {
  action: "pick" | "ask";
  row_id: string;
  title: string;
  task_ids?: string[];
  // "pick"
  option?: string;
  action_type?: string | null;
  repo?: string | null;
  pr_number?: number | null;
  branch?: string | null;
  base_branch?: string | null;
  confirmed?: boolean;
  // "ask"
  question?: string;
}

function validate(body: unknown): string | null {
  if (!body || typeof body !== "object") return "body must be an object";
  const b = body as Record<string, unknown>;
  if (b.action !== "pick" && b.action !== "ask") return "action must be 'pick' or 'ask'";
  if (typeof b.row_id !== "string" || !b.row_id.trim()) return "row_id must be a non-empty string";
  if (typeof b.title !== "string" || !b.title.trim()) return "title must be a non-empty string";
  if (b.action === "pick" && (typeof b.option !== "string" || !b.option.trim())) {
    return "option is required to pick";
  }
  if (b.action === "ask" && (typeof b.question !== "string" || !b.question.trim())) {
    return "question is required to ask";
  }
  return null;
}

async function notifyAra(sb: ReturnType<typeof serviceClient>, payload: Record<string, unknown>): Promise<string | null> {
  const webhookUrl = await getSecret(sb, "ara_webhook_url");
  const webhookKey = await getSecret(sb, "ara_webhook_key");
  if (!webhookUrl || !webhookKey) {
    return "ara webhook not configured -- set ara_webhook_url and ara_webhook_key in Settings & keys";
  }
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${webhookKey}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return `ara webhook returned ${res.status}`;
    return null;
  } catch (e) {
    return `ara webhook failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// Repos the standing auto-merge rule (Oct 5, 2026) already covers --
// straight-copy's own PRs merge the moment their build passes, no second
// human click. Everything else needs the explicit confirm step below.
const AUTO_MERGE_REPOS = new Set(["tambriakemp/straight-copy"]);

function isMenoviaPhase2(repo: string, branch: string, base: string): boolean {
  const r = repo.toLowerCase();
  const b = `${branch} ${base}`.toLowerCase();
  return r.includes("menovia") && (b.includes("phase-2") || b.includes("phase2"));
}

interface GhPr {
  number: number; state: string; merged: boolean; mergeable: boolean | null; mergeable_state: string;
  title: string; html_url: string; changed_files: number; additions: number; deletions: number;
  head: { sha: string; ref: string }; base: { ref: string };
}
interface GhCheckRun { name: string; status: string; conclusion: string | null }

async function ghFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GitHub ${path} -> ${res.status}: ${body?.message ?? JSON.stringify(body)}`);
  return body;
}

interface MergeSummary {
  repo: string; prNumber: number; title: string; url: string;
  branch: string; baseBranch: string;
  filesChanged: number; additions: number; deletions: number;
  ciStatus: string; checks: Array<{ name: string; conclusion: string | null }>;
}
interface MergeOutcome {
  ok?: true;
  error?: string;
  needsConfirm?: true;
  summary?: MergeSummary;
  result?: unknown;
}

async function mergePr(sb: ReturnType<typeof serviceClient>, b: DecideBody): Promise<MergeOutcome> {
  if (!b.repo || !b.pr_number) return { error: "merge requires repo and pr_number" };
  const token = await getSecret(sb, "github_token");
  if (!token) {
    return { error: "github_token is not set -- add it on /admin/tokens -> Keys before merging from Decide" };
  }

  let pr: GhPr;
  try {
    pr = await ghFetch(`/repos/${b.repo}/pulls/${b.pr_number}`, token) as GhPr;
  } catch (e) {
    return { error: `could not read PR: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (pr.merged) return { ok: true, result: { already_merged: true, html_url: pr.html_url } };
  if (pr.state !== "open") return { error: `PR #${pr.number} is ${pr.state}, not open` };

  const branch = b.branch ?? pr.head.ref;
  const base = b.base_branch ?? pr.base.ref;

  // Hard guard, no override: never merge a Menovia Phase 2 branch into main,
  // auto-merge list or not, confirmed or not.
  if (isMenoviaPhase2(b.repo, branch, base)) {
    return { error: `Blocked: ${b.repo}#${pr.number} (${branch} -> ${base}) matches the Menovia Phase 2 main-merge guard. This never merges automatically -- ask Devin to review by hand.` };
  }

  let checkRuns: GhCheckRun[] = [];
  try {
    const checks = await ghFetch(`/repos/${b.repo}/commits/${pr.head.sha}/check-runs`, token);
    checkRuns = checks.check_runs ?? [];
  } catch {
    // No checks configured, or the call failed -- ciPassed below treats an
    // empty list as "unknown", which still blocks the auto-merge repos and
    // still requires a confirm on everything else.
  }
  const allDone = checkRuns.every((c) => c.status === "completed");
  const allOk = checkRuns.every((c) => ["success", "neutral", "skipped"].includes(c.conclusion ?? ""));
  const ciPassed = checkRuns.length > 0 && allDone && allOk;
  const summary = {
    repo: b.repo, prNumber: pr.number, title: pr.title, url: pr.html_url,
    branch, baseBranch: base,
    filesChanged: pr.changed_files, additions: pr.additions, deletions: pr.deletions,
    ciStatus: checkRuns.length === 0 ? "no checks configured" : ciPassed ? "passed" : allDone ? "failed" : "running",
    checks: checkRuns.map((c) => ({ name: c.name, conclusion: c.conclusion })),
  };

  const autoMerge = AUTO_MERGE_REPOS.has(b.repo);
  if (autoMerge) {
    if (!ciPassed) return { error: `Not merged: CI is ${summary.ciStatus} on ${b.repo}#${pr.number}`, summary };
  } else if (!b.confirmed) {
    return { needsConfirm: true, summary };
  }

  try {
    const result = await ghFetch(`/repos/${b.repo}/pulls/${b.pr_number}/merge`, token, {
      method: "PUT",
      body: JSON.stringify({ merge_method: "squash" }),
    });
    return { ok: true, result: { ...result, html_url: pr.html_url }, summary };
  } catch (e) {
    return { error: `merge failed: ${e instanceof Error ? e.message : String(e)}`, summary };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const caller = await resolveCaller(req);
  if (caller.kind !== "admin") return json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "body must be valid JSON" }, 400);
  }
  const problem = validate(body);
  if (problem) return json({ error: problem }, 400);
  const b = body as DecideBody;
  const taskIds = b.task_ids ?? [];

  const sb = serviceClient();

  if (b.action === "ask") {
    const warning = await notifyAra(sb, {
      type: "decide_question",
      row_id: b.row_id,
      title: b.title,
      task_ids: taskIds,
      question: b.question,
      asked_at: new Date().toISOString(),
    });
    await sb.from("decide_actions").insert({
      row_id: b.row_id, title: b.title, task_ids: taskIds, action: "ask",
      question: b.question, status: warning ? "failed" : "done",
      result: warning ? { warning } : null, acted_by: caller.userId,
    });
    if (warning) return json({ ok: true, warnings: [warning] });
    return json({ ok: true });
  }

  // action === "pick"
  if (b.action_type === "merge") {
    const outcome = await mergePr(sb, b);
    if ("needsConfirm" in outcome) return json(outcome);
    const warning = outcome.error
      ? null
      : await notifyAra(sb, {
        type: "decide_merge_result",
        row_id: b.row_id, title: b.title, task_ids: taskIds,
        repo: b.repo, pr_number: b.pr_number, result: outcome.result,
      });
    await sb.from("decide_actions").insert({
      row_id: b.row_id, title: b.title, task_ids: taskIds, action: "pick",
      option_chosen: b.option, action_type: b.action_type,
      status: outcome.error ? "failed" : "done",
      result: outcome.error ? { error: outcome.error, summary: outcome.summary } : { result: outcome.result, summary: outcome.summary },
      acted_by: caller.userId,
    });
    if (outcome.error) return json({ error: outcome.error, summary: outcome.summary }, 502);
    return json({ ok: true, result: outcome.result, warnings: warning ? [warning] : [] });
  }

  const warning = await notifyAra(sb, {
    type: "decide_action",
    row_id: b.row_id, title: b.title, task_ids: taskIds,
    option: b.option, action_type: b.action_type ?? null,
    decided_at: new Date().toISOString(),
  });
  await sb.from("decide_actions").insert({
    row_id: b.row_id, title: b.title, task_ids: taskIds, action: "pick",
    option_chosen: b.option, action_type: b.action_type ?? null,
    status: warning ? "failed" : "done",
    result: warning ? { warning } : null, acted_by: caller.userId,
  });
  if (warning) return json({ ok: true, warnings: [warning] });
  return json({ ok: true });
});
