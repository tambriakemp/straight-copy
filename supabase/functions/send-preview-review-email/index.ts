// Sends the "AI OS — Design Preview" review email to a client contact via
// SureContact's transactional /emails/send endpoint using a template UUID.
//
// The template lives in SureContact (named "AI OS — Design Preview"). We
// look up its UUID once via the templates API and cache it in
// app_settings.review_email_template_uuid. Merge tags in the template pull
// from the contact's primary_fields + custom_fields, so we upsert the contact
// first with first_name/business_name/portal_url/preview_url before sending.
//
// Accepts an optional `contact_id` referencing public.client_contacts.
// If omitted, falls back to the client's primary contact, then to the legacy
// clients.contact_* columns.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { splitContactName, upsertSureContact } from "../_shared/surecontact.ts";

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
const SURECONTACT_TEMPLATES_URL =
  "https://api.surecontact.com/api/v1/public/email-templates?per_page=100";

const TEMPLATE_NAME = "AI OS — Design Preview";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeName(s: string) {
  // Normalize unicode dashes + whitespace so "—", "–", "-" all match.
  return s
    .normalize("NFKC")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function resolveTemplateUuid(
  admin: ReturnType<typeof createClient>,
  apiKey: string,
): Promise<{ uuid: string | null; error?: string }> {
  const { data: settings } = await admin
    .from("app_settings")
    .select("review_email_template_uuid")
    .eq("id", 1)
    .maybeSingle();
  if (settings?.review_email_template_uuid) {
    return { uuid: settings.review_email_template_uuid };
  }

  const resp = await fetch(SURECONTACT_TEMPLATES_URL, {
    headers: { "X-API-Key": apiKey, Accept: "application/json" },
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    return { uuid: null, error: `SureContact templates ${resp.status}` };
  }
  const items: any[] = Array.isArray(data?.data) ? data.data : [];
  const target = normalizeName(TEMPLATE_NAME);
  const match = items.find((t: any) => normalizeName(String(t?.name ?? "")) === target);
  if (!match?.uuid) {
    return { uuid: null, error: `Template "${TEMPLATE_NAME}" not found in SureContact` };
  }
  await admin
    .from("app_settings")
    .update({ review_email_template_uuid: match.uuid, updated_at: new Date().toISOString() })
    .eq("id", 1);
  return { uuid: match.uuid };
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
    .select("id, business_name, contact_name, contact_email, contact_phone, surecontact_contact_uuid")
    .eq("id", cp.client_id)
    .maybeSingle();
  if (!client) return json({ error: "client not found" }, 404);

  // Resolve recipient
  let recipientEmail: string | null = null;
  let recipientName: string | null = null;
  let recipientPhone: string | null = null;

  if (contactId) {
    const { data: contact } = await admin
      .from("client_contacts")
      .select("id, name, email, phone, client_id")
      .eq("id", contactId)
      .maybeSingle();
    if (!contact || contact.client_id !== cp.client_id) {
      return json({ error: "contact not found for this client" }, 400);
    }
    recipientEmail = contact.email;
    recipientName = contact.name;
    recipientPhone = contact.phone;
  } else {
    const { data: primary } = await admin
      .from("client_contacts")
      .select("name, email, phone")
      .eq("client_id", cp.client_id)
      .eq("is_primary", true)
      .maybeSingle();
    if (primary?.email) {
      recipientEmail = primary.email;
      recipientName = primary.name;
      recipientPhone = primary.phone;
    } else {
      recipientEmail = client.contact_email;
      recipientName = client.contact_name;
      recipientPhone = client.contact_phone;
    }
  }

  if (!recipientEmail) return json({ error: "contact has no email" }, 400);

  const origin = req.headers.get("origin") ?? "https://cre8visions.com";
  const portalUrl = `${origin.replace(/\/$/, "")}/portal/${cp.client_id}`;
  const previewUrl = `${origin.replace(/\/$/, "")}/p/${preview.slug}`;
  const businessName = client.business_name || "your business";
  const { firstName, lastName } = splitContactName(recipientName);

  // 1) Resolve the template UUID (cached in app_settings)
  const { uuid: templateUuid, error: tplError } = await resolveTemplateUuid(admin, SURECONTACT_API_KEY);
  if (!templateUuid) return json({ error: tplError || "Template not found" }, 502);

  // 2) Upsert the contact so SureContact has fresh primary_fields + custom_fields
  //    available to the template merge tags.
  const upsert = await upsertSureContact(
    {
      email: recipientEmail,
      firstName,
      lastName,
      company: businessName,
      phone: recipientPhone ?? "",
      customFields: {
        portal_url: portalUrl,
        preview_url: previewUrl,
        business_name: businessName,
        client_name: recipientName ?? firstName,
      },
      metadata: { form_source: "cre8visions_crm", trigger: "preview_review" },
    },
    SURECONTACT_API_KEY,
  );
  if (!upsert.ok) {
    return json({ error: upsert.error || `Upsert failed (${upsert.status})`, details: upsert.data }, 502);
  }

  // 3) Send via template
  const sendPayload = {
    contact_email: recipientEmail,
    template_uuid: templateUuid,
  };

  try {
    const resp = await fetch(SURECONTACT_SEND_URL, {
      method: "POST",
      headers: {
        "X-API-Key": SURECONTACT_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(sendPayload),
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
      template_uuid: templateUuid,
      surecontact: data,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "network error";
    return json({ error: msg }, 500);
  }
});
