// Sends the "Site Preview Ready" review email to a client contact via
// SureContact's transactional /emails/send endpoint.
//
// Prefers a SureContact template (configured in app_settings.review_email_template_uuid)
// so every send shows up in the contact's SureContact activity history with the
// same template. Falls back to inline HTML if no template uuid is configured yet.
//
// Accepts an optional `contact_id` referencing public.client_contacts.
// If omitted, falls back to the client's primary contact, then to the legacy
// clients.contact_* columns.
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

function buildEmailHtml(firstName: string, portalUrl: string) {
  const safeName = escapeHtml(firstName || "there");
  const safeUrl = escapeHtml(portalUrl);
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f6f3ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2a2622;">
  <div style="max-width:600px;margin:0 auto;padding:40px 28px;background:#ffffff;">
    <p style="font-size:16px;line-height:1.6;margin:0 0 18px;">Hi ${safeName},</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 18px;">
      Your site preview is live and ready for your eyes. Head to your client portal to walk through it.
    </p>
    <p style="margin:28px 0;text-align:center;">
      <a href="${safeUrl}"
         style="display:inline-block;background:#8a6d4e;color:#ffffff;text-decoration:none;
                padding:14px 28px;border-radius:4px;font-size:15px;letter-spacing:0.05em;">
        Open my client portal
      </a>
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
  const contactId: string | undefined = body?.contact_id;
  if (!previewProjectId) return json({ error: "preview_project_id required" }, 400);

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
    .select("id, business_name, contact_name, contact_email, surecontact_contact_uuid")
    .eq("id", cp.client_id)
    .maybeSingle();
  if (!client) return json({ error: "client not found" }, 404);

  // Resolve which contact to send to
  let recipientEmail: string | null = null;
  let recipientName: string | null = null;
  let recipientSureUuid: string | null = null;

  if (contactId) {
    const { data: contact } = await admin
      .from("client_contacts")
      .select("id, name, email, surecontact_contact_uuid, client_id")
      .eq("id", contactId)
      .maybeSingle();
    if (!contact || contact.client_id !== cp.client_id) {
      return json({ error: "contact not found for this client" }, 400);
    }
    recipientEmail = contact.email;
    recipientName = contact.name;
    recipientSureUuid = contact.surecontact_contact_uuid;
  } else {
    // Try primary contact from client_contacts
    const { data: primary } = await admin
      .from("client_contacts")
      .select("name, email, surecontact_contact_uuid")
      .eq("client_id", cp.client_id)
      .eq("is_primary", true)
      .maybeSingle();
    if (primary?.email) {
      recipientEmail = primary.email;
      recipientName = primary.name;
      recipientSureUuid = primary.surecontact_contact_uuid;
    } else {
      recipientEmail = client.contact_email;
      recipientName = client.contact_name;
      recipientSureUuid = client.surecontact_contact_uuid;
    }
  }

  if (!recipientEmail) return json({ error: "contact has no email" }, 400);

  const origin = req.headers.get("origin") ?? "https://cre8visions.com";
  const portalUrl = `${origin.replace(/\/$/, "")}/portal/${cp.client_id}`;
  const previewUrl = `${origin.replace(/\/$/, "")}/p/${preview.slug}`;
  const firstName = (recipientName || "").trim().split(/\s+/)[0] || "there";
  const businessName = client.business_name || "your business";

  // Look up template uuid (if configured)
  const { data: settings } = await admin
    .from("app_settings")
    .select("review_email_template_uuid")
    .eq("id", 1)
    .maybeSingle();
  const templateUuid: string | null = settings?.review_email_template_uuid ?? null;

  const sendBody: Record<string, unknown> = {
    track_opens: true,
    track_clicks: true,
  };

  if (templateUuid) {
    sendBody.template_uuid = templateUuid;
    sendBody.variables = {
      first_name: firstName,
      client_name: recipientName || firstName,
      business_name: businessName,
      portal_url: portalUrl,
      preview_url: previewUrl,
    };
  } else {
    sendBody.subject = "Your site preview is ready — let's gather your feedback";
    sendBody.body = buildEmailHtml(firstName, portalUrl);
  }

  if (recipientSureUuid) {
    sendBody.contact_uuid = recipientSureUuid;
  } else {
    sendBody.contact_email = recipientEmail;
    if (recipientName) sendBody.contact_name = recipientName;
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
    return json({
      success: true,
      recipient: recipientEmail,
      preview_url: previewUrl,
      used_template: !!templateUuid,
      surecontact: data,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "network error";
    return json({ error: msg }, 500);
  }
});
