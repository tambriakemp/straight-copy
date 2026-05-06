// Sends the "Site Preview Ready" review email to a client via SureContact's
// transactional /emails/send endpoint.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SURECONTACT_API_KEY = Deno.env.get("SURECONTACT_API_KEY");
const SURECONTACT_SEND_URL =
  "https://api.surecontact.com/api/v1/public/emails/send";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildEmailHtml(firstName: string, previewUrl: string) {
  const safeName = escapeHtml(firstName || "there");
  const safeUrl = escapeHtml(previewUrl);
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f6f3ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2a2622;">
  <div style="max-width:600px;margin:0 auto;padding:40px 28px;background:#ffffff;">
    <p style="font-size:16px;line-height:1.6;margin:0 0 18px;">Hi ${safeName},</p>

    <p style="font-size:16px;line-height:1.6;margin:0 0 18px;">
      Your site preview is live and ready for your eyes. Take a few minutes to walk through it before we move into the next phase of the build.
    </p>

    <p style="margin:28px 0;text-align:center;">
      <a href="${safeUrl}"
         style="display:inline-block;background:#8a6d4e;color:#ffffff;text-decoration:none;
                padding:14px 28px;border-radius:4px;font-size:15px;letter-spacing:0.05em;">
        Review my site preview
      </a>
    </p>

    <p style="font-size:16px;line-height:1.6;margin:0 0 12px;"><strong>How to leave feedback:</strong></p>
    <ol style="font-size:15px;line-height:1.7;padding-left:22px;margin:0 0 22px;">
      <li>Click the <strong>"Leave Feedback"</strong> button in the bottom right corner.</li>
      <li>Click anywhere on the page to drop a numbered pin — type your note, add your name, and save. Your comment is tied to that exact spot.</li>
      <li>Use pins for anything: copy tweaks, color/spacing thoughts, "move this up," "swap this image," questions, approvals — all of it.</li>
      <li>Move between pages using the site's own navigation. Pins work on every page.</li>
      <li>You can reply to your own pins or to anything we reply with — it's a running conversation, not a one-shot form.</li>
    </ol>

    <p style="font-size:16px;line-height:1.6;margin:0 0 12px;"><strong>What to look for:</strong></p>
    <ul style="font-size:15px;line-height:1.7;padding-left:22px;margin:0 0 22px;">
      <li>Does the overall feel match your brand?</li>
      <li>Is the messaging clear from the moment someone lands?</li>
      <li>Are there sections you want emphasized, softened, or removed?</li>
      <li>Anything missing that a visitor would expect to see?</li>
    </ul>

    <p style="font-size:16px;line-height:1.6;margin:0 0 18px;">
      Don't worry about being too picky — the more specific you are now, the faster we land on the final version. Aim to leave your feedback within the next 3 business days so we can keep your build on schedule.
    </p>

    <p style="font-size:16px;line-height:1.6;margin:0 0 28px;">
      If anything is broken or you can't access the preview, just reply to this email.
    </p>

    <p style="font-size:16px;line-height:1.6;margin:0;">Talking soon,</p>
    <p style="font-size:16px;line-height:1.6;margin:4px 0 0;">Bree<br/>Cre8 Visions</p>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Auth: must be an admin user
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userRes } = await userClient.auth.getUser();
  if (!userRes.user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: userRes.user.id });
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  if (!SURECONTACT_API_KEY) return json({ error: "SURECONTACT_API_KEY not configured" }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const previewProjectId: string | undefined = body?.preview_project_id;
  if (!previewProjectId) return json({ error: "preview_project_id required" }, 400);

  // Load preview project + linked client
  const { data: preview } = await admin
    .from("preview_projects")
    .select("id, slug, name, client_project_id")
    .eq("id", previewProjectId)
    .maybeSingle();
  if (!preview) return json({ error: "preview not found" }, 404);
  if (!preview.client_project_id) {
    return json({ error: "preview is not linked to a client project" }, 400);
  }

  const { data: cp } = await admin
    .from("client_projects")
    .select("client_id")
    .eq("id", preview.client_project_id)
    .maybeSingle();
  if (!cp?.client_id) return json({ error: "client not found" }, 404);

  const { data: client } = await admin
    .from("clients")
    .select("id, contact_name, contact_email, surecontact_contact_uuid")
    .eq("id", cp.client_id)
    .maybeSingle();
  if (!client?.contact_email) return json({ error: "client has no contact_email" }, 400);

  const origin = req.headers.get("origin") ?? "https://cre8visions.com";
  const previewUrl = `${origin.replace(/\/$/, "")}/p/${preview.slug}`;
  const firstName = (client.contact_name || "").trim().split(/\s+/)[0] || "there";
  const html = buildEmailHtml(firstName, previewUrl);

  const sendBody: Record<string, unknown> = {
    subject: "Your site preview is ready — let's gather your feedback",
    body: html,
    track_opens: true,
    track_clicks: true,
  };
  if (client.surecontact_contact_uuid) {
    sendBody.contact_uuid = client.surecontact_contact_uuid;
  } else {
    sendBody.contact_email = client.contact_email;
  }

  try {
    const resp = await fetch(SURECONTACT_SEND_URL, {
      method: "POST",
      headers: {
        "X-API-Key": SURECONTACT_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(sendBody),
    });
    let data: any = null;
    try { data = await resp.json(); } catch { /* */ }
    if (!resp.ok) {
      console.error("[send-preview-review-email] SureContact failed", resp.status, data);
      return json({ error: data?.message || `SureContact error ${resp.status}`, details: data }, 502);
    }
    return json({ success: true, recipient: client.contact_email, preview_url: previewUrl, surecontact: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "network error";
    return json({ error: msg }, 500);
  }
});
