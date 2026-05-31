// Send approved social posts to CoPost.
// NOTE: CoPost API endpoints/shape are stubbed below — replace once docs are provided.
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

// TODO: replace with real CoPost base URL once docs are pasted.
const COPOST_BASE = "https://api.copost.com";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

interface SlideRow {
  image_path: string | null;
  image_url: string | null;
  copy?: { heading?: string; body?: string };
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

  // Load CoPost API key from project_secrets
  const { data: apiKey } = await admin.rpc("get_project_secret", {
    _client_project_id: batch.client_project_id,
    _key: "copost_api_key",
    _enc_key: ENC_KEY,
  });
  const { data: workspaceId } = await admin.rpc("get_project_secret", {
    _client_project_id: batch.client_project_id,
    _key: "copost_workspace_id",
    _enc_key: ENC_KEY,
  });
  if (!apiKey) return json({ error: "CoPost API key not configured for this project" }, 400);

  // Load approved posts
  const { data: posts } = await admin
    .from("social_posts")
    .select("*")
    .eq("batch_id", batchId)
    .eq("status", "approved")
    .order("order_index", { ascending: true });
  if (!posts?.length) return json({ error: "no approved posts in batch" }, 400);

  await admin.from("social_post_batches").update({ status: "publishing" }).eq("id", batchId);

  const results: Array<{ post_id: string; ok: boolean; error?: string; copost_post_id?: string }> = [];

  for (const post of posts) {
    try {
      const slides = (post.slides ?? []) as SlideRow[];
      // Build fresh signed URLs (24h) for CoPost to fetch
      const mediaUrls: string[] = [];
      for (const s of slides) {
        if (s.image_path) {
          const { data: signed } = await admin.storage.from("social-posts").createSignedUrl(s.image_path, 60 * 60 * 24);
          if (signed?.signedUrl) mediaUrls.push(signed.signedUrl);
        }
      }
      if (!mediaUrls.length) throw new Error("post has no rendered images");

      // TODO: replace endpoint + payload shape with real CoPost spec.
      const res = await fetch(`${COPOST_BASE}/v1/posts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: workspaceId ?? undefined,
          type: post.format === "carousel" ? "carousel" : "image",
          caption: post.caption,
          hashtags: post.hashtags,
          media_urls: mediaUrls,
        }),
      });
      const respText = await res.text();
      if (!res.ok) throw new Error(`CoPost ${res.status}: ${respText.slice(0, 300)}`);
      let respJson: { id?: string } = {};
      try { respJson = JSON.parse(respText); } catch { /* ignore */ }
      const copostId = respJson.id ?? null;

      await admin.from("social_posts").update({
        status: "published",
        copost_post_id: copostId,
        published_at: new Date().toISOString(),
        error: null,
      }).eq("id", post.id);

      results.push({ post_id: post.id, ok: true, copost_post_id: copostId ?? undefined });
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
