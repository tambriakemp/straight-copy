// Send selected social_images to CoPost via the project's CoPost trigger URL.
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
  const ids: string[] = Array.isArray(body.image_ids) ? (body.image_ids as string[]).map(String) : [];
  if (!ids.length) return json({ error: "image_ids required" }, 400);

  const { data: images, error: lErr } = await admin.from("social_images").select("*").in("id", ids);
  if (lErr || !images?.length) return json({ error: "no images found" }, 404);

  const projectIds = Array.from(new Set(images.map((i) => i.client_project_id)));
  if (projectIds.length !== 1) return json({ error: "all images must belong to the same project" }, 400);
  const clientProjectId = projectIds[0];

  const { data: endpointUrl } = await admin.rpc("get_project_secret", {
    _client_project_id: clientProjectId,
    _key: "copost_endpoint_url",
    _enc_key: ENC_KEY,
  });
  if (!endpointUrl) return json({ error: "CoPost endpoint URL not configured for this project" }, 400);
  try {
    const u = new URL(String(endpointUrl));
    if (u.protocol !== "https:" || !u.host.endsWith("copost.io")) {
      return json({ error: "Stored CoPost URL is invalid" }, 400);
    }
  } catch {
    return json({ error: "Stored CoPost URL is malformed" }, 400);
  }

  const results: Array<{ id: string; ok: boolean; skipped?: string; error?: string }> = [];

  // Atomic idempotent claim: only flip rows that aren't already sending/sent.
  const { data: claimed, error: claimErr } = await admin
    .from("social_images")
    .update({ copost_status: "sending", copost_error: null })
    .in("id", ids)
    .not("copost_status", "in", "(sending,sent)")
    .select("*");
  if (claimErr) return json({ error: claimErr.message }, 500);

  const claimedIds = new Set((claimed ?? []).map((r) => r.id));
  for (const img of images) {
    if (!claimedIds.has(img.id)) {
      if (img.copost_status === "sent") results.push({ id: img.id, ok: true, skipped: "already sent" });
      else if (img.copost_status === "sending") results.push({ id: img.id, ok: false, skipped: "already in progress" });
      else results.push({ id: img.id, ok: false, error: "could not claim" });
      continue;
    }
    try {

      const { data: signed, error: sErr } = await admin.storage
        .from("social-images")
        .createSignedUrl(img.storage_path, 60 * 60 * 24 * 30);
      if (sErr || !signed?.signedUrl) throw new Error(`signed url failed: ${sErr?.message ?? "unknown"}`);
      const imageUrl = `${signed.signedUrl}#.png`;

      const payload: Record<string, unknown> = {
        postText: buildPostText(img.caption, img.hashtags),
        images: [imageUrl],
      };
      if (img.hashtags?.length) {
        payload.tags = (img.hashtags as string[]).slice(0, 10).map((h) => h.replace(/^#/, ""));
      }

      const res = await fetch(String(endpointUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const respText = await res.text();
      if (!res.ok) throw new Error(`CoPost ${res.status}: ${respText.slice(0, 400)}`);

      await admin.from("social_images").update({
        copost_status: "sent",
        copost_sent_at: new Date().toISOString(),
        copost_error: null,
      }).eq("id", img.id);
      results.push({ id: img.id, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin.from("social_images").update({
        copost_status: "error",
        copost_error: msg.slice(0, 500),
      }).eq("id", img.id);
      results.push({ id: img.id, ok: false, error: msg });
    }
  }

  return json({ ok: true, results });
});
