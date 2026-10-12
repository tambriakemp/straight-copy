// CRE-413: hourly fallback (pg_cron, :22 past the hour) that is the real,
// self-sufficient mechanism for the "rebuilding" / "stuck" states — see the
// CRE-413 migration's header comment for why Paperclip has no outbound
// webhook to push these as they happen. 'queued' (on rejection) and
// 'ready_for_review' (on resubmit) are already pushed immediately by
// create-rebuild-issue and prospect-approvals-sync's push action
// respectively, so this poll mostly just confirms those are still accurate
// and catches the two states nothing else reports.
//
// Auth: _shared/webhook-auth.ts's hasAgentSecret (CLAUDE_WEBHOOK_SECRET),
// same shape as sync-paperclip-pending / sync-paperclip-project-tasks.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";
import { hasAgentSecret } from "../_shared/webhook-auth.ts";
import { mapIssueStatus } from "../_shared/rebuildStatus.ts";

const PAPERCLIP_BASE = "https://paperclip.cre8visions.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agent-secret",
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

async function getSecret(sb: SupabaseClient, key: string): Promise<string | null> {
  const { data } = await sb.from("app_secrets").select("value").eq("key", key).maybeSingle();
  return (data as { value?: string } | null)?.value ?? null;
}

interface TrackedRow {
  id: string;
  rebuild_issue_id: string;
  rebuild_status: string | null;
}

async function latestBlockedComment(apiKey: string, issueId: string): Promise<string | null> {
  try {
    const res = await fetch(`${PAPERCLIP_BASE}/api/issues/${issueId}/comments`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = await res.json();
    const comments: Array<{ body?: string }> = Array.isArray(body) ? body : body?.items ?? body?.data ?? [];
    const last = comments[comments.length - 1];
    return last?.body ? last.body.slice(0, 500) : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!hasAgentSecret(req)) return json({ error: "Unauthorized" }, 401);
  const sb = serviceClient();

  const apiKey = await getSecret(sb, "paperclip_board_api_key");
  if (!apiKey) return json({ error: "paperclip_board_api_key is not set" }, 500);

  // Self-heal a claim create-rebuild-issue never got to finish (e.g. the
  // function was killed mid-run) — otherwise a row stuck on the
  // "__creating__" sentinel can never be retried by anything. 10 minutes is
  // comfortably longer than any real create-rebuild-issue call should take.
  const staleCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: stuck } = await sb
    .from("prospect_approvals")
    .select("id")
    .eq("rebuild_issue_id", "__creating__")
    .lt("updated_at", staleCutoff);
  if (stuck?.length) {
    await sb.from("prospect_approvals").update({ rebuild_issue_id: null }).in(
      "id",
      stuck.map((r: { id: string }) => r.id),
    );
    console.warn(`[sync-rebuild-status] reset ${stuck.length} stale "__creating__" claim(s) for retry`);
  }

  const { data, error } = await sb
    .from("prospect_approvals")
    .select("id, rebuild_issue_id, rebuild_status")
    .not("rebuild_issue_id", "is", null)
    .neq("rebuild_issue_id", "__creating__");
  if (error) return json({ error: error.message }, 500);

  const rows = (data ?? []) as TrackedRow[];
  let updated = 0;
  const failures: { id: string; error: string }[] = [];

  for (const row of rows) {
    try {
      const res = await fetch(`${PAPERCLIP_BASE}/api/issues/${row.rebuild_issue_id}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`issue fetch ${res.status}: ${await res.text()}`);
      const issue = await res.json();
      const issueStatus = String(issue?.status ?? "");

      const blockedReason = issueStatus === "blocked"
        ? (issue?.unblockDescriptor?.action as string | undefined) ?? await latestBlockedComment(apiKey, row.rebuild_issue_id)
        : null;

      const update = mapIssueStatus(issueStatus, {
        alreadyReadyForReview: row.rebuild_status === "ready_for_review",
        blockedReason,
      });

      if (update.rebuild_status === row.rebuild_status) continue; // no change, skip the write

      const { error: upErr } = await sb.from("prospect_approvals").update(update).eq("id", row.id);
      if (upErr) throw new Error(`update: ${upErr.message}`);
      updated++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[sync-rebuild-status] approval ${row.id} (issue ${row.rebuild_issue_id}) failed: ${msg}`);
      failures.push({ id: row.id, error: msg });
    }
  }

  return json({ ok: failures.length === 0, tracked: rows.length, updated, failures });
});
