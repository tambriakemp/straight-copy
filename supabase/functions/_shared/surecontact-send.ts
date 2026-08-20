// Sending client email through SureContact.
//
// Why this exists: everything else in the app queues mail through
// enqueue_email → process-email-queue, which delivers via the Lovable email
// API. That path works, but the message never touches SureContact, so it does
// not appear on the contact's timeline, does not get opens or clicks tracked,
// and does not exist as far as any sequence or report is concerned.
//
// Client-facing mail has to go through SureContact for that history to be real.
// This module is that path. Two steps, in order:
//   1. Make sure the contact exists and carries the `client` tag. Sending to a
//      contact SureContact does not know about is how mail ends up untracked.
//   2. Send, and log the send as an activity on the contact.
//
// The send route is configurable. SureContact's public API exposes direct send
// through the conversations compose endpoint; SURECONTACT_SEND_PATH pins it if
// that ever moves, so a route change is an env edit rather than a deploy.
import { splitContactName, upsertSureContact } from "./surecontact.ts";

const API_BASE = "https://api.surecontact.com/api/v1/public";

/** Tried in order. The first that does not 404 is used and remembered. */
const SEND_PATHS = ["conversations/compose", "emails/send", "contacts/send-email"];

let resolvedSendPath: string | null = null;

export interface SureContactSendInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Name of the person, used to create the contact if they are new. */
  name?: string | null;
  company?: string | null;
  replyTo?: string;
  /** Tags to ensure on the contact before sending. `client` is always added. */
  tags?: string[];
  /** Recorded on the SureContact activity so the timeline says why. */
  reason?: string;
}

export interface SureContactSendResult {
  ok: boolean;
  /** SureContact's id for the message, when it gives one back. */
  messageId?: string | null;
  path?: string;
  status: number;
  error?: string;
  data?: unknown;
}

function pathsToTry(): string[] {
  const pinned = Deno.env.get("SURECONTACT_SEND_PATH");
  if (pinned) return [pinned.replace(/^\/+/, "")];
  if (resolvedSendPath) return [resolvedSendPath];
  return SEND_PATHS;
}

/**
 * Ensure the recipient exists in SureContact as a tagged contact.
 *
 * Always adds `client`. Sending to an unknown address still delivers, but the
 * message lands nowhere useful — no contact timeline, no attribution — which is
 * the exact problem this module exists to fix.
 */
export async function ensureClientContact(
  apiKey: string,
  input: { email: string; name?: string | null; company?: string | null; tags?: string[] },
): Promise<{ ok: boolean; error?: string }> {
  const { firstName, lastName } = splitContactName(input.name);
  const tags = Array.from(new Set(["client", ...(input.tags ?? [])]));
  const res = await upsertSureContact(
    {
      email: input.email,
      firstName,
      lastName,
      company: input.company ?? null,
      tags,
      lists: ["Cre8 Visions Clients"],
      metadata: { form_source: "cre8visions_crm", trigger: "agent_email" },
    },
    apiKey,
  );
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function sendSureContactEmail(
  apiKey: string,
  input: SureContactSendInput,
): Promise<SureContactSendResult> {
  const ensured = await ensureClientContact(apiKey, {
    email: input.to,
    name: input.name,
    company: input.company,
    tags: input.tags,
  });
  if (!ensured.ok) {
    // Carry on rather than abort: a failed upsert usually means the contact
    // already exists in a state the upsert didn't like, and refusing to send a
    // proposal over a tagging problem is the wrong trade.
    console.warn("[surecontact-send] contact upsert failed, sending anyway", ensured.error);
  }

  const body = {
    contact_email: input.to,
    subject: input.subject,
    body: input.html,
    ...(input.text ? { text_content: input.text } : {}),
    ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    is_draft: false,
  };

  let lastStatus = 0;
  let lastError = "No send route succeeded";
  let lastData: unknown = null;

  for (const path of pathsToTry()) {
    try {
      const resp = await fetch(`${API_BASE}/${path}`, {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await resp.json().catch(() => null);

      if (resp.status === 404) {
        // Wrong route, not a wrong request. Try the next one.
        lastStatus = 404;
        lastError = `No such SureContact route: ${path}`;
        continue;
      }
      if (!resp.ok) {
        lastStatus = resp.status;
        lastData = data;
        lastError = (data && typeof data === "object" && "message" in (data as Record<string, unknown>))
          ? String((data as Record<string, unknown>).message)
          : `SureContact send failed (${resp.status})`;
        // A real error from a real route — stop, don't retry other paths and
        // risk sending the same message twice.
        break;
      }

      resolvedSendPath = path;
      const d = (data ?? {}) as Record<string, unknown>;
      const messageId =
        (d.message_id as string) ?? (d.uuid as string) ?? (d.id as string) ??
        ((d.data as Record<string, unknown>)?.uuid as string) ?? null;
      return { ok: true, messageId, path, status: resp.status, data };
    } catch (e) {
      lastStatus = 0;
      lastError = String((e as Error).message || e);
    }
  }

  return { ok: false, status: lastStatus, error: lastError, data: lastData };
}

/** Record the send on the contact's SureContact timeline. Best-effort. */
export async function logSureContactActivity(
  apiKey: string,
  input: {
    email: string;
    type: "email_sent" | "custom_activity";
    description: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await fetch(`${API_BASE}/activities`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        contact_email: input.email,
        type: input.type,
        description: input.description.slice(0, 1000),
        metadata: input.metadata ?? {},
      }),
    });
  } catch (e) {
    console.warn("[surecontact-send] activity log failed", String((e as Error).message || e));
  }
}
