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
// CRE-393: the actionable-status filter alone was never the right gate — it
// let through every issue an agent merely had `in_progress`/`in_review`
// *responsible* to Bree, whether or not she actually had anything to do.
// Confirmed live on CRE-393 against the six rows Bree named as correct and
// the eleven she named as noise: the right signal is each issue's own
// `assigneeUserId` (literally hers) or its server-computed `reviewAttention`
// / `blockerAttention` state — "stalled" means nothing (no participant,
// interaction, approval, wake, or active run) owns the next action, which is
// exactly the case that needs a human; "covered" means an agent interaction
// already owns it, so it stays off her list. Verified against
// inbox/mine's own embedded reviewAttention/blockerAttention fields — no
// second API call per issue needed. `isUnreadForMe` is still not used here:
// it is scoped to the calling agent identity, not the userId query param.
//
// Kind is now three-way, not two: "interaction" (assigneeUserId is Bree —
// hers to check off), "interaction_stalled" (agent-owned, nothing covering
// it — she needs to see it, but checking it off would wrongly tell an agent
// its own work is done, so the frontend renders no checkbox for this kind —
// see needsYouNow.ts/needsYouRows.ts), and "approval" (unchanged, from the
// /approvals endpoint).
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

interface AttentionState { state: "none" | "covered" | "stalled"; [k: string]: unknown }
interface InboxIssue {
  id: string;
  identifier: string | null;
  title: string | null;
  summary?: string | null;
  status: string;
  assigneeUserId: string | null;
  reviewAttention?: AttentionState | null;
  blockerAttention?: AttentionState | null;
}

function issueLink(identifier: string | null): string | null {
  return identifier ? `${PAPERCLIP_BASE}/CRE/issues/${identifier}` : null;
}

// Needs-Bree gate for one Paperclip issue responsible to her. See the
// CRE-393 header comment above for how this was derived and verified.
function needsBree(issue: InboxIssue, breeUserId: string): boolean {
  if (issue.assigneeUserId === breeUserId) return true;
  if (issue.reviewAttention?.state === "stalled") return true;
  if (issue.blockerAttention?.state === "stalled") return true;
  return false;
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
      const ACTIONABLE_STATUSES = new Set(["in_progress", "in_review", "blocked", "todo"]);
      for (const i of list) {
        if (!ACTIONABLE_STATUSES.has(i.status)) continue;
        if (!needsBree(i, breeUserId)) continue;
        const identifier = i.identifier ?? null;
        items.push({
          id: String(i.id),
          kind: i.assigneeUserId === breeUserId ? "interaction" : "interaction_stalled",
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
