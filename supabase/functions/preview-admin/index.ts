// Admin-only management endpoints for preview projects + comments.
// All actions dispatched via { action: "..." } in JSON body (POST).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userRes } = await userClient.auth.getUser();
  if (!userRes.user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: userRes.user.id });
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  try {
    const payload = await req.json();
    const action = payload.action as string;

    switch (action) {
      case "list": {
        const { data } = await admin
          .from("preview_projects")
          .select("*")
          .order("created_at", { ascending: false });
        return json({ projects: data ?? [] });
      }

      case "get": {
        const { id } = payload;
        const { data: project } = await admin.from("preview_projects").select("*").eq("id", id).single();
        const { data: files } = await admin.from("preview_files").select("*").eq("project_id", id).order("path");
        const { data: comments } = await admin
          .from("preview_comments")
          .select("*")
          .eq("project_id", id)
          .order("pin_number", { ascending: true });
        const ids = (comments ?? []).map((c) => c.id);
        let replies: any[] = [];
        if (ids.length) {
          const { data } = await admin
            .from("preview_comment_replies")
            .select("*")
            .in("comment_id", ids)
            .order("created_at", { ascending: true });
          replies = data ?? [];
        }
        return json({ project, files: files ?? [], comments: comments ?? [], replies });
      }

      case "create": {
        const { name, client_label, client_id, attach_to_project_id } = payload;
        if (!name) return json({ error: "name required" }, 400);
        const slug = genSlug();
        const id = crypto.randomUUID();

        // If linked to an existing project, attach to it; otherwise (legacy) create a new site_preview client_project.
        let client_project_id: string | null = null;
        if (attach_to_project_id) {
          client_project_id = attach_to_project_id;
        } else if (client_id) {
          const { data: cp, error: cpErr } = await admin
            .from("client_projects")
            .insert({ client_id, type: "site_preview", name })
            .select("id").single();
          if (cpErr) throw cpErr;
          client_project_id = cp.id;
        }

        const { data, error } = await admin
          .from("preview_projects")
          .insert({
            id, name,
            client_label: client_label || null,
            slug,
            storage_prefix: `previews/${id}/`,
            client_project_id,
          })
          .select("*").single();
        if (error) throw error;
        return json({ project: data, client_project_id });
      }

      case "update": {
        const { id, ...patch } = payload;
        const allowed: any = {};
        for (const k of ["name", "client_label", "feedback_enabled", "archived", "entry_path", "is_multi_page"]) {
          if (k in patch) allowed[k] = patch[k];
        }
        const { data, error } = await admin
          .from("preview_projects").update(allowed).eq("id", id).select("*").single();
        if (error) throw error;
        return json({ project: data });
      }

      case "reply": {
        const { comment_id, body, author_name } = payload;
        if (!comment_id || !body) return json({ error: "missing fields" }, 400);
        const { data, error } = await admin
          .from("preview_comment_replies")
          .insert({ comment_id, body, author_name: author_name || "Admin", is_admin: true })
          .select("*").single();
        if (error) throw error;
        return json({ reply: data });
      }

      case "comment_status": {
        const { id, status } = payload;
        const { data, error } = await admin
          .from("preview_comments").update({ status }).eq("id", id).select("*").single();
        if (error) throw error;
        return json({ comment: data });
      }

      case "comment_delete": {
        const { id } = payload;
        const { error } = await admin.from("preview_comments").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "project_delete": {
        const { id } = payload;
        const { data: proj } = await admin
          .from("preview_projects").select("storage_prefix").eq("id", id).single();
        const { data: files } = await admin.from("preview_files").select("path").eq("project_id", id);
        if (proj && files?.length) {
          await admin.storage.from("preview-sites").remove(files.map((f) => `${proj.storage_prefix}${f.path}`));
        }
        const { error } = await admin.from("preview_projects").delete().eq("id", id);
        if (error) throw error;
        return json({ ok: true });
      }

      case "file_delete": {
        const { project_id, path } = payload;
        const { data: proj } = await admin
          .from("preview_projects").select("storage_prefix").eq("id", project_id).single();
        if (proj) {
          await admin.storage.from("preview-sites").remove([`${proj.storage_prefix}${path}`]);
        }
        await admin.from("preview_files").delete().eq("project_id", project_id).eq("path", path);
        return json({ ok: true });
      }

      case "file_rename": {
        // Rename/move an uploaded file to a new path so HTML references resolve.
        const { project_id, from_path, to_path } = payload;
        if (!project_id || !from_path || !to_path) return json({ error: "missing fields" }, 400);
        const clean = String(to_path).replace(/^\/+/, "").replace(/\.\.+/g, "");
        if (!clean) return json({ error: "bad target" }, 400);
        const { data: proj } = await admin
          .from("preview_projects").select("storage_prefix").eq("id", project_id).single();
        if (!proj) return json({ error: "project not found" }, 404);
        // Move within the bucket
        const src = `${proj.storage_prefix}${from_path}`;
        const dst = `${proj.storage_prefix}${clean}`;
        const mv = await admin.storage.from("preview-sites").move(src, dst);
        if (mv.error) {
          // Fallback: copy + delete
          const cp = await admin.storage.from("preview-sites").copy(src, dst);
          if (cp.error) return json({ error: cp.error.message }, 400);
          await admin.storage.from("preview-sites").remove([src]);
        }
        // If a row already exists at dst, remove it
        await admin.from("preview_files").delete().eq("project_id", project_id).eq("path", clean);
        await admin.from("preview_files").update({ path: clean }).eq("project_id", project_id).eq("path", from_path);
        return json({ ok: true, path: clean });
      }

      case "missing_assets": {
        // Parse all HTML files for src/href/url() refs and report any that don't
        // exist in preview_files (by exact normalized path or basename).
        const { id } = payload;
        const { data: proj } = await admin
          .from("preview_projects").select("storage_prefix").eq("id", id).single();
        const { data: files } = await admin.from("preview_files").select("path").eq("project_id", id);
        if (!proj || !files) return json({ missing: [] });
        const allPaths = new Set(files.map((f: any) => f.path));
        const allBasenames = new Set(files.map((f: any) => f.path.split("/").pop()?.toLowerCase()));
        const htmls = files.filter((f: any) => /\.html?$/i.test(f.path));
        const missing: { ref: string; in_page: string }[] = [];
        const seen = new Set<string>();
        for (const h of htmls) {
          const dl = await admin.storage.from("preview-sites").download(`${proj.storage_prefix}${h.path}`);
          if (dl.error || !dl.data) continue;
          const text = await dl.data.text();
          const refs: string[] = [];
          const re = /(?:src|href|poster|data-src)=["']([^"']+)["']|url\(\s*["']?([^)"']+)["']?\s*\)/gi;
          let m: RegExpExecArray | null;
          while ((m = re.exec(text))) refs.push(m[1] || m[2]);
          for (const r of refs) {
            if (/^(https?:|\/\/|data:|mailto:|tel:|#|javascript:|blob:)/i.test(r)) continue;
            const clean = r.replace(/[?#].*$/, "");
            if (!clean) continue;
            // Resolve relative to page dir
            const dir = h.path.includes("/") ? h.path.slice(0, h.path.lastIndexOf("/") + 1) : "";
            let target = clean.startsWith("/") ? clean.replace(/^\/+/, "") : dir + clean;
            const parts: string[] = [];
            for (const seg of target.split("/")) {
              if (seg === "" || seg === ".") continue;
              if (seg === "..") parts.pop(); else parts.push(seg);
            }
            target = parts.join("/");
            if (allPaths.has(target)) continue;
            if (allBasenames.has(target.split("/").pop()?.toLowerCase())) continue;
            const k = `${h.path}::${clean}`;
            if (seen.has(k)) continue;
            seen.add(k);
            missing.push({ ref: clean, in_page: h.path });
          }
        }
        return json({ missing });
      }

      case "file_upload_single": {
        // Upload a single file (base64) into the project's storage prefix and upsert preview_files row.
        const { project_id, path, content_base64, mime } = payload;
        if (!project_id || !path || !content_base64) return json({ error: "missing fields" }, 400);
        const clean = String(path).replace(/^\/+/, "").replace(/\.\.+/g, "");
        if (!clean) return json({ error: "bad path" }, 400);
        const { data: proj } = await admin
          .from("preview_projects").select("storage_prefix").eq("id", project_id).single();
        if (!proj) return json({ error: "project not found" }, 404);
        const bin = Uint8Array.from(atob(content_base64), (c) => c.charCodeAt(0));
        const contentType = mime || "application/octet-stream";
        const up = await admin.storage.from("preview-sites").upload(
          `${proj.storage_prefix}${clean}`, bin,
          { contentType, upsert: true },
        );
        if (up.error) return json({ error: up.error.message }, 400);
        await admin.from("preview_files").upsert({
          project_id, path: clean, size_bytes: bin.byteLength, content_type: contentType,
        }, { onConflict: "project_id,path" });
        return json({ ok: true, path: clean, size: bin.byteLength });
      }

      default:
        return json({ error: "unknown action" }, 400);
    }
  } catch (e: any) {
    console.error(e);
    return json({ error: e?.message || String(e) }, 500);
  }
});

function genSlug(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
