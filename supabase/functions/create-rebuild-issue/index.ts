// CRE-413: the instant a prospect preview flips to 'rejected', the
// prospect_approvals_fire_rebuild_issue trigger (see the migration in the
// same PR) calls this function via pg_net with { approval_id }. It creates a
// '[Rebuild] <company> - <slug>' Paperclip issue assigned to Camille (Web
// Designer, the design critic gate owner — Bree's decision Oct 11, so the
// rebuild has exactly one owner instead of Nicole and Camille both touching
// it) and stores the issue id back on the row so Bree can see rebuild status
// on /admin/approvals (wired in a follow-up PR after the Oct 12 9 AM CT send).
//
// Idempotent by construction: the only way to proceed past the atomic claim
// below is to be the caller that flips rebuild_issue_id from NULL to a
// placeholder in the same statement that reads it, so a duplicate trigger
// fire or a manual re-run for the same approval_id always no-ops as
// { skipped: true } rather than creating a second issue.
//
// Auth uses _shared/webhook-auth.ts's hasAgentSecret (CLAUDE_WEBHOOK_SECRET,
// the canonical shared-secret check per CRE-249) — the same value the
// pg_net trigger sends, sourced from the paperclip_pending_sync_secret Vault
// entry that's already kept equal to it by convention (see the cron
// migrations).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";
import { hasAgentSecret } from "../_shared/webhook-auth.ts";

const ATTACHMENT_BUCKET = "prospect-approval-attachments";
// Long TTL deliberately, unlike prospect-approvals-sync's 10-minute signed
// URLs: those are consumed immediately by a live poll, but a link embedded
// in a Paperclip issue description needs to still work whenever Camille
// actually reads the issue, which could be hours later.
const ISSUE_LINK_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

const PAPERCLIP_BASE = "https://paperclip.cre8visions.com";
const COMPANY_ID = "62e315f3-8d2c-49c9-8a67-00f151290b5c";
// Camille, Web Designer — rebuild owner per Bree's decision Oct 11, 2026
// (relayed by Ara on CRE-413): she rebuilds, re-passes her own design critic
// rubric (CRE-415), resubmits, then closes the card herself. Was Nicole.
const CAMILLE_AGENT_ID = "4b4fb790-6e52-48f8-8a97-520901170f7f";

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

// Keep in sync with prospectKeyAndVersion in src/pages/admin/Approvals.tsx
// and supabase/functions/prospect-approvals-sync/index.ts.
function prospectKeyAndVersion(slug: string): { prospectKey: string; version: string } {
  const m = slug.match(/^(.*)-v(\d+)$/i);
  if (m) return { prospectKey: m[1], version: `v${m[2]}` };
  return { prospectKey: slug, version: "v1" };
}

interface ApprovalRow {
  id: string;
  batch: string;
  slug: string;
  company: string;
  preview_url: string | null;
  status: string;
  rebuild_issue_id: string | null;
}

interface FeedbackRound {
  id: string;
  notes: string | null;
  round: number;
  created_by: string | null;
}

async function latestFeedback(sb: SupabaseClient, prospectKey: string): Promise<FeedbackRound | null> {
  const { data } = await sb
    .from("prospect_approval_feedback")
    .select("id, notes, round, created_by")
    .eq("prospect_key", prospectKey)
    .order("round", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as FeedbackRound | null) ?? null;
}

async function attachmentLinks(sb: SupabaseClient, feedbackId: string): Promise<string[]> {
  const { data: rows } = await sb
    .from("prospect_approval_attachments")
    .select("storage_path, file_name")
    .eq("feedback_id", feedbackId);
  const attachments = (rows ?? []) as { storage_path: string; file_name: string }[];
  if (!attachments.length) return [];

  const { data: signed } = await sb.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrls(attachments.map((a) => a.storage_path), ISSUE_LINK_TTL_SECONDS);
  const urlByPath = new Map<string | null, string>(
    (signed ?? []).map((s: { path: string | null; signedUrl: string }) => [s.path, s.signedUrl]),
  );
  return attachments.map((a) => `- [${a.file_name}](${urlByPath.get(a.storage_path) ?? "#"})`);
}

function buildDescription(row: ApprovalRow, feedback: FeedbackRound | null, attachmentLines: string[]): string {
  const parts = [
    `**Prospect:** ${row.company} (\`${row.slug}\`)`,
    `**Batch:** ${row.batch}`,
    row.preview_url ? `**Preview:** ${row.preview_url}` : null,
    "",
    "**Bree's note:**",
    feedback?.notes?.trim() ? feedback.notes.trim() : "_(no note left — check the approvals page attachments/history)_",
  ];
  if (attachmentLines.length) {
    parts.push("", "**Attachments:**", ...attachmentLines);
  }
  parts.push(
    "",
    "**Camille, do this:**",
    "1. Rebuild this preview.",
    "2. Pass it against your own design critic rubric (CRE-415) before resubmitting — don't send Bree anything that wouldn't pass your own gate.",
    `3. Resubmit through prospect-approvals-sync's push action with \`rebuilt_from_approval_id: "${row.id}"\` — slug can be the new version (e.g. \`-v2\`), that updates this exact row in place (new preview URL, back to pending, rebuild_status -> ready_for_review). It will not create a second row.`,
    "4. Mark this card done once step 3 is confirmed. If you get stuck, set it blocked with the specific reason instead of leaving it open.",
  );
  return parts.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  if (!hasAgentSecret(req)) return json({ error: "Unauthorized" }, 401);
  const sb = serviceClient();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "body must be valid JSON" }, 400);
  }
  const approvalId = (body as { approval_id?: unknown } | null)?.approval_id;
  if (typeof approvalId !== "string" || !approvalId) {
    return json({ error: "approval_id must be a non-empty string" }, 400);
  }

  const apiKey = await getSecret(sb, "paperclip_board_api_key");
  if (!apiKey) return json({ error: "paperclip_board_api_key is not set" }, 500);

  // Atomic claim: only the caller that actually flips rebuild_issue_id from
  // NULL in this statement proceeds to create a Paperclip issue.
  const { data: claimed, error: claimErr } = await sb
    .from("prospect_approvals")
    .update({ rebuild_issue_id: "__creating__", updated_at: new Date().toISOString() })
    .eq("id", approvalId)
    .eq("status", "rejected")
    .is("rebuild_issue_id", null)
    .select("id, batch, slug, company, preview_url, status, rebuild_issue_id")
    .maybeSingle();
  if (claimErr) return json({ error: claimErr.message }, 500);
  if (!claimed) return json({ ok: true, skipped: true, reason: "already claimed or not rejected" }, 200);

  const row = claimed as ApprovalRow;
  const { prospectKey } = prospectKeyAndVersion(row.slug);
  const feedback = await latestFeedback(sb, prospectKey);
  const attachmentLines = feedback ? await attachmentLinks(sb, feedback.id) : [];

  try {
    const res = await fetch(`${PAPERCLIP_BASE}/api/companies/${COMPANY_ID}/issues`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `[Rebuild] ${row.company} - ${row.slug}`,
        description: buildDescription(row, feedback, attachmentLines),
        status: "todo",
        priority: "high",
        assigneeAgentId: CAMILLE_AGENT_ID,
      }),
    });
    if (!res.ok) throw new Error(`issues create ${res.status}: ${await res.text()}`);
    const issue = await res.json();
    const issueId = issue?.id;
    if (!issueId) throw new Error(`Paperclip response had no issue id: ${JSON.stringify(issue)}`);

    // CRE-393 bug fix: stash the human-readable identifier too (not just
    // the UUID above) -- a Decide card's task_ids only ever carries
    // "CRE-417", never the Paperclip row id, so without this decide-action
    // has no column to match the card back to this row on an Approve click.
    const { error: saveErr } = await sb
      .from("prospect_approvals")
      .update({ rebuild_issue_id: issueId, rebuild_issue_identifier: issue?.identifier ?? null, rebuild_status: "queued" })
      .eq("id", row.id);
    if (saveErr) throw new Error(`saving rebuild_issue_id: ${saveErr.message}`);

    return json({ ok: true, issue_id: issueId, identifier: issue?.identifier ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[create-rebuild-issue] approval ${row.id} failed: ${msg}`);
    // Release the claim so a retry (hourly sync or a manual re-run) can try again.
    await sb.from("prospect_approvals").update({ rebuild_issue_id: null }).eq("id", row.id);
    return json({ error: msg }, 500);
  }
});
