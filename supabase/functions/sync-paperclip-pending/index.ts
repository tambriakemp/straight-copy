// Polls Paperclip for what needs Bree right now (CRE-235 §4) and mirrors it
// into paperclip_pending_items for the Briefs tab's "Needs you now" panel.
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
// the ones that need her attention. Filtered below to the statuses that
// actually mean "needs you right now": in_review, blocked, todo.
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
  kind: "approval" | "interaction";
  title: string;
  issue_identifier: string | null;
  issue_url: string | null;
  raw: unknown;
}

function issueLink(identifier: string | null): string | null {
  return identifier ? `${PAPERCLIP_BASE}/CRE/issues/${identifier}` : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Guarded by the same shared-secret pattern as dispatch-social-schedule —
  // this is a cron target, not a public endpoint.
  const secret = Deno.env.get("CLAUDE_WEBHOOK_SECRET");
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
      const list = Array.isArray(inbox) ? inbox : inbox.items ?? [];
      const ACTIONABLE_STATUSES = new Set(["in_review", "blocked", "todo"]);
      for (const i of list) {
        if (!ACTIONABLE_STATUSES.has(i.status)) continue;
        const identifier = i.identifier ?? null;
        items.push({
          id: String(i.id),
          kind: "interaction",
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
  // Paperclip side and should drop off "Needs you now".
  const seenIds = items.map((i) => i.id);
  if (seenIds.length) {
    await sb.from("paperclip_pending_items").delete().not("id", "in", `(${seenIds.map((id) => `"${id}"`).join(",")})`);
  } else {
    await sb.from("paperclip_pending_items").delete().neq("id", "");
  }

  return json({ ok: true, synced: items.length });
});
