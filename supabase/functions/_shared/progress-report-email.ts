// Shared helper that renders the AI-generated weekly progress report body
// into a fully-styled HTML email and sends it through SureContact so opens
// and clicks are tracked. We send via the same `/public/emails/send`
// endpoint used by `send-web-dev-email`, but we use a self-contained HTML
// body (custom_subject + custom_html) so no SureContact template UUID is
// required.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";
import { splitContactName, upsertSureContact } from "./surecontact.ts";

const SURECONTACT_SEND_URL =
  "https://api.surecontact.com/api/v1/public/emails/send";

export interface ProgressReportRecipient {
  email: string;
  name?: string | null;
  company?: string | null;
  phone?: string | null;
}

export interface ProgressReportEmailInput {
  recipient: ProgressReportRecipient;
  subject: string;
  html: string;
  /** Tags applied to the SureContact contact for filtering/tracking. */
  tags?: string[];
  /** Custom fields merged into the contact for reporting. */
  mergeFields?: Record<string, string | number | null | undefined>;
}

export interface ProgressReportEmailResult {
  ok: boolean;
  status: number;
  recipient: string;
  error?: string;
  details?: unknown;
}

/** Sends a single progress-report email via SureContact. */
export async function sendProgressReportEmail(
  input: ProgressReportEmailInput,
): Promise<ProgressReportEmailResult> {
  const apiKey = Deno.env.get("SURECONTACT_API_KEY");
  if (!apiKey) {
    return { ok: false, status: 500, recipient: input.recipient.email, error: "SURECONTACT_API_KEY not configured" };
  }

  const { firstName, lastName } = splitContactName(input.recipient.name ?? "");
  const upsert = await upsertSureContact(
    {
      email: input.recipient.email,
      firstName,
      lastName,
      company: input.recipient.company || "",
      phone: input.recipient.phone || "",
      customFields: input.mergeFields,
      tags: input.tags && input.tags.length > 0 ? input.tags : ["weekly_progress_report"],
      metadata: { form_source: "cre8visions_crm", trigger: "weekly_progress_report" },
    },
    apiKey,
  );
  if (!upsert.ok) {
    return { ok: false, status: upsert.status || 502, recipient: input.recipient.email, error: upsert.error, details: upsert.data };
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
        contact_email: input.recipient.email,
        custom_subject: input.subject,
        custom_html: input.html,
        tracking: { opens: true, clicks: true },
      }),
    });
    let data: unknown = null;
    try { data = await resp.json(); } catch { /* */ }
    if (!resp.ok) {
      const msg = (data as any)?.message || `SureContact ${resp.status}`;
      return { ok: false, status: resp.status, recipient: input.recipient.email, error: msg, details: data };
    }
    return { ok: true, status: 200, recipient: input.recipient.email };
  } catch (e) {
    return {
      ok: false,
      status: 500,
      recipient: input.recipient.email,
      error: e instanceof Error ? e.message : "network error",
    };
  }
}

export interface ProgressReportSummary {
  /** Short paragraph that frames the week's work. */
  overview: string;
  /** Bullet items, max 5, each phrased as a punchy lead-in. */
  bullets: string[];
}

/** Brand-styled HTML email for the weekly progress report. */
export function renderProgressReportHtml(args: {
  projectName: string;
  businessName: string | null;
  contactName: string | null;
  periodLabel: string;
  summary: ProgressReportSummary;
  portalUrl: string;
  taskCount: number;
}): string {
  const greeting = args.contactName ? `Hi ${escapeHtml(args.contactName.split(" ")[0])},` : "Hello,";
  const bulletItems = (args.summary.bullets || [])
    .slice(0, 5)
    .map(
      (b) => `
        <tr>
          <td style="padding:0 0 14px 0;font-family:'Karla',Arial,sans-serif;font-size:15px;line-height:1.6;color:#2b2722;">
            <span style="display:inline-block;width:18px;color:#7a6a55;">✓</span>
            <span>${formatBulletHtml(b)}</span>
          </td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(args.projectName)} — Weekly Progress</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf6ef;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fffdf9;border:1px solid #e7ddcd;border-radius:6px;">
          <tr>
            <td style="padding:36px 40px 8px 40px;border-bottom:1px solid #efe7d6;">
              <div style="font-family:'Karla',Arial,sans-serif;font-size:11px;letter-spacing:0.35em;text-transform:uppercase;color:#7a6a55;">Cre8 Visions · Weekly Report</div>
              <h1 style="margin:14px 0 4px;font-family:'Cormorant Garamond',Georgia,serif;font-weight:500;font-size:34px;line-height:1.2;color:#2b2722;">
                ${escapeHtml(args.projectName)}
              </h1>
              <div style="font-family:'Karla',Arial,sans-serif;font-size:14px;color:#7a6a55;">
                ${escapeHtml(args.periodLabel)}${args.businessName ? ` · ${escapeHtml(args.businessName)}` : ""}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 40px 8px 40px;font-family:'Karla',Arial,sans-serif;font-size:15px;line-height:1.65;color:#2b2722;">
              <p style="margin:0 0 18px;">${escapeHtml(greeting)}</p>
              <div style="font-family:'Karla',Arial,sans-serif;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#7a6a55;margin-bottom:6px;">Project Overview</div>
              <p style="margin:0 0 22px;">${formatParagraphHtml(args.summary.overview)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 8px 40px;">
              <div style="font-family:'Karla',Arial,sans-serif;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#7a6a55;margin-bottom:12px;">Key Updates</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${bulletItems}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 40px 28px 40px;font-family:'Karla',Arial,sans-serif;font-size:13px;color:#7a6a55;">
              ${args.taskCount} task${args.taskCount === 1 ? "" : "s"} completed this period.
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 36px 40px;">
              <a href="${escapeAttr(args.portalUrl)}" style="display:inline-block;font-family:'Karla',Arial,sans-serif;font-size:12px;letter-spacing:0.25em;text-transform:uppercase;color:#2b2722;text-decoration:none;border:1px solid #2b2722;padding:12px 22px;border-radius:2px;">View in client portal</a>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 40px 28px 40px;border-top:1px solid #efe7d6;font-family:'Karla',Arial,sans-serif;font-size:12px;color:#9a8c75;">
              Sent automatically by Cre8 Visions. Reply to this email to reach the team directly.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function formatBulletHtml(s: string): string {
  // Allow `**bold**` for the lead-in.
  const escaped = escapeHtml(s);
  return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function formatParagraphHtml(s: string): string {
  return escapeHtml(s).replace(/\n/g, "<br/>");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

/**
 * Computes the report window: from the previous Friday 21:00 UTC to this
 * Friday 21:00 UTC. When called on a Friday before 21:00 UTC, returns the
 * week ending today; otherwise the week ending the upcoming Friday.
 */
export function getWeeklyWindow(now: Date = new Date()): { start: Date; end: Date; label: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 21, 0, 0));
  // Day of week (0=Sun..6=Sat). Want Friday = 5.
  const day = end.getUTCDay();
  const diffToFri = (day - 5 + 7) % 7; // days since most recent Friday
  end.setUTCDate(end.getUTCDate() - diffToFri);
  // If we're past the current Friday's send time, that's the period end. Otherwise use last Friday.
  if (now.getTime() > end.getTime()) {
    // good — end is the most recent Friday 21:00 UTC at-or-before now
  } else {
    end.setUTCDate(end.getUTCDate() - 7);
  }
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
  return { start, end, label: `Week of ${fmt(start)} – ${fmt(end)}` };
}

export interface CompletedTaskForSummary {
  id: string;
  name: string;
  description: string | null;
  epic_name: string | null;
  completed_at: string;
}

/** Asks the AI Gateway for the project overview + bullets. */
export async function generateProgressSummary(
  tasks: CompletedTaskForSummary[],
  projectName: string,
  periodLabel: string,
): Promise<ProgressReportSummary> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const taskLines = tasks
    .map(
      (t) =>
        `- [${t.epic_name || "General"}] ${t.name}${t.description ? ` — ${t.description.slice(0, 280)}` : ""}`,
    )
    .join("\n");

  const systemPrompt = `You are an account manager at a high-end design and development agency writing a weekly progress report email for a client. Write at a high level — synthesize the work, do not list every task. Be warm, confident, and concise. Never invent work that isn't in the list. Output strictly valid JSON.`;

  const userPrompt = `Project: ${projectName}
Period: ${periodLabel}
Completed tasks this week (${tasks.length}):
${taskLines}

Produce a JSON object with:
- "overview": one paragraph (3-5 sentences) framing the week's progress at a high level.
- "bullets": an array of 1-5 strings, each a key update. Begin each bullet with a short bold lead-in using **double asterisks**, then a colon, then a one-sentence elaboration. Group related tasks. Skip work that doesn't matter.

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
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content ?? "{}";
  let parsed: ProgressReportSummary;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Try to strip ```json fences if model ignored instructions
    const stripped = String(content).replace(/^```(?:json)?\s*|\s*```$/g, "");
    parsed = JSON.parse(stripped);
  }
  if (!parsed.overview || !Array.isArray(parsed.bullets)) {
    throw new Error("AI response missing required fields");
  }
  parsed.bullets = parsed.bullets.slice(0, 5).map(String);
  return parsed;
}
