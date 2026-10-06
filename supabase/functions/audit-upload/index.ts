// Ingest endpoint for the site-audit tool's publish step (CRE-225). Auth is
// a shared secret, same shape as post-brief's x-agent-secret, but checked
// against app_secrets.audit_upload_secret — a row the Briefs tab's Settings
// card lets Bree generate/view/rotate herself, rather than a Supabase
// Function env var nobody but Lovable can set.
//
// Upserts by slug: a client_audits row that doesn't exist yet is created
// (with a generated password); one that already exists keeps its password
// untouched, so a re-audit never resets what the client was given. Only one
// report.html is kept per slug — a re-audit overwrites the storage object
// and last_audited_at, it does not version. See CRE-225 for why: the table
// this builds on (CRE-235, PR #62) is already a flat one-row-per-client
// shape, not the versioned table the original CRE-225 plan sketched, and
// changing that now would mean a second, conflicting migration on top of
// what's already live.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-audit-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

const WORDS = ["copper", "harbor", "willow", "cedar", "quartz", "amber", "maple", "ridge", "violet", "basin", "linen", "clover"];
function randomPassword(): string {
  const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)];
  const digits = Math.floor(10 + Math.random() * 89);
  return `${pick()}-${pick()}-${digits}`;
}

function cleanSlug(raw: string): string | null {
  const s = String(raw || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$/.test(s)) return null;
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const sb = serviceClient();

  const { data: secretRow } = await sb
    .from("app_secrets").select("value").eq("key", "audit_upload_secret").maybeSingle();
  const supplied = req.headers.get("x-audit-key");
  if (!secretRow?.value || supplied !== secretRow.value) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "body must be valid JSON" }, 400);
  }
  const b = body as { slug?: string; client_name?: string; html?: string; audited_at?: string };

  const slug = cleanSlug(b.slug ?? "");
  if (!slug) return json({ error: "slug must be 2-80 chars, lowercase letters/digits/hyphens, no leading/trailing hyphen" }, 400);
  if (typeof b.html !== "string" || !b.html.trim()) return json({ error: "html must be a non-empty string" }, 400);
  if (typeof b.client_name !== "string" || !b.client_name.trim()) return json({ error: "client_name required" }, 400);
  const auditedAt = b.audited_at && !isNaN(Date.parse(b.audited_at)) ? new Date(b.audited_at).toISOString() : new Date().toISOString();

  const storagePath = `${slug}/report.html`;
  const up = await sb.storage.from("audit-reports").upload(storagePath, new TextEncoder().encode(b.html), {
    contentType: "text/html; charset=utf-8",
    upsert: true,
  });
  if (up.error) return json({ error: `storage upload failed: ${up.error.message}` }, 500);

  const siteUrl = Deno.env.get("SITE_URL") || "https://cre8visions.com";
  const reportUrl = `${siteUrl}/audit/${slug}`;

  const { data: existing } = await sb.from("client_audits").select("id").eq("slug", slug).maybeSingle();

  if (existing) {
    const { data, error } = await sb
      .from("client_audits")
      .update({ client_name: b.client_name, storage_path: storagePath, last_audited_at: auditedAt, status: "ready", report_url: reportUrl })
      .eq("slug", slug)
      .select("id, slug, status")
      .single();
    if (error) return json({ error: error.message }, 500);
    return json({ ...data, created: false });
  }

  const { data, error } = await sb
    .from("client_audits")
    .insert({
      client_name: b.client_name,
      slug,
      password: randomPassword(),
      storage_path: storagePath,
      last_audited_at: auditedAt,
      status: "ready",
      report_url: reportUrl,
    })
    .select("id, slug, status")
    .single();
  if (error) return json({ error: error.message }, 500);
  return json({ ...data, created: true }, 201);
});
