// Polls Paperclip for what needs Bree right now (CRE-235 §4) and mirrors it
// into paperclip_pending_items for the Today page's "Do" list.
// Paperclip has no outbound webhook for "approval created" / "interaction
// created" — only routines carry webhook triggers — so polling on a schedule
// (pg_cron/pg_net, every 10 minutes) is the only option today.
//
// The read credential and Bree's own Paperclip user id both live in
// app_secrets, pasted from the same Settings card as the brief ingest
// secret — never a Supabase Function env var.
//
// inbox/mine's shape was confirmed live against real data on CRE-248: it
// returns full Paperclip issue objects with a flat `identifier` field (not
// `issueIdentifier`, not a nested `.issue`), and — the bigger find — it
// returns *every* issue responsible to the given user regardless of status
// (76 rows going back to September, including `done`/`backlog`), not just
// the ones that need her attention.
//
// CRE-393 round 1 (wrong): gated on each issue's own `reviewAttention` /
// `blockerAttention` server state, treating "stalled" as "needs a human".
// That looked right against a handful of hand-checked rows, but in
// production it fired for nearly every agent-owned issue sitting in
// in_progress/in_review/blocked — "stalled" just means no agent happens to
// be actively mid-run on the issue *at the moment this cron tick fired*,
// which is true of almost any issue between heartbeats (agents are
// event-driven, not continuously polling). It is not a signal that Bree
// specifically owns the next step. Bree flagged 17+ agent-owned rows (one
// of them this very issue, CRE-393, between its own runs) showing up as
// noise — confirmed live: /api/issues/{id}/interactions on several of the
// flagged issues returned either no interactions at all or only
// already-resolved ones, so nothing was actually waiting on her.
//
// CRE-393 round 2 (this version): the real "waiting on Bree" signal is a
// live, unresolved interaction thread on the issue — `status: "pending"`
// and either addressed to her directly (`addresseeUserId`) or whose
// `effectiveResolverPolicy` excludes agents outright (`human_only` /
// `board_only` — an agent literally cannot close it, so the only way it
// moves is her answering). Verified live: CRE-394's ask_user_questions
// interaction (addressed to Bree, human_only, pending) is exactly the case
// that should show; CRE-393's own two confirmations are both already
// `status: "expired"` (superseded by her comment), so they now correctly
// drop off without any attention-state lookup. `board_or_agents` / `anyone`
// / `not_creator` interactions are deliberately NOT treated as hers — an
// agent can resolve those on its own, so surfacing them would reintroduce
// the same noise under a different name.
//
// Kind is still three-way: "interaction" (assigneeUserId is Bree — hers to
// check off), "interaction_stalled" (agent-owned, but a pending interaction
// genuinely needs her answer — no checkbox, see needsYouNow.ts/
// needsYouRows.ts for why), and "approval" (unchanged, from the /approvals
// endpoint).
// The /approvals endpoint's field shape is still unverified — this company
// has never had a real pending-approval row to check field names against,
// so that mapping is left as the original best guess.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agent-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PAPERCLIP_BASE = "https://paperclip.cre8visions.com";
const COMPANY_ID = "62e315f3-8d2c-49c9-8a67-00f151290b5c";

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

interface PendingItem {
  id: string;
  kind: "approval" | "interaction" | "interaction_stalled";
  title: string;
  issue_identifier: string | null;
  issue_url: string | null;
  raw: unknown;
}

interface InboxIssue {
  id: string;
  identifier: string | null;
  title: string | null;
  summary?: string | null;
  status: string;
  assigneeUserId: string | null;
}

interface IssueInteraction {
  status: string;
  addresseeUserId: string | null;
  effectiveResolverPolicy: string;
}

function issueLink(identifier: string | null): string | null {
  return identifier ? `${PAPERCLIP_BASE}/CRE/issues/${identifier}` : null;
}

// Terminal statuses never carry a pending interaction in practice (closing
// or cancelling an issue resolves/withdraws whatever was open on it) — skip
// them so the per-issue interactions lookup below isn't spent on the bulk
// of inbox/mine's rows, which per the file header can include everything
// back to September.
const SKIP_STATUSES = new Set(["done", "cancelled"]);
// Bree's own explicit list (CRE-393 round 2): an issue assigned straight to
// her counts as "hers to do" only in these statuses — a done/backlog item
// she's nominally assigned to isn't today's work.
const BREE_ASSIGNED_STATUSES = new Set(["todo", "in_progress", "in_review"]);
// An agent can resolve anything else (anyone / board_or_agents /
// not_creator) on its own — only these two policies mean a human has to be
// the one to answer.
const HUMAN_RESOLVER_POLICIES = new Set(["human_only", "board_only"]);

async function hasOpenInteractionForBree(
  headers: Record<string, string>,
  issueId: string,
  breeUserId: string,
): Promise<boolean> {
  const res = await fetch(`${PAPERCLIP_BASE}/api/issues/${issueId}/interactions`, { headers });
  if (!res.ok) {
    // Best-effort: one issue's interactions failing to load shouldn't 502
    // the whole sync and wipe everyone else's Do list. Logged so a
    // persistent failure is still visible in the function's logs.
    console.error(`interactions ${issueId} ${res.status}: ${await res.text()}`);
    return false;
  }
  const list = await res.json();
  return (Array.isArray(list) ? list : []).some((i: IssueInteraction) =>
    i.status === "pending" &&
    (i.addresseeUserId === breeUserId || HUMAN_RESOLVER_POLICIES.has(i.effectiveResolverPolicy))
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Guarded by the same shared-secret pattern as dispatch-social-schedule —
  // this is a cron target, not a public endpoint.
  const secret = await getSecret(serviceClient(), "CLAUDE_WEBHOOK_SECRET");
  const supplied = req.headers.get("x-agent-secret") ?? new URL(req.url).searchParams.get("secret");
  if (!secret || supplied !== secret) return json({ error: "Unauthorized" }, 401);

  const sb = serviceClient();
  const readToken = await getSecret(sb, "paperclip_read_token");
  const breeUserId = await getSecret(sb, "paperclip_bree_user_id");
  if (!readToken) return json({ error: "paperclip_read_token is not set" }, 500);

  const headers = { Authorization: `Bearer ${readToken}` };
  const items: PendingItem[] = [];

  try {
    const approvalsRes = await fetch(
      `${PAPERCLIP_BASE}/api/companies/${COMPANY_ID}/approvals?status=pending`,
      { headers },
    );
    if (!approvalsRes.ok) throw new Error(`approvals ${approvalsRes.status}: ${await approvalsRes.text()}`);
    const approvals = await approvalsRes.json();
    const list = Array.isArray(approvals) ? approvals : approvals.items ?? [];
    for (const a of list) {
      const identifier = a.issueIdentifier ?? a.issue?.identifier ?? null;
      items.push({
        id: String(a.id),
        kind: "approval",
        title: a.title ?? a.summary ?? "Pending approval",
        issue_identifier: identifier,
        issue_url: issueLink(identifier),
        raw: a,
      });
    }
  } catch (e) {
    return json({ error: `approvals sync failed: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }

  if (breeUserId) {
    try {
      const inboxRes = await fetch(
        `${PAPERCLIP_BASE}/api/agents/me/inbox/mine?userId=${encodeURIComponent(breeUserId)}`,
        { headers },
      );
      if (!inboxRes.ok) throw new Error(`inbox ${inboxRes.status}: ${await inboxRes.text()}`);
      const inbox = await inboxRes.json();
      const list: InboxIssue[] = Array.isArray(inbox) ? inbox : inbox.items ?? [];
      for (const i of list) {
        if (SKIP_STATUSES.has(i.status)) continue;
        const identifier = i.identifier ?? null;

        if (i.assigneeUserId === breeUserId) {
          if (!BREE_ASSIGNED_STATUSES.has(i.status)) continue;
          items.push({
            id: String(i.id),
            kind: "interaction",
            title: i.title ?? i.summary ?? "Needs your input",
            issue_identifier: identifier,
            issue_url: issueLink(identifier),
            raw: i,
          });
          continue;
        }

        // Not hers by assignment — the only other way it belongs on her Do
        // list is a live, unresolved interaction that specifically needs a
        // human. See the CRE-393 round 2 header comment for why this
        // replaced the old reviewAttention/blockerAttention "stalled" check.
        if (!(await hasOpenInteractionForBree(headers, i.id, breeUserId))) continue;
        items.push({
          id: String(i.id),
          kind: "interaction_stalled",
          title: i.title ?? i.summary ?? "Needs your input",
          issue_identifier: identifier,
          issue_url: issueLink(identifier),
          raw: i,
        });
      }
    } catch (e) {
      return json({ error: `inbox sync failed: ${e instanceof Error ? e.message : String(e)}` }, 502);
    }
  }

  if (items.length) {
    const { error } = await sb.from("paperclip_pending_items").upsert(
      items.map((i) => ({ ...i, synced_at: new Date().toISOString() })),
      { onConflict: "id" },
    );
    if (error) return json({ error: error.message }, 500);
  }

  // Stale-row cleanup: anything not seen this run is resolved/expired on the
  // Paperclip side (or no longer needs Bree) and should drop off "Do".
  const seenIds = items.map((i) => i.id);
  if (seenIds.length) {
    await sb.from("paperclip_pending_items").delete().not("id", "in", `(${seenIds.map((id) => `"${id}"`).join(",")})`);
  } else {
    await sb.from("paperclip_pending_items").delete().neq("id", "");
  }

  return json({ ok: true, synced: items.length });
});
