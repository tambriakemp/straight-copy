// Delivering a finished run to the channels the agent is configured for.
//
// in_app is implicit — the run row IS the in-app delivery, plus an
// activity_events entry so it shows up in the dashboard feed. The rest are
// opt-in per agent. Every channel is best-effort: a failed email must never
// mark a successful run as failed.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";
import type { AgentFinding, AgentRow } from "./types.ts";
import { sendPushToAll } from "./push.ts";

const ADMIN_EMAIL = Deno.env.get("PROGRESS_REPORT_ADMIN_EMAIL") ?? "";
const PORTAL_BASE = Deno.env.get("PORTAL_BASE_URL") ?? "";
const FROM_NAME = "straight-copy";
const FROM_DOMAIN = "cre8visions.com";
const SENDER_DOMAIN = "notify.cre8visions.com";

/** Minimal markdown → HTML for the email body. Headings, bullets, bold, links. */
function renderBrief(markdown: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\[(.+?)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');

  const out: string[] = [];
  let inList = false;
  for (const line of markdown.split("\n")) {
    const t = line.trim();
    if (/^[-*]\s+/.test(t)) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(t.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    if (inList) { out.push("</ul>"); inList = false; }
    if (!t) continue;
    if (/^#{1,3}\s+/.test(t)) out.push(`<h3>${inline(t.replace(/^#{1,3}\s+/, ""))}</h3>`);
    else out.push(`<p>${inline(t)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

export async function deliverRun(
  sb: SupabaseClient,
  agent: AgentRow,
  runId: string,
  finding: AgentFinding,
  pendingApprovals: number,
  opts?: { push?: boolean },
): Promise<Record<string, unknown>> {
  const delivery = agent.delivery ?? {};
  const outcome: Record<string, unknown> = {};

  // --- in-app: always. The dashboard feed reads activity_events. ---
  await sb.from("activity_events").insert({
    kind: "agent_run_completed",
    title: `${agent.name}: ${finding.headline}`,
    description: pendingApprovals
      ? `${pendingApprovals} action${pendingApprovals === 1 ? "" : "s"} waiting for approval`
      : null,
    actor: agent.name,
    agent_id: agent.id,
    agent_run_id: runId,
    metadata: { agent_key: agent.key },
  });
  outcome.in_app = true;

  // --- email ---
  if (delivery.email && ADMIN_EMAIL) {
    try {
      const messageId = crypto.randomUUID();
      const link = PORTAL_BASE ? `${PORTAL_BASE}/admin/agents/runs/${runId}` : null;
      const html = `
        <div style="font-family:Georgia,serif;max-width:620px;margin:0 auto;color:#1c1a17">
          <p style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:#8a8378">
            ${esc(agent.role)}
          </p>
          <h2 style="font-weight:400;font-size:22px;margin:6px 0 18px">${esc(finding.headline)}</h2>
          ${renderBrief(finding.summary)}
          ${pendingApprovals ? `<p style="margin-top:18px"><strong>${pendingApprovals}</strong> action${pendingApprovals === 1 ? "" : "s"} waiting for your approval.</p>` : ""}
          ${link ? `<p style="margin-top:22px"><a href="${link}">Open the full run</a></p>` : ""}
          <p style="font-size:11px;color:#8a8378;margin-top:26px">Sent by ${esc(agent.name)}, ${esc(agent.role)}.</p>
        </div>`;

      await sb.from("email_send_log").insert({
        message_id: messageId,
        template_name: `agent:${agent.key}`,
        recipient_email: ADMIN_EMAIL,
        status: "pending",
      });
      await sb.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          to: ADMIN_EMAIL,
          from: `${FROM_NAME} <noreply@${FROM_DOMAIN}>`,
          sender_domain: SENDER_DOMAIN,
          subject: `${agent.name}: ${finding.headline}`.slice(0, 180),
          html,
          purpose: "transactional",
          label: `agent-${agent.key}`,
          idempotency_key: `agent-run-${runId}`,
          queued_at: new Date().toISOString(),
        },
      });
      outcome.email = "queued";
    } catch (e) {
      outcome.email = `failed: ${String((e as Error).message || e)}`;
    }
  }

  // --- push: only when something actually needs a person ---
  //
  // `opts.push` exists for the one case that needs a person without anything
  // being pending: a social post that failed its retry. The alternative was to
  // pass pendingApprovals: 1 when nothing is pending, which would put a false
  // "1 action waiting for approval" in the email body and the activity feed.
  // Every existing caller omits opts and behaves exactly as before.
  if (delivery.push && (opts?.push ?? pendingApprovals > 0)) {
    try {
      outcome.push = await sendPushToAll(sb);
    } catch (e) {
      outcome.push = `failed: ${String((e as Error).message || e)}`;
    }
  }

  return outcome;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
