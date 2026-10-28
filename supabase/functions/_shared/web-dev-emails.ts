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

// CRE-780: these 8 ids didn't exist in SureContact ("Template not found" on
// aa81debf.../375741e8...) — replaced with the real ids, matched by name.
export const WEB_DEV_EMAIL_TEMPLATES: Record<string, WebDevEmailTemplate> = {
  "web-dev-kickoff":                { uuid: "6ae6694f-eaa9-4565-a8c0-3a9aacf5ded0", trigger: "agency", label: "Kickoff" },
  "web-dev-contract-signed":        { uuid: "4d90fb2d-b077-48bc-995f-0d533f105641", trigger: "auto",   label: "Contract signed" },
  "web-dev-questionnaire-complete": { uuid: "049399da-b336-4317-a96a-ca26da6f5e8f", trigger: "auto",   label: "Questionnaire complete" },
  "web-dev-design-concepts-ready":  { uuid: "9c170670-6b62-4347-87a6-65cb4213c9eb", trigger: "agency", label: "Design concepts ready" },
  "web-dev-design-approved":        { uuid: "fbb68e73-7195-45be-9b50-cabdbe780ce6", trigger: "agency", label: "Design approved — dev starting" },
  "web-dev-prelaunch-preview":      { uuid: "1af163de-d03e-4fb7-8022-2ff8e0f6ecfa", trigger: "agency", label: "Pre-launch preview" },
  "web-dev-launch-confirmation":    { uuid: "8ed5d561-df8b-43c8-9ee2-00ecd21bb6ff", trigger: "agency", label: "Launch confirmation" },
  "web-dev-postlaunch-followup":    { uuid: "c5366a69-a133-4835-bb59-a0c00a14ff1c", trigger: "auto",   label: "Post-launch follow-up" },
};

// Templates whose CTA button should land the client directly on the
// discovery chat rather than the bare project page — the two earliest
// sends, whose SureContact copy already says "Start my discovery chat".
const DEEP_LINK_TO_DISCOVERY = new Set(["web-dev-kickoff", "web-dev-contract-signed"]);

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

  // Prefer the project's assigned primary contact when present; otherwise
  // fall back to the client-level primary contact, then to the client record.
  let email = client.contact_email as string | null;
  let name = client.contact_name as string | null;
  let phone = client.contact_phone as string | null;

  let projectPrimaryId: string | null = null;
  if (args.projectId) {
    const { data: proj } = await sb
      .from("client_projects")
      .select("primary_contact_id")
      .eq("id", args.projectId)
      .maybeSingle();
    projectPrimaryId = (proj?.primary_contact_id as string | null) ?? null;
  }

  if (projectPrimaryId) {
    const { data: pc } = await sb
      .from("client_contacts")
      .select("email, name, phone")
      .eq("id", projectPrimaryId)
      .maybeSingle();
    if (pc?.email) {
      email = pc.email;
      name = pc.name ?? name;
      phone = pc.phone ?? phone;
    }
  } else {
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
  }
  if (!email) {
    return { ok: false, status: 422, error: "Client has no email on file" };
  }

  // Build merge fields. CRE-780: this used to send the bare
  // https://cre8visions.com/portal, which has no route — build a real,
  // per-client (and, when we have one, per-project) link instead.
  const baseUrl = (Deno.env.get("PORTAL_BASE_URL") || "https://cre8visions.com").replace(/\/$/, "");
  const portalUrl = args.projectId
    ? `${baseUrl}/portal/${args.clientId}/projects/${args.projectId}${DEEP_LINK_TO_DISCOVERY.has(args.templateKey) ? "#portal-discovery" : ""}`
    : `${baseUrl}/portal/${args.clientId}`;
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

/**
 * Finds the latest active web_development project for a client. Used by
 * auto-fire hooks that have a client_id but no project_id.
 */
export async function findLatestWebDevProject(
  sb: SupabaseClient,
  clientId: string,
): Promise<{ id: string } | null> {
  const { data } = await sb
    .from("client_projects")
    .select("id, created_at")
    .eq("client_id", clientId)
    .eq("type", "web_development")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id as string } : null;
}

/**
 * Convenience wrapper for auto-fire events: looks up the project + matching
 * task, then sends the template. Safe to call from webhook/edge contexts —
 * swallows "no project / no task" cases as no-ops so non-web-dev clients are
 * not affected.
 */
export async function autoFireWebDevTemplate(
  sb: SupabaseClient,
  args: { clientId: string; templateKey: string; extraMergeFields?: Record<string, string | number | null | undefined> },
): Promise<SendWebDevEmailResult | { ok: true; status: 204; skipped: string }> {
  const project = await findLatestWebDevProject(sb, args.clientId);
  if (!project) return { ok: true, status: 204, skipped: "no_web_dev_project" };
  const task = await findTaskByTemplate(sb, project.id, args.templateKey);
  // Idempotency: if already sent, skip
  if (task) {
    const { data: t } = await sb.from("project_tasks").select("email_template").eq("id", task.id).maybeSingle();
    if ((t as any)?.email_template?.sent_at) {
      return { ok: true, status: 204, skipped: "already_sent" };
    }
  }
  return sendWebDevTemplate(sb, {
    taskId: task?.id ?? null,
    templateKey: args.templateKey,
    clientId: args.clientId,
    projectId: project.id,
    extraMergeFields: args.extraMergeFields,
  });
}

/** Enqueue a scheduled send (drained by the cron). */
export async function scheduleWebDevEmail(
  sb: SupabaseClient,
  args: { taskId: string; templateKey: string; sendAfter: Date },
): Promise<void> {
  await sb.from("web_dev_scheduled_emails").insert({
    task_id: args.taskId,
    template_key: args.templateKey,
    send_after: args.sendAfter.toISOString(),
  });
}
