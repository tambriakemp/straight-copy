// Ingest + decision read-back for Nicole's weekly prospect-outreach batches
// (CRE-244). Replaces the standalone /var/www/approvals Python server on the
// Paperclip VPS. Auth is a shared secret, same shape as post-brief: the
// expected value lives in app_secrets.prospect_approvals_ingest_secret — a
// row the Approvals tab's Settings card lets Bree generate/show/rotate
// herself, rather than a Supabase Function env var nobody but Lovable can
// set.
//
// action "push": upsert prospects into a batch, one row per prospect. Keyed
// primarily on (batch, slug); when a push's slug is new but it is either
// (a) tagged with `rebuilt_from_approval_id`, or (b) shares the same base
// slug (the part before a trailing -vN) as an existing row in the batch, the
// push UPDATES that existing row in place instead of inserting a second one
// — new slug, new preview/content fields, same row, same id. Re-pushing an
// existing (batch, slug) row (no version change) likewise updates content
// fields only — it never touches status/notes/decided_at/decided_by on its
// own, so a re-push can't clobber a decision Bree already made.
//
// CRE-413 bug fix (2026-10-12, Bree via comment on CRE-413): the original
// CRE-413 build inserted a brand-new row for a rebuild (tagging it
// `rebuilt_from` and separately flipping the OLD row's rebuild_status) —
// that put two rows on /admin/approvals for one prospect (west-pool-service
// bug, CRE-417). Bree wants exactly one row per prospect, updated in place:
// new preview URL, status back to 'pending' for her review, rebuild_status
// 'ready_for_review', and a `rebuild_round` counter on that same row so the
// history is visible without a second row. Fixed below — see
// `resolveTargetRow`. The round-by-round notes/attachments history is
// unaffected either way: it's already kept in prospect_approval_feedback,
// keyed by prospect_key (the slug with any trailing -vN stripped), not by
// this row's own id or count.
//
// action "decisions": read back rows Nicole needs for her side of the
// pipeline (approved/rejected only, optionally filtered by batch and/or an
// "updated since" cursor for polling). Each decision now also carries its
// full feedback history (CRE-303 follow-up, Bree 11:01 AM CT Oct 6) — every
// round Bree has left on this prospect, newest first, with its own
// attachments as short-lived signed URLs (the bucket is private, so a bare
// storage path is useless to Nicole's side) and the latest round flagged.
// History is keyed by prospect_key (the slug with any trailing -vN
// stripped), not by this row's own id — unaffected by the rebuild-in-place
// fix above, since there's still exactly one prospect_key per prospect.
//
// CRE-413 follow-up bug fix (2026-10-12, caller sends a partial rebuild
// payload): both UPDATE branches used to rebuild the full content object
// from the incoming prospect every time, defaulting any field the caller
// didn't send (contact_email, hook, trade, city, ...) to null. A rebuild
// push that only knows the new preview_url would silently null out the
// prospect's real contact/outreach fields on every update. Fixed by
// splitting into `insertContent` (full, null-defaulted — only safe for a
// brand-new row with nothing to preserve) and `patchContent` (sparse — only
// the keys the caller actually sent), used by the two UPDATE branches.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

const ATTACHMENT_BUCKET = "prospect-approval-attachments";
const SIGNED_URL_TTL_SECONDS = 600; // 10 minutes — just long enough for a read-back to download them

// Keep in sync with prospectKeyAndVersion in src/pages/admin/Approvals.tsx —
// both sides must derive the same key for the same slug, or a round written
// from the admin UI won't group with the history Nicole reads back.
function prospectKeyAndVersion(slug: string): { prospectKey: string; version: string } {
  const m = slug.match(/^(.*)-v(\d+)$/i);
  if (m) return { prospectKey: m[1], version: `v${m[2]}` };
  return { prospectKey: slug, version: "v1" };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-agent-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

interface ProspectInput {
  slug: string;
  company: string;
  city?: string | null;
  trade?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  hook?: string | null;
  current_site_url?: string | null;
  preview_url?: string | null;
  preview_image_url?: string | null;
  email_subject?: string | null;
  email_body?: string | null;
  rebuilt_from_approval_id?: string | null;
}

const OPTIONAL_STRING_FIELDS = [
  "city",
  "trade",
  "contact_name",
  "contact_email",
  "hook",
  "current_site_url",
  "preview_url",
  "preview_image_url",
  "email_subject",
  "email_body",
  "rebuilt_from_approval_id",
] as const;

function validateProspect(p: unknown): string | null {
  if (!p || typeof p !== "object") return "each prospect must be an object";
  const row = p as Record<string, unknown>;
  if (typeof row.slug !== "string" || !row.slug.trim()) {
    return "slug must be a non-empty string";
  }
  if (typeof row.company !== "string" || !row.company.trim()) {
    return "company must be a non-empty string";
  }
  for (const key of OPTIONAL_STRING_FIELDS) {
    const v = row[key];
    if (v !== undefined && v !== null && typeof v !== "string") {
      return `${key} must be a string or null`;
    }
  }
  return null;
}

function validatePush(body: unknown): string | null {
  if (!body || typeof body !== "object") return "body must be an object";
  const b = body as Record<string, unknown>;
  if (typeof b.batch !== "string" || !b.batch.trim()) {
    return "batch must be a non-empty string";
  }
  if (!Array.isArray(b.prospects) || !b.prospects.length) {
    return "prospects must be a non-empty array";
  }
  for (const p of b.prospects as unknown[]) {
    const problem = validateProspect(p);
    if (problem) return problem;
  }
  return null;
}

interface AttachmentRow {
  feedback_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

interface FeedbackRow {
  id: string;
  prospect_key: string;
  round: number;
  preview_version: string;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

async function signedUrlsByPath(sb: SupabaseClient, paths: string[]) {
  if (!paths.length) return new Map<string | null, string>();
  const { data: signed } = await sb.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  return new Map<string | null, string>(
    (signed ?? []).map((s: { path: string | null; signedUrl: string }) => [s.path, s.signedUrl]),
  );
}

// Every feedback round for each of the given prospect_keys, newest round
// first, each carrying its own attachments and an is_latest flag on the
// highest round number for that key.
async function feedbackByProspectKey(sb: SupabaseClient, prospectKeys: string[]) {
  const byKey = new Map<string, Array<{
    round: number;
    preview_version: string;
    notes: string | null;
    created_at: string;
    created_by: string | null;
    is_latest: boolean;
    attachments: Array<{
      file_name: string;
      mime_type: string | null;
      size_bytes: number | null;
      created_at: string;
      signed_url: string | null;
    }>;
  }>>();
  if (!prospectKeys.length) return byKey;

  const { data: feedbackRows, error } = await sb
    .from("prospect_approval_feedback")
    .select("id, prospect_key, round, preview_version, notes, created_at, created_by")
    .in("prospect_key", prospectKeys)
    .order("round", { ascending: false });
  if (error || !feedbackRows?.length) return byKey;

  const rounds = feedbackRows as FeedbackRow[];
  const feedbackIds = rounds.map((r) => r.id);
  const { data: attachmentRows } = await sb
    .from("prospect_approval_attachments")
    .select("feedback_id, storage_path, file_name, mime_type, size_bytes, created_at")
    .in("feedback_id", feedbackIds);
  const attachments = (attachmentRows ?? []) as AttachmentRow[];
  const signedByPath = await signedUrlsByPath(sb, attachments.map((a) => a.storage_path));

  const attachmentsByFeedback = new Map<string, AttachmentRow[]>();
  for (const a of attachments) {
    const list = attachmentsByFeedback.get(a.feedback_id) ?? [];
    list.push(a);
    attachmentsByFeedback.set(a.feedback_id, list);
  }

  const maxRoundByKey = new Map<string, number>();
  for (const r of rounds) {
    maxRoundByKey.set(r.prospect_key, Math.max(r.round, maxRoundByKey.get(r.prospect_key) ?? 0));
  }

  for (const r of rounds) {
    const list = byKey.get(r.prospect_key) ?? [];
    const roundAttachments = (attachmentsByFeedback.get(r.id) ?? []).map((a) => ({
      file_name: a.file_name,
      mime_type: a.mime_type,
      size_bytes: a.size_bytes,
      created_at: a.created_at,
      signed_url: signedByPath.get(a.storage_path) ?? null,
    }));
    list.push({
      round: r.round,
      preview_version: r.preview_version,
      notes: r.notes,
      created_at: r.created_at,
      created_by: r.created_by,
      is_latest: r.round === maxRoundByKey.get(r.prospect_key),
      attachments: roundAttachments,
    });
    byKey.set(r.prospect_key, list);
  }
  return byKey;
}

interface ExistingRow {
  id: string;
  slug: string;
  status: string;
  rebuild_round: number | null;
}

// Find the row a push with a *new* slug should land on instead of inserting
// a second one for the same prospect. Two ways in:
//   1. `rebuilt_from_approval_id` names the row directly — it must still be
//      in this batch and still 'rejected' (the state Bree's "Sent back"
//      leaves it in), otherwise it's stale/wrong and we fall through.
//   2. No id given (or it didn't resolve): fall back to matching on the
//      base slug — prospectKeyAndVersion strips a trailing -vN, so
//      "west-pool-service-v2" and "west-pool-service" share a base.
async function resolveTargetRow(
  sb: SupabaseClient,
  batch: string,
  slug: string,
  rebuiltFromApprovalId: string | null | undefined,
): Promise<ExistingRow | null> {
  if (rebuiltFromApprovalId) {
    const { data } = await sb
      .from("prospect_approvals")
      .select("id, slug, status, rebuild_round")
      .eq("id", rebuiltFromApprovalId)
      .eq("batch", batch)
      .eq("status", "rejected")
      .maybeSingle();
    if (data) return data as ExistingRow;
  }

  const { prospectKey } = prospectKeyAndVersion(slug);
  const { data: candidates } = await sb
    .from("prospect_approvals")
    .select("id, slug, status, rebuild_round")
    .eq("batch", batch)
    .ilike("slug", `${prospectKey}%`);
  for (const candidate of (candidates ?? []) as ExistingRow[]) {
    if (prospectKeyAndVersion(candidate.slug).prospectKey === prospectKey) {
      return candidate;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const sb = serviceClient();

  const { data: secretRow } = await sb
    .from("app_secrets")
    .select("value")
    .eq("key", "prospect_approvals_ingest_secret")
    .maybeSingle();
  const supplied = req.headers.get("x-agent-secret");
  if (!secretRow?.value || supplied !== secretRow.value) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "body must be valid JSON" }, 400);
  }

  const action = (body as Record<string, unknown> | null)?.action ?? "push";

  if (action === "decisions") {
    const b = body as { batch?: string; since?: string };
    let query = sb
      .from("prospect_approvals")
      .select("id, batch, slug, company, status, notes, decided_at, decided_by, updated_at")
      .neq("status", "pending")
      .order("updated_at", { ascending: false });
    if (b.batch) query = query.eq("batch", b.batch);
    if (b.since) query = query.gt("updated_at", b.since);
    const { data, error } = await query;
    if (error) return json({ error: error.message }, 500);
    const decisions = data as Array<{ slug: string }> ?? [];
    const prospectKeys = Array.from(new Set(decisions.map((d) => prospectKeyAndVersion(d.slug).prospectKey)));
    const feedbackByKey = await feedbackByProspectKey(sb, prospectKeys);
    return json({
      decisions: decisions.map((d) => ({
        ...d,
        feedback: feedbackByKey.get(prospectKeyAndVersion(d.slug).prospectKey) ?? [],
      })),
    }, 200);
  }

  if (action !== "push") {
    return json({ error: "action must be 'push' or 'decisions'" }, 400);
  }

  const problem = validatePush(body);
  if (problem) return json({ error: problem }, 400);

  const b = body as { batch: string; prospects: ProspectInput[] };
  const results: { slug: string; id?: string; merged_into?: string; error?: string }[] = [];

  for (const p of b.prospects) {
    const { data: existing } = await sb
      .from("prospect_approvals")
      .select("id")
      .eq("batch", b.batch)
      .eq("slug", p.slug)
      .maybeSingle();

    // Full defaults (missing field -> null) — only correct for a brand-new
    // row, where there is no prior value to clobber.
    const insertContent = {
      company: p.company,
      city: p.city ?? null,
      trade: p.trade ?? null,
      contact_name: p.contact_name ?? null,
      contact_email: p.contact_email ?? null,
      hook: p.hook ?? null,
      current_site_url: p.current_site_url ?? null,
      preview_url: p.preview_url ?? null,
      preview_image_url: p.preview_image_url ?? null,
      email_subject: p.email_subject ?? null,
      email_body: p.email_body ?? null,
      updated_at: new Date().toISOString(),
    };

    // Sparse patch for the two UPDATE branches below: only the keys the
    // caller actually sent. A caller that only knows the new preview_url
    // (e.g. a rebuild push) must not silently null out contact_email,
    // hook, etc. that it never had and never meant to touch.
    const patchContent: Record<string, unknown> = {
      company: p.company,
      updated_at: new Date().toISOString(),
    };
    for (const key of OPTIONAL_STRING_FIELDS) {
      if (key === "rebuilt_from_approval_id") continue;
      if (p[key] !== undefined) patchContent[key] = p[key];
    }

    if (existing) {
      // Exact (batch, slug) match — plain re-push, e.g. editing content
      // without a version change. Never touches status/notes/decided_at.
      const { error } = await sb.from("prospect_approvals").update(patchContent).eq("id", existing.id);
      if (error) {
        results.push({ slug: p.slug, error: error.message });
        continue;
      }
      results.push({ slug: p.slug, id: existing.id as string });
      continue;
    }

    const target = await resolveTargetRow(sb, b.batch, p.slug, p.rebuilt_from_approval_id);

    if (target) {
      // Rebuild landing on a new slug (e.g. west-pool-service -> -v2): one
      // row, updated in place — new slug, new content, back in Bree's
      // queue. Only flip status/rebuild_status when the target was actually
      // 'rejected' (a real rebuild cycle); a same-base-slug match on a
      // pending/approved row just means the content/slug changed, so leave
      // its decision alone, same as the exact-match branch above.
      const wasRejected = target.status === "rejected";
      const update: Record<string, unknown> = { ...patchContent, slug: p.slug };
      if (wasRejected) {
        update.status = "pending";
        update.rebuild_status = "ready_for_review";
        update.rebuild_stuck_reason = null;
        update.rebuild_round = (target.rebuild_round ?? 0) + 1;
      }
      const { error } = await sb.from("prospect_approvals").update(update).eq("id", target.id);
      if (error) {
        results.push({ slug: p.slug, error: error.message });
        continue;
      }
      results.push({ slug: p.slug, id: target.id, merged_into: target.id });
      continue;
    }

    // Truly new prospect — never seen this batch+base-slug before.
    const { data: inserted, error } = await sb
      .from("prospect_approvals")
      .insert({
        ...insertContent,
        batch: b.batch,
        slug: p.slug,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) {
      results.push({ slug: p.slug, error: error.message });
      continue;
    }
    results.push({ slug: p.slug, id: inserted.id as string });
  }

  const failed = results.filter((r) => r.error);
  return json({ ok: failed.length === 0, results }, failed.length ? 207 : 200);
});
