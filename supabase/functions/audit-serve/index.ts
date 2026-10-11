// Public endpoint for CRE-225's password-gated /audit/<slug> report viewer.
// POST checks the password (plaintext, by design -- client_audits.password
// must stay human-readable so Bree can always see it, not just reset it --
// see the briefs_core migration's own rationale) and rate limit, then issues
// a short-lived session row. GET with a valid token serves the most recent
// report version for that client.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    if (req.method === "POST") {
      const body = await req.json();
      const slug = String(body?.slug ?? "");
      const password = String(body?.password ?? "");
      if (!slug || !password) {
        return new Response(JSON.stringify({ error: "slug and password are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const ip = clientIp(req);
      const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
      const { count } = await admin
        .from("audit_login_attempts")
        .select("id", { count: "exact", head: true })
        .eq("slug", slug).eq("ip", ip).gte("created_at", windowStart);
      if ((count ?? 0) >= RATE_LIMIT_MAX_ATTEMPTS) {
        return new Response(JSON.stringify({ error: "too many attempts, try again later" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: clientAudit } = await admin
        .from("client_audits").select("id, password").eq("slug", slug).maybeSingle();
      if (!clientAudit || clientAudit.password !== password) {
        await admin.from("audit_login_attempts").insert({ slug, ip });
        return new Response(JSON.stringify({ error: "invalid password" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
      const { data: session, error: sessErr } = await admin
        .from("audit_sessions").insert({ slug, expires_at: expiresAt }).select("token").single();
      if (sessErr) throw sessErr;

      return new Response(JSON.stringify({ token: session.token }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "GET") {
      const url = new URL(req.url);
      const slug = url.searchParams.get("slug") ?? "";
      const token = url.searchParams.get("token") ?? "";
      if (!slug || !token) {
        return new Response(JSON.stringify({ error: "slug and token are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: session } = await admin
        .from("audit_sessions").select("expires_at, slug").eq("token", token).maybeSingle();
      if (!session || session.slug !== slug || new Date(session.expires_at) <= new Date()) {
        return new Response(JSON.stringify({ error: "invalid or expired session" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: clientAudit } = await admin
        .from("client_audits").select("id").eq("slug", slug).maybeSingle();
      if (!clientAudit) {
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: version } = await admin
        .from("audit_report_versions")
        .select("storage_path")
        .eq("client_audit_id", clientAudit.id)
        .order("audited_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!version) {
        return new Response(JSON.stringify({ error: "no report published yet" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: file, error: dlErr } = await admin.storage
        .from("audit-reports").download(version.storage_path);
      if (dlErr || !file) {
        return new Response(JSON.stringify({ error: "report file missing" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const html = await file.text();
      return new Response(html, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
          "X-Robots-Tag": "noindex",
        },
      });
    }

    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("audit-serve error", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
