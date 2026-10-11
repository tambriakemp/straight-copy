// Public endpoint: serves uploaded preview files keyed by slug.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FN_BASE = `${SUPABASE_URL}/functions/v1`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

// The in-page feedback widget — the floating "Leave feedback" bubble, its
// modal and the pins it drew — used to be injected here, into every HTML
// page this function served.
//
// It is gone. The feedback board (/admin/.../feedback and the client's
// /portal/.../feedback) renders its own pins over the page in an iframe
// and owns the comment flow, so the injected copy drew a SECOND set of
// pins on top of the board's own and put a bubble over the board's
// toolbar. Two widgets for one job, and the one that lost was the one
// the board could not control.
//
// __pf_widget.js, __pf_bootstrap.js and __pf_embed.js still answer, with
// nothing in them: a script tag for one of them may already be pasted
// into a client's live site, and a 404 in their console is a worse
// parting gift than an empty file.
const RETIRED_WIDGET_JS = "/* The preview feedback widget was retired. Comments live on the feedback board. */";


function contentTypeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
    css: "text/css; charset=utf-8", js: "application/javascript; charset=utf-8",
    json: "application/json; charset=utf-8", svg: "image/svg+xml",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", webp: "image/webp", ico: "image/x-icon",
    woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf",
    mp4: "video/mp4", webm: "video/webm", txt: "text/plain; charset=utf-8",
    pdf: "application/pdf",
  };
  return map[ext] ?? "application/octet-stream";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    let path = url.searchParams.get("path") || "";
    if (!slug) return new Response("missing slug", { status: 400, headers: corsHeaders });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: project, error } = await admin
      .from("preview_projects")
      .select("id,slug,storage_prefix,entry_path,feedback_enabled,archived,client_project_id")
      .eq("slug", slug)
      .single();
    if (error || !project || project.archived) {
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }

    if (!path) path = project.entry_path;

    // The three widget paths, kept alive and empty. See the note at the
    // top of this file: a script tag for one of them may be pasted into a
    // client's live site, so they answer with a comment rather than a 404.
    if (path === "__pf_widget.js" || path === "__pf_bootstrap.js" || path === "__pf_embed.js") {
      return new Response(RETIRED_WIDGET_JS, {
        headers: { ...corsHeaders, "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=300" },
      });
    }


    // Reject path traversal
    if (path.includes("..")) return new Response("bad path", { status: 400, headers: corsHeaders });

    let { data: file, error: dlErr } = await admin.storage
      .from("preview-sites")
      .download(`${project.storage_prefix}${path}`);
    let resolvedVia = "exact";
    if (dlErr || !file) {
      // Fallback: match by basename across all project files (case-insensitive)
      const want = path.split("/").pop()?.toLowerCase() ?? "";
      if (want) {
        const { data: rows } = await admin
          .from("preview_files").select("path").eq("project_id", project.id);
        const hit = (rows ?? []).find((r: any) => r.path.split("/").pop()?.toLowerCase() === want);
        if (hit) {
          const second = await admin.storage.from("preview-sites").download(`${project.storage_prefix}${hit.path}`);
          if (!second.error && second.data) {
            file = second.data;
            path = hit.path;
            dlErr = null as any;
            resolvedVia = "basename";
          }
        }
      }
      if (!file) return new Response("Not found", { status: 404, headers: corsHeaders });
    }

    const ct = contentTypeFor(path);
    const isHtml = ct.startsWith("text/html");

    if (isHtml) {
      let html = await file.text();
      const base = `${FN_BASE}/preview-serve?slug=${encodeURIComponent(slug)}&path=`;
      // Resolve a (possibly relative) asset reference against the current HTML path
      const resolveRef = (ref: string): string => {
        // Skip protocol-absolute, data, mailto, tel, anchor, js
        if (/^(https?:|\/\/|data:|mailto:|tel:|#|javascript:|blob:)/i.test(ref)) return ref;
        let target = ref.replace(/[?#].*$/, "");
        const tail = ref.slice(target.length);
        if (target.startsWith("/")) {
          target = target.replace(/^\/+/, "");
        } else {
          // Resolve relative to current page's directory
          const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
          target = dir + target;
          // Normalize ./ and ../ segments
          const parts: string[] = [];
          for (const seg of target.split("/")) {
            if (seg === "" || seg === ".") continue;
            if (seg === "..") parts.pop();
            else parts.push(seg);
          }
          target = parts.join("/");
        }
        return `${base}${encodeURIComponent(target)}${tail}`;
      };

      const rewriteSegment = (seg: string): string => {
        // Rewrite src/href on any tag
        seg = seg.replace(/(\s(?:src|href|poster|data-src))=("|')([^"']+)\2/gi,
          (_m, attr, q, p) => `${attr}=${q}${resolveRef(p)}${q}`);
        // Rewrite srcset (comma-separated list with optional descriptors)
        seg = seg.replace(/(\ssrcset)=("|')([^"']+)\2/gi, (_m, attr, q, list) => {
          const rewritten = list.split(",").map((part: string) => {
            const t = part.trim();
            if (!t) return "";
            const sp = t.indexOf(" ");
            const url = sp === -1 ? t : t.slice(0, sp);
            const desc = sp === -1 ? "" : t.slice(sp);
            return resolveRef(url) + desc;
          }).filter(Boolean).join(", ");
          return `${attr}=${q}${rewritten}${q}`;
        });
        // Rewrite url(...) in inline <style>/style attributes
        seg = seg.replace(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi,
          (_m, q, p) => `url(${q}${resolveRef(p)}${q})`);
        return seg;
      };

      // Split off <script>...</script> blocks so we never rewrite JS source.
      // A user-bundled HTML may contain `URL.createObjectURL(new Blob(...))`
      // — case-insensitive `url(...)` would otherwise mangle it.
      const scriptRe = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
      let out = "";
      let last = 0;
      for (const m of html.matchAll(scriptRe)) {
        const start = m.index ?? 0;
        out += rewriteSegment(html.slice(last, start));
        out += m[0]; // leave script body untouched
        last = start + m[0].length;
      }
      out += rewriteSegment(html.slice(last));
      html = out;

      // Nothing is injected any more. The page is served as it was
      // written; the feedback board draws the pins over it.

      return new Response(html, {
        headers: {
          ...corsHeaders,
          "Content-Type": ct,
          "Cache-Control": "no-store",
          "X-Frame-Options": "ALLOWALL",
        },
      });
    }

    return new Response(await file.arrayBuffer(), {
      headers: { ...corsHeaders, "Content-Type": ct, "Cache-Control": "public, max-age=300" },
    });
  } catch (e: any) {
    const url = new URL(req.url);
    if (["__pf_widget.js", "__pf_bootstrap.js", "__pf_embed.js"].includes(url.searchParams.get("path") ?? "")) {
      return new Response(RETIRED_WIDGET_JS, {
        headers: { ...corsHeaders, "Content-Type": "application/javascript; charset=utf-8" },
      });
    }
    return new Response("error: " + (e?.message || e), { status: 500, headers: corsHeaders });
  }
});
