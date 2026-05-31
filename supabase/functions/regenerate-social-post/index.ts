// Regenerate copy and/or design for a single existing social post.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: userRes } = await userClient.auth.getUser();
  if (!userRes.user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: userRes.user.id });
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const postId = String(body.post_id ?? "");
  const mode = String(body.mode ?? "all"); // 'copy' | 'design' | 'all'
  if (!postId) return json({ error: "post_id required" }, 400);

  const { data: post } = await admin.from("social_posts").select("*").eq("id", postId).single();
  if (!post) return json({ error: "post not found" }, 404);

  const mod = await import("../_shared/social/prompts.ts");
  const render = await import("../_shared/social/render.ts");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

  async function callAI<T>(model: string, system: string, user: string, tool: typeof mod.COPY_TOOL): Promise<T> {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        tools: [tool],
        tool_choice: { type: "function", function: { name: tool.function.name } },
      }),
    });
    if (!res.ok) throw new Error(`AI ${model} failed: ${res.status} ${await res.text()}`);
    const j = await res.json();
    return JSON.parse(j.choices[0].message.tool_calls[0].function.arguments) as T;
  }

  const { data: proj } = await admin.from("client_projects").select("client_id").eq("id", post.client_project_id).single();
  const { data: client } = await admin
    .from("clients")
    .select("business_name, intake_summary, intake_data, brand_voice_doc, brand_voice_quick_ref, brand_kit_intake")
    .eq("id", proj!.client_id).single();
  const intake = (client!.intake_data ?? {}) as Record<string, unknown>;
  const ctx: mod.BrandContext = {
    business_name: client!.business_name,
    one_liner: (intake?.one_liner as string) ?? null,
    voice_doc: client!.brand_voice_doc,
    voice_quick_ref: client!.brand_voice_quick_ref,
    intake_summary: client!.intake_summary,
    intake_data: client!.intake_data,
    brand_kit: client!.brand_kit_intake,
  };

  const { data: batch } = await admin.from("social_post_batches").select("*").eq("id", post.batch_id).single();

  try {
    let copy: mod.PostCopy;
    if (mode === "copy" || mode === "all" || !post.slides?.length) {
      copy = await callAI<mod.PostCopy>(
        "google/gemini-2.5-flash", mod.COPY_SYSTEM,
        mod.buildCopyUserPrompt(ctx, {
          format: post.format,
          slides_per_carousel: batch?.slides_per_carousel ?? 5,
          brief: batch?.brief ?? null,
          platform: batch?.platform ?? null,
          index: post.order_index,
          total: (batch?.single_count ?? 0) + (batch?.carousel_count ?? 0),
        }),
        mod.COPY_TOOL,
      );
    } else {
      copy = {
        hook: "",
        caption: post.caption ?? "",
        hashtags: post.hashtags ?? [],
        slides: (post.slides as Array<{ copy: { heading: string; body: string; cta?: string | null } }>).map((s) => s.copy),
      };
    }

    const design = await callAI<mod.PostDesign>(
      "google/gemini-2.5-pro", mod.DESIGN_SYSTEM,
      mod.buildDesignUserPrompt(ctx, copy, post.format),
      mod.DESIGN_TOOL,
    );

    const slidesOut: Array<{ copy: unknown; design: unknown; image_path: string | null; image_url: string | null; error?: string }> = [];
    for (let i = 0; i < design.slides.length; i++) {
      const sd = design.slides[i];
      const html = render.buildSlideHtml(sd, design);
      let image_path: string | null = null;
      let image_url: string | null = null;
      let err: string | undefined;
      try {
        const png = await render.renderSlideToPng(html);
        const path = `${post.client_project_id}/${post.batch_id}/post-${post.order_index}-slide-${i}-${Date.now()}.png`;
        const up = await admin.storage.from("social-posts").upload(path, png, { contentType: "image/png", upsert: true });
        if (up.error) throw up.error;
        image_path = path;
        const { data: signed } = await admin.storage.from("social-posts").createSignedUrl(path, 60 * 60 * 24 * 7);
        image_url = signed?.signedUrl ?? null;
      } catch (e) {
        err = e instanceof Error ? e.message : String(e);
      }
      slidesOut.push({ copy: copy.slides[i] ?? null, design: sd, image_path, image_url, ...(err ? { error: err } : {}) });
    }

    await admin.from("social_posts").update({
      status: "draft",
      caption: copy.caption || post.caption,
      hashtags: copy.hashtags?.length ? copy.hashtags : post.hashtags,
      slides: slidesOut,
      error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", postId);

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
