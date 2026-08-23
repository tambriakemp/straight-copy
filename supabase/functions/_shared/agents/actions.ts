// Executing agent actions.
//
// Every action arrives here the same way whether it auto-executed at run time
// or a human approved it later, so there is exactly one code path that can
// change the world on an agent's behalf.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";
import { logProposalEvent } from "../proposal-events.ts";
import { renderProposalPdf } from "../proposal-pdf.ts";
import { logSureContactActivity, sendSureContactEmail } from "../surecontact-send.ts";
import {
  PROJECT_TYPES, reviewProposal, type ProposalContent,
} from "./proposal-spine.ts";

// Mirrors the constants in send-transactional-email/index.ts so agent mail
// leaves from the same identity as every other email the app sends.
const FROM_NAME = "straight-copy";
const FROM_DOMAIN = "cre8visions.com";
const SENDER_DOMAIN = "notify.cre8visions.com";

/** Same bucket proposal-sign reads from, so uploads and signing agree. */
const PROPOSAL_BUCKET = "client-assets";

/**
 * Render a proposal to PDF and store it.
 *
 * The signing flow stamps a signature page onto a source PDF, so a proposal
 * with no PDF cannot be signed — this is what makes an agent-written proposal
 * a real one rather than a record only staff can read.
 *
 * Called lazily at send time rather than on every section write: a twelve
 * section document would otherwise render twelve times, eleven of them thrown
 * away.
 */
async function renderAndStoreProposalPdf(
  sb: SupabaseClient,
  proposalId: string,
  clientId: string,
  title: string,
  content: ProposalContent,
  agentName: string,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  try {
    const pdf = await renderProposalPdf(title, content);
    const path = `proposals/${clientId}/${proposalId}/source.pdf`;
    const { error: upErr } = await sb.storage.from(PROPOSAL_BUCKET)
      .upload(path, pdf, { contentType: "application/pdf", upsert: true, cacheControl: "3600" });
    if (upErr) throw upErr;

    await sb.from("client_proposals")
      .update({ source_pdf_path: path, pdf_generated_at: new Date().toISOString() })
      .eq("id", proposalId);

    await logProposalEvent(sb, {
      proposal_id: proposalId,
      client_id: clientId,
      event_type: "pdf_uploaded",
      actor: agentName,
      detail: { path, generated: true },
    });
    return { ok: true, path };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/**
 * How many days after a send the first chase is due.
 *
 * Read from the agent's own config rather than hardcoded, so the follow-up
 * window is one number in one place. It was 4 here and 4 in the gatherer, which
 * meant changing it to Bree's 48 hours in the obvious place left the send path
 * still scheduling four days out.
 */
async function followupWindowDays(sb: SupabaseClient, agentId: string): Promise<number> {
  try {
    const { data } = await sb.from("agents").select("config").eq("id", agentId).maybeSingle();
    const cfg = (data?.config ?? {}) as Record<string, unknown>;
    const n = Number(cfg.followup_after_days);
    return Number.isFinite(n) && n > 0 ? n : 2;
  } catch {
    return 2;
  }
}

/**
 * project_tasks.priority is an enum: low | normal | high | urgent.
 *
 * There is no "medium" — which is the word any model reaches for first, and it
 * failed the insert with a raw Postgres enum error rather than doing the
 * obvious thing.
 */
const TASK_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
function taskPriority(raw: unknown): string {
  const v = String(raw ?? "").toLowerCase();
  if (TASK_PRIORITIES.has(v)) return v;
  if (v === "medium" || v === "med" || v === "moderate") return "normal";
  if (v === "critical" || v === "highest" || v === "p0") return "urgent";
  return "normal";
}

/**
 * project_tasks.status is an enum: backlog | ready_for_claude | in_progress |
 * needs_review | blocked | complete.
 *
 * There is no "todo" — which is the word both this code and any model reach for
 * first, and it failed every insert with "invalid input value for enum
 * project_task_status". Every task an agent tried to open died on it, so a run
 * that had done the thinking still produced nothing on the board.
 *
 * Same shape as taskPriority above, and for the same reason: the enum is the
 * schema's vocabulary, not the caller's, so translate rather than reject.
 */
const TASK_STATUSES = new Set([
  "backlog", "ready_for_claude", "in_progress", "needs_review", "blocked", "complete",
]);
function taskStatus(raw: unknown): string {
  const v = String(raw ?? "").toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (TASK_STATUSES.has(v)) return v;
  if (v === "todo" || v === "to_do" || v === "open" || v === "new" || v === "pending") {
    return "backlog";
  }
  if (v === "doing" || v === "started" || v === "active") return "in_progress";
  if (v === "review" || v === "in_review") return "needs_review";
  if (v === "done" || v === "closed" || v === "finished") return "complete";
  return "backlog";
}

/**
 * Rows an agent may delete, and how to describe one that is gone.
 *
 * An allowlist rather than a check for "is this a table": deleting a client or
 * a project cascades through invoices, tasks, proposals and journey nodes, and
 * no amount of confirmation makes that a thing an agent should be able to do
 * from a chat message.
 */
const DELETABLE: Record<string, string> = {
  project_invoices: "invoice",
  project_tasks: "task",
  client_proposals: "proposal",
  project_links: "link",
  project_notes: "note",
  agent_runs: "run",
};

const PORTAL_BASE_URL =
  (Deno.env.get("PORTAL_BASE_URL") || "https://cre8visions.com").replace(/\/$/, "");

/** Where a client goes to see this piece of work. */
export function portalUrl(clientId: string, clientProjectId?: string | null): string {
  return clientProjectId
    ? `${PORTAL_BASE_URL}/portal/${clientId}/projects/${clientProjectId}`
    : `${PORTAL_BASE_URL}/portal/${clientId}`;
}

/**
 * The button, appended rather than trusted to what the model wrote.
 *
 * An email asking someone to review a proposal, approve a deliverable or pay an
 * invoice is useless without the way in, and a model writing prose will
 * sometimes describe the portal instead of linking it — or invent a URL. So the
 * link is built from ids here, always, and the plain-text fallback is included
 * because a button that does not render is the same as no link at all.
 */
export function withPortalLink(
  html: string,
  clientId: string,
  clientProjectId?: string | null,
  label = "Open your client portal",
): string {
  const link = portalUrl(clientId, clientProjectId);
  return `${html}\n<p style="margin:24px 0"><a href="${link}" style="background:#8B7355;color:#FAFAF8;padding:12px 20px;border-radius:8px;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;display:inline-block">${label}</a></p><p style="font-family:Arial,sans-serif;font-size:12px;color:#9A938A">Or paste this into your browser: ${link}</p>`;
}

/**
 * Deliver one client-facing email.
 *
 * SureContact first, always. Client mail that bypasses SureContact leaves no
 * trace on the contact's timeline and gets no opens or clicks, which makes the
 * whole engagement history a guess. The queue below is a fallback for when the
 * API key isn't configured — not a second option.
 *
 * Either way the send is written to email_send_log, so there is one place to
 * look for "did we actually send this".
 */
async function deliverClientEmail(
  sb: SupabaseClient,
  args: {
    to: string;
    subject: string;
    html: string;
    label: string;
    idempotencyKey: string;
    templateName: string;
    /** Used to create the SureContact contact if they are new. */
    name?: string | null;
    company?: string | null;
    reason?: string;
  },
): Promise<
  | { ok: true; messageId: string; via: "surecontact" | "queue" }
  | { ok: false; error: string }
> {
  const messageId = crypto.randomUUID();
  await sb.from("email_send_log").insert({
    message_id: messageId,
    template_name: args.templateName,
    recipient_email: args.to,
    status: "pending",
  });

  const apiKey = Deno.env.get("SURECONTACT_API_KEY");
  if (apiKey) {
    const sent = await sendSureContactEmail(apiKey, {
      to: args.to,
      subject: args.subject,
      html: args.html,
      name: args.name,
      company: args.company,
      reason: args.reason,
    });
    if (sent.ok) {
      await sb.from("email_send_log").update({
        status: "sent",
        // SureContact's own id, so a webhook event can be matched back.
        metadata: { provider: "surecontact", provider_message_id: sent.messageId ?? null },
      }).eq("message_id", messageId);
      await logSureContactActivity(apiKey, {
        email: args.to,
        type: "email_sent",
        description: args.reason ?? args.subject,
        metadata: { subject: args.subject, label: args.label, crm_message_id: messageId },
      });
      return { ok: true, messageId: sent.messageId ?? messageId, via: "surecontact" };
    }
    // Fall through to the queue rather than dropping the message — but say so
    // loudly, because a silent fallback is how mail quietly stops being tracked.
    console.error("[actions] SureContact send failed, falling back to queue", sent.error);
    await sb.from("email_send_log").update({
      error_message: `SureContact send failed: ${sent.error}`,
    }).eq("message_id", messageId);
  }

  const { error } = await sb.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId,
      to: args.to,
      from: `${FROM_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject: args.subject,
      html: args.html,
      purpose: "transactional",
      label: args.label,
      idempotency_key: args.idempotencyKey,
      queued_at: new Date().toISOString(),
    },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, messageId, via: "queue" };
}

export interface ActionRow {
  id: string;
  run_id: string;
  agent_id: string;
  kind: string;
  outward: boolean;
  title: string;
  description: string | null;
  payload: Record<string, unknown>;
}

export interface ExecuteOutcome {
  ok: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

/**
 * Refuse when the row an action names does not belong to the project it claims.
 *
 * The approval gate keys off `payload.client_project_id`, and that value was
 * written by the model. Without this check, an action could name a project the
 * owner has marked autonomous while pointing at a post belonging to one she
 * has not — and the gate would wave it straight through.
 *
 * Cheap, and load-bearing. The worst case with it in place is that the gate
 * says "auto", the executor refuses, and nothing was posted.
 */
function assertProjectMatches(
  actual: string | null | undefined,
  claimed: string | null | undefined,
): ExecuteOutcome | null {
  if (!claimed) {
    return { ok: false, error: "Missing client_project_id" };
  }
  if (actual !== claimed) {
    return {
      ok: false,
      error: "That record belongs to a different client project",
    };
  }
  return null;
}

/**
 * Send a client email that an agent wrote.
 *
 * Shares everything with `draft_email` — SureContact-first delivery, the
 * send log, idempotency on the action id, the portal button built from ids —
 * because a second send path would be a second place for a client email to go
 * missing. The only difference between the kinds using this is the approval
 * gate in front of them: `request_client_photos` is routine and goes when the
 * autonomy allows it, `draft_client_message` is marked alwaysApprove and never
 * does.
 */
async function sendClientEmail(
  sb: SupabaseClient,
  action: ActionRow,
  agentName: string,
): Promise<ExecuteOutcome> {
  const p = action.payload as {
    to?: string; subject?: string; body?: string;
    client_id?: string; client_project_id?: string;
    portal_link_label?: string; include_portal_link?: boolean;
  };
  if (!p.to || !p.subject || !p.body) {
    return { ok: false, error: "Email is missing to, subject or body" };
  }

  let name: string | null = null;
  let company: string | null = null;
  if (p.client_id) {
    const { data: c } = await sb.from("clients")
      .select("contact_name, business_name").eq("id", p.client_id).maybeSingle();
    name = c?.contact_name ?? null;
    company = c?.business_name ?? null;
  }

  const html = p.client_id && p.include_portal_link !== false
    ? withPortalLink(
      p.body, p.client_id, p.client_project_id ?? null,
      p.portal_link_label || "Open your client portal",
    )
    : p.body;

  const sent = await deliverClientEmail(sb, {
    to: p.to,
    subject: p.subject,
    html,
    label: `agent-${action.kind}`,
    idempotencyKey: `agent-action-${action.id}`,
    templateName: `agent:${action.kind}`,
    name,
    company,
    reason: `${agentName}: ${action.title}`,
  });
  if (!sent.ok) return { ok: false, error: sent.error };
  return {
    ok: true,
    result: {
      sent: true,
      via: sent.via,
      message_id: sent.messageId,
      to: p.to,
      client_project_id: p.client_project_id ?? null,
    },
  };
}

export async function executeAction(
  sb: SupabaseClient,
  action: ActionRow,
  agentName: string,
): Promise<ExecuteOutcome> {
  try {
    switch (action.kind) {
      case "create_task": {
        const p = action.payload as {
          name?: string; client_project_id?: string; client_id?: string;
          due_date?: string; priority?: string; status?: string;
        };
        let projectId = p.client_project_id ?? null;

        // project_tasks.client_project_id is NOT NULL. Rather than refuse a
        // task because the agent named the client instead of the project —
        // which is how a whole run's worth of work used to get thrown away —
        // resolve it from the client when there is exactly one sensible answer.
        if (!projectId && p.client_id) {
          const { data: projs } = await sb.from("client_projects")
            .select("id, status")
            .eq("client_id", p.client_id)
            .order("created_at", { ascending: false });
          const open = (projs ?? []).filter((x) => x.status !== "complete");
          projectId = (open[0] ?? projs?.[0])?.id ?? null;
        }
        if (!projectId) {
          return {
            ok: false,
            error: "No client_project_id or client_id supplied; a task has to hang off a project",
          };
        }
        const { data, error } = await sb.from("project_tasks").insert({
          client_project_id: projectId,
          name: p.name ?? action.title,
          description: action.description
            ? `${action.description}\n\n> Opened by ${agentName}.`
            : `> Opened by ${agentName}.`,
          due_date: p.due_date ?? null,
          priority: taskPriority(p.priority),
          assignee_kind: "agency",
          status: taskStatus(p.status),
        }).select("id").single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { task_id: data.id, client_project_id: projectId } };
      }

      case "complete_checklist_item": {
        const p = action.payload as { item_id?: string };
        if (!p.item_id) return { ok: false, error: "No item_id supplied" };
        const { error } = await sb.from("launch_checklist_items")
          .update({ status: "complete", completed_at: new Date().toISOString() })
          .eq("id", p.item_id);
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { item_id: p.item_id } };
      }

      case "draft_email": {
        // Reaching a person is the one thing an agent never does implicitly.
        // Executing here means a human already approved this exact text.
        const p = action.payload as {
          to?: string; subject?: string; body?: string; client_id?: string;
          /** Deep-links the button to one project rather than the portal root. */
          client_project_id?: string;
          /**
           * Whether the client has to go somewhere to act. Defaults to true
           * whenever a client_id is known: an email that asks for something and
           * gives no way to do it is the common failure, and a spare link at
           * the bottom of one that does not costs nothing.
           */
          include_portal_link?: boolean;
          /** Button wording, so "Review the proposal" beats "Open your portal". */
          portal_link_label?: string;
        };
        if (!p.to || !p.subject || !p.body) {
          return { ok: false, error: "Draft is missing to, subject or body" };
        }

        let name: string | null = null;
        let company: string | null = null;
        if (p.client_id) {
          const { data: c } = await sb.from("clients")
            .select("contact_name, business_name").eq("id", p.client_id).maybeSingle();
          name = c?.contact_name ?? null;
          company = c?.business_name ?? null;
        }

        // Built from ids rather than left to the drafted prose, so the client
        // always gets a working way in whatever the agent wrote.
        const html = p.client_id && p.include_portal_link !== false
          ? withPortalLink(
            p.body, p.client_id, p.client_project_id ?? null,
            p.portal_link_label || "Open your client portal",
          )
          : p.body;

        const sent = await deliverClientEmail(sb, {
          to: p.to,
          subject: p.subject,
          html,
          label: `agent-${action.kind}`,
          // One approval, one send: a double-click can't send it twice.
          idempotencyKey: `agent-action-${action.id}`,
          templateName: `agent:${action.kind}`,
          name,
          company,
          reason: `${agentName}: ${action.title}`,
        });
        if (!sent.ok) return { ok: false, error: sent.error };
        return {
          ok: true,
          result: { sent: true, via: sent.via, message_id: sent.messageId, to: p.to },
        };
      }

      // --- client engagement ------------------------------------------------

      case "sync_client_to_surecontact": {
        const p = action.payload as { client_id?: string };
        if (!p.client_id) return { ok: false, error: "No client_id supplied" };
        // Reuse the existing function rather than calling SureContact directly:
        // it owns the portal URLs, the tier and stage tags, and writing
        // surecontact_contact_uuid back. A second implementation would drift.
        const resp = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-client-to-surecontact`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ clientId: p.client_id }),
          },
        );
        const body = await resp.json().catch(() => ({}));
        if (!resp.ok || body?.success === false) {
          return { ok: false, error: body?.error || `Sync failed (${resp.status})` };
        }
        return { ok: true, result: { client_id: p.client_id, surecontact: body } };
      }

      case "create_client_project": {
        const p = action.payload as { client_id?: string; name?: string; type?: string };
        if (!p.client_id) return { ok: false, error: "No client_id supplied" };
        if (!p.type || !(PROJECT_TYPES as readonly string[]).includes(p.type)) {
          // The type decides what the client sees in their portal, so an
          // invented one is worse than none. Send it back rather than defaulting.
          return {
            ok: false,
            error: `Project type must be one of: ${PROJECT_TYPES.join(", ")}`,
          };
        }
        const { data, error } = await sb.from("client_projects").insert({
          client_id: p.client_id,
          name: p.name ?? action.title,
          type: p.type,
        }).select("id, name, type").single();
        if (error) return { ok: false, error: error.message };
        return {
          ok: true,
          result: {
            client_project_id: data.id, client_id: p.client_id, name: data.name, type: data.type,
          },
        };
      }

      // A proposal is written the way a person writes one: create the
      // document, then fill it a section at a time. The old draft_proposal
      // took the WHOLE thing as one tool argument — ~6,000 tokens for a real
      // Menovia-sized retainer, JSON-escaped, complete and valid in one shot.
      // Truncate at section eleven and the JSON is malformed, so the entire
      // call is lost; and a model facing that bet writes shorter sections to
      // survive it. Both of those were observed. Small writes remove the bet.
      case "create_proposal_draft": {
        const p = action.payload as {
          client_id?: string;
          client_project_id?: string;
          title?: string;
          kind?: string;
          cover?: ProposalContent["cover"];
        };
        if (!p.client_id) return { ok: false, error: "No client_id supplied" };
        if (!p.client_project_id) {
          return { ok: false, error: "No client_project_id supplied; a proposal has to hang off a project" };
        }

        const content: ProposalContent = {
          kind: p.kind,
          cover: p.cover ?? {},
          sections: [],
        };

        const { data, error } = await sb.from("client_proposals").insert({
          client_id: p.client_id,
          client_project_id: p.client_project_id,
          title: p.title ?? action.title,
          description: action.description ?? null,
          content,
          status: "draft",
          created_by_agent: action.agent_id,
        }).select("id, title").single();
        if (error) return { ok: false, error: error.message };

        await logProposalEvent(sb, {
          proposal_id: data.id,
          client_id: p.client_id,
          event_type: "drafted",
          actor: agentName,
          detail: { title: data.title },
        });

        const { data: proj } = await sb.from("client_projects")
          .select("name").eq("id", p.client_project_id).maybeSingle();
        await logProposalEvent(sb, {
          proposal_id: data.id,
          client_id: p.client_id,
          event_type: "project_attached",
          actor: agentName,
          detail: { project_name: proj?.name ?? null, client_project_id: p.client_project_id },
        });

        return {
          ok: true,
          result: {
            proposal_id: data.id,
            title: data.title,
            status: "draft",
            sections: 0,
            next: "Write each section with write_proposal_section, in reading order.",
          },
        };
      }

      case "write_proposal_section": {
        const p = action.payload as {
          proposal_id?: string;
          heading?: string;
          body?: string;
          summary?: string;
          /**
           * Which existing section to overwrite. `true` means the one whose
           * heading matches `heading`; a string names a different heading, so a
           * section can be renamed in place. Typed loosely on purpose — the
           * model supplies this and has sent a boolean where a string was
           * declared.
           */
          replace?: string | boolean;
        };
        if (!p.proposal_id) return { ok: false, error: "No proposal_id supplied" };
        if (!p.heading?.trim()) return { ok: false, error: "A section needs a heading" };
        if (!p.body?.trim()) return { ok: false, error: "A section needs a body" };

        const { data: row, error: rErr } = await sb.from("client_proposals")
          .select("id, title, content, status, client_id, content_version")
          .eq("id", p.proposal_id).maybeSingle();
        if (rErr) return { ok: false, error: rErr.message };
        if (!row) return { ok: false, error: "Proposal not found" };
        if (row.status === "signed") {
          return { ok: false, error: "That proposal is signed. It cannot be rewritten." };
        }

        const content: ProposalContent = (row.content as ProposalContent) ?? { sections: [] };
        const sections = [...(content.sections ?? [])];
        // Never call a string method on a payload field without checking.
        // `replace?` in the tool schema read as a boolean flag, so the model
        // sent `replace: true`, and `(p.replace ?? p.heading).trim()` threw
        // "(p.replace ?? p.heading).trim is not a function" — failing every
        // rewrite while the chat showed the error and nothing else.
        const target = (typeof p.replace === "string" && p.replace.trim()
          ? p.replace
          : p.heading
        ).trim().toLowerCase();
        const at = sections.findIndex(
          (s) => (s.heading ?? "").trim().toLowerCase() === target,
        );

        const written = {
          heading: p.heading.trim(),
          summary: p.summary?.trim() || undefined,
          body: p.body.trim(),
        };
        // Replacing in place keeps document order stable — a revision must not
        // move a section to the end just because it was rewritten.
        if (at >= 0) sections[at] = written;
        else sections.push(written);

        const next: ProposalContent = { ...content, sections };
        const review = reviewProposal(next);

        const version = (row.content_version ?? 0) + 1;

        // Snapshot BEFORE the update, so a failed write leaves no version row
        // claiming a change that never landed. Append-only: restoring copies an
        // old snapshot forward rather than deleting anything, which is what
        // makes undoing an undo work.
        await sb.from("client_proposal_versions").insert({
          proposal_id: row.id,
          version,
          content: next,
          changed_by_agent: action.agent_id,
          note: at >= 0 ? `Rewrote ${written.heading}` : `Added ${written.heading}`,
        });

        const { error: uErr } = await sb.from("client_proposals").update({
          content: next,
          content_version: version,
          // The stored PDF no longer matches the content. send_proposal
          // regenerates from this signal rather than shipping a stale document.
          pdf_generated_at: null,
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        if (uErr) return { ok: false, error: uErr.message };

        return {
          ok: true,
          result: {
            proposal_id: row.id,
            heading: written.heading,
            action: at >= 0 ? "replaced" : "appended",
            position: (at >= 0 ? at : sections.length - 1) + 1,
            sections: sections.length,
            body_chars: review.bodyChars,
            // Reported every time, never blocking, so the agent can tell Bree
            // what is still outstanding without being stopped from writing.
            still_missing: review.missing.length ? review.missing : undefined,
          },
        };
      }

      case "restore_proposal_version": {
        const p = action.payload as { proposal_id?: string; version?: number };
        if (!p.proposal_id) return { ok: false, error: "No proposal_id supplied" };

        const { data: row, error: rErr } = await sb.from("client_proposals")
          .select("id, status, content_version, client_id")
          .eq("id", p.proposal_id).maybeSingle();
        if (rErr) return { ok: false, error: rErr.message };
        if (!row) return { ok: false, error: "Proposal not found" };
        if (row.status === "signed") {
          return { ok: false, error: "That proposal is signed. It cannot be rewritten." };
        }

        // No version given means "undo the last thing" — the version before
        // the current one, which is what "put it back" almost always means.
        const wanted = p.version ?? (row.content_version ?? 1) - 1;
        if (wanted < 1) return { ok: false, error: "There is nothing earlier to go back to." };

        const { data: snap, error: sErr } = await sb.from("client_proposal_versions")
          .select("version, content, note")
          .eq("proposal_id", row.id).eq("version", wanted).maybeSingle();
        if (sErr) return { ok: false, error: sErr.message };
        if (!snap) return { ok: false, error: `No version ${wanted} of that proposal.` };

        // Copy forward as a NEW version rather than rewinding the counter, so
        // the history stays append-only and this restore can itself be undone.
        const version = (row.content_version ?? 0) + 1;
        await sb.from("client_proposal_versions").insert({
          proposal_id: row.id,
          version,
          content: snap.content,
          changed_by_agent: action.agent_id,
          note: `Restored version ${snap.version}`,
        });

        const { error: uErr } = await sb.from("client_proposals").update({
          content: snap.content,
          content_version: version,
          pdf_generated_at: null,
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        if (uErr) return { ok: false, error: uErr.message };

        const restored = reviewProposal(snap.content as ProposalContent);
        return {
          ok: true,
          result: {
            proposal_id: row.id,
            restored_from: snap.version,
            now_version: version,
            sections: restored.sectionCount,
            was: snap.note ?? undefined,
          },
        };
      }

      case "send_proposal": {
        const p = action.payload as {
          proposal_id?: string; subject?: string; body?: string; to?: string;
        };
        if (!p.proposal_id) return { ok: false, error: "No proposal_id supplied" };
        if (!p.subject || !p.body) return { ok: false, error: "Send is missing subject or body" };

        const { data: proposal, error: pErr } = await sb.from("client_proposals")
          .select("id, title, client_id, client_project_id, status, followup_count, source_pdf_path, pdf_generated_at, content")
          .eq("id", p.proposal_id).maybeSingle();
        if (pErr) return { ok: false, error: pErr.message };
        if (!proposal) return { ok: false, error: "Proposal not found" };
        if (proposal.status === "signed") {
          return { ok: false, error: "Proposal is already signed" };
        }

        // Sections are written one at a time, and each write clears
        // pdf_generated_at. So the PDF is rendered HERE, once, from whatever
        // the document finally says — rather than twelve times on the way in,
        // or worse, sending the client a PDF that predates the last revision.
        if (!proposal.source_pdf_path || !proposal.pdf_generated_at) {
          const rendered = await renderAndStoreProposalPdf(
            sb, proposal.id, proposal.client_id, proposal.title,
            (proposal.content as ProposalContent) ?? {}, agentName,
          );
          if (!rendered.ok) {
            return { ok: false, error: `Could not render the proposal PDF: ${rendered.error}` };
          }
          proposal.source_pdf_path = rendered.path;
        }

        const { data: client } = await sb.from("clients")
          .select("contact_email, contact_name, business_name")
          .eq("id", proposal.client_id).maybeSingle();
        const to = p.to || client?.contact_email;
        if (!to) return { ok: false, error: "No recipient email on the client" };

        const link = portalUrl(proposal.client_id, proposal.client_project_id);
        const html = withPortalLink(
          p.body, proposal.client_id, proposal.client_project_id,
          "Review and sign the proposal",
        );

        const sent = await deliverClientEmail(sb, {
          to,
          subject: p.subject,
          html,
          label: "agent-send-proposal",
          // One approval, one send: a double-click cannot send it twice.
          idempotencyKey: `agent-action-${action.id}`,
          templateName: "agent:send_proposal",
          name: client?.contact_name ?? null,
          company: client?.business_name ?? null,
          reason: `Proposal sent: ${proposal.title}`,
        });
        if (!sent.ok) return { ok: false, error: sent.error };

        const followupDays = await followupWindowDays(sb, action.agent_id);
        const { error: uErr } = await sb.from("client_proposals").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          sent_to: to,
          send_message_id: sent.messageId,
          next_followup_at: new Date(Date.now() + followupDays * 86_400_000).toISOString(),
        }).eq("id", proposal.id);
        if (uErr) return { ok: false, error: uErr.message };

        await logProposalEvent(sb, {
          proposal_id: proposal.id,
          client_id: proposal.client_id,
          event_type: sent.via === "surecontact" ? "email_sent" : "email_queued",
          actor: agentName,
          detail: { to, subject: p.subject, message_id: sent.messageId, via: sent.via, link },
        });

        return {
          ok: true,
          result: { proposal_id: proposal.id, to, message_id: sent.messageId, via: sent.via, link },
        };
      }

      case "schedule_followup": {
        const p = action.payload as { proposal_id?: string; due_date?: string; note?: string };
        if (!p.proposal_id) return { ok: false, error: "No proposal_id supplied" };
        const { data: proposal } = await sb.from("client_proposals")
          .select("id, client_id, client_project_id, title").eq("id", p.proposal_id).maybeSingle();
        if (!proposal) return { ok: false, error: "Proposal not found" };

        const due = p.due_date ??
          new Date(Date.now() + (await followupWindowDays(sb, action.agent_id)) * 86_400_000)
            .toISOString().slice(0, 10);
        const { error } = await sb.from("client_proposals")
          .update({ next_followup_at: new Date(`${due}T09:00:00Z`).toISOString() })
          .eq("id", proposal.id);
        if (error) return { ok: false, error: error.message };

        // Also open a dated task so the follow-up shows in Up Next alongside
        // everything else a person is expected to do that day.
        let taskId: string | null = null;
        if (proposal.client_project_id) {
          const { data: task, error: tErr } = await sb.from("project_tasks").insert({
            client_project_id: proposal.client_project_id,
            name: `Follow up on proposal: ${proposal.title}`,
            description: `${p.note ?? action.description ?? ""}\n\n> Scheduled by ${agentName}.`.trim(),
            due_date: due,
            // project_tasks.priority is an enum with no "medium" in it, and
            // this insert used to send exactly that. The error was never
            // destructured, so every scheduled follow-up silently failed to
            // open its task and reported a null id as success.
            priority: taskPriority("normal"),
            assignee_kind: "agency",
            status: taskStatus(null),
          }).select("id").maybeSingle();
          if (tErr) {
            console.error("[actions] follow-up task insert failed", tErr.message);
          }
          taskId = task?.id ?? null;
        }

        await logProposalEvent(sb, {
          proposal_id: proposal.id,
          client_id: proposal.client_id,
          event_type: "followup_scheduled",
          actor: agentName,
          detail: { due_date: due, note: p.note ?? null, task_id: taskId },
        });

        return { ok: true, result: { proposal_id: proposal.id, due_date: due, task_id: taskId } };
      }

      case "delete_record": {
        const p = action.payload as { table?: string; id?: string; label?: string };
        const noun = p.table ? DELETABLE[p.table] : undefined;
        if (!p.table || !noun) {
          return {
            ok: false,
            error: `Cannot delete from "${p.table ?? "nothing"}". Deletable: ${Object.keys(DELETABLE).join(", ")}`,
          };
        }
        if (!p.id) return { ok: false, error: "No id supplied" };

        // Read it back first so the record of the deletion says what was
        // deleted. Once the row is gone the action row is the only trace.
        const { data: before } = await sb.from(p.table).select("*").eq("id", p.id).maybeSingle();
        if (!before) {
          // Already gone is the outcome that was wanted, so this is not a failure.
          return { ok: true, result: { table: p.table, id: p.id, already_absent: true } };
        }

        const { error } = await sb.from(p.table).delete().eq("id", p.id);
        if (error) return { ok: false, error: error.message };

        return {
          ok: true,
          result: {
            table: p.table,
            id: p.id,
            deleted: `${noun}${p.label ? ` — ${p.label}` : ""}`,
            snapshot: before,
          },
        };
      }

      // --- social ------------------------------------------------------------

      case "write_social_caption": {
        const p = action.payload as {
          client_project_id?: string; target?: string; id?: string;
          caption?: string; hashtags?: string[];
        };
        if (p.target !== "post" && p.target !== "image") {
          return { ok: false, error: "target must be 'post' or 'image'" };
        }
        if (!p.id) return { ok: false, error: "Missing id" };
        if (!p.caption?.trim()) return { ok: false, error: "Missing caption" };

        const table = p.target === "post" ? "social_posts" : "social_images";
        const { data: row } = await sb.from(table)
          .select("id, client_project_id, status, copost_status")
          .eq("id", p.id).maybeSingle();
        if (!row) return { ok: false, error: `No ${p.target} with id ${p.id}` };

        const guard = assertProjectMatches(row.client_project_id, p.client_project_id);
        if (guard) return guard;

        // Never rewrite what has already gone out. The caption on a published
        // post is what the client's audience read; changing it here would make
        // the record disagree with reality.
        if (p.target === "post" && row.status !== "draft") {
          return { ok: false, error: `Post is ${row.status}, not a draft` };
        }
        if (p.target === "image" && ["sending", "sent"].includes(row.copost_status)) {
          return { ok: false, error: `Image is already ${row.copost_status}` };
        }

        const hashtags = (p.hashtags ?? [])
          .map((h) => h.replace(/^#/, "").trim())
          .filter(Boolean)
          .slice(0, 15);

        const patch: Record<string, unknown> = {
          caption: p.caption.trim(),
          hashtags,
        };
        if (p.target === "image") patch.caption_status = "ready";

        const { error } = await sb.from(table).update(patch).eq("id", p.id);
        if (error) return { ok: false, error: error.message };

        return {
          ok: true,
          result: {
            target: p.target,
            id: p.id,
            client_project_id: row.client_project_id,
            hashtags: hashtags.length,
          },
        };
      }

      case "schedule_social_post": {
        const p = action.payload as {
          client_project_id?: string; target?: string; id?: string;
          scheduled_at?: string;
        };
        if (p.target !== "post" && p.target !== "image") {
          return { ok: false, error: "target must be 'post' or 'image'" };
        }
        if (!p.id) return { ok: false, error: "Missing id" };

        const when = p.scheduled_at ? new Date(p.scheduled_at) : null;
        if (!when || Number.isNaN(when.getTime())) {
          return { ok: false, error: "scheduled_at is not a valid ISO 8601 time" };
        }
        const now = Date.now();
        if (when.getTime() <= now) {
          return { ok: false, error: "scheduled_at is in the past" };
        }
        if (when.getTime() > now + 90 * 86_400_000) {
          return { ok: false, error: "scheduled_at is more than 90 days out" };
        }

        const table = p.target === "post" ? "social_posts" : "social_images";
        const { data: row } = await sb.from(table)
          .select("id, client_project_id, status, caption")
          .eq("id", p.id).maybeSingle();
        if (!row) return { ok: false, error: `No ${p.target} with id ${p.id}` };

        const guard = assertProjectMatches(row.client_project_id, p.client_project_id);
        if (guard) return guard;

        const { data: project } = await sb.from("client_projects")
          .select("id, type").eq("id", row.client_project_id).maybeSingle();
        if (project?.type !== "marketing") {
          return { ok: false, error: "That project is not a marketing project" };
        }

        // Existence only — the value is a credential and never leaves the
        // decrypting function. A post booked against a project with nowhere to
        // send it would sit pending until it timed out.
        const { data: secret } = await sb.from("project_secrets")
          .select("key").eq("client_project_id", row.client_project_id)
          .eq("key", "copost_endpoint_url").maybeSingle();
        if (!secret) {
          return { ok: false, error: "No CoPost endpoint is configured for that project" };
        }

        if (!row.caption?.trim()) {
          return { ok: false, error: "Write the caption before scheduling it" };
        }

        // Approving and scheduling are one step: booking a post IS the
        // approval, so a second status to keep in step would only be a way for
        // the two to disagree.
        if (p.target === "post" && row.status === "draft") {
          await sb.from("social_posts").update({ status: "approved" }).eq("id", p.id);
        }

        const { data: slot, error } = await sb.from("social_schedule").insert({
          client_project_id: row.client_project_id,
          social_post_id: p.target === "post" ? p.id : null,
          social_image_id: p.target === "image" ? p.id : null,
          scheduled_at: when.toISOString(),
          created_by_agent: action.agent_id,
          agent_action_id: action.id,
        }).select("id").maybeSingle();

        if (error) {
          // The partial unique index doing its job. Say so plainly rather than
          // throwing — a re-proposed action is a normal thing to happen, and
          // the model should learn it is already booked, not that it broke.
          if (/duplicate key|unique/i.test(error.message)) {
            return { ok: false, error: "That post is already scheduled" };
          }
          return { ok: false, error: error.message };
        }

        return {
          ok: true,
          result: {
            schedule_id: slot?.id,
            target: p.target,
            id: p.id,
            client_project_id: row.client_project_id,
            scheduled_at: when.toISOString(),
          },
        };
      }

      case "cancel_social_post": {
        const p = action.payload as {
          client_project_id?: string; schedule_id?: string; reason?: string;
        };
        if (!p.schedule_id) return { ok: false, error: "Missing schedule_id" };

        const { data: row } = await sb.from("social_schedule")
          .select("id, client_project_id, status").eq("id", p.schedule_id).maybeSingle();
        if (!row) return { ok: false, error: `No scheduled post with id ${p.schedule_id}` };

        const guard = assertProjectMatches(row.client_project_id, p.client_project_id);
        if (guard) return guard;

        const { data: updated } = await sb.from("social_schedule")
          .update({
            status: "cancelled",
            last_error: p.reason ?? `Cancelled by ${agentName}.`,
          })
          .eq("id", p.schedule_id).eq("status", "pending")
          .select("id");

        // Zero rows means it is already sending or sent. Saying "cancelled"
        // there would be a lie the model then repeats to a person.
        if (!updated?.length) {
          return { ok: false, error: `Too late — that post is ${row.status}` };
        }
        return { ok: true, result: { schedule_id: p.schedule_id, cancelled: true } };
      }

      case "request_client_photos":
      case "draft_client_message":
        return await sendClientEmail(sb, action, agentName);

      case "flag_risk":
        // Deliberately inert. A flag is the finding; the run record is the
        // artifact. Executing it just marks that it was acknowledged.
        return { ok: true, result: { acknowledged: true } };

      default:
        return { ok: false, error: `Unknown action kind: ${action.kind}` };
    }
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/** Run an action and write the outcome back onto its row. */
export async function executeAndRecord(
  sb: SupabaseClient,
  action: ActionRow,
  agentName: string,
): Promise<ExecuteOutcome> {
  const outcome = await executeAction(sb, action, agentName);
  await sb.from("agent_actions").update({
    status: outcome.ok ? "executed" : "failed",
    executed_at: new Date().toISOString(),
    result: outcome.result ?? null,
    error: outcome.error ?? null,
  }).eq("id", action.id);
  return outcome;
}
