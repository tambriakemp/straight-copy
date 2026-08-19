// Executing agent actions.
//
// Every action arrives here the same way whether it auto-executed at run time
// or a human approved it later, so there is exactly one code path that can
// change the world on an agent's behalf.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

// Mirrors the constants in send-transactional-email/index.ts so agent mail
// leaves from the same identity as every other email the app sends.
const FROM_NAME = "straight-copy";
const FROM_DOMAIN = "cre8visions.com";
const SENDER_DOMAIN = "notify.cre8visions.com";

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
          name?: string; client_project_id?: string; due_date?: string; priority?: string;
        };
        if (!p.client_project_id) {
          // project_tasks.client_project_id is NOT NULL, so a task with no
          // project has nowhere to live. Surface it rather than guessing.
          return { ok: false, error: "No client_project_id supplied; cannot place the task" };
        }
        const { data, error } = await sb.from("project_tasks").insert({
          client_project_id: p.client_project_id,
          name: p.name ?? action.title,
          description: action.description
            ? `${action.description}\n\n> Opened by ${agentName}.`
            : `> Opened by ${agentName}.`,
          due_date: p.due_date ?? null,
          priority: (p.priority as string) ?? "medium",
          assignee_kind: "agency",
          status: "todo",
        }).select("id").single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { task_id: data.id } };
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
        // Executing here means a human already approved this exact text, so
        // hand it to the existing queue rather than sending inline.
        const p = action.payload as { to?: string; subject?: string; body?: string };
        if (!p.to || !p.subject || !p.body) {
          return { ok: false, error: "Draft is missing to, subject or body" };
        }
        // Same envelope shape send-transactional-email builds, so
        // process-email-queue handles retries and rate limiting as usual.
        const messageId = crypto.randomUUID();
        await sb.from("email_send_log").insert({
          message_id: messageId,
          template_name: `agent:${action.kind}`,
          recipient_email: p.to,
          status: "pending",
        });
        const { data, error } = await sb.rpc("enqueue_email", {
          queue_name: "transactional_emails",
          payload: {
            message_id: messageId,
            to: p.to,
            from: `${FROM_NAME} <noreply@${FROM_DOMAIN}>`,
            sender_domain: SENDER_DOMAIN,
            subject: p.subject,
            html: p.body,
            purpose: "transactional",
            label: `agent-${action.kind}`,
            // One approval, one send: a double-click can't queue it twice.
            idempotency_key: `agent-action-${action.id}`,
            queued_at: new Date().toISOString(),
          },
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { queued: true, message_id: messageId, msg_id: data ?? null } };
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
