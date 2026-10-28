// The client portal, served from the Client Portal plugin.
//
// This is the implementation the card is for: every read and write goes to
// the plugin's v1 API, from this server, with a credential that never leaves
// it. `legacy-source.ts` is the bridge until CP-6 has imported the data; this
// is the destination.
//
// THE CLIENT SCOPE IS SENT ON EVERY CALL
//
// `x-client-portal-client-scope` tells the plugin which client the request is
// on behalf of, and the plugin then answers `404` for any id belonging to
// anyone else. That is the second of two checks, not the only one -- the
// first is that `index.ts` resolved the caller's Supabase session to this
// client id before any of this ran. Two independent checks because the
// consequence of a single bug is one client reading another's contracts.
//
// WHAT THIS FILE TRANSLATES, AND WHY THE TRANSLATION IS HERE
//
// The plugin speaks a general-purpose API: proposals, invoices, schedules and
// credentials, each a faithful view of a row. The screens want four view
// models with the joins already done. Doing that here rather than in the
// browser is not a style choice -- it is the reason a client's browser never
// needs a credential that can read every client.

import {
  initialsFor,
  instalmentSummary,
  ladder,
  paymentState,
  paymentTotals,
  stepPosition,
  type AgreementLineItem,
  type AgreementView,
  type AgreementsView,
  type HomeView,
  type LoginRequest,
  type LoginsView,
  type PaymentRow,
  type PaymentsView,
  type PortalMilestone,
  type SharedLogin,
  type SignRequest,
  type SignResult,
  type TeamUpdate,
  type WaitingItem,
} from "../_shared/client-portal-wire.ts";
import { PluginApiError, type PluginClient } from "../_shared/client-portal-plugin.ts";
import {
  footnoteFor,
  invoiceRows,
  markFirstPrimary,
  formatMoney,
  providerLabel,
  widenStatus,
  type ShapeInvoice,
  type ShapeScheduleItem,
} from "../_shared/client-portal-shape.ts";
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

/* -------------------------------------------------------------------------- */
/* The slices of the plugin API this file reads                                */
/* -------------------------------------------------------------------------- */
//
// Declared locally rather than imported from the plugin package, which is in
// a different repository on a different release cadence. The `v1` promise is
// that a field is never removed, renamed or retyped and that enums may gain
// members -- so a local declaration of the subset this screen needs stays
// correct, and every `status` below is widened to `string` for exactly that
// reason. Narrowing them to the members known today would turn the plugin
// adding one into a runtime failure here.

interface PluginClientRow {
  id: string;
  name: string;
  status: string;
}

interface PluginContact {
  name: string;
  isPrimary: boolean;
}

interface PluginMilestone {
  key: string;
  clientLabel: string;
  state: string;
  note?: string | null;
}

interface PluginClientProject {
  id: string;
  paperclipProjectId: string;
  portalVisibility: {
    milestones?: PluginMilestone[];
    /** Short labels, e.g. "Photos". A list of strings, not of objects. */
    waitingOnClient?: string[];
    headline?: string | null;
    targetDate?: string | null;
    updates?: Array<{ id?: string; title?: string; occurredAt?: string; tone?: string }>;
  } | null;
}

interface PluginProposal {
  id: string;
  number: string;
  title: string;
  blocks: unknown;
  source: string;
  pdfAssetRef: string | null;
  totalCents: number;
  currency: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface PluginSignature {
  signerSide: string;
  signerName: string;
  signedAt: string | null;
}

type PluginScheduleItem = ShapeScheduleItem;

/** Declared in `_shared/client-portal-shape.ts`, which does the shaping. */
type PluginInvoice = ShapeInvoice;

interface PluginCredential {
  id: string;
  label: string;
  url: string | null;
  username: string | null;
  secret: string;
  createdAt: string;
}

interface PluginCredentialRequest {
  id: string;
  label: string;
  note: string | null;
  urlHint: string | null;
  usernameHint: string | null;
  requestedByKind: string;
  requestedAt: string;
}

interface PluginSigning {
  styles: Array<{ key: string; name: string; fontStack: string }>;
  defaultStyle: string | null;
  consentText: string;
  providers: Array<{ kind: string; adapterKey: string; displayName?: string; enabled: boolean }>;
}

/* -------------------------------------------------------------------------- */

export class PluginSource implements PortalSource {
  readonly kind = "plugin" as const;
  readonly #api: PluginClient;

  constructor(api: PluginClient) {
    this.#api = api;
  }

  /** Every call carries the scope. There is no overload that omits it. */
  #get<T>(ctx: PortalCallerContext, path: string, query?: Record<string, string>): Promise<T> {
    return this.#api.call<T>(path, { clientScope: ctx.clientId, query });
  }

  #post<T>(ctx: PortalCallerContext, path: string, body: Record<string, unknown>): Promise<T> {
    return this.#api.call<T>(path, { method: "POST", clientScope: ctx.clientId, body });
  }

  async #me(ctx: PortalCallerContext) {
    const { client, contacts } = await this.#get<{
      client: PluginClientRow;
      contacts: PluginContact[];
    }>(ctx, `/clients/${encodeURIComponent(ctx.clientId)}`);
    // The person, if we know one, for "Good afternoon, Maya". The business
    // name is the fallback rather than the other way round: a greeting
    // addressed to a company reads like an invoice.
    const primary = contacts.find((contact) => contact.isPrimary) ?? contacts[0];
    const displayName = primary?.name ?? client.name;
    return {
      clientId: client.id,
      displayName,
      businessName: client.name === displayName ? null : client.name,
      initials: initialsFor(displayName),
    };
  }

  async home(ctx: PortalCallerContext): Promise<HomeView> {
    const [me, projects, proposals, invoices] = await Promise.all([
      this.#me(ctx),
      this.#get<{ clientProjects: PluginClientProject[] }>(ctx, "/client-projects", {
        clientId: ctx.clientId,
      }),
      this.#get<{ proposals: PluginProposal[] }>(ctx, "/proposals", { clientId: ctx.clientId }),
      this.#get<{ invoices: PluginInvoice[] }>(ctx, "/invoices", { clientId: ctx.clientId }),
    ]);

    // The first linked project is the one the home screen is about. A client
    // with several still gets one progress bar, because the alternative is a
    // home screen that asks them which of their projects they meant.
    const project = projects.clientProjects[0] ?? null;
    const visibility = project?.portalVisibility ?? null;

    const milestones: PortalMilestone[] = ladder(
      (visibility?.milestones ?? []).map((milestone) => ({
        key: milestone.key,
        // The client-facing label, verbatim. These are a licensee's words.
        label: milestone.clientLabel,
        done: milestone.state === "done",
      })),
    );
    const position = stepPosition(milestones);

    const waitingOnYou: WaitingItem[] = [];
    for (const proposal of proposals.proposals) {
      if (proposal.status !== "sent" && proposal.status !== "viewed") continue;
      waitingOnYou.push({
        id: `proposal:${proposal.id}`,
        title: `Sign ${proposal.title}`,
        icon: "✎",
        action: "Review and sign",
        href: `/portal/${ctx.clientId}/agreements?id=${encodeURIComponent(proposal.id)}`,
        primary: true,
      });
    }
    // `waitingOnClient` is a list of short labels -- "Photos", "Copy for the
    // About page". There is no link to send the client to, because the thing
    // being waited on happens off the portal, so the row is drawn with no
    // button rather than with one that goes nowhere.
    for (const label of visibility?.waitingOnClient ?? []) {
      if (!label) continue;
      waitingOnYou.push({
        id: `task:${label}`,
        title: label,
        icon: null,
        action: "Open",
        href: null,
        primary: false,
      });
    }

    // Only the billed invoices here: the home card names the next payment
    // the client can actually make, and an unbilled instalment is not one.
    const rows = invoiceRows(invoices.invoices, [], ctx.now);
    const nextPayable = rows.find((row) => row.payable) ?? null;
    const provider = nextPayable
      ? providerLabel(
          invoices.invoices.find((invoice) => invoice.id === nextPayable.id)?.provider ?? null,
        )
      : null;

    return {
      branding: ctx.branding,
      me,
      headline: visibility?.headline ?? null,
      stepNumber: position?.stepNumber ?? null,
      stepCount: position?.stepCount ?? null,
      targetDate: visibility?.targetDate ?? null,
      milestones,
      waitingOnYou: markFirstPrimary(waitingOnYou),
      nextPayment: nextPayable
        ? {
            invoiceId: nextPayable.id,
            amountCents: nextPayable.amountCents,
            currency: nextPayable.currency,
            label: nextPayable.label,
            dueOn: nextPayable.dueOn,
            providerName: provider,
          }
        : null,
      updates: (visibility?.updates ?? [])
        .filter((update): update is { id?: string; title: string; occurredAt?: string; tone?: string } =>
          typeof update.title === "string" && update.title.length > 0,
        )
        .map((update, index): TeamUpdate => ({
          id: update.id ?? `update:${index}`,
          title: update.title,
          occurredAt: update.occurredAt ?? ctx.now.toISOString(),
          tone: update.tone === "accent" ? "accent" : "positive",
        })),
    };
  }

  async agreements(ctx: PortalCallerContext): Promise<AgreementsView> {
    const [me, list, signing] = await Promise.all([
      this.#me(ctx),
      this.#get<{ proposals: PluginProposal[] }>(ctx, "/proposals", { clientId: ctx.clientId }),
      this.#get<PluginSigning>(ctx, "/signing"),
    ]);

    // A draft is not a document the client has been given, so it is not one
    // they can be shown. The plugin refuses to sign one; this makes it
    // invisible rather than visible and unsignable.
    const visible = list.proposals.filter((proposal) => proposal.status !== "draft");

    const agreements = await Promise.all(
      visible.map((proposal) => this.#agreement(ctx, proposal, me.businessName ?? me.displayName)),
    );

    const hosted = signing.providers.some(
      (provider) => provider.kind === "esign" && provider.enabled && provider.adapterKey !== "builtin",
    );
    const firstOpen = agreements.find(
      (agreement) => agreement.status === "sent" || agreement.status === "viewed",
    );
    const deposit = firstOpen ? await this.#firstInstalment(ctx, firstOpen.id) : null;

    return {
      branding: ctx.branding,
      me,
      agreements,
      signing: {
        consentText: signing.consentText,
        styles: signing.styles,
        defaultStyle: signing.defaultStyle,
        hosted,
        depositProviderName: providerLabel(
          signing.providers.find((provider) => provider.kind === "payments" && provider.enabled)
            ?.adapterKey ?? null,
        ),
        depositCents: deposit?.amountCents ?? null,
      },
    };
  }

  async #agreement(
    ctx: PortalCallerContext,
    proposal: PluginProposal,
    preparedFor: string,
  ): Promise<AgreementView> {
    const detail = await this.#get<{
      proposal: PluginProposal;
      signatures: PluginSignature[];
      schedule: PluginScheduleItem[];
    }>(ctx, `/proposals/${encodeURIComponent(proposal.id)}`);

    const blocks = Array.isArray(detail.proposal.blocks)
      ? (detail.proposal.blocks as Array<Record<string, unknown>>)
      : [];
    const scope = blocks.find((block) => block.kind === "scope" || block.kind === "intro");
    const pricing = blocks.find((block) => block.kind === "pricing");
    const lineItems: AgreementLineItem[] = Array.isArray(pricing?.lineItems)
      ? (pricing!.lineItems as Array<Record<string, unknown>>).map((item) => ({
          description: String(item.description ?? ""),
          amountCents: Number(item.amountCents ?? 0),
        }))
      : [];

    const clientSignature = detail.signatures.find(
      (signature) => signature.signerSide === "client" && signature.signedAt,
    );

    return {
      id: detail.proposal.id,
      number: detail.proposal.number,
      title: detail.proposal.title,
      preparedFor,
      preparedBy: ctx.branding.agencyName,
      sentAt: sentAtOf(detail.proposal),
      status: widenStatus(detail.proposal.status),
      scopeHeading: scope ? String(scope.title ?? "What we’ll build") : null,
      scopeBody: scope ? String(scope.body ?? "") || null : null,
      lineItems,
      totalCents: detail.proposal.totalCents,
      currency: detail.proposal.currency,
      instalmentSummary: instalmentSummary(
        detail.schedule.map((item) => ({ label: item.label, amountCents: item.amountCents })),
        (cents) => formatMoney(cents, detail.proposal.currency),
      ),
      // Always false on this backend, even when a source PDF exists: see
      // `document()` for why the plugin cannot serve it. Drawing a link that
      // leads to a 501 is worse than drawing none.
      hasSourcePdf: false,
      hasSignedDocument: Boolean(clientSignature),
      signedAt: clientSignature?.signedAt ?? null,
      signerName: clientSignature?.signerName ?? null,
    };
  }

  async #firstInstalment(
    ctx: PortalCallerContext,
    proposalId: string,
  ): Promise<{ amountCents: number } | null> {
    try {
      const { schedule } = await this.#get<{ schedule: PluginScheduleItem[] }>(
        ctx,
        `/proposals/${encodeURIComponent(proposalId)}/payment-schedule`,
      );
      const first = [...schedule].sort((a, b) => a.sequence - b.sequence)[0];
      return first ? { amountCents: first.amountCents } : null;
    } catch (caught) {
      // An unsent proposal has no schedule yet, and that is not an error on
      // a screen whose job is to show the proposal. The deposit line is
      // simply omitted.
      if (caught instanceof PluginApiError && caught.status === 404) return null;
      throw caught;
    }
  }

  async sign(ctx: PortalCallerContext, input: SignRequest): Promise<SignResult> {
    if (!input.consentGranted) {
      throw badRequest("consent_required", "Tick the box to sign.");
    }
    const name = input.signerName.trim();
    if (name.length === 0) {
      throw badRequest("signer_name_required", "Type your full name to sign.");
    }

    const result = await this.#post<{
      signature: { signedAt: string };
      invoices?: Array<{ id: string; status: string }>;
    }>(ctx, `/proposals/${encodeURIComponent(input.proposalId)}/sign`, {
      signerName: name,
      signatureKind: input.signatureStyle ? "adopted" : "typed",
      ...(input.signatureStyle ? { signatureStyle: input.signatureStyle } : {}),
      signerSide: "client",
      consentGranted: true,
    });

    // Signing materialises the schedule and bills the first instalment, so
    // the deposit to pay is the one invoice that came back payable. Asking
    // the plugin again would race the write that just happened.
    const deposit = (result.invoices ?? []).find((invoice) => invoice.status !== "paid") ?? null;
    return {
      signedAt: result.signature.signedAt,
      nextHref: deposit ? `/portal/${ctx.clientId}/payments` : null,
      depositInvoiceId: deposit?.id ?? null,
    };
  }

  async decline(
    ctx: PortalCallerContext,
    proposalId: string,
    reason: string | null,
  ): Promise<void> {
    await this.#post(ctx, `/proposals/${encodeURIComponent(proposalId)}/events`, {
      kind: "declined",
      ...(reason ? { detail: { reason } } : {}),
    });
  }

  /**
   * Mockup 15, which draws the whole schedule and not only the bills.
   *
   * The invoices come from one route; the instalments nobody has billed yet
   * come from the payment schedule of each signed proposal, which is a route
   * per proposal. That is a fan-out, and it is the reason this is on the
   * server: a client on a train doing it from a phone would make five
   * sequential round trips to render one table.
   */
  async payments(ctx: PortalCallerContext): Promise<PaymentsView> {
    const [me, invoices, proposals] = await Promise.all([
      this.#me(ctx),
      this.#get<{ invoices: PluginInvoice[] }>(ctx, "/invoices", { clientId: ctx.clientId }),
      this.#get<{ proposals: PluginProposal[] }>(ctx, "/proposals", { clientId: ctx.clientId }),
    ]);

    const schedule = await this.#scheduleFor(ctx, proposals.proposals);
    const rows = invoiceRows(invoices.invoices, schedule, ctx.now);
    const totals = paymentTotals(rows);
    const providers = invoices.invoices
      .map((invoice) => providerLabel(invoice.provider))
      .filter((name): name is string => Boolean(name));

    return {
      branding: ctx.branding,
      me,
      totalCents: totals.totalCents,
      paidCents: totals.paidCents,
      currency: rows[0]?.currency ?? "USD",
      next: totals.next,
      rows,
      footnote: footnoteFor(providers),
    };
  }

  /**
   * Every instalment on every signed proposal.
   *
   * Only signed ones: an unsent proposal has no schedule, and a sent one that
   * has not been signed has terms the client has not agreed to. Showing those
   * on a payments page would read as money owed.
   */
  async #scheduleFor(
    ctx: PortalCallerContext,
    proposals: PluginProposal[],
  ): Promise<PluginScheduleItem[]> {
    const signed = proposals.filter((proposal) => proposal.status === "signed");
    const lists = await Promise.all(
      signed.map(async (proposal) => {
        try {
          const { schedule } = await this.#get<{ schedule: PluginScheduleItem[] }>(
            ctx,
            `/proposals/${encodeURIComponent(proposal.id)}/payment-schedule`,
          );
          return schedule;
        } catch (caught) {
          // A signed proposal with no schedule is possible -- a contract
          // whose terms were settled outside the builder. The page is still
          // worth rendering from the invoices alone.
          if (caught instanceof PluginApiError && caught.status === 404) return [];
          throw caught;
        }
      }),
    );
    return lists.flat();
  }

  async checkout(
    ctx: PortalCallerContext,
    invoiceId: string,
  ): Promise<{ checkoutUrl: string }> {
    const { invoice } = await this.#post<{ invoice: PluginInvoice }>(
      ctx,
      `/invoices/${encodeURIComponent(invoiceId)}/checkout`,
      {},
    );
    if (!invoice.checkoutUrl) {
      // The plugin answers `provider_has_no_checkout` for a manual provider.
      // Reaching here without one means it succeeded and returned nothing,
      // which is worth saying plainly rather than redirecting to "null".
      throw new PortalError(
        502,
        "no_checkout_url",
        "That payment could not be started. Please get in touch and we will send a link.",
      );
    }
    return { checkoutUrl: invoice.checkoutUrl };
  }

  /**
   * The sealed contract, from the plugin's own download route.
   *
   * The seal is re-checked on the way out by the plugin, so bytes that no
   * longer hash to what was recorded are refused rather than served. Nothing
   * is re-checked here: a second opinion on a hash this side never computed
   * would be theatre.
   *
   * `source` is not available on this backend. An uploaded proposal's PDF is
   * in the host object store, which a plugin can only reach with the
   * `plugin.assets.read` capability -- a name that does not exist on a stock
   * Paperclip, so a manifest declaring it is refused at install. The plugin
   * therefore has no route to serve it, `hasSourcePdf` is reported `false`
   * so no link is drawn, and this refusal is the backstop.
   */
  async document(
    ctx: PortalCallerContext,
    kind: "signed" | "source",
    proposalId: string,
  ): Promise<PortalDocument> {
    if (kind === "source") {
      throw new PortalError(
        501,
        "source_document_unavailable",
        "The original proposal cannot be downloaded here yet. Ask us and we will email it.",
      );
    }
    const result = await this.#get<{
      filename: string;
      contentType: string;
      contentBase64: string;
    }>(ctx, `/proposals/${encodeURIComponent(proposalId)}/signed-document`);
    return {
      form: "bytes",
      filename: result.filename,
      contentType: result.contentType,
      contentBase64: result.contentBase64,
    };
  }

  async logins(ctx: PortalCallerContext): Promise<LoginsView> {
    const [me, credentials, requests] = await Promise.all([
      this.#me(ctx),
      this.#get<{ credentials: PluginCredential[] }>(ctx, "/credentials", {
        clientId: ctx.clientId,
      }),
      this.#get<{ requests: PluginCredentialRequest[] }>(ctx, "/credential-requests"),
    ]);

    return {
      branding: ctx.branding,
      me,
      logins: credentials.credentials.map((credential): SharedLogin => ({
        id: credential.id,
        label: credential.label,
        username: credential.username,
        url: credential.url,
        sharedAt: credential.createdAt,
        // Whatever the plugin considers the mask, rather than a local
        // constant: two spellings of "hidden" on one screen reads as a bug.
        masked: credential.secret,
      })),
      requests: requests.requests.map((request): LoginRequest => ({
        id: request.id,
        label: request.label,
        note: request.note,
        requestedAt: request.requestedAt,
        urlHint: request.urlHint,
        usernameHint: request.usernameHint,
        askedByAgent: request.requestedByKind === "agent",
      })),
    };
  }

  async shareLogin(ctx: PortalCallerContext, input: ShareLoginInput): Promise<void> {
    if (input.secret.length === 0) {
      throw badRequest("secret_required", "There is no password in the box.");
    }
    if (input.requestId) {
      await this.#post(
        ctx,
        `/credential-requests/${encodeURIComponent(input.requestId)}/fulfil`,
        {
          secret: input.secret,
          ...(input.label ? { label: input.label } : {}),
          ...(input.url ? { url: input.url } : {}),
          ...(input.username ? { username: input.username } : {}),
        },
      );
      return;
    }
    if (!input.label) {
      throw badRequest("label_required", "Give the login a name.");
    }
    await this.#post(ctx, "/credentials", {
      clientId: ctx.clientId,
      label: input.label,
      secret: input.secret,
      ...(input.url ? { url: input.url } : {}),
      ...(input.username ? { username: input.username } : {}),
    });
  }

  async updateLogin(ctx: PortalCallerContext, input: UpdateLoginInput): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (input.label !== undefined) patch.label = input.label;
    if (input.url !== undefined) patch.url = input.url;
    if (input.username !== undefined) patch.username = input.username;
    if (input.secret !== undefined) patch.secret = input.secret;
    if (Object.keys(patch).length === 0) {
      throw badRequest("nothing_to_update", "Nothing was changed.");
    }
    await this.#api.call(`/credentials/${encodeURIComponent(input.id)}`, {
      method: "PATCH",
      clientScope: ctx.clientId,
      body: patch,
    });
  }

  async removeLogin(ctx: PortalCallerContext, id: string): Promise<void> {
    await this.#api.call(`/credentials/${encodeURIComponent(id)}`, {
      method: "DELETE",
      clientScope: ctx.clientId,
    });
  }
}

/** When the client was given this document. */
function sentAtOf(proposal: PluginProposal): string | null {
  return proposal.status === "draft" ? null : proposal.updatedAt ?? proposal.createdAt;
}
