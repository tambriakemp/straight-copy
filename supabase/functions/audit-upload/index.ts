// Shared-secret ingest for the site-audit tool (CRE-225). A headless VPS
// script has no browser session, so this is gated by a secret stored in
// app_secrets.audit_upload_key -- not a Supabase Function env var --
// checked inside the function. Same pattern as post-brief (CRE-235).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const providedKey = req.headers.get("x-audit-key") ?? "";
    const { data: secretRow } = await admin
      .from("app_secrets").select("value").eq("key", "audit_upload_key").maybeSingle();
    const expectedKey = secretRow?.value ?? "";
    if (!expectedKey || providedKey !== expectedKey) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const slug = String(body?.slug ?? "");
    const html = String(body?.html ?? "");
    const auditedAt = String(body?.audited_at ?? "");
    if (!slug || !html || !auditedAt) {
      return new Response(JSON.stringify({ error: "slug, html and audited_at are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Identity creation stays admin-only (via /admin/audits) -- an upload
    // never auto-creates a client row, it only adds a version to one that
    // already exists.
    const { data: clientAudit, error: findErr } = await admin
      .from("client_audits").select("id, slug").eq("slug", slug).maybeSingle();
    if (findErr) throw findErr;
    if (!clientAudit) {
      return new Response(
        JSON.stringify({ error: "unknown slug -- create the client in /admin/audits first" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const storagePath = `${slug}/${auditedAt}.html`;
    const { error: upErr } = await admin.storage
      .from("audit-reports")
      .upload(storagePath, new TextEncoder().encode(html), {
        contentType: "text/html; charset=utf-8",
        upsert: true,
      });
    if (upErr) throw upErr;

    const { error: versionErr } = await admin
      .from("audit_report_versions")
      .insert({ client_audit_id: clientAudit.id, storage_path: storagePath, audited_at: auditedAt });
    if (versionErr) throw versionErr;

    // report_url stays the human-facing link /admin/audits already renders
    // as a clickable name (<a href={row.report_url}>) -- audit-serve itself
    // resolves "current" by querying audit_report_versions for the latest
    // row, not from this column.
    const { error: updateErr } = await admin
      .from("client_audits")
      .update({ report_url: `/audit/${slug}`, status: "ready" })
      .eq("id", clientAudit.id);
    if (updateErr) throw updateErr;

    return new Response(JSON.stringify({ ok: true, storage_path: storagePath }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("audit-upload error", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
