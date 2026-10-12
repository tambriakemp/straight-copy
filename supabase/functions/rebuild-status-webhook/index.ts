// CRE-413: optional receiver for a faster-than-hourly push on a rebuild
// issue's "rebuilding" / "stuck" state. Paperclip itself has no outbound
// webhook for issue status changes (see the CRE-413 migration's header
// comment), so nothing calls this today — it exists so Ara/Nicole can wire
// a proactive ping (e.g. Nicole's own routine calling this when she picks up
// a [Rebuild] issue, or sets it blocked with a reason) without needing a new
// PR. sync-rebuild-status's hourly poll is the real, self-sufficient
// fallback and will catch the same transitions within the hour regardless.
//
// Deliberately uses its own narrow secret (rebuild_status_webhook_secret,
// an app_secrets row the CRE-413 migration seeds with a random value)
// rather than CLAUDE_WEBHOOK_SECRET — least privilege: whoever holds this
// value can only push a rebuild-status update, not anything else guarded by
// the shared internal secret.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";
import { mapIssueStatus } from "../_shared/rebuildStatus.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const sb = serviceClient();
  const secret = await getSecret(sb, "rebuild_status_webhook_secret");
  const supplied = req.headers.get("x-agent-secret");
  if (!secret || supplied !== secret) return json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "body must be valid JSON" }, 400);
  }
  const b = body as { issue_id?: unknown; status?: unknown; comment?: unknown };
  if (typeof b.issue_id !== "string" || !b.issue_id) {
    return json({ error: "issue_id must be a non-empty string" }, 400);
  }
  if (typeof b.status !== "string" || !b.status) {
    return json({ error: "status must be a non-empty string" }, 400);
  }

  const { data: row, error: findErr } = await sb
    .from("prospect_approvals")
    .select("id, rebuild_status")
    .eq("rebuild_issue_id", b.issue_id)
    .maybeSingle();
  if (findErr) return json({ error: findErr.message }, 500);
  if (!row) return json({ ok: true, skipped: true, reason: "no row tracks this issue_id" }, 200);

  const update = mapIssueStatus(b.status, {
    alreadyReadyForReview: row.rebuild_status === "ready_for_review",
    blockedReason: typeof b.comment === "string" ? b.comment.slice(0, 500) : null,
  });

  const { error: updateErr } = await sb
    .from("prospect_approvals")
    .update(update)
    .eq("id", row.id);
  if (updateErr) return json({ error: updateErr.message }, 500);

  return json({ ok: true, ...update });
});
