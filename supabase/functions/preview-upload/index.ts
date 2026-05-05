// Admin-only: upload a single HTML+assets bundle or a zip to create/update a preview project.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { BlobReader, ZipReader } from "https://esm.sh/@zip.js/zip.js@2.7.45";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function genSlug(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function contentTypeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    html: "text/html; charset=utf-8",
    htm: "text/html; charset=utf-8",
    css: "text/css; charset=utf-8",
    js: "application/javascript; charset=utf-8",
    mjs: "application/javascript; charset=utf-8",
    json: "application/json; charset=utf-8",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    ico: "image/x-icon",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf",
    mp4: "video/mp4",
    webm: "video/webm",
    txt: "text/plain; charset=utf-8",
    pdf: "application/pdf",
  };
  return map[ext] ?? "application/octet-stream";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: userRes.user.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const form = await req.formData();
    const projectIdRaw = form.get("project_id");
    const name = (form.get("name") as string) || "Untitled preview";
    const clientLabel = (form.get("client_label") as string) || null;

    // Resolve or create project
    let projectId = projectIdRaw ? String(projectIdRaw) : null;
    let project: any = null;

    if (projectId) {
      const { data, error } = await admin
        .from("preview_projects")
        .select("*")
        .eq("id", projectId)
        .single();
      if (error || !data) throw new Error("project not found");
      project = data;
      // wipe existing files
      await admin.storage.from("preview-sites").remove(
        (
          await admin.from("preview_files").select("path").eq("project_id", projectId)
        ).data?.map((r: any) => `${project.storage_prefix}${r.path}`) ?? [],
      );
      await admin.from("preview_files").delete().eq("project_id", projectId);
    } else {
      const slug = genSlug();
      const newId = crypto.randomUUID();
      const storagePrefix = `previews/${newId}/`;
      const { data, error } = await admin
        .from("preview_projects")
        .insert({
          id: newId,
          name,
          client_label: clientLabel,
          slug,
          storage_prefix: storagePrefix,
          entry_path: "index.html",
        })
        .select("*")
        .single();
      if (error) throw error;
      project = data;
      projectId = newId;
    }

    // Collect files: either a single "zip" entry or many "files[]" with a relpath in field name
    const filesToUpload: { path: string; data: Uint8Array }[] = [];
    const zipFile = form.get("zip") as File | null;

    if (zipFile && zipFile.size > 0) {
      if (zipFile.size > 50 * 1024 * 1024) throw new Error("Zip too large (max 50MB)");
      const reader = new ZipReader(new BlobReader(zipFile));
      const entries = await reader.getEntries();
      if (entries.length > 800) throw new Error("Too many files in zip");
      for (const e of entries) {
        if (e.directory) continue;
        // Strip a single leading folder if all entries share it
        let path = e.filename.replace(/^\/+/, "");
        if (!path) continue;
        const buf = await e.getData!(new (await import("https://esm.sh/@zip.js/zip.js@2.7.45")).Uint8ArrayWriter());
        filesToUpload.push({ path, data: buf });
      }
      await reader.close();

      // strip common top-level folder
      const top = filesToUpload[0]?.path.split("/")[0];
      if (top && filesToUpload.every((f) => f.path.startsWith(top + "/"))) {
        for (const f of filesToUpload) f.path = f.path.slice(top.length + 1);
      }
    } else {
      // Loose files. Each <input> appended with name="file:<relpath>"
      for (const [key, val] of form.entries()) {
        if (val instanceof File && key.startsWith("file:")) {
          const relpath = key.slice("file:".length).replace(/^\/+/, "");
          if (!relpath) continue;
          const buf = new Uint8Array(await val.arrayBuffer());
          filesToUpload.push({ path: relpath, data: buf });
        }
      }
    }

    if (filesToUpload.length === 0) throw new Error("No files supplied");

    // Determine entry HTML
    const htmlFiles = filesToUpload
      .filter((f) => /\.html?$/i.test(f.path))
      .map((f) => f.path);
    let entry = htmlFiles.find((p) => /^index\.html?$/i.test(p)) ||
      htmlFiles.find((p) => !p.includes("/")) ||
      htmlFiles[0];
    if (!entry) throw new Error("No HTML file found");

    const isMulti = htmlFiles.length > 1;

    // Upload all files
    for (const f of filesToUpload) {
      const ct = contentTypeFor(f.path);
      const { error: upErr } = await admin.storage
        .from("preview-sites")
        .upload(`${project.storage_prefix}${f.path}`, f.data, {
          contentType: ct,
          upsert: true,
        });
      if (upErr) throw upErr;
      await admin.from("preview_files").insert({
        project_id: projectId,
        path: f.path,
        content_type: ct,
        size_bytes: f.data.byteLength,
      });
    }

    await admin
      .from("preview_projects")
      .update({ entry_path: entry, is_multi_page: isMulti })
      .eq("id", projectId);

    return new Response(
      JSON.stringify({
        ok: true,
        project: { ...project, entry_path: entry, is_multi_page: isMulti },
        file_count: filesToUpload.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("preview-upload error", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
