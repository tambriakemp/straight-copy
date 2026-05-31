// Orchestrator: generate copy (Claude) + designs + rendered PNGs for a social post batch.
// If the batch has design_template_id set (and the template is active), slides are
// rendered from that uploaded HTML template. Otherwise we fall back to the AI-designed
// slide pipeline (Lovable AI Gemini design model + generic slide HTML).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  COPY_SYSTEM, DESIGN_SYSTEM, DESIGN_TOOL, ANTHROPIC_COPY_TOOL,
  buildCopyUserPrompt, buildDesignUserPrompt,
  type BrandContext, type PostCopy, type PostDesign,
} from "../_shared/social/prompts.ts";
import { buildSlideHtml, renderSlideToPng } from "../_shared/social/render.ts";
import {
  sanitizeTemplateHtml, renderTemplateForSlide, renderTemplateToPng,
} from "../_shared/social/template-render.ts";
import { callClaudeStructured } from "../_shared/social/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const DESIGN_MODEL = "google/gemini-2.5-pro";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function callLovableAI<T>(model: string, system: string, user: string, tool: typeof DESIGN_TOOL): Promise<T> {
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
  const call = j?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) throw new Error(`AI ${model} returned no tool call`);
  return JSON.parse(call.function.arguments) as T;
}

async function loadBrandContext(admin: ReturnType<typeof createClient>, clientProjectId: string): Promise<BrandContext> {
  const { data: proj } = await admin.from("client_projects").select("client_id").eq("id", clientProjectId).single();
  if (!proj) throw new Error("project not found");
  const { data: client } = await admin
    .from("clients")
    .select("business_name, intake_summary, intake_data, brand_voice_doc, brand_voice_quick_ref, brand_kit_intake")
    .eq("id", proj.client_id)
    .single();
  if (!client) throw new Error("client not found");
  const intake = (client.intake_data ?? {}) as Record<string, unknown>;
  return {
    business_name: client.business_name,
    one_liner: (intake?.one_liner as string) ?? null,
    voice_doc: client.brand_voice_doc,
    voice_quick_ref: client.brand_voice_quick_ref,
    intake_summary: client.intake_summary,
    intake_data: client.intake_data,
    brand_kit: client.brand_kit_intake,
  };
}

interface TemplateRow {
  id: string;
  html_source: string;
  format_support: string;
  active: boolean;
}

async function pickTemplateForPost(
  admin: ReturnType<typeof createClient>,
  clientProjectId: string,
  fixedTemplateId: string | null,
  format: "single" | "carousel",
  postIndex: number,
): Promise<TemplateRow | null> {
  if (fixedTemplateId) {
    const { data } = await admin.from("social_design_templates")
      .select("id, html_source, format_support, active")
      .eq("id", fixedTemplateId).maybeSingle();
    return data?.active ? (data as TemplateRow) : null;
  }
  const { data } = await admin.from("social_design_templates")
    .select("id, html_source, format_support, active")
    .eq("client_project_id", clientProjectId)
    .eq("active", true);
  const pool = (data ?? []).filter((t: TemplateRow) =>
    t.format_support === "both" || t.format_support === format);
  if (!pool.length) return null;
  return pool[postIndex % pool.length] as TemplateRow;
}

async function generateOnePost(
  admin: ReturnType<typeof createClient>,
  batchId: string,
  clientProjectId: string,
  ctx: BrandContext,
  format: "single" | "carousel",
  slidesPerCarousel: number,
  brief: string | null,
  platform: string | null,
  index: number,
  total: number,
  fixedTemplateId: string | null,
) {
  try {
    // 1. COPY via Claude
    const copy = await callClaudeStructured<PostCopy>({
      system: COPY_SYSTEM,
      user: buildCopyUserPrompt(ctx, {
        format, slides_per_carousel: slidesPerCarousel, brief, platform, index, total,
      }),
      tool: ANTHROPIC_COPY_TOOL,
      temperature: 0.95,
    });

    // 2. DESIGN: template-first, fallback to AI design
    const template = await pickTemplateForPost(admin, clientProjectId, fixedTemplateId, format, index);

    const slidesOut: Array<{
      copy: unknown; design: unknown; image_path: string | null; image_url: string | null; error?: string;
    }> = [];

    if (template) {
      const sanitized = sanitizeTemplateHtml(template.html_source);
      for (let i = 0; i < copy.slides.length; i++) {
        const sc = copy.slides[i];
        const html = renderTemplateForSlide(sanitized, sc, i, copy.slides.length);
        let image_path: string | null = null;
        let image_url: string | null = null;
        let err: string | undefined;
        try {
          const png = await renderTemplateToPng(html);
          const path = `${clientProjectId}/${batchId}/post-${index}-slide-${i}.png`;
          const up = await admin.storage.from("social-posts").upload(path, png, { contentType: "image/png", upsert: true });
          if (up.error) throw up.error;
          image_path = path;
          const { data: signed } = await admin.storage.from("social-posts").createSignedUrl(path, 60 * 60 * 24 * 7);
          image_url = signed?.signedUrl ?? null;
        } catch (e) {
          err = e instanceof Error ? e.message : String(e);
        }
        slidesOut.push({
          copy: sc, design: { template_id: template.id }, image_path, image_url,
          ...(err ? { error: err } : {}),
        });
      }
    } else {
      const design = await callLovableAI<PostDesign>(DESIGN_MODEL, DESIGN_SYSTEM,
        buildDesignUserPrompt(ctx, copy, format), DESIGN_TOOL);
      for (let i = 0; i < design.slides.length; i++) {
        const sd = design.slides[i];
        const html = buildSlideHtml(sd, design);
        let image_path: string | null = null;
        let image_url: string | null = null;
        let err: string | undefined;
        try {
          const png = await renderSlideToPng(html);
          const path = `${clientProjectId}/${batchId}/post-${index}-slide-${i}.png`;
          const up = await admin.storage.from("social-posts").upload(path, png, { contentType: "image/png", upsert: true });
          if (up.error) throw up.error;
          image_path = path;
          const { data: signed } = await admin.storage.from("social-posts").createSignedUrl(path, 60 * 60 * 24 * 7);
          image_url = signed?.signedUrl ?? null;
        } catch (e) {
          err = e instanceof Error ? e.message : String(e);
        }
        slidesOut.push({
          copy: copy.slides[i] ?? null, design: sd, image_path, image_url,
          ...(err ? { error: err } : {}),
        });
      }
    }

    await admin.from("social_posts").insert({
      batch_id: batchId,
      client_project_id: clientProjectId,
      order_index: index,
      format,
      status: "draft",
      caption: copy.caption,
      hashtags: copy.hashtags,
      slides: slidesOut,
      copy_provider: "anthropic",
      design_template_id: template?.id ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from("social_posts").insert({
      batch_id: batchId,
      client_project_id: clientProjectId,
      order_index: index,
      format,
      status: "error",
      slides: [],
      error: msg,
    });
  }
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

  const clientProjectId = String(body.client_project_id ?? "").trim();
  const singleCount = Math.max(0, Math.min(20, Number(body.single_count ?? 0)));
  const carouselCount = Math.max(0, Math.min(20, Number(body.carousel_count ?? 0)));
  const slidesPerCarousel = Math.max(2, Math.min(10, Number(body.slides_per_carousel ?? 5)));
  const brief = body.brief ? String(body.brief).slice(0, 2000) : null;
  const platform = body.platform ? String(body.platform) : null;
  const designTemplateId = body.design_template_id ? String(body.design_template_id) : null;

  if (!clientProjectId) return json({ error: "client_project_id required" }, 400);
  if (singleCount + carouselCount === 0) return json({ error: "request at least one post" }, 400);

  const { data: batch, error: batchErr } = await admin
    .from("social_post_batches")
    .insert({
      client_project_id: clientProjectId,
      created_by: userRes.user.id,
      status: "drafting",
      brief, platform,
      single_count: singleCount,
      carousel_count: carouselCount,
      slides_per_carousel: slidesPerCarousel,
      design_template_id: designTemplateId,
    })
    .select("id").single();
  if (batchErr || !batch) return json({ error: batchErr?.message ?? "failed to create batch" }, 500);

  const work = (async () => {
    try {
      const ctx = await loadBrandContext(admin, clientProjectId);
      const total = singleCount + carouselCount;
      const jobs: Array<{ format: "single" | "carousel" }> = [
        ...Array.from({ length: singleCount }, () => ({ format: "single" as const })),
        ...Array.from({ length: carouselCount }, () => ({ format: "carousel" as const })),
      ];
      const CHUNK = 2;
      for (let i = 0; i < jobs.length; i += CHUNK) {
        const slice = jobs.slice(i, i + CHUNK);
        await Promise.all(slice.map((job, k) =>
          generateOnePost(
            admin, batch.id, clientProjectId, ctx, job.format,
            slidesPerCarousel, brief, platform, i + k, total, designTemplateId,
          ),
        ));
      }
      const { data: errs } = await admin.from("social_posts").select("id, status").eq("batch_id", batch.id);
      const anyOk = (errs ?? []).some((r) => r.status !== "error");
      await admin.from("social_post_batches").update({
        status: anyOk ? "ready_for_review" : "error",
        updated_at: new Date().toISOString(),
      }).eq("id", batch.id);
    } catch (e) {
      await admin.from("social_post_batches").update({
        status: "error",
        error: e instanceof Error ? e.message : String(e),
        updated_at: new Date().toISOString(),
      }).eq("id", batch.id);
    }
  })();

  // @ts-ignore
  if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(work);
  } else {
    work.catch(() => {});
  }

  return json({ ok: true, batch_id: batch.id });
});
