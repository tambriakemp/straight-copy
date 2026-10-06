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
// "updated since" cursor for polling).
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

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
    return json({ decisions: data ?? [] }, 200);
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
