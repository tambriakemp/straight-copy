// Weekly progress report email helpers.
//
// Sends through SureContact using the "Web Dev — Weekly Progress Report"
// template (UUID below). The template renders the merge fields we populate
// on the contact's custom_fields before triggering the send.

import { splitContactName, upsertSureContact } from "./surecontact.ts";

export const WEEKLY_PROGRESS_TEMPLATE_UUID =
  "a81cf774-414a-4b0d-96dc-8f8e56ed0610";

const SURECONTACT_SEND_URL =
  "https://api.surecontact.com/api/v1/public/emails/send";

export interface ProgressReportRecipient {
  email: string;
  name?: string | null;
  company?: string | null;
  phone?: string | null;
}

/** Strongly-typed merge fields the SureContact template expects. */
export interface ProgressReportData {
  report_week: string;            // "Week of June 2, 2026"
  report_intro: string;           // 1-2 sentence opening
  report_completed: string;       // HTML <ul> of completed items
  report_in_progress: string;     // HTML <ul> of in-progress items
  report_next: string;            // HTML <ul> of next-up items
  report_current_phase: string;   // e.g. "Phase 4 — Development"
  report_progress: string;        // e.g. "On track — 60% complete"
  portal_url: string;
  project_name: string;
  business_name: string;
  contact_name: string;
}

export interface ProgressReportEmailResult {
  ok: boolean;
  status: number;
  recipient: string;
  error?: string;
  details?: unknown;
}

/** Upserts the contact w/ merge fields and triggers the SureContact template. */
export async function sendProgressReportEmail(args: {
  recipient: ProgressReportRecipient;
  data: ProgressReportData;
  tags?: string[];
}): Promise<ProgressReportEmailResult> {
  const apiKey = Deno.env.get("SURECONTACT_API_KEY");
  if (!apiKey) {
    return { ok: false, status: 500, recipient: args.recipient.email, error: "SURECONTACT_API_KEY not configured" };
  }

  const { firstName, lastName } = splitContactName(args.recipient.name ?? "");
  // SureContact merges custom_fields on the contact into the template at send
  // time, so we push all report_* fields onto the contact before triggering.
  const upsert = await upsertSureContact(
    {
      email: args.recipient.email,
      firstName,
      lastName,
      company: args.recipient.company || args.data.business_name || "",
      phone: args.recipient.phone || "",
      customFields: args.data as unknown as Record<string, string>,
      tags: args.tags && args.tags.length > 0 ? args.tags : ["weekly_progress_report"],
      metadata: { form_source: "cre8visions_crm", trigger: "weekly_progress_report" },
    },
    apiKey,
  );
  if (!upsert.ok) {
    return { ok: false, status: upsert.status || 502, recipient: args.recipient.email, error: upsert.error, details: upsert.data };
  }

  try {
    const resp = await fetch(SURECONTACT_SEND_URL, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        contact_email: args.recipient.email,
        template_uuid: WEEKLY_PROGRESS_TEMPLATE_UUID,
      }),
    });
    let data: unknown = null;
    try { data = await resp.json(); } catch { /* */ }
    if (!resp.ok) {
      const msg = (data as any)?.message || `SureContact ${resp.status}`;
      return { ok: false, status: resp.status, recipient: args.recipient.email, error: msg, details: data };
    }
    return { ok: true, status: 200, recipient: args.recipient.email };
  } catch (e) {
    return {
      ok: false,
      status: 500,
      recipient: args.recipient.email,
      error: e instanceof Error ? e.message : "network error",
    };
  }
}

/**
 * Computes the report window: from the previous Friday 21:00 UTC to this
 * Friday 21:00 UTC.
 */
export function getWeeklyWindow(now: Date = new Date()): { start: Date; end: Date; label: string; weekOf: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 21, 0, 0));
  const day = end.getUTCDay();
  const diffToFri = (day - 5 + 7) % 7;
  end.setUTCDate(end.getUTCDate() - diffToFri);
  if (now.getTime() <= end.getTime()) end.setUTCDate(end.getUTCDate() - 7);
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
  const fmtLong = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
  return { start, end, label: `Week of ${fmt(start)} – ${fmt(end)}`, weekOf: `Week of ${fmtLong(end)}` };
}

export interface TaskForSummary {
  id: string;
  name: string;
  description: string | null;
  epic_name: string | null;
  status: string;
  updated_at: string;
}

/** Calls the AI Gateway to assemble all template merge fields. */
export async function generateProgressReportData(args: {
  projectName: string;
  businessName: string | null;
  contactName: string | null;
  periodLabel: string;
  weekOf: string;
  portalUrl: string;
  completedTasks: TaskForSummary[];
  inProgressTasks: TaskForSummary[];
  nextTasks: TaskForSummary[];
}): Promise<ProgressReportData> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const fmtTaskList = (rows: TaskForSummary[]) =>
    rows.length === 0
      ? "(none)"
      : rows
          .map(
            (t) =>
              `- [${t.epic_name || "General"}] ${t.name}${t.description ? ` — ${t.description.slice(0, 240)}` : ""}`,
          )
          .join("\n");

  const systemPrompt = `You are an account manager at a high-end design and development agency writing this week's progress report email for a client. Synthesize the work — do not list every task verbatim. Be warm, confident, concise. Never invent work that isn't in the lists. Output strictly valid JSON.`;

  const userPrompt = `Project: ${args.projectName}
Client: ${args.businessName || "the client"}
Period: ${args.periodLabel}

COMPLETED THIS WEEK (${args.completedTasks.length}):
${fmtTaskList(args.completedTasks)}

CURRENTLY IN PROGRESS (${args.inProgressTasks.length}):
${fmtTaskList(args.inProgressTasks)}

COMING UP NEXT (${args.nextTasks.length}):
${fmtTaskList(args.nextTasks)}

Produce a JSON object with these exact string fields:
- "intro": 1-2 sentence warm opening that frames the week.
- "current_phase": short phase label, e.g. "Phase 4 — Development" or "Discovery", inferred from the work. Keep it crisp.
- "progress": short status sentence, e.g. "On track — design system complete, build underway." Be honest based on what's listed.
- "completed_bullets": array of 1-6 strings. Each string is a single sentence summarizing a meaningful completed item (group related tasks). No markdown.
- "in_progress_bullets": array of 0-5 strings, same style. Empty array if nothing is in progress.
- "next_bullets": array of 0-5 strings, same style. Empty array if nothing is queued.

Return ONLY the JSON, no markdown fence.`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`AI gateway error ${resp.status}: ${text.slice(0, 400)}`);
  }
  const respJson = await resp.json();
  const content = respJson?.choices?.[0]?.message?.content ?? "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = JSON.parse(String(content).replace(/^```(?:json)?\s*|\s*```$/g, ""));
  }

  const toStringArr = (v: unknown): string[] => {
    if (!Array.isArray(v)) return [];
    return v
      .map((b) => {
        if (typeof b === "string") return b.trim();
        if (b && typeof b === "object") {
          const o = b as Record<string, unknown>;
          const lead = o.lead ?? o.title ?? o.heading ?? o.name;
          const body = o.body ?? o.description ?? o.detail ?? o.text ?? o.content;
          if (lead && body) return `${String(lead)}: ${String(body)}`;
          if (lead) return String(lead);
          if (body) return String(body);
          return Object.values(o).map(String).join(" — ");
        }
        return String(b);
      })
      .filter(Boolean);
  };

  const completedBullets = toStringArr(parsed.completed_bullets);
  const inProgressBullets = toStringArr(parsed.in_progress_bullets);
  const nextBullets = toStringArr(parsed.next_bullets);
  const actionItems = toStringArr(parsed.action_items);

  return {
    report_week: args.weekOf,
    report_intro: String(parsed.intro || "").trim() || `Here's where ${args.projectName} stands this week.`,
    report_completed: renderBulletList(completedBullets, "green"),
    report_in_progress: renderBulletList(inProgressBullets, "gold"),
    report_next: renderBulletList(nextBullets, "blue"),
    report_action_items: renderBulletList(actionItems, "amber"),
    report_current_phase: String(parsed.current_phase || "").trim() || "In Progress",
    report_progress: String(parsed.progress || "").trim() || "On track.",
    delivery_date: args.deliveryDate,
    portal_url: args.portalUrl,
    project_name: args.projectName,
    business_name: args.businessName || "",
    contact_name: args.contactName || "",
  };
}

function renderBulletList(items: string[], accent: "green" | "gold" | "blue" | "amber"): string {
  if (items.length === 0) return "";
  const color =
    accent === "green" ? "#3f7a4a" :
    accent === "gold" ? "#b48a2a" :
    accent === "blue" ? "#3b6fa0" : "#c1843a";
  const lis = items
    .map(
      (i) =>
        `<li style="margin:0 0 8px;padding:0;font-family:'Karla',Arial,sans-serif;font-size:15px;line-height:1.6;color:#2b2722;border-left:3px solid ${color};padding-left:12px;list-style:none;">${escapeHtml(i)}</li>`,
    )
    .join("");
  return `<ul style="margin:0;padding:0;list-style:none;">${lis}</ul>`;
}

/** In-app preview that mirrors the SureContact template layout. */
export function renderProgressReportPreviewHtml(data: ProgressReportData): string {
  const section = (label: string, html: string) => {
    if (!html) return "";
    return `
      <tr><td style="padding:18px 40px 4px 40px;font-family:'Karla',Arial,sans-serif;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#7a6a55;">${escapeHtml(label)}</td></tr>
      <tr><td style="padding:6px 40px 4px 40px;">${html}</td></tr>`;
  };
  const greeting = data.contact_name ? `Hi ${escapeHtml(data.contact_name.split(" ")[0])},` : "Hello,";
  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>${escapeHtml(data.project_name)} — Weekly Progress</title></head>
<body style="margin:0;padding:0;background:#faf6ef;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf6ef;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fffdf9;border:1px solid #e7ddcd;border-radius:6px;">
        <tr><td style="padding:36px 40px 8px 40px;border-bottom:1px solid #efe7d6;">
          <div style="font-family:'Karla',Arial,sans-serif;font-size:11px;letter-spacing:0.35em;text-transform:uppercase;color:#7a6a55;">Cre8 Visions · Weekly Report</div>
          <h1 style="margin:14px 0 4px;font-family:'Cormorant Garamond',Georgia,serif;font-weight:500;font-size:34px;line-height:1.2;color:#2b2722;">${escapeHtml(data.project_name)}</h1>
          <div style="font-family:'Karla',Arial,sans-serif;font-size:14px;color:#7a6a55;">${escapeHtml(data.report_week)}${data.business_name ? ` · ${escapeHtml(data.business_name)}` : ""}</div>
        </td></tr>
        <tr><td style="padding:28px 40px 4px 40px;font-family:'Karla',Arial,sans-serif;font-size:15px;line-height:1.65;color:#2b2722;">
          <p style="margin:0 0 14px;">${escapeHtml(greeting)}</p>
          <p style="margin:0 0 4px;">${escapeHtml(data.report_intro)}</p>
        </td></tr>
        <tr><td style="padding:18px 40px 4px 40px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #efe7d6;border-radius:4px;">
            <tr>
              <td style="padding:12px 16px;font-family:'Karla',Arial,sans-serif;font-size:13px;color:#7a6a55;">
                <strong style="color:#2b2722;">Phase:</strong> ${escapeHtml(data.report_current_phase)}<br/>
                <strong style="color:#2b2722;">Status:</strong> ${escapeHtml(data.report_progress)}<br/>
                <strong style="color:#2b2722;">Target delivery:</strong> ${escapeHtml(data.delivery_date)}
              </td>
            </tr>
          </table>
        </td></tr>
        ${section("Completed this week", data.report_completed)}
        ${section("In progress", data.report_in_progress)}
        ${section("Coming up next", data.report_next)}
        ${section("Action items for you", data.report_action_items)}
        <tr><td style="padding:28px 40px 36px 40px;">
          <a href="${escapeAttr(data.portal_url)}" style="display:inline-block;font-family:'Karla',Arial,sans-serif;font-size:12px;letter-spacing:0.25em;text-transform:uppercase;color:#2b2722;text-decoration:none;border:1px solid #2b2722;padding:12px 22px;border-radius:2px;">View in client portal</a>
        </td></tr>
        <tr><td style="padding:18px 40px 28px 40px;border-top:1px solid #efe7d6;font-family:'Karla',Arial,sans-serif;font-size:12px;color:#9a8c75;">
          Sent automatically by Cre8 Visions. Reply to this email to reach the team directly.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeAttr(s: string): string { return escapeHtml(s); }
