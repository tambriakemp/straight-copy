// Admin-only: rewrite a single HTML page in a preview project using an LLM.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripFences(text: string): string {
  let t = text.trim();
  // Remove leading ```html or ``` and trailing ```
  t = t.replace(/^```(?:html|HTML)?\s*\n?/, "");
  t = t.replace(/\n?```\s*$/, "");
  return t.trim();
}

function sse(type: string, data: unknown) {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

function streamJson(work: (send: (type: string, data?: unknown) => void) => Promise<unknown>) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(controller) {
        const send = (type: string, data: unknown = {}) => {
          controller.enqueue(encoder.encode(sse(type, data)));
        };
        const heartbeat = setInterval(() => send("ping", { t: Date.now() }), 15000);

        try {
          send("progress", { message: "Starting AI edit" });
          const result = await work(send);
          send("done", result);
        } catch (e: any) {
          console.error(e);
          send("error", { error: e?.message || String(e) });
        } finally {
          clearInterval(heartbeat);
          controller.close();
        }
      },
    }),
    {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    },
  );
}

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
    const { project_id, page_path, prompt, new_assets, vision_attachments } = await req.json();
    if (!project_id || !page_path || !prompt) return json({ error: "missing fields" }, 400);

    const { data: proj } = await admin
      .from("preview_projects").select("storage_prefix").eq("id", project_id).single();
    if (!proj) return json({ error: "project not found" }, 404);

    // Load the HTML
    const dl = await admin.storage.from("preview-sites").download(`${proj.storage_prefix}${page_path}`);
    if (dl.error || !dl.data) return json({ error: "page not found" }, 404);
    const originalHtml = await dl.data.text();

    // Load asset list for context
    const { data: files } = await admin.from("preview_files").select("path").eq("project_id", project_id);
    const allPaths = (files ?? []).map((f: any) => f.path);

    const newAssetsList = Array.isArray(new_assets) && new_assets.length
      ? `\n\nNEWLY UPLOADED assets (use these when the instruction calls for it):\n${(new_assets as any[]).map((a) => `- ${a.path}`).join("\n")}`
      : "";

    // Compute relative directory of the page to help the model write correct relative paths
    const pageDir = page_path.includes("/") ? page_path.slice(0, page_path.lastIndexOf("/") + 1) : "";

    const system = `You are an expert front-end engineer. You edit a SINGLE HTML file for a static preview site.

RULES:
- Return ONLY the full updated HTML document. No code fences, no commentary, no explanations.
- Preserve ALL unrelated markup, structure, scripts, styles, and whitespace exactly.
- Make the smallest change required to satisfy the user's instruction.
- STRUCTURAL UNITS: Before adding any separator, bullet, or repeating decoration, identify the existing repeating element in the DOM (e.g. <span>, <li>, <div> children of a track). The "items" are those elements — NEVER split a text node on whitespace and treat each word as an item.
- For marquees, ticker strips, breadcrumbs, and any inline scrolling list: each direct child element of the track/container is one item. Insert separators only BETWEEN those existing children, never between words inside a child's text.
- If the user asks to change spacing or alignment of separators (dots, dashes, bullets), prefer CSS adjustments (margin, padding, gap, justify-content) on the existing item/separator elements rather than restructuring markup.
- When inserting images, use plain <img> tags (or CSS background-image) with proper width/height/alt and object-fit:cover when filling a frame.
- Use relative URLs for assets in this project. The page lives at "${page_path}" so a sibling file "images/foo.jpg" is referenced as "${pageDir ? "../".repeat(pageDir.split("/").length - 1) : ""}images/foo.jpg" (or just "images/foo.jpg" if pageDir is empty). Prefer paths relative to the page.
- Do NOT add new <script> tags unless the user explicitly asks for JavaScript behavior. Prefer pure HTML/CSS solutions.
- Keep existing classes and IDs intact unless the change requires renaming them.
- If the user attaches a screenshot, treat it as a visual reference of the area they want changed (not necessarily content to embed). Use it to locate the relevant element in the HTML.

Available asset paths in this project:
${allPaths.map((p) => `- ${p}`).join("\n")}${newAssetsList}`;

    const userText = `User instruction:\n${prompt}\n\nCurrent HTML of "${page_path}":\n\n${originalHtml}`;
    const visionParts = Array.isArray(vision_attachments)
      ? vision_attachments
          .filter((v: any) => v?.data_url)
          .map((v: any) => ({ type: "image_url", image_url: { url: v.data_url } }))
      : [];
    const userContent = visionParts.length
      ? [{ type: "text", text: userText }, ...visionParts]
      : userText;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        stream: true,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!aiResp.ok || !aiResp.body) {
      const errText = aiResp.body ? await aiResp.text() : "";
      console.error("AI gateway error:", aiResp.status, errText);
      if (aiResp.status === 429) return json({ error: "Rate limit exceeded. Please wait and try again." }, 429);
      if (aiResp.status === 402) return json({ error: "AI credits exhausted. Add credits in workspace settings." }, 402);
      return json({ error: "AI request failed" }, 500);
    }

    // Stream and accumulate to keep the connection alive (avoids 150s idle timeout)
    const reader = aiResp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let raw = "";
    let done = false;
    while (!done) {
      const { value, done: d } = await reader.read();
      if (d) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") { done = true; break; }
        try {
          const parsed = JSON.parse(data);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (delta) raw += delta;
        } catch { buffer = line + "\n" + buffer; break; }
      }
    }
    if (!raw) return json({ error: "AI returned empty response" }, 500);

    const newHtml = stripFences(raw);
    if (!/<html[\s>]|<!doctype/i.test(newHtml.slice(0, 200))) {
      return json({ error: "AI did not return a valid HTML document", preview: newHtml.slice(0, 300) }, 500);
    }

    // Save back
    const bytes = new TextEncoder().encode(newHtml);
    const up = await admin.storage.from("preview-sites").upload(
      `${proj.storage_prefix}${page_path}`, bytes,
      { contentType: "text/html; charset=utf-8", upsert: true },
    );
    if (up.error) return json({ error: up.error.message }, 500);

    await admin.from("preview_files").update({ size_bytes: bytes.byteLength })
      .eq("project_id", project_id).eq("path", page_path);

    return json({ ok: true, bytes: bytes.byteLength });
  } catch (e: any) {
    console.error(e);
    return json({ error: e?.message || String(e) }, 500);
  }
});
