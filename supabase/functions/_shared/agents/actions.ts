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
  inferKind, missingEssentials, missingSections, PROJECT_TYPES, type ProposalContent,
} from "./proposal-spine.ts";

// Mirrors the constants in send-transactional-email/index.ts so agent mail
// leaves from the same identity as every other email the app sends.
const FROM_NAME = "straight-copy";
const FROM_DOMAIN = "cre8visions.com";
const SENDER_DOMAIN = "notify.cre8visions.com";

/** Same bucket proposal-sign reads from, so uploads and signing agree. */
const PROPOSAL_BUCKET = "client-assets";

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
          due_date?: string; priority?: string;
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
          status: "todo",
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

        const sent = await deliverClientEmail(sb, {
          to: p.to,
          subject: p.subject,
          html: p.body,
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

      case "draft_proposal": {
        const p = action.payload as {
          client_id?: string;
          client_project_id?: string;
          title?: string;
          content?: ProposalContent;
        };
        if (!p.client_id) return { ok: false, error: "No client_id supplied" };
        if (!p.client_project_id) {
          return { ok: false, error: "No client_project_id supplied; a proposal has to hang off a project" };
        }
        if (!p.content) return { ok: false, error: "No proposal content supplied" };

        // The spine is the house order, not a gate. Rejecting a finished draft
        // for a section it folded into its neighbour put the agent in a loop it
        // could not win, so only the sections a client would notice missing
        // block — the rest are recorded as gaps and rendered as such.
        const content: ProposalContent = { ...p.content, kind: inferKind(p.content) };
        const blocking = missingEssentials(content);
        if (blocking.length) {
          return {
            ok: false,
            error: `Write these before filing the draft: ${blocking.join(", ")}. Everything else is optional.`,
          };
        }
        const gaps = missingSections(content);

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

        // Render immediately. The signing flow stamps a signature page onto a
        // source PDF, so a proposal with no PDF cannot be signed — generating it
        // here is what makes an agent-written proposal a real one.
        try {
          const pdf = await renderProposalPdf(data.title, content);
          const path = `proposals/${p.client_id}/${data.id}/source.pdf`;
          const { error: upErr } = await sb.storage.from(PROPOSAL_BUCKET)
            .upload(path, pdf, { contentType: "application/pdf", upsert: true, cacheControl: "3600" });
          if (upErr) throw upErr;
          await sb.from("client_proposals")
            .update({ source_pdf_path: path, pdf_generated_at: new Date().toISOString() })
            .eq("id", data.id);
          await logProposalEvent(sb, {
            proposal_id: data.id,
            client_id: p.client_id,
            event_type: "pdf_uploaded",
            actor: agentName,
            detail: { path, generated: true },
          });
        } catch (e) {
          // The draft still exists and is readable; it just can't be sent for
          // signature until a PDF lands. Say so rather than failing the draft.
          console.error("[actions] proposal PDF render failed", String((e as Error).message || e));
        }
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
            client_id: p.client_id,
            client_project_id: p.client_project_id,
            title: data.title,
            kind: content.kind,
            status: "draft",
            // Named so the reply can say what it left out rather than the agent
            // guessing, and so nothing re-drafts to "fix" a deliberate omission.
            gaps: gaps.length ? gaps : undefined,
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
          .select("id, title, client_id, client_project_id, status, followup_count, source_pdf_path")
          .eq("id", p.proposal_id).maybeSingle();
        if (pErr) return { ok: false, error: pErr.message };
        if (!proposal) return { ok: false, error: "Proposal not found" };
        if (proposal.status === "signed") {
          return { ok: false, error: "Proposal is already signed" };
        }
        if (!proposal.source_pdf_path) {
          // Sending a link to a proposal the client cannot sign wastes the one
          // moment they were actually paying attention.
          return { ok: false, error: "Proposal has no PDF yet, so it cannot be signed. Regenerate it first." };
        }

        const { data: client } = await sb.from("clients")
          .select("contact_email, contact_name, business_name")
          .eq("id", proposal.client_id).maybeSingle();
        const to = p.to || client?.contact_email;
        if (!to) return { ok: false, error: "No recipient email on the client" };

        const link = proposal.client_project_id
          ? `${PORTAL_BASE_URL}/portal/${proposal.client_id}/projects/${proposal.client_project_id}`
          : `${PORTAL_BASE_URL}/portal/${proposal.client_id}`;

        // The link is appended rather than trusted to the drafted body: the
        // client must always get a working way in, whatever the agent wrote.
        const html = `${p.body}\n<p style="margin:24px 0"><a href="${link}" style="background:#8B7355;color:#FAFAF8;padding:12px 20px;border-radius:8px;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;display:inline-block">Review and sign the proposal</a></p><p style="font-family:Arial,sans-serif;font-size:12px;color:#9A938A">Or paste this into your browser: ${link}</p>`;

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

        const followupDays = 4;
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

        const due = p.due_date ?? new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10);
        const { error } = await sb.from("client_proposals")
          .update({ next_followup_at: new Date(`${due}T09:00:00Z`).toISOString() })
          .eq("id", proposal.id);
        if (error) return { ok: false, error: error.message };

        // Also open a dated task so the follow-up shows in Up Next alongside
        // everything else a person is expected to do that day.
        let taskId: string | null = null;
        if (proposal.client_project_id) {
          const { data: task } = await sb.from("project_tasks").insert({
            client_project_id: proposal.client_project_id,
            name: `Follow up on proposal: ${proposal.title}`,
            description: `${p.note ?? action.description ?? ""}\n\n> Scheduled by ${agentName}.`.trim(),
            due_date: due,
            priority: "medium",
            assignee_kind: "agency",
            status: "todo",
          }).select("id").maybeSingle();
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
