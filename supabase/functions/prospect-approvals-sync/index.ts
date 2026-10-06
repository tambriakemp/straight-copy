// Ingest + decision read-back for Nicole's weekly prospect-outreach batches
// (CRE-244). Replaces the standalone /var/www/approvals Python server on the
// Paperclip VPS. Auth is a shared secret, same shape as post-brief: the
// expected value lives in app_secrets.prospect_approvals_ingest_secret — a
// row the Approvals tab's Settings card lets Bree generate/show/rotate
// herself, rather than a Supabase Function env var nobody but Lovable can
// set.
//
// action "push": upsert prospects into a batch. Re-pushing an existing
// (batch, slug) row updates its content fields only — it never touches
// status/notes/decided_at/decided_by, so a re-push can't clobber a decision
// Bree already made.
// action "decisions": read back rows Nicole needs for her side of the
// pipeline (approved/rejected only, optionally filtered by batch and/or an
// "updated since" cursor for polling). Each decision now also carries its
// full feedback history (CRE-303 follow-up, Bree 11:01 AM CT Oct 6) — every
// round Bree has left on this prospect, newest first, with its own
// attachments as short-lived signed URLs (the bucket is private, so a bare
// storage path is useless to Nicole's side) and the latest round flagged.
// History is keyed by prospect_key (the slug with any trailing -vN
// stripped), not by this row's own id, so a rebuild that lands as a new row
// (acme-roofing-v2) still carries the rounds left on acme-roofing (v1).
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
  const results: { slug: string; id?: string; error?: string }[] = [];

  for (const p of b.prospects) {
    const { data: existing } = await sb
      .from("prospect_approvals")
      .select("id")
      .eq("batch", b.batch)
      .eq("slug", p.slug)
      .maybeSingle();

    const content = {
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

    if (existing) {
      const { error } = await sb.from("prospect_approvals").update(content).eq("id", existing.id);
      if (error) {
        results.push({ slug: p.slug, error: error.message });
        continue;
      }
      results.push({ slug: p.slug, id: existing.id as string });
    } else {
      const { data: inserted, error } = await sb
        .from("prospect_approvals")
        .insert({ ...content, batch: b.batch, slug: p.slug, status: "pending" })
        .select("id")
        .single();
      if (error) {
        results.push({ slug: p.slug, error: error.message });
        continue;
      }
      results.push({ slug: p.slug, id: inserted.id as string });
    }
  }

  const failed = results.filter((r) => r.error);
  return json({ ok: failed.length === 0, results }, failed.length ? 207 : 200);
});
