// Onboarding invites (CRE-822, G6) -- one source for the invite ENVELOPE,
// read from wherever this install's invite-of-record lives: the Client
// Portal plugin once CP-6 has imported it, `/admin`'s `onboarding_invites`
// table until then.
//
// WHAT THIS IS NOT ABOUT
//
// The chat conversation and its extracted summary are a separate concern and
// stay in `onboarding_submissions` either way -- see the plugin's own
// `docs/API.md`, "Where the answers go": "two places holding the same
// answers is two places that can disagree." This module is only ever about
// the token, the contact details, the expiry/revoked/completed state, and
// the handles a payment webhook needs for idempotency.
//
// WHO THIS IS FOR
//
// Every caller here is either an agency/webhook caller with no client
// session (Invites.tsx's admin page, AutomationBuildView's per-client panel,
// surecart-webhook) or a public, token-only caller with no session at all
// (onboarding-session, onboarding-chat). Neither matches `PortalCallerContext`
// -- that is an authenticated CLIENT, and the one client-scoped read this
// feature needs (the Brand Voice banner on the project page) already lives
// on `PortalSource.onboardingInvite` in `client-portal/source.ts`. This file
// is the other, board/public half.
//
// WHAT NEITHER SOURCE CAN DO, AND SAYS SO
//
// The plugin's `GET /onboarding-invites` and `GET /clients/:clientId/
// onboarding-invites` both answer the tokenless `inviteToWire` shape, by
// design (see the plugin's own docs: a board-wide list is "precisely where a
// leak would be worst"). So a caller that already created an invite and is
// now re-reading it by `sourceOrderRef` (a webhook replay) cannot recover its
// token or its `sourceOrderRef`/provider-ref columns from the plugin -- there
// is also no route to PATCH them after creation. `findBySourceOrderRef`
// therefore answers "does one already exist" (for the idempotency check) and
// nothing more on the plugin path; `surecart-webhook` reads this file's
// comments before assuming it can resend the original link on a replay.
//
// A second, separate plugin gap: `POST /onboarding-invites/redeem` refuses
// an already-submitted invite with `invite_already_used` (by design, on the
// plugin's side, to stop a second submission from moving the completion
// time). `onboarding-session`'s "Reopen Brand Voice chat" link has always
// gone through this same lookup with no such refusal -- see
// `LegacyInviteSource#redeemByToken`'s own comment -- so reopening a
// completed chat stops working only once an install is plugin-backed. Not
// fixable from this repository; flagged rather than silently degraded.

import { readPluginConfig, PluginClient, PluginApiError } from "./client-portal-plugin.ts";

/** The envelope, with no opinion about which source answered. */
export interface InviteRecord {
  id: string;
  /** Populated by `create` and by `redeemByToken`/`findByToken`'s admin-table
   * implementation. Never populated by a list read on the plugin path --
   * see this file's header. */
  token: string | null;
  businessName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  tier: string | null;
  note: string | null;
  expiresAt: string | null;
  revoked: boolean;
  expired: boolean;
  live: boolean;
  lastOpenedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  /** The client this invite is bound to, once one exists. Null is the
   * common case -- see `createOnboardingInvite`'s own doc comment. Always
   * null on the admin-tables bridge: that table has no such column, and the
   * nearest equivalent (`onboarding_submissions`, reached via `submission_id`)
   * is a one-way pointer the other direction. */
  clientId: string | null;
  /** The purchase this invite came out of, for Invites.tsx's "via SureCart"
   * badge. Always null on the plugin path -- its own serialiser never
   * returns this on a read, by design (see this file's header); the webhook's
   * idempotency check reads it by filtering, not by reading it back. */
  sourceOrderRef: string | null;
}

export interface CreateInviteInput {
  clientId?: string | null;
  businessName?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  tier?: string | null;
  note?: string | null;
  sourceOrderRef?: string | null;
  providerCustomerRef?: string | null;
  providerSubscriptionRef?: string | null;
  expiresInDays?: number | null;
}

/** A refusal with a status + code a caller can branch on, mirroring `PortalError`. */
export class InviteError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "InviteError";
    this.status = status;
    this.code = code;
  }
}

export interface InviteSource {
  readonly kind: "plugin" | "admin-tables";

  /** The webhook's idempotency lookup: has this order already minted one. */
  findBySourceOrderRef(ref: string): Promise<InviteRecord | null>;

  /** Mints a new invite. The one call that returns a populated `token`. */
  create(input: CreateInviteInput): Promise<InviteRecord>;

  revoke(id: string): Promise<InviteRecord>;

  /** Invites.tsx's "All invites" admin list. `clientId: "unbound"` asks for
   * the ones bound to no client yet. */
  listCompany(filters: { clientId?: string | null; contactEmail?: string }): Promise<InviteRecord[]>;

  /**
   * The most relevant invite for one client -- AutomationBuildView's panel
   * and (on the admin-tables side) the same match priority brand-kit-intake
   * used to apply: by `submissionId` first, then the most recent non-revoked
   * invite sent to `contactEmail`. Every hint is optional because the two
   * sources key on different ones; a caller that has all three may pass all
   * three.
   */
  findForClient(hints: {
    clientId?: string | null;
    submissionId?: string | null;
    contactEmail?: string | null;
  }): Promise<InviteRecord | null>;

  /**
   * A lightweight validity check, with no side effect where the source can
   * avoid one. `null` for not-found, revoked or expired alike -- callers that
   * only need "may this token proceed" (onboarding-chat) do not need to tell
   * those apart.
   */
  findByToken(token: string): Promise<InviteRecord | null>;

  /** What a form should show for a token. Throws `InviteError` with
   * `invite_revoked` / `invite_expired` / `invite_already_used` / `not_found`
   * -- the caller is expected to say which, unlike `findByToken`. */
  redeemByToken(token: string): Promise<InviteRecord>;

  /** Marks an invite filled in and binds it to the client it produced. */
  complete(
    id: string,
    input: { clientId?: string | null; submissionRef?: string | null },
  ): Promise<InviteRecord>;
}

/* -------------------------------------------------------------------------- */
/* Plugin implementation                                                      */
/* -------------------------------------------------------------------------- */

interface PluginInvite {
  id: string;
  clientId: string | null;
  businessName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  tier: string | null;
  note: string | null;
  expiresAt: string | null;
  revoked: boolean;
  expired: boolean;
  live: boolean;
  lastOpenedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface PluginInviteWithToken extends PluginInvite {
  token: string;
}

function fromPlugin(row: PluginInvite, token: string | null = null): InviteRecord {
  return {
    id: row.id,
    token,
    businessName: row.businessName,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    tier: row.tier,
    note: row.note,
    expiresAt: row.expiresAt,
    revoked: row.revoked,
    expired: row.expired,
    live: row.live,
    lastOpenedAt: row.lastOpenedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    clientId: row.clientId,
    sourceOrderRef: null,
  };
}

class PluginInviteSource implements InviteSource {
  readonly kind = "plugin" as const;
  readonly #api: PluginClient;

  constructor(api: PluginClient) {
    this.#api = api;
  }

  async findBySourceOrderRef(ref: string): Promise<InviteRecord | null> {
    const data = await this.#api.call<{ invites: PluginInvite[] }>("/onboarding-invites", {
      query: { sourceOrderRef: ref },
    });
    const row = data.invites[0];
    // No token, and no `sourceOrderRef`/provider refs either -- see this
    // file's header. Presence is all a replay check can read back.
    return row ? fromPlugin(row) : null;
  }

  async create(input: CreateInviteInput): Promise<InviteRecord> {
    const data = await this.#api.call<{ invite: PluginInviteWithToken }>("/onboarding-invites", {
      method: "POST",
      body: {
        ...(input.clientId ? { clientId: input.clientId } : {}),
        ...(input.businessName ? { businessName: input.businessName } : {}),
        ...(input.contactName ? { contactName: input.contactName } : {}),
        ...(input.contactEmail ? { contactEmail: input.contactEmail } : {}),
        ...(input.tier ? { tier: input.tier } : {}),
        ...(input.note ? { note: input.note } : {}),
        ...(input.sourceOrderRef ? { sourceOrderRef: input.sourceOrderRef } : {}),
        ...(input.providerCustomerRef ? { providerCustomerRef: input.providerCustomerRef } : {}),
        ...(input.providerSubscriptionRef
          ? { providerSubscriptionRef: input.providerSubscriptionRef }
          : {}),
        ...(input.expiresInDays ? { expiresInDays: input.expiresInDays } : {}),
      },
    });
    return fromPlugin(data.invite, data.invite.token);
  }

  async revoke(id: string): Promise<InviteRecord> {
    const data = await this.#api.call<{ invite: PluginInvite }>(
      `/onboarding-invites/${encodeURIComponent(id)}/revoke`,
      { method: "POST", body: {} },
    );
    return fromPlugin(data.invite);
  }

  async listCompany(filters: {
    clientId?: string | null;
    contactEmail?: string;
  }): Promise<InviteRecord[]> {
    const data = await this.#api.call<{ invites: PluginInvite[] }>("/onboarding-invites", {
      query: {
        ...(filters.clientId === null
          ? { clientId: "unbound" }
          : filters.clientId
            ? { clientId: filters.clientId }
            : {}),
        ...(filters.contactEmail ? { contactEmail: filters.contactEmail } : {}),
      },
    });
    return data.invites.map((row) => fromPlugin(row));
  }

  async findForClient(hints: { clientId?: string | null }): Promise<InviteRecord | null> {
    if (!hints.clientId) return null;
    const data = await this.#api.call<{ invites: PluginInvite[] }>(
      `/clients/${encodeURIComponent(hints.clientId)}/onboarding-invites`,
    );
    const row = data.invites.find((invite) => !invite.revoked) ?? null;
    return row ? fromPlugin(row) : null;
  }

  async findByToken(token: string): Promise<InviteRecord | null> {
    try {
      return await this.redeemByToken(token);
    } catch (caught) {
      if (caught instanceof InviteError) return null;
      throw caught;
    }
  }

  async redeemByToken(token: string): Promise<InviteRecord> {
    try {
      const data = await this.#api.call<{ invite: PluginInvite }>("/onboarding-invites/redeem", {
        method: "POST",
        body: { token },
      });
      return fromPlugin(data.invite);
    } catch (caught) {
      throw toInviteError(caught);
    }
  }

  async complete(
    id: string,
    input: { clientId?: string | null; submissionRef?: string | null },
  ): Promise<InviteRecord> {
    try {
      const data = await this.#api.call<{ invite: PluginInvite }>(
        `/onboarding-invites/${encodeURIComponent(id)}/complete`,
        {
          method: "POST",
          body: {
            ...(input.clientId ? { clientId: input.clientId } : {}),
            ...(input.submissionRef ? { submissionRef: input.submissionRef } : {}),
          },
        },
      );
      return fromPlugin(data.invite);
    } catch (caught) {
      throw toInviteError(caught);
    }
  }
}

function toInviteError(caught: unknown): InviteError {
  if (caught instanceof PluginApiError) {
    return new InviteError(caught.status, caught.code, caught.message);
  }
  if (caught instanceof InviteError) return caught;
  throw caught;
}

/* -------------------------------------------------------------------------- */
/* Admin-tables implementation                                                */
/* -------------------------------------------------------------------------- */

type Row = Record<string, unknown>;

/** The slice of the Supabase client this file uses -- enough to be faked,
 * same discipline as `client-portal/legacy-source.ts`'s `Db`. */
export interface InviteDb {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        eq(column: string, value: unknown): PromiseLike<{ data: Row | null; error: unknown }>;
        maybeSingle(): PromiseLike<{ data: Row | null; error: unknown }>;
        order(
          column: string,
          options?: { ascending?: boolean },
        ): PromiseLike<{ data: Row[] | null; error: unknown }>;
      };
      order(
        column: string,
        options?: { ascending?: boolean },
      ): PromiseLike<{ data: Row[] | null; error: unknown }>;
    };
    insert(values: Record<string, unknown>): {
      select(columns: string): {
        single(): PromiseLike<{ data: Row | null; error: { message?: string } | null }>;
      };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: unknown): PromiseLike<{ error: { message?: string } | null }>;
    };
  };
}

function text(row: Row | null | undefined, key: string): string | null {
  const value = row?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toRecord(row: Row, now: Date): InviteRecord {
  const expiresAt = text(row, "expires_at");
  const expired = expiresAt !== null && Date.parse(expiresAt) <= now.getTime();
  const completedAt = text(row, "completed_at");
  const revoked = Boolean(row.revoked);
  return {
    id: text(row, "id") ?? "",
    token: text(row, "token"),
    businessName: text(row, "business_name"),
    contactName: text(row, "contact_name"),
    contactEmail: text(row, "contact_email"),
    tier: text(row, "tier"),
    note: text(row, "note"),
    expiresAt,
    revoked,
    expired,
    live: !revoked && !expired && completedAt === null,
    lastOpenedAt: text(row, "last_opened_at"),
    completedAt,
    createdAt: text(row, "created_at") ?? now.toISOString(),
    // This table has no `client_id` column at all -- see the migration
    // header. A caller that needs one resolves it from `clients` itself.
    clientId: null,
    sourceOrderRef: text(row, "source_order_id"),
  };
}

const COLUMNS =
  "id, token, business_name, contact_name, contact_email, tier, note, expires_at, " +
  "revoked, completed_at, last_opened_at, created_at, submission_id, source_order_id";

class LegacyInviteSource implements InviteSource {
  readonly kind = "admin-tables" as const;
  readonly #db: InviteDb;
  readonly #now: () => Date;

  constructor(db: InviteDb, now: () => Date = () => new Date()) {
    this.#db = db;
    this.#now = now;
  }

  async findBySourceOrderRef(ref: string): Promise<InviteRecord | null> {
    const { data } = await this.#db
      .from("onboarding_invites")
      .select(COLUMNS)
      .eq("source_order_id", ref)
      .maybeSingle();
    return data ? toRecord(data, this.#now()) : null;
  }

  async create(input: CreateInviteInput): Promise<InviteRecord> {
    const expiresAt = input.expiresInDays
      ? new Date(this.#now().getTime() + input.expiresInDays * 86_400_000).toISOString()
      : new Date(this.#now().getTime() + 30 * 86_400_000).toISOString();
    const { data, error } = await this.#db
      .from("onboarding_invites")
      .insert({
        token: mintLegacyToken(),
        business_name: input.businessName ?? null,
        contact_name: input.contactName ?? null,
        contact_email: input.contactEmail ?? null,
        tier: input.tier ?? null,
        note: input.note ?? null,
        source_order_id: input.sourceOrderRef ?? null,
        // The admin table's own vendor-named columns -- see the webhook's
        // backfill. Left as-is here; this bridge is not where that drifts.
        surecart_customer_id: input.providerCustomerRef ?? null,
        surecart_subscription_id: input.providerSubscriptionRef ?? null,
        expires_at: expiresAt,
      })
      .select(COLUMNS)
      .single();
    if (error || !data) {
      throw new InviteError(500, "insert_failed", error?.message ?? "Could not create that invite.");
    }
    return toRecord(data, this.#now());
  }

  async revoke(id: string): Promise<InviteRecord> {
    const { error } = await this.#db.from("onboarding_invites").update({ revoked: true }).eq("id", id);
    if (error) throw new InviteError(500, "revoke_failed", error.message ?? "Could not revoke that invite.");
    const { data } = await this.#db.from("onboarding_invites").select(COLUMNS).eq("id", id).maybeSingle();
    if (!data) throw new InviteError(404, "not_found", "That invite could not be found.");
    return toRecord(data, this.#now());
  }

  async listCompany(filters: {
    clientId?: string | null;
    contactEmail?: string;
  }): Promise<InviteRecord[]> {
    // `clientId` has no meaning on this table -- see the migration header --
    // so a filter naming one answers nothing rather than guessing at a join.
    if (filters.clientId) return [];
    const now = this.#now();
    if (filters.contactEmail) {
      const { data } = await this.#db
        .from("onboarding_invites")
        .select(COLUMNS)
        .eq("contact_email", filters.contactEmail)
        .order("created_at", { ascending: false });
      return (data ?? []).map((row) => toRecord(row, now));
    }
    const { data } = await this.#db
      .from("onboarding_invites")
      .select(COLUMNS)
      .order("created_at", { ascending: false });
    return (data ?? []).map((row) => toRecord(row, now));
  }

  async findForClient(hints: {
    submissionId?: string | null;
    contactEmail?: string | null;
  }): Promise<InviteRecord | null> {
    const now = this.#now();
    if (hints.submissionId) {
      const { data } = await this.#db
        .from("onboarding_invites")
        .select(COLUMNS)
        .eq("submission_id", hints.submissionId)
        .maybeSingle();
      if (data && !data.revoked) return toRecord(data, now);
    }
    if (hints.contactEmail) {
      const { data } = await this.#db
        .from("onboarding_invites")
        .select(COLUMNS)
        .eq("contact_email", hints.contactEmail)
        .order("created_at", { ascending: false });
      const candidate = (data ?? []).find((row) => !row.revoked) ?? null;
      if (candidate) return toRecord(candidate, now);
    }
    return null;
  }

  async findByToken(token: string): Promise<InviteRecord | null> {
    const { data } = await this.#db
      .from("onboarding_invites")
      .select(COLUMNS)
      .eq("token", token)
      .maybeSingle();
    if (!data) return null;
    const record = toRecord(data, this.#now());
    if (record.revoked || record.expired) return null;
    return record;
  }

  /**
   * Deliberately NOT the plugin's full `redeem` contract: this bridge's own
   * history (`onboarding-session`'s old "resolve") always let a client
   * reopen and review an already-submitted chat through this same lookup,
   * with no "already used" refusal at all -- only revoked and expired ever
   * stopped it. Adding that refusal now would be a regression this card
   * never asked for, for every client on this bridge today. The plugin's
   * own `/onboarding-invites/redeem` throws `invite_already_used` and cannot
   * be changed from here, so "reopen a completed chat" stops working only
   * once an install is plugin-backed -- a real, flagged gap, not something
   * worked around with a second plugin call that does not exist.
   */
  async redeemByToken(token: string): Promise<InviteRecord> {
    const { data } = await this.#db
      .from("onboarding_invites")
      .select(COLUMNS)
      .eq("token", token)
      .maybeSingle();
    if (!data) throw new InviteError(404, "not_found", "That invite could not be found.");
    const record = toRecord(data, this.#now());
    if (record.revoked) {
      throw new InviteError(
        409,
        "invite_revoked",
        "That onboarding link has been withdrawn. Ask your contact at the agency for a new one.",
      );
    }
    if (record.expired) {
      throw new InviteError(
        409,
        "invite_expired",
        "That onboarding link has expired. Ask your contact at the agency for a new one.",
      );
    }
    await this.#db
      .from("onboarding_invites")
      .update({ last_opened_at: this.#now().toISOString() })
      .eq("id", record.id);
    return record;
  }

  async complete(
    id: string,
    input: { clientId?: string | null; submissionRef?: string | null },
  ): Promise<InviteRecord> {
    const { error } = await this.#db
      .from("onboarding_invites")
      .update({
        completed_at: this.#now().toISOString(),
        ...(input.submissionRef ? { submission_id: input.submissionRef } : {}),
      })
      .eq("id", id);
    if (error) throw new InviteError(500, "complete_failed", error.message ?? "Could not complete that invite.");
    const { data } = await this.#db.from("onboarding_invites").select(COLUMNS).eq("id", id).maybeSingle();
    if (!data) throw new InviteError(404, "not_found", "That invite could not be found.");
    return toRecord(data, this.#now());
  }
}

function mintLegacyToken(len = 24): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
}

/* -------------------------------------------------------------------------- */

/** Which implementation this install answers from -- same decision as
 * `client-portal/index.ts#sourceFor`, independently for each caller. */
export function onboardingInviteSource(db: InviteDb, now?: () => Date): InviteSource {
  const config = readPluginConfig();
  if (config) return new PluginInviteSource(new PluginClient(config));
  return new LegacyInviteSource(db, now);
}
