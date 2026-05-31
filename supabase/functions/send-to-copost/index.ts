// Send approved social posts to CoPost via per-project trigger URL.
// Spec: POST https://api.copost.io/triggers/<id> with JSON { postText, images?, tags? }.
// No API key — auth is the URL itself.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENC_KEY = Deno.env.get("PROJECT_SECRETS_KEY")!;

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

interface SlideRow {
  image_path: string | null;
  image_url: string | null;
  copy?: { heading?: string; body?: string };
}

function buildPostText(caption: string | null, hashtags: string[] | null): string {
  const parts: string[] = [];
  if (caption?.trim()) parts.push(caption.trim());
  if (hashtags?.length) parts.push(hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" "));
  return parts.join("\n\n");
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
  const batchId = String(body.batch_id ?? "");
  if (!batchId) return json({ error: "batch_id required" }, 400);

  const { data: batch } = await admin.from("social_post_batches").select("*").eq("id", batchId).single();
  if (!batch) return json({ error: "batch not found" }, 404);

  // Load CoPost endpoint URL from project_secrets
  const { data: endpointUrl } = await admin.rpc("get_project_secret", {
    _client_project_id: batch.client_project_id,
    _key: "copost_endpoint_url",
    _enc_key: ENC_KEY,
  });
  if (!endpointUrl) return json({ error: "CoPost endpoint URL not configured for this project" }, 400);

  // Validate the endpoint shape
  try {
    const u = new URL(String(endpointUrl));
    if (u.protocol !== "https:" || !u.host.endsWith("copost.io")) {
      return json({ error: "Stored CoPost URL is invalid" }, 400);
    }
  } catch {
    return json({ error: "Stored CoPost URL is malformed" }, 400);
  }

  // Load approved posts
  const { data: posts } = await admin
    .from("social_posts")
    .select("*")
    .eq("batch_id", batchId)
    .eq("status", "approved")
    .order("order_index", { ascending: true });
  if (!posts?.length) return json({ error: "no approved posts in batch" }, 400);

  await admin.from("social_post_batches").update({ status: "publishing" }).eq("id", batchId);

  const results: Array<{ post_id: string; ok: boolean; error?: string }> = [];

  for (const post of posts) {
    try {
      const slides = (post.slides ?? []) as SlideRow[];

      // Build fresh long-lived signed URLs (30d) so CoPost can fetch the images.
      // CoPost requires the URL to end with a valid extension — Supabase signed URLs
      // include ?token=… so we ensure the path itself ends in .png.
      const images: string[] = [];
      for (const s of slides) {
        if (!s.image_path) continue;
        const { data: signed, error: sErr } = await admin.storage
          .from("social-posts")
          .createSignedUrl(s.image_path, 60 * 60 * 24 * 30);
        if (sErr || !signed?.signedUrl) throw new Error(`signed url failed: ${sErr?.message ?? "unknown"}`);
        images.push(signed.signedUrl);
      }
      if (!images.length) throw new Error("post has no rendered images");
      if (images.length > 10) images.length = 10; // CoPost max

      const payload: Record<string, unknown> = {
        postText: buildPostText(post.caption, post.hashtags),
        images,
      };
      if (post.hashtags?.length) {
        payload.tags = post.hashtags.slice(0, 10).map((h: string) => h.replace(/^#/, ""));
      }

      const res = await fetch(String(endpointUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const respText = await res.text();
      if (!res.ok) throw new Error(`CoPost ${res.status}: ${respText.slice(0, 400)}`);

      await admin.from("social_posts").update({
        status: "published",
        published_at: new Date().toISOString(),
        error: null,
      }).eq("id", post.id);

      results.push({ post_id: post.id, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin.from("social_posts").update({ status: "error", error: msg }).eq("id", post.id);
      results.push({ post_id: post.id, ok: false, error: msg });
    }
  }

  const anyOk = results.some((r) => r.ok);
  const anyErr = results.some((r) => !r.ok);
  await admin.from("social_post_batches").update({
    status: anyErr && !anyOk ? "error" : "published",
    updated_at: new Date().toISOString(),
  }).eq("id", batchId);

  return json({ ok: true, results });
});
