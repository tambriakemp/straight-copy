// Public endpoint for CRE-225's password-gated /audit/<slug> report viewer.
// POST checks the rate limit, then the password, then issues a short-lived
// session row. GET with a valid token serves the most recent report version
// for that client.
//
// CRE-859: the password compare used to `select("id, password")` and compare
// the visitor's input in JS, so the plaintext left the database -- and was
// compared non-constant-time -- on every attempt. It now calls the Client
// Portal plugin's `POST /site-audits/password/verify`, which answers only
// `{ ok }`: the password is sealed in the plugin and never reaches this
// function, and the comparison there is constant-time. See
// `_shared/client-portal-plugin.ts` and the plugin's own `site-audits.ts` for
// why that route exists. There is deliberately no local fallback that
// re-reads and compares the plaintext column -- a misconfigured plugin fails
// the request (503/502), not the password check.
//
// CRE-867: the report-bytes path (GET) now reads no plugin-owned table and no
// storage bucket directly either. `by-slug` resolves the audit id, `versions`
// is read in the plugin's own order (`version DESC NULLS LAST, created_at
// DESC, id DESC` -- taking `versions[0]` rather than re-sorting on
// `audited_at` here, so there is one definition of "latest" and it lives in
// the plugin), and `versions/:versionId/download` returns the bytes. Exactly
// one of `url`/`contentBase64` on that response is ever set, and a `url` is
// fetched server-side rather than handed to the browser -- a redirect would
// carry the report to a URL with none of the `Cache-Control: private,
// no-store` / `X-Robots-Tag: noindex` protection this response has.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PluginApiError, PluginClient, readPluginConfig } from "../_shared/client-portal-plugin.ts";

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

      const config = readPluginConfig();
      if (!config) {
        console.error("audit-serve: CLIENT_PORTAL_* is not configured, refusing to verify a report password");
        return new Response(JSON.stringify({ error: "report viewing is temporarily unavailable" }), {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let verified: { ok: boolean };
      try {
        verified = await new PluginClient(config).call<{ ok: boolean }>(
          "/site-audits/password/verify",
          { method: "POST", body: { slug, password } },
        );
      } catch (e) {
        console.error("audit-serve: password verify call failed", e instanceof PluginApiError ? e.code : e);
        return new Response(JSON.stringify({ error: "could not verify the password right now" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!verified.ok) {
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

      const config = readPluginConfig();
      if (!config) {
        console.error("audit-serve: CLIENT_PORTAL_* is not configured, refusing to serve a report");
        return new Response(JSON.stringify({ error: "report viewing is temporarily unavailable" }), {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const plugin = new PluginClient(config);

      let auditId: string;
      try {
        const { audit } = await plugin.call<{ audit: { id: string } }>(
          `/site-audits/by-slug/${encodeURIComponent(slug)}`,
        );
        auditId = audit.id;
      } catch (e) {
        if (e instanceof PluginApiError && e.code === "audit_not_found") {
          return new Response(JSON.stringify({ error: "not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        console.error("audit-serve: by-slug lookup failed", e instanceof PluginApiError ? e.code : e);
        return new Response(JSON.stringify({ error: "could not look up the report right now" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let versionId: string;
      try {
        const { versions } = await plugin.call<{ versions: Array<{ id: string }> }>(
          `/site-audits/${auditId}/versions`,
        );
        // The plugin orders `version DESC NULLS LAST, created_at DESC, id
        // DESC` -- take its first row rather than re-sorting here.
        const latest = versions[0];
        if (!latest) {
          return new Response(JSON.stringify({ error: "no report published yet" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        versionId = latest.id;
      } catch (e) {
        console.error("audit-serve: versions list failed", e instanceof PluginApiError ? e.code : e);
        return new Response(JSON.stringify({ error: "could not look up the report right now" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let download: { url: string | null; contentBase64: string | null };
      try {
        download = await plugin.call<{ url: string | null; contentBase64: string | null }>(
          `/site-audits/${auditId}/versions/${versionId}/download`,
        );
      } catch (e) {
        if (e instanceof PluginApiError) {
          console.error("audit-serve: version download failed", e.code);
          if (e.code === "version_not_found") {
            return new Response(JSON.stringify({ error: "not found" }), {
              status: 404,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (e.code === "file_bytes_elsewhere") {
            return new Response(
              JSON.stringify({ error: "report storage is not configured for this install" }),
              { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          if (e.code === "report_bytes_missing") {
            return new Response(JSON.stringify({ error: "report file missing" }), {
              status: 422,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } else {
          console.error("audit-serve: version download failed", e);
        }
        return new Response(JSON.stringify({ error: "could not fetch the report right now" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let html: string;
      if (download.contentBase64) {
        html = new TextDecoder().decode(
          Uint8Array.from(atob(download.contentBase64), (c) => c.charCodeAt(0)),
        );
      } else if (download.url) {
        let fileRes: Response;
        try {
          fileRes = await fetch(download.url);
        } catch (e) {
          console.error("audit-serve: fetching report bytes from the configured store failed", e);
          return new Response(JSON.stringify({ error: "could not fetch the report right now" }), {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (!fileRes.ok) {
          console.error("audit-serve: store returned", fileRes.status, "fetching report bytes");
          return new Response(JSON.stringify({ error: "could not fetch the report right now" }), {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        html = await fileRes.text();
      } else {
        // The plugin's own contract is that exactly one of `url`/
        // `contentBase64` is set -- this is that contract broken, not a
        // missing report, but the caller gets the same answer either way.
        console.error("audit-serve: version download set neither url nor contentBase64");
        return new Response(JSON.stringify({ error: "report file missing" }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

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
