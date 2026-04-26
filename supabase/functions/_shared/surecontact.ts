// Shared helper for upserting contacts into SureContact.
// Uses the same /api/v1/public/contacts/upsert endpoint as submit-contact.

const SURECONTACT_UPSERT_URL =
  "https://api.surecontact.com/api/v1/public/contacts/upsert";

export interface SureContactUpsertInput {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  phone?: string | null;
  customFields?: Record<string, string | number | null | undefined>;
  tags?: string[];
  /** Tags SureContact should drop from the contact on this upsert. */
  tagsToRemove?: string[];
  lists?: string[];
  metadata?: Record<string, unknown>;
}

export interface SureContactUpsertResult {
  ok: boolean;
  status: number;
  data: unknown;
  error?: string;
}

/**
 * Splits a single contact name into first/last for SureContact's primary_fields.
 * SureContact treats first_name as required-ish for clean records.
 */
export function splitContactName(name?: string | null): {
  firstName: string;
  lastName: string;
} {
  if (!name) return { firstName: "", lastName: "" };
  const trimmed = name.trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

/**
 * Upsert a contact in SureContact. Returns a result object — never throws,
 * so callers can decide whether to surface errors to the user.
 */
export async function upsertSureContact(
  input: SureContactUpsertInput,
  apiKey: string,
): Promise<SureContactUpsertResult> {
  const cleanCustom: Record<string, string> = {};
  if (input.customFields) {
    for (const [k, v] of Object.entries(input.customFields)) {
      if (v === null || v === undefined) continue;
      const s = String(v).trim();
      if (s) cleanCustom[k] = s;
    }
  }

  const body: Record<string, unknown> = {
    primary_fields: {
      email: input.email.trim(),
      first_name: (input.firstName || "").trim(),
      last_name: (input.lastName || "").trim(),
      company: (input.company || "").trim(),
      source: "api",
      status: "active",
    },
    custom_fields: cleanCustom,
    metadata: input.metadata || { form_source: "cre8visions_crm" },
    lists: input.lists && input.lists.length > 0
      ? input.lists
      : ["Cre8 Visions Clients"],
    tags: input.tags || [],
  };

  if (input.tagsToRemove && input.tagsToRemove.length > 0) {
    // SureContact accepts both naming conventions in upsert payloads;
    // sending both is harmless and ensures stale stage tags are dropped.
    body.tags_to_remove = input.tagsToRemove;
    body.remove_tags = input.tagsToRemove;
  }

  try {
    const resp = await fetch(SURECONTACT_UPSERT_URL, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    let data: unknown = null;
    try {
      data = await resp.json();
    } catch {
      // some 5xx responses may not be JSON
    }

    if (!resp.ok) {
      const errMsg =
        (data && typeof data === "object" && "message" in (data as any)
          ? String((data as any).message)
          : `SureContact upsert failed (${resp.status})`);
      return { ok: false, status: resp.status, data, error: errMsg };
    }

    return { ok: true, status: resp.status, data };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}
