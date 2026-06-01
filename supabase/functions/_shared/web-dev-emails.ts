// SureContact template bindings for the Web Dev workflow.
// Same send pattern as send-preview-review-email: upsert contact (refresh
// merge fields) then POST to /public/emails/send with template_uuid.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";
import { splitContactName, upsertSureContact } from "./surecontact.ts";

const SURECONTACT_SEND_URL =
  "https://api.surecontact.com/api/v1/public/emails/send";

export type WebDevEmailTrigger = "agency" | "auto";

export interface WebDevEmailTemplate {
  uuid: string;
  trigger: WebDevEmailTrigger;
  label: string;
}

export const WEB_DEV_EMAIL_TEMPLATES: Record<string, WebDevEmailTemplate> = {
  "web-dev-kickoff":                { uuid: "aa81debf", trigger: "agency", label: "Kickoff" },
  "web-dev-contract-signed":        { uuid: "375741e8", trigger: "auto",   label: "Contract signed" },
  "web-dev-questionnaire-complete": { uuid: "ccd63937", trigger: "auto",   label: "Questionnaire complete" },
  "web-dev-design-concepts-ready":  { uuid: "4d87b58a", trigger: "agency", label: "Design concepts ready" },
  "web-dev-design-approved":        { uuid: "08c4a5e9", trigger: "agency", label: "Design approved — dev starting" },
  "web-dev-prelaunch-preview":      { uuid: "d2283bd3", trigger: "agency", label: "Pre-launch preview" },
  "web-dev-launch-confirmation":    { uuid: "5b4efb27", trigger: "agency", label: "Launch confirmation" },
  "web-dev-postlaunch-followup":    { uuid: "745635fc", trigger: "auto",   label: "Post-launch follow-up" },
};

export interface SendWebDevEmailArgs {
  taskId?: string | null;
  templateKey: string;
  clientId: string;
  projectId?: string | null;
  extraMergeFields?: Record<string, string | number | null | undefined>;
}

export interface SendWebDevEmailResult {
  ok: boolean;
  status: number;
  recipient?: string;
  error?: string;
  details?: unknown;
}

/**
 * Sends a SureContact template to the primary contact of a client, refreshing
 * the contact's merge fields first. On success, if a taskId is provided the
 * task's email_template JSON is stamped with sent_at; on failure last_send_error
 * is stored.
 */
export async function sendWebDevTemplate(
  sb: SupabaseClient,
  args: SendWebDevEmailArgs,
): Promise<SendWebDevEmailResult> {
  const tpl = WEB_DEV_EMAIL_TEMPLATES[args.templateKey];
  if (!tpl) return { ok: false, status: 400, error: `Unknown template ${args.templateKey}` };

  const apiKey = Deno.env.get("SURECONTACT_API_KEY");
  if (!apiKey) return { ok: false, status: 500, error: "SURECONTACT_API_KEY not configured" };

  // Load client
  const { data: client, error: clientErr } = await sb
    .from("clients")
    .select("id, contact_name, contact_email, contact_phone, business_name")
    .eq("id", args.clientId)
    .maybeSingle();
  if (clientErr || !client) {
    return { ok: false, status: 404, error: "Client not found" };
  }

  // Prefer primary contact from client_contacts when present
  let email = client.contact_email as string | null;
  let name = client.contact_name as string | null;
  let phone = client.contact_phone as string | null;
  const { data: primary } = await sb
    .from("client_contacts")
    .select("email, name, phone")
    .eq("client_id", client.id)
    .eq("is_primary", true)
    .maybeSingle();
  if (primary?.email) {
    email = primary.email;
    name = primary.name ?? name;
    phone = primary.phone ?? phone;
  }
  if (!email) {
    return { ok: false, status: 422, error: "Client has no email on file" };
  }

  // Build merge fields
  const portalUrl = `https://cre8visions.com/portal`;
  let projectName: string | null = null;
  if (args.projectId) {
    const { data: proj } = await sb
      .from("client_projects")
      .select("name")
      .eq("id", args.projectId)
      .maybeSingle();
    projectName = proj?.name ?? null;
  }

  const merge: Record<string, string | number | null | undefined> = {
    portal_url: portalUrl,
    project_name: projectName,
    business_name: client.business_name,
    contact_name: name,
    template_key: args.templateKey,
    ...(args.extraMergeFields || {}),
  };

  const { firstName, lastName } = splitContactName(name);
  const upsert = await upsertSureContact(
    {
      email,
      firstName,
      lastName,
      company: client.business_name || "",
      phone: phone || "",
      customFields: merge,
      metadata: { form_source: "cre8visions_crm", trigger: `web_dev:${args.templateKey}` },
    },
    apiKey,
  );
  if (!upsert.ok) {
    await stampTaskFailure(sb, args.taskId, upsert.error || "upsert_failed");
    return { ok: false, status: upsert.status || 502, error: upsert.error, details: upsert.data };
  }

  let data: unknown = null;
  try {
    const resp = await fetch(SURECONTACT_SEND_URL, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ contact_email: email, template_uuid: tpl.uuid }),
    });
    try { data = await resp.json(); } catch { /* */ }
    if (!resp.ok) {
      const msg = (data as any)?.message || `SureContact ${resp.status}`;
      await stampTaskFailure(sb, args.taskId, msg);
      return { ok: false, status: resp.status, error: msg, details: data };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "network error";
    await stampTaskFailure(sb, args.taskId, msg);
    return { ok: false, status: 500, error: msg };
  }

  await stampTaskSuccess(sb, args.taskId);
  return { ok: true, status: 200, recipient: email };
}

async function stampTaskSuccess(sb: SupabaseClient, taskId?: string | null) {
  if (!taskId) return;
  const { data: t } = await sb.from("project_tasks").select("email_template").eq("id", taskId).maybeSingle();
  if (!t) return;
  const next = { ...(t.email_template || {}), sent_at: new Date().toISOString(), last_send_error: null };
  await sb.from("project_tasks").update({ email_template: next }).eq("id", taskId);
}

async function stampTaskFailure(sb: SupabaseClient, taskId: string | null | undefined, err: string) {
  if (!taskId) return;
  const { data: t } = await sb.from("project_tasks").select("email_template").eq("id", taskId).maybeSingle();
  if (!t) return;
  const next = { ...(t.email_template || {}), last_send_error: err };
  await sb.from("project_tasks").update({ email_template: next }).eq("id", taskId);
}

/**
 * Finds the task in the given project that's bound to a given template_key,
 * if any. Used by auto-fire wiring so the send is stamped onto the right card.
 */
export async function findTaskByTemplate(
  sb: SupabaseClient,
  projectId: string,
  templateKey: string,
): Promise<{ id: string } | null> {
  const { data } = await sb
    .from("project_tasks")
    .select("id, email_template")
    .eq("client_project_id", projectId)
    .not("email_template", "is", null);
  for (const t of data ?? []) {
    if ((t as any).email_template?.template_key === templateKey) return { id: t.id as string };
  }
  return null;
}
