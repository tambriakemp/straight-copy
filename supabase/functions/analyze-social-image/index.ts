// Analyze a social image and generate a caption + hashtags using Lovable AI Gateway.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const SYSTEM = `You are a senior social media copywriter. Given a single image, write ONE Instagram-friendly caption (2-4 sentences, no emojis unless they fit naturally) plus 8-15 relevant hashtags. Use the brand context if provided. Return only the structured tool call.`;

const TOOL = {
  type: "function",
  function: {
    name: "write_caption",
    description: "Produce a caption and hashtags for a single image.",
    parameters: {
      type: "object",
      properties: {
        caption: { type: "string", description: "Caption text, plain language, no hashtags inside." },
        hashtags: {
          type: "array",
          items: { type: "string", description: "Hashtag without the # prefix." },
          minItems: 5,
          maxItems: 20,
        },
      },
      required: ["caption", "hashtags"],
      additionalProperties: false,
    },
  },
} as const;

async function analyzeOne(admin: ReturnType<typeof createClient>, imageId: string) {
  const { data: image, error } = await admin.from("social_images").select("*").eq("id", imageId).single();
  if (error || !image) throw new Error(`image not found: ${imageId}`);

  await admin.from("social_images").update({ caption_status: "pending", caption_error: null }).eq("id", imageId);

  // Get a short-lived signed URL the model can fetch
  const { data: signed, error: sErr } = await admin.storage
    .from("social-images")
    .createSignedUrl(image.storage_path as string, 60 * 10);
  if (sErr || !signed?.signedUrl) throw new Error(`signed url failed: ${sErr?.message ?? "unknown"}`);

  // Brand context (best-effort)
  let brandContext = "";
  const { data: proj } = await admin
    .from("client_projects").select("client_id, name").eq("id", image.client_project_id).single();
  if (proj?.client_id) {
    const { data: client } = await admin
      .from("clients")
      .select("business_name, intake_summary, brand_voice_quick_ref")
      .eq("id", proj.client_id).single();
    if (client) {
      brandContext = `Brand: ${client.business_name ?? ""}\n` +
        (client.brand_voice_quick_ref ? `Voice: ${client.brand_voice_quick_ref}\n` : "") +
        (client.intake_summary ? `About: ${String(client.intake_summary).slice(0, 800)}\n` : "");
    }
  }

  const userText = brandContext
    ? `Use this brand context when writing the caption:\n${brandContext}\nWrite the caption + hashtags for the attached image.`
    : `Write the caption + hashtags for the attached image.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: [
          { type: "text", text: userText },
          { type: "image_url", image_url: { url: signed.signedUrl } },
        ]},
      ],
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: TOOL.function.name } },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI failed ${res.status}: ${body.slice(0, 400)}`);
  }
  const j = await res.json();
  const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI returned no tool call");
  const parsed = JSON.parse(args) as { caption: string; hashtags: string[] };
  const hashtags = (parsed.hashtags ?? []).map((h) => String(h).replace(/^#/, "").trim()).filter(Boolean);

  await admin.from("social_images").update({
    caption: parsed.caption,
    hashtags,
    caption_status: "ready",
    caption_error: null,
  }).eq("id", imageId);
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

  const ids: string[] = Array.isArray(body.image_ids)
    ? (body.image_ids as string[])
    : body.image_id ? [String(body.image_id)] : [];
  if (!ids.length) return json({ error: "image_id or image_ids required" }, 400);

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const id of ids) {
    try {
      await analyzeOne(admin, id);
      results.push({ id, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin.from("social_images").update({
        caption_status: "error",
        caption_error: msg.slice(0, 500),
      }).eq("id", id);
      results.push({ id, ok: false, error: msg });
    }
  }
  return json({ ok: true, results });
});
