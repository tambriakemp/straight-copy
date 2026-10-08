// Checking off a brief / Needs-you-now item from the Today page or
// /admin/briefs (CRE-335), instead of Bree telling Ara in chat.
//
// Writes brief_item_completions on the service role -- browsers can only
// read that table, see the admin-read-only policy in
// 20261008120000_brief_item_completions.sql -- then fires a webhook to
// Ara (the same Grok Bot agent-stuck endpoint named in every agent's
// AGENTS.md, CRE-310) and, when the item names a Paperclip issue, posts a
// short comment there so the owning agent wakes up too.
//
// This never resolves the underlying record (a Paperclip approval, an
// overdue invoice, a pending prospect batch, ...): per CRE-335 S4, a check
// on a data-driven Needs-you-now item is acknowledgement only. The source
// query keeps returning it; the frontend hides/strikes it by matching this
// table's item_id, and nothing here ever writes to paperclip_pending_items,
// project_invoices, prospect_approvals, or client_proposals.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { resolveCaller } from "../_shared/webhook-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

interface CompleteBody {
  action: "complete" | "undo";
  item_id: string;
  item_text?: string;
  issue_identifier?: string | null;
  brief_date?: string | null;
  note?: string | null;
}

function validate(body: unknown): string | null {
  if (!body || typeof body !== "object") return "body must be an object";
  const b = body as Record<string, unknown>;
  if (b.action !== "complete" && b.action !== "undo") return "action must be 'complete' or 'undo'";
  if (typeof b.item_id !== "string" || !b.item_id.trim()) return "item_id must be a non-empty string";
  if (b.action === "complete" && (typeof b.item_text !== "string" || !b.item_text.trim())) {
    return "item_text is required to complete an item";
  }
  if (b.issue_identifier !== undefined && b.issue_identifier !== null && typeof b.issue_identifier !== "string") {
    return "issue_identifier must be a string or null";
  }
  if (b.brief_date !== undefined && b.brief_date !== null && typeof b.brief_date !== "string") {
    return "brief_date must be a string or null";
  }
  if (b.note !== undefined && b.note !== null && typeof b.note !== "string") {
    return "note must be a string or null";
  }
  return null;
}

// Resolves a CRE-### identifier to the internal issue id the comments API
// needs. Tries the identifier directly first (several Paperclip routes
// accept either an id or an identifier); falls back to a company search
// when that 404s. Unverified against a live Paperclip instance as of this
// writing -- see the CRE-335 task comment.
async function resolvePaperclipIssueId(identifier: string, token: string): Promise<string | null> {
  const headers = { Authorization: `Bearer ${token}` };
  const direct = await fetch(`${PAPERCLIP_BASE}/api/issues/${identifier}`, { headers });
  if (direct.ok) {
    const data = await direct.json();
    return data?.id ?? data?.issue?.id ?? identifier;
  }
  const search = await fetch(
    `${PAPERCLIP_BASE}/api/companies/${COMPANY_ID}/issues?q=${encodeURIComponent(identifier)}`,
    { headers },
  );
  if (!search.ok) return null;
  const results = await search.json();
  const list = Array.isArray(results) ? results : results.items ?? [];
  const match = list.find((i: { identifier?: string }) => i.identifier === identifier);
  return match?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // Browser-initiated only -- this is Bree clicking a checkbox while
  // logged into the dashboard, not a cron job or another edge function.
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
  const b = body as CompleteBody;

  const sb = serviceClient();

  if (b.action === "undo") {
    const { error } = await sb.from("brief_item_completions").delete().eq("item_id", b.item_id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  const completedAt = new Date().toISOString();
  const { error: upsertError } = await sb.from("brief_item_completions").upsert({
    item_id: b.item_id,
    item_text: b.item_text,
    issue_identifier: b.issue_identifier ?? null,
    brief_date: b.brief_date ?? null,
    completed_by: caller.userId,
    note: b.note ?? null,
    completed_at: completedAt,
  });
  if (upsertError) return json({ error: upsertError.message }, 500);

  const warnings: string[] = [];

  // Webhook to Ara. Stored in app_secrets, not a real Supabase Function
  // secret, because this Lovable Cloud project gives us no path to set one
  // ourselves (CLAUDE.md, "no Supabase dashboard ... no service-role key ...
  // reachable" ) -- same reasoning as briefs_ingest_secret / paperclip_read_token
  // already in this table.
  const webhookUrl = await getSecret(sb, "ara_webhook_url");
  const webhookKey = await getSecret(sb, "ara_webhook_key");
  if (webhookUrl && webhookKey) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${webhookKey}` },
        body: JSON.stringify({
          type: "brief_item_done",
          item_id: b.item_id,
          item_text: b.item_text,
          issue: b.issue_identifier ?? null,
          brief_date: b.brief_date ?? null,
          completed_at: completedAt,
          note: b.note ?? null,
        }),
      });
      if (!res.ok) warnings.push(`ara webhook returned ${res.status}`);
    } catch (e) {
      warnings.push(`ara webhook failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    warnings.push("ara webhook not configured -- set ara_webhook_url and ara_webhook_key in Briefs > Settings");
  }

  // Wake the owning agent by commenting on the linked issue. Reuses the
  // same paperclip_read_token the pending-items sync already has (see the
  // CRE-335 task comment for why this needed a plain "works or doesn't",
  // not a guess).
  if (b.issue_identifier) {
    const token = await getSecret(sb, "paperclip_read_token");
    if (!token) {
      warnings.push("paperclip_read_token not set -- could not comment on the linked issue");
    } else {
      try {
        const issueId = await resolvePaperclipIssueId(b.issue_identifier, token);
        if (!issueId) {
          warnings.push(`could not resolve Paperclip issue ${b.issue_identifier}`);
        } else {
          const noteLine = b.note ? `\n- Note: ${b.note}` : "";
          const dateLine = b.brief_date ? `\n- Brief date: ${b.brief_date}` : "";
          const commentRes = await fetch(`${PAPERCLIP_BASE}/api/issues/${issueId}/comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              body: `Bree marked this done from the brief.\n\n- Brief item: ${b.item_text}${dateLine}${noteLine}`,
            }),
          });
          if (!commentRes.ok) {
            warnings.push(`paperclip comment failed: ${commentRes.status} ${await commentRes.text()}`);
          }
        }
      } catch (e) {
        warnings.push(`paperclip comment failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return json({ ok: true, warnings });
});
