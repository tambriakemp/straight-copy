// The client portal, served from the `/admin` tables. A BRIDGE, NOT A HOME.
//
// Everything here is scheduled for deletion. The destination is
// `plugin-source.ts`; this exists because the Client Portal plugin has never
// been installed anywhere and the import that would move this data into it is
// CP-6, which is gated on the owner's approval. Without this file, merging
// the new screens would take the portal of every current client blank until
// that approval arrives.
//
// WHEN TO DELETE IT
//
// When CP-6 has imported the data and the three CLIENT_PORTAL_* variables are
// set on this project. At that point `index.ts` stops constructing this
// class, and the deletion is this file plus six lines there. Nothing in
// `src/` changes, because no screen knows which source answered it.
//
// THREE THINGS IT DELIBERATELY DOES NOT REIMPLEMENT
//
// Signing, declining and the audit trail around them live in
// `proposal-sign`, which stamps the PDF, records the IP and user agent, logs
// the event and triggers the deposit automation. That is roughly 150 lines of
// safety-critical code, and a second copy of it here would be a second copy
// that drifts. So those three delegate over HTTP to the existing function,
// forwarding the caller's own bearer token -- which also means the existing
// function re-checks the caller rather than trusting this one.
//
// WHAT IT CANNOT DO, AND SAYS SO
//
// There is no concept of an agency ASKING a client for a login in these
// tables; `cp_credential_requests` is new in the plugin. So `logins()`
// returns an empty `requests` list here and mockup 16's right-hand panel
// renders as a plain "share a login" form rather than an answer to a named
// ask. That is a real difference from the mockup, it lasts exactly as long as
// this file does, and it is written down rather than papered over.

import {
  initialsFor,
  ladder,
  paymentState,
  paymentTotals,
  stepPosition,
  type AgreementLineItem,
  type AgreementView,
  type AgreementsView,
  type HomeView,
  type LoginsView,
  type PaymentRow,
  type PaymentsView,
  type PortalMe,
  type SharedLogin,
  type SignRequest,
  type SignResult,
  type TeamUpdate,
  type WaitingItem,
} from "../_shared/client-portal-wire.ts";
import { footnoteFor, providerLabel } from "../_shared/client-portal-shape.ts";
import {
  badRequest,
  notFound,
  PortalError,
  type PortalCallerContext,
  type PortalDocument,
  type PortalSource,
  type ShareLoginInput,
  type UpdateLoginInput,
} from "./source.ts";

/** A row as it comes back. Every column is read through a named accessor below. */
type Row = Record<string, unknown>;

/**
 * The slice of the Supabase query builder this file uses.
 *
 * Declared rather than imported, and deliberately not `any`: the point of
 * writing it out is that adding a `.filter()` call to this file is a change
 * to this interface, which is a moment to ask whether the filter belongs in
 * a bridge that is scheduled for deletion.
 *
 * `PromiseLike` and not `Promise` throughout, because the real builder is a
 * thenable rather than a promise, and narrowing it makes the real client fail
 * to satisfy this.
 */
export interface Query extends PromiseLike<{ data: Row[] | null; error: unknown }> {
  select(columns: string): Query;
  eq(column: string, value: unknown): Query;
  neq(column: string, value: unknown): Query;
  in(column: string, values: readonly unknown[]): Query;
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): Query;
  delete(): Query;
  maybeSingle(): PromiseLike<{ data: Row | null; error: unknown }>;
}

/** The slice of the Supabase client this file uses. Enough to be faked. */
export interface Db {
  from(table: string): Query;
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

/* -- reading a row without reaching for `any` ------------------------------ */
//
// Four accessors instead of a cast per column. A `row.foo as string` is a
// claim the compiler cannot check and the database will not honour -- these
// tables are edited by two different migration sources -- so each of these
// says what it does with a value of the wrong shape, once.

function text(row: Row | null | undefined, key: string): string | null {
  const value = row?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function required(row: Row, key: string): string {
  return text(row, key) ?? "";
}

function cents(row: Row, key: string): number {
  const value = row[key];
  const number = typeof value === "number" ? value : Number(value);
  // A non-numeric amount becomes zero rather than NaN: a client reading
  // "$NaN" learns nothing, and a row whose total is wrong is visible in the
  // tile at the top of the page.
  return Number.isFinite(number) ? number : 0;
}

function rows(result: { data: Row[] | null; error?: unknown }): Row[] {
  return result.data ?? [];
}

/** The `error` string out of a delegated response, if it carried one. */
function errorFrom(body: unknown): string | null {
  const value = (body as { error?: unknown } | null)?.error;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Calls the existing portal edge functions, as the caller.
 *
 * `body` is whatever JSON came back, so it is `unknown` and read through a
 * cast at each call site. Those functions are not typed and their responses
 * differ per action; pretending otherwise here would be a type that is
 * checked against nothing.
 */
export interface Delegate {
  (fn: string, body: Record<string, unknown>): Promise<{ status: number; body: unknown }>;
}

/** The mask these screens show. The plugin has its own; both are `••••••••`. */
const MASK = "••••••••";

/** `status` on `project_invoices`: scheduled | sent | paid | void | failed. */
const BILLED = new Set(["sent", "paid", "failed"]);

export class LegacySource implements PortalSource {
  readonly kind = "admin-tables" as const;
  readonly #db: Db;
  readonly #delegate: Delegate;
  readonly #encryptionKey: string;

  constructor(db: Db, delegate: Delegate, encryptionKey: string) {
    this.#db = db;
    this.#delegate = delegate;
    this.#encryptionKey = encryptionKey;
  }

  async #me(ctx: PortalCallerContext): Promise<PortalMe> {
    const { data } = await this.#db
      .from("clients")
      .select("id, business_name, contact_name")
      .eq("id", ctx.clientId)
      .maybeSingle();
    if (!data) throw notFound("That portal");
    const displayName = text(data, "contact_name") ?? text(data, "business_name") ?? "there";
    return {
      clientId: required(data, "id"),
      displayName,
      businessName: text(data, "business_name"),
      initials: initialsFor(displayName),
    };
  }

  async home(ctx: PortalCallerContext): Promise<HomeView> {
    const [me, nodes, projects, proposals, invoices] = await Promise.all([
      this.#me(ctx),
      this.#db
        .from("journey_nodes")
        .select("key, label, order_index, status, completed_at")
        .eq("client_id", ctx.clientId)
        .order("order_index", { ascending: true }),
      this.#db
        .from("client_projects")
        .select("id, name, type, status, updated_at")
        .eq("client_id", ctx.clientId)
        .neq("status", "archived")
        .order("updated_at", { ascending: false }),
      this.#db
        .from("client_proposals")
        .select("id, title, status, sent_at, client_signed_at, declined_at")
        .eq("client_id", ctx.clientId),
      this.#db
        .from("project_invoices")
        .select("id, label, amount_cents, currency, status, due_date, paid_at, checkout_url")
        .eq("client_id", ctx.clientId)
        .order("sequence", { ascending: true }),
    ]);

    const { data: client } = await this.#db
      .from("clients")
      .select("delivery_date")
      .eq("id", ctx.clientId)
      .maybeSingle();

    const milestones = ladder(
      rows(nodes).map((node) => ({
        key: required(node, "key"),
        // `journey_nodes.label` is already the client-facing wording -- the
        // admin edits it and clients read it. Carried verbatim.
        label: required(node, "label"),
        done: isNodeDone(node),
      })),
    );
    const position = stepPosition(milestones);
    const project = rows(projects)[0] ?? null;

    const waiting: WaitingItem[] = [];
    for (const proposal of rows(proposals)) {
      if (proposal.status !== "sent") continue;
      if (proposal.client_signed_at || proposal.declined_at) continue;
      waiting.push({
        id: `proposal:${required(proposal, "id")}`,
        title: `Sign ${required(proposal, "title")}`,
        icon: "sign",
        action: "Review and sign",
        href: `/portal/${ctx.clientId}/agreements?id=${encodeURIComponent(required(proposal, "id"))}`,
        primary: true,
      });
    }

    const payments = invoiceRowsFromAdmin(rows(invoices), ctx.now);
    const nextPayable = payments.find((row) => row.payable) ?? null;

    return {
      branding: ctx.branding,
      me,
      headline: headlineFor(project),
      stepNumber: position?.stepNumber ?? null,
      stepCount: position?.stepCount ?? null,
      targetDate: text(client, "delivery_date"),
      milestones,
      waitingOnYou: waiting,
      nextPayment: nextPayable
        ? {
            invoiceId: nextPayable.id,
            amountCents: nextPayable.amountCents,
            currency: nextPayable.currency,
            label: nextPayable.label,
            dueOn: nextPayable.dueOn,
            providerName: nextPayable.paidWith ?? providerLabel("surecart"),
          }
        : null,
      updates: recentUpdates(rows(proposals), rows(invoices), rows(nodes)),
    };
  }

  async agreements(ctx: PortalCallerContext): Promise<AgreementsView> {
    const [me, proposals] = await Promise.all([
      this.#me(ctx),
      this.#db
        .from("client_proposals")
        .select(
          "id, title, description, status, content, total_cents, currency, sent_at, " +
            "client_signed_at, client_signature_name, signed_pdf_path, source_pdf_path, " +
            "payment_terms, created_at, declined_at, version",
        )
        .eq("client_id", ctx.clientId)
        .in("status", ["sent", "signed", "declined", "voided", "superseded"])
        .order("created_at", { ascending: false }),
    ]);

    const agreements = rows(proposals).map((row): AgreementView => {
      const content = (row.content ?? null) as {
        cover?: { prepared_for?: string; prepared_by?: string; project_name?: string };
        sections?: Array<{ heading?: string; body?: string }>;
      } | null;
      const sections = Array.isArray(content?.sections) ? content.sections : [];
      // The first section with a body is "What we'll build". A document with
      // a dozen sections is not re-laid-out on the client screen: the screen
      // is for reading and signing, and the full document is the PDF under it.
      const scope = sections.find((section) => (section.body ?? "").trim().length > 0);
      const title = required(row, "title");
      return {
        id: required(row, "id"),
        // These tables have no proposal number. Falling back to the title
        // rather than inventing a number that would not match the PDF.
        number: content?.cover?.project_name ?? title,
        title,
        preparedFor: content?.cover?.prepared_for ?? me.businessName ?? me.displayName,
        preparedBy: content?.cover?.prepared_by ?? ctx.branding.agencyName,
        sentAt: text(row, "sent_at"),
        status: adminStatus(row),
        scopeHeading: scope || text(row, "description") ? "What we’ll build" : null,
        scopeBody: scope?.body ?? text(row, "description"),
        lineItems: lineItemsFrom(row.payment_terms),
        totalCents: cents(row, "total_cents"),
        currency: (text(row, "currency") ?? "usd").toUpperCase(),
        instalmentSummary: null,
        hasSourcePdf: Boolean(row.source_pdf_path),
        hasSignedDocument: Boolean(row.signed_pdf_path),
        signedAt: text(row, "client_signed_at"),
        signerName: text(row, "client_signature_name"),
      };
    });

    return {
      branding: ctx.branding,
      me,
      agreements,
      signing: {
        // These tables store the consent sentence nowhere, so the wording is
        // the one the screen has always used. The plugin stores it per
        // company and per signature, which is why this is the half that goes.
        consentText:
          "I’ve read the proposal and service agreement. Typing my name counts as my signature.",
        // One face, because the legacy signer stores a typed name and has no
        // concept of an adopted style. Offering a choice the stored signature
        // would not record would be a choice that does not survive signing.
        styles: [],
        defaultStyle: null,
        hosted: false,
        depositProviderName: providerLabel("surecart"),
        depositCents: null,
      },
    };
  }

  async sign(ctx: PortalCallerContext, input: SignRequest): Promise<SignResult> {
    if (!input.consentGranted) {
      throw badRequest("consent_required", "Tick the box to sign.");
    }
    const name = input.signerName.trim();
    if (name.length === 0) {
      throw badRequest("signer_name_required", "Type your full name to sign.");
    }
    const result = await this.#delegate("proposal-sign", {
      action: "sign",
      clientId: ctx.clientId,
      proposalId: input.proposalId,
      signatureType: "typed",
      signatureName: name,
      // The legacy signer stores the typed name as the signature value. It
      // is the mark itself, and it is what the stamped PDF draws.
      signatureData: name,
      audit: { consentText: "typed-name", source: "client-portal" },
    });
    if (result.status >= 400) {
      throw new PortalError(
        result.status,
        "sign_refused",
        errorFrom(result.body) ?? "That proposal could not be signed.",
      );
    }

    // Signing triggers the deposit automation, which writes the invoice
    // asynchronously. Rather than race it, the client is sent to Payments,
    // which reads whatever exists by the time they arrive.
    return {
      signedAt: new Date().toISOString(),
      nextHref: `/portal/${ctx.clientId}/payments`,
      depositInvoiceId: null,
    };
  }

  async decline(
    ctx: PortalCallerContext,
    proposalId: string,
    reason: string | null,
  ): Promise<void> {
    const result = await this.#delegate("proposal-sign", {
      action: "decline",
      clientId: ctx.clientId,
      proposalId,
      ...(reason ? { reason } : {}),
    });
    if (result.status >= 400) {
      throw new PortalError(
        result.status,
        "decline_refused",
        errorFrom(result.body) ?? "That proposal could not be declined.",
      );
    }
  }

  /**
   * A proposal PDF, as a short-lived signed URL.
   *
   * Delegated to `proposal-sign`, which already mints one and already decides
   * which statuses a client may download at all -- a client-hidden proposal
   * is a 404 there, and reimplementing that list here would be a second copy
   * of a rule about what clients may see.
   */
  async document(
    ctx: PortalCallerContext,
    kind: "signed" | "source",
    proposalId: string,
  ): Promise<PortalDocument> {
    const result = await this.#delegate("proposal-sign", {
      action: "download",
      clientId: ctx.clientId,
      proposalId,
      variant: kind === "signed" ? "signed" : "source",
    });
    const url = (result.body as { pdfUrl?: unknown } | null)?.pdfUrl;
    if (result.status >= 400 || typeof url !== "string") {
      throw notFound("That document");
    }
    return {
      form: "url",
      filename: kind === "signed" ? "signed-proposal.pdf" : "proposal.pdf",
      url,
    };
  }

  async payments(ctx: PortalCallerContext): Promise<PaymentsView> {
    const [me, invoices] = await Promise.all([
      this.#me(ctx),
      this.#db
        .from("project_invoices")
        .select("id, label, amount_cents, currency, status, due_date, paid_at, checkout_url, sequence")
        .eq("client_id", ctx.clientId)
        .neq("status", "void")
        .order("sequence", { ascending: true }),
    ]);

    const payments = invoiceRowsFromAdmin(rows(invoices), ctx.now);
    const totals = paymentTotals(payments);
    return {
      branding: ctx.branding,
      me,
      totalCents: totals.totalCents,
      paidCents: totals.paidCents,
      currency: payments[0]?.currency ?? "USD",
      next: totals.next,
      rows: payments,
      footnote: footnoteFor([providerLabel("surecart") ?? ""]),
    };
  }

  async checkout(
    ctx: PortalCallerContext,
    invoiceId: string,
  ): Promise<{ checkoutUrl: string }> {
    const { data } = await this.#db
      .from("project_invoices")
      .select("id, status, checkout_url")
      .eq("id", invoiceId)
      .eq("client_id", ctx.clientId)
      .maybeSingle();
    if (!data) throw notFound("That payment");
    if (data.status === "paid") {
      throw new PortalError(409, "already_paid", "That payment has already been made.");
    }
    const checkoutUrl = text(data, "checkout_url");
    if (!checkoutUrl) {
      // Minting a SureCart checkout is an admin action in these tables and
      // needs credentials this path does not hold. Saying so beats a button
      // that fails silently.
      throw new PortalError(
        409,
        "no_checkout_url",
        "That payment is not ready to be paid online yet. Get in touch and we will send a link.",
      );
    }
    return { checkoutUrl };
  }

  async logins(ctx: PortalCallerContext): Promise<LoginsView> {
    const [me, logins] = await Promise.all([
      this.#me(ctx),
      this.#db
        .from("client_logins")
        .select("id, label, url, username, created_at")
        .eq("client_id", ctx.clientId)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }),
    ]);

    return {
      branding: ctx.branding,
      me,
      logins: rows(logins).map((row): SharedLogin => ({
        id: required(row, "id"),
        label: required(row, "label"),
        username: text(row, "username"),
        url: text(row, "url"),
        sharedAt: required(row, "created_at"),
        masked: MASK,
      })),
      // See the header: these tables have no record of an ask. The panel
      // renders as a plain share form rather than as an answer to one.
      requests: [],
    };
  }

  async shareLogin(ctx: PortalCallerContext, input: ShareLoginInput): Promise<void> {
    if (input.requestId) {
      throw new PortalError(
        409,
        "requests_not_available",
        "That request is no longer available. Share the login directly instead.",
      );
    }
    const label = (input.label ?? "").trim();
    if (!label) throw badRequest("label_required", "Give the login a name.");
    if (input.secret.length === 0) {
      throw badRequest("secret_required", "There is no password in the box.");
    }
    await this.#writeLogin(ctx, { label, url: input.url, username: input.username, secret: input.secret });
  }

  async updateLogin(ctx: PortalCallerContext, input: UpdateLoginInput): Promise<void> {
    const { data: existing } = await this.#db
      .from("client_logins")
      .select("id, label, url, username, client_project_id")
      .eq("id", input.id)
      .eq("client_id", ctx.clientId)
      .maybeSingle();
    if (!existing) throw notFound("That login");

    await this.#writeLogin(ctx, {
      id: input.id,
      label: (input.label ?? required(existing, "label")).trim(),
      url: input.url !== undefined ? input.url : text(existing, "url"),
      username: input.username !== undefined ? input.username : text(existing, "username"),
      // An omitted secret means "leave the password alone". The RPC takes an
      // empty string for that, which is why this is not simply `?? ""`:
      // sending the empty string on purpose and sending it by accident have
      // to look different in the caller.
      secret: input.secret ?? "",
      projectId: text(existing, "client_project_id"),
    });
  }

  async removeLogin(ctx: PortalCallerContext, id: string): Promise<void> {
    const { data: existing } = await this.#db
      .from("client_logins")
      .select("id")
      .eq("id", id)
      .eq("client_id", ctx.clientId)
      .maybeSingle();
    if (!existing) throw notFound("That login");
    const { error } = await this.#db.from("client_logins").delete().eq("id", id);
    if (error) {
      throw new PortalError(500, "remove_failed", "That login could not be removed.");
    }
  }

  /**
   * Write through `set_client_login`, never with a plain `insert`.
   *
   * The RPC is `SECURITY DEFINER` and granted to the service role alone, and
   * it is where `pgp_sym_encrypt` happens. A direct insert would need the
   * plaintext in a column, which is the one thing this table does not have.
   */
  async #writeLogin(
    ctx: PortalCallerContext,
    fields: {
      id?: string;
      label: string;
      url: string | null | undefined;
      username: string | null | undefined;
      secret: string;
      projectId?: string | null;
    },
  ): Promise<void> {
    if (!this.#encryptionKey) {
      throw new PortalError(
        503,
        "not_configured",
        "Saved logins are unavailable right now. Please try again later.",
      );
    }
    // Argument names, not positions: the function has picked up a tenth
    // parameter since it shipped, and a positional call would have silently
    // started passing the project id as the encryption key.
    //
    // An EMPTY `_password` means "leave the stored one alone" -- the
    // function does `COALESCE(v_enc, encrypted_password)` precisely so that
    // submitting an edit form that never showed the password cannot wipe it.
    const { error } = await this.#db.rpc("set_client_login", {
      _id: fields.id ?? null,
      _client_id: ctx.clientId,
      _label: fields.label,
      _url: fields.url ?? null,
      _username: fields.username ?? null,
      _password: fields.secret,
      _note: null,
      _created_by: null,
      _enc_key: this.#encryptionKey,
      _client_project_id: fields.projectId ?? null,
    });
    if (error) {
      // The message is deliberately generic: a database error on this path
      // can quote the statement, and the statement has a password bound into
      // it. The detail goes to the function log, not to the client.
      console.error("[client-portal] set_client_login failed", error.code ?? error.message);
      throw new PortalError(500, "save_failed", "That login could not be saved.");
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Pure shaping, exported so the tests can reach it without a database         */
/* -------------------------------------------------------------------------- */

/**
 * Has this journey node been finished, however that was recorded?
 *
 * `status` has been written by several things over two years, so a node is
 * done if it says so in any of the ways it has ever said so. The same rule as
 * `src/lib/journeyPhases.ts`, and for the same reason: trusting one spelling
 * shows a client "Now: Design" three weeks after design finished.
 */
export function isNodeDone(node: { status?: string | null; completed_at?: string | null }): boolean {
  if (node.completed_at) return true;
  const done = ["complete", "completed", "done", "client_submitted", "approved", "skipped"];
  return done.includes((node.status ?? "").trim().toLowerCase());
}

/** `project_invoices` rows as payment rows. */
export function invoiceRowsFromAdmin(invoices: Row[], now: Date): PaymentRow[] {
  return invoices.map((row): PaymentRow => {
    const state = paymentState({
      paidAt: text(row, "paid_at"),
      // `scheduled` is a plan; `sent` is a bill. Only the second is payable,
      // which is exactly the Ready/Later distinction mockup 15 draws.
      issued: BILLED.has(String(row.status)),
      dueOn: text(row, "due_date"),
      now,
    });
    return {
      id: required(row, "id"),
      label: required(row, "label"),
      dueOn: text(row, "due_date"),
      dueNote: null,
      amountCents: cents(row, "amount_cents"),
      currency: (text(row, "currency") ?? "usd").toUpperCase(),
      state,
      paidWith: row.paid_at ? providerLabel("surecart") : null,
      paidAt: text(row, "paid_at"),
      // These tables never recorded one: the SureCart receipt lives at the
      // provider and nothing here kept the address. The Receipt button is
      // therefore absent on this source and present on the plugin, which has
      // a column for it as of CP-5.
      receiptUrl: null,
      payable: (state === "ready" || state === "overdue") && Boolean(row.checkout_url),
    };
  });
}

/** The hero line. Named for what is being built, not for the project row. */
export function headlineFor(project: { type?: string; name?: string } | null): string | null {
  if (!project) return null;
  if (project.type === "site_preview") return "Your new site is being built";
  if (project.type === "automation_build") return "Your automation is being built";
  return project.name ? `${project.name} is under way` : null;
}

/** "Latest from the team": the three most recent things that actually happened. */
export function recentUpdates(
  proposals: Row[],
  invoices: Row[],
  nodes: Row[],
): TeamUpdate[] {
  const all: TeamUpdate[] = [];
  for (const proposal of proposals) {
    const signedAt = text(proposal, "client_signed_at");
    const sentAt = text(proposal, "sent_at");
    if (signedAt) {
      all.push({
        id: `signed:${required(proposal, "id")}`,
        title: `${required(proposal, "title")} is signed`,
        occurredAt: signedAt,
        tone: "positive",
      });
    } else if (sentAt) {
      all.push({
        id: `sent:${required(proposal, "id")}`,
        title: `${required(proposal, "title")} is ready for you`,
        occurredAt: sentAt,
        tone: "accent",
      });
    }
  }
  for (const invoice of invoices) {
    const paidAt = text(invoice, "paid_at");
    if (!paidAt) continue;
    all.push({
      id: `paid:${required(invoice, "id")}`,
      title: `${required(invoice, "label")} received, thank you`,
      occurredAt: paidAt,
      tone: "positive",
    });
  }
  for (const node of nodes) {
    const completedAt = text(node, "completed_at");
    if (!completedAt) continue;
    all.push({
      id: `node:${required(node, "key")}`,
      title: `${required(node, "label")} is done`,
      occurredAt: completedAt,
      tone: "positive",
    });
  }
  return all
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 3);
}

/**
 * Line items from `payment_terms`, when that is what it holds.
 *
 * Free-form jsonb written by several generations of the proposal builder, so
 * this takes what it recognises and returns nothing rather than guessing. An
 * investment table with invented rows would be a price list the client could
 * hold us to.
 */
export function lineItemsFrom(terms: unknown): AgreementLineItem[] {
  const items = (terms as { line_items?: unknown } | null)?.line_items;
  if (!Array.isArray(items)) return [];
  return items
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      description: String(item.description ?? item.label ?? ""),
      amountCents: Number(item.amount_cents ?? item.amountCents ?? 0),
    }))
    .filter((item) => item.description.length > 0);
}

/** `client_proposals.status`, as the client screen's vocabulary. */
export function adminStatus(row: Row): AgreementView["status"] {
  if (row.client_signed_at || row.status === "signed") return "signed";
  if (row.declined_at || row.status === "declined") return "declined";
  if (row.status === "voided" || row.status === "superseded") return "void";
  return "sent";
}
