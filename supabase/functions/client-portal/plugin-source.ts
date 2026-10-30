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
  payWaitingItem,
  stepPosition,
  type AccountAccessItem,
  type AccountAccessView,
  type AgreementLineItem,
  type AgreementView,
  type AgreementsView,
  type HomeView,
  type LoginRequest,
  type LoginsView,
  type PaymentRow,
  type PaymentsView,
  type PortalAudit,
  type PortalBranding,
  type PortalMilestone,
  type PortalOnboardingInvite,
  type PortalSubscription,
  type SharedDriveLink,
  type SharedLogin,
  type SignRequest,
  type SignResult,
  type SubscriptionActionResult,
  type TeamUpdate,
  type WaitingItem,
} from "../_shared/client-portal-wire.ts";
import { PluginApiError, type PluginClient } from "../_shared/client-portal-plugin.ts";
import {
  footnoteFor,
  invoiceRows,
  markFirstPrimary,
  formatMoney,
  pluginProjectNames,
  pluginProjects,
  providerLabel,
  sortLogins,
  widenStatus,
  type ShapeInvoice,
  type ShapeScheduleItem,
} from "../_shared/client-portal-shape.ts";
import {
  badRequest,
  notFound,
  PortalError,
  type LoginRevealActor,
  type PortalCallerContext,
  type PortalDocument,
  type PortalSource,
  type SaveAccountAccessInput,
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
  /** The project header's three additions (CRE-822) -- see `docs/API.md`. */
  buildStartDate?: string | null;
  deliveryDate?: string | null;
  deliveryVideoUrl?: string | null;
}

/** Where the client keeps their files now (CRE-827), one row per link. */
interface PluginSharedDriveLink {
  id: string;
  clientProjectId: string;
  url: string;
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
  /**
   * The `/admin` project this one was imported from, when it was.
   *
   * Written by CP-6's import and null for anything created in the plugin. It
   * is the only id on this row that `/portal/:clientId/projects/:projectId`
   * can resolve, which is why it decides whether a project row gets a link.
   */
  legacyAdminProjectId?: string | null;
  /**
   * What sort of work this is, as the licensee's own key (CRE-822). Lives on
   * the link row -- a Paperclip project has a name and a status and no kind
   * -- and is mapped to a client-facing word by `projectKindLabel`, never
   * shown raw.
   */
  kind?: string | null;
  /**
   * The linked Paperclip project, which is where its name lives.
   *
   * OPTIONAL, AND ABSENT MEANS AN OLDER PLUGIN. The link row carries a
   * project id and no name -- Paperclip projects are the source of truth, so
   * the plugin resolves the name through the host rather than keeping a copy
   * that could go stale. That resolution is new (see the agent-platform PR on
   * CRE-776), and this contract's rule for a field a server has not got yet
   * is to draw what an unset value draws: a project with no resolvable name
   * is left out of the list rather than listed as "Untitled".
   */
  project?: { name?: string | null; status?: string | null } | null;
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
  /** The proposal family and the stated terms (CRE-822) -- see `docs/API.md`. */
  versionGroupId?: string | null;
  paymentDueDays?: number | null;
  paymentTerms?: string | null;
}

/** Derived from the event trail, not stored -- see `docs/API.md` (CRE-822). */
interface PluginProposalTimeline {
  sentAt: string | null;
  firstViewedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
}

/**
 * The PDF an uploaded proposal arrived as, as the plugin reports it.
 *
 * OPTIONAL, AND ABSENT MEANS AN OLDER PLUGIN, the same rule `project` carries
 * above: before CRE-801 the plugin had no such table and the proposal detail
 * route returned no such field, so absent must draw what "no document" draws
 * rather than an error or a dead link. `Boolean(detail.sourceDocument)` gets
 * that right for both an older server and a proposal with nothing attached.
 *
 * Never the bytes. Those come only from the download route, which has
 * authorised the caller for them specifically.
 */
interface PluginSourceDocument {
  id: string;
  pdfSha256: string;
  byteSize: number;
  contentType: string;
  uploadedAt: string;
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
  /** Unsealed, like `username` since `001` (CRE-822) -- see `docs/API.md`. */
  note?: string | null;
  sortOrder?: number | null;
  /** Absent on a plugin that does not file a credential against a project. */
  projectId?: string | null;
  projectName?: string | null;
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

/**
 * CRE-822, G2. `sourceStatus` is on the real row -- the word the previous
 * system used, kept for an audit trail -- and deliberately not read here:
 * a caller that could would start branching on it, which is the drift that
 * put a six-way status set in a browser in the first place.
 */
interface PluginPhase {
  key: string;
  label: string;
  status: string;
  position: "done" | "now" | "next" | "later";
  finished: boolean;
}

/**
 * CRE-822, G8. Never carries `passwordProtected`'s underlying secret -- the
 * plugin's own serialiser already withholds that, this just doesn't ask for
 * anything it would have to throw away.
 */
interface PluginSiteAudit {
  id: string;
  slug: string;
  kind: string | null;
  subjectName: string;
  coverNote: string | null;
  reportUrl: string | null;
  reviewedAt: string | null;
  sharedAt: string | null;
  createdAt: string;
  versionCount: number;
  latestVersion: number | null;
}

/** CRE-822, G4. Already shaped like `AccountAccessView` minus `items`. */
interface PluginAccountAccess {
  checks: Record<string, boolean>;
  fields: Record<string, string>;
  notes: { present: boolean; credentialId: string | null };
  submittedAt: string | null;
  complete: boolean;
  updatedAt: string | null;
}

/** Already shaped like `AccountAccessItem`. */
type PluginAccountAccessItem = AccountAccessItem;

/**
 * CRE-822, G14. `usingDefaults` is omitted -- it tells a settings screen
 * whether a licensee has configured anything yet, and no portal screen
 * draws differently because of it; `/branding` has already filled in the
 * name and the derived monogram either way.
 */
interface PluginBranding {
  agencyName: string;
  monogram: string | null;
  contactName: string | null;
  contactEmail: string | null;
  replyWindow: string | null;
}

/**
 * CRE-822, G5. No provider reference on the wire -- see `docs/API.md`, "The
 * recurring plan" -- so there is nothing here a front end could use to call
 * the vendor directly even if it wanted to.
 */
interface PluginSubscription {
  id: string;
  clientId: string;
  provider: string;
  planLabel: string | null;
  status: string | null;
  amountCents: number | null;
  currency: string | null;
  interval: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  currentPeriodEnd: string | null;
  renewsOn: string | null;
  endsOn: string | null;
}

interface PluginSubscriptionActionResult {
  subscription: PluginSubscription;
  requested: boolean;
  message: string;
}

/** CRE-822, G6. Never carries a token -- `inviteToWire` on the plugin side
 * only ever answers the tokenless shape to this route. */
interface PluginOnboardingInvite {
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

  #patch<T>(ctx: PortalCallerContext, path: string, body: Record<string, unknown>): Promise<T> {
    return this.#api.call<T>(path, { method: "PATCH", clientScope: ctx.clientId, body });
  }

  /**
   * CRE-822, G14. `/branding` rather than `/settings/branding`: the settings
   * route shows what a licensee has configured, with nulls meaning "not
   * set", and a screen reading it on a fresh install would draw an empty
   * header. This one fills in the company name and derives the monogram.
   */
  async branding(clientId: string): Promise<PortalBranding> {
    const data = await this.#api.call<{ branding: PluginBranding }>("/branding", {
      clientScope: clientId,
    });
    return {
      agencyName: data.branding.agencyName,
      monogram: data.branding.monogram,
      contactName: data.branding.contactName,
      replyWindow: data.branding.replyWindow,
      contactEmail: data.branding.contactEmail,
    };
  }

  /** The person, if we know one, for "Good afternoon, Maya". The business
   * name is the fallback rather than the other way round: a greeting
   * addressed to a company reads like an invoice. */
  #meFrom(client: PluginClientRow, contacts: PluginContact[]) {
    const primary = contacts.find((contact) => contact.isPrimary) ?? contacts[0];
    const displayName = primary?.name ?? client.name;
    return {
      clientId: client.id,
      displayName,
      businessName: client.name === displayName ? null : client.name,
      initials: initialsFor(displayName),
    };
  }

  async #me(ctx: PortalCallerContext) {
    const { client, contacts } = await this.#clientRow(ctx);
    return this.#meFrom(client, contacts);
  }

  #clientRow(ctx: PortalCallerContext) {
    return this.#get<{
      client: PluginClientRow;
      contacts: PluginContact[];
    }>(ctx, `/clients/${encodeURIComponent(ctx.clientId)}`);
  }

  async home(ctx: PortalCallerContext): Promise<HomeView> {
    const [{ client, contacts }, projects, proposals, invoices, sharedDriveLinks] = await Promise.all([
      this.#clientRow(ctx),
      this.#get<{ clientProjects: PluginClientProject[] }>(ctx, "/client-projects", {
        clientId: ctx.clientId,
      }),
      this.#get<{ proposals: PluginProposal[] }>(ctx, "/proposals", { clientId: ctx.clientId }),
      this.#get<{ invoices: PluginInvoice[] }>(ctx, "/invoices", { clientId: ctx.clientId }),
      this.#get<{ sharedDriveLinks: PluginSharedDriveLink[] }>(ctx, "/shared-drive-links"),
    ]);
    const me = this.#meFrom(client, contacts);

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
        icon: "sign",
        action: "Review and sign",
        href: `/portal/${ctx.clientId}/agreements?id=${encodeURIComponent(proposal.id)}`,
        primary: true,
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

    // Before the labels below, not after: the two rows a client can act on
    // belong at the top of a list of things waiting on them.
    const payRow = payWaitingItem(nextPayable, ctx.clientId, formatMoney);
    if (payRow) waitingOnYou.push(payRow);

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

    return {
      branding: ctx.branding,
      me,
      projects: pluginProjects(projects.clientProjects, ctx.clientId),
      buildStartDate: client.buildStartDate ?? null,
      deliveryDate: client.deliveryDate ?? null,
      deliveryVideoUrl: client.deliveryVideoUrl ?? null,
      sharedDriveLinks: sharedDriveLinks.sharedDriveLinks.map((link) => ({
        id: link.id,
        clientProjectId: link.clientProjectId,
        url: link.url,
      })),
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
      sourceDocument?: PluginSourceDocument | null;
      /** CRE-822, optional for the same reason `sourceDocument` is. */
      timeline?: PluginProposalTimeline | null;
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
      // The real `timeline` wins the moment the plugin sends one; the local
      // derivation stays as what an older server, with no such route field,
      // falls back to.
      sentAt: detail.timeline?.sentAt ?? sentAtOf(detail.proposal),
      firstViewedAt: detail.timeline?.firstViewedAt ?? null,
      declinedAt: detail.timeline?.declinedAt ?? null,
      declineReason: detail.timeline?.declineReason ?? null,
      versionGroupId: detail.proposal.versionGroupId ?? null,
      paymentDueDays: detail.proposal.paymentDueDays ?? null,
      paymentTerms: detail.proposal.paymentTerms ?? null,
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
      // True exactly when the plugin holds the document, which since CRE-801
      // it can. Not `source === "pdf_upload"`: an imported proposal is marked
      // an upload and may have no bytes yet, and a link drawn from the label
      // rather than from the document would 404 in a client's hands.
      hasSourcePdf: Boolean(detail.sourceDocument),
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
   * The invoices come from one route and the instalments nobody has billed
   * yet from another, and the projects are read so each row can say which one
   * it is for -- the project column, the grouping and the project filter Bree
   * asked for on 29 October (CRE-831) are all that one lookup.
   *
   * THE SCHEDULE USED TO BE A FAN-OUT, one call per signed proposal, and two
   * things were wrong with it. It asked for the response under the wrong key
   * -- the plugin answers `paymentSchedule` and this read `schedule`, so
   * every instalment was dropped -- and even correct it could only ever
   * return the instalments that hang off a *document*. Every plan imported
   * from `/admin` belongs to a project and has no proposal, so the whole
   * agreed schedule was invisible and a client on a three-payment contract
   * saw the two that had been invoiced. `GET /payment-schedule?clientId=`
   * answers both kinds in one read.
   */
  async payments(ctx: PortalCallerContext): Promise<PaymentsView> {
    const [me, invoices, projects, schedule] = await Promise.all([
      this.#me(ctx),
      this.#get<{ invoices: PluginInvoice[] }>(ctx, "/invoices", { clientId: ctx.clientId }),
      this.#get<{ clientProjects: PluginClientProject[] }>(ctx, "/client-projects", {
        clientId: ctx.clientId,
      }),
      this.#scheduleFor(ctx),
    ]);

    const rows = invoiceRows(
      invoices.invoices,
      schedule,
      ctx.now,
      pluginProjectNames(projects.clientProjects),
    );
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
   * Every instalment of every plan this client has.
   *
   * One call, and it returns the plans that belong to a project as well as
   * the ones that are a term of a signed document -- which the per-proposal
   * route cannot, because such a plan has no proposal to be asked under.
   *
   * A 404 is an older plugin: the route is an addition, and a licensee
   * running a build from before it is entitled to a Payments tab that draws
   * the bills rather than an error. The fallback is the per-signed-proposal
   * fan-out this used to be, which is the most that server can answer.
   */
  async #scheduleFor(ctx: PortalCallerContext): Promise<PluginScheduleItem[]> {
    try {
      const { paymentSchedule } = await this.#get<{ paymentSchedule: PluginScheduleItem[] }>(
        ctx,
        "/payment-schedule",
        { clientId: ctx.clientId },
      );
      return paymentSchedule ?? [];
    } catch (caught) {
      if (caught instanceof PluginApiError && caught.status === 404) {
        return this.#scheduleFromProposals(ctx);
      }
      throw caught;
    }
  }

  /**
   * The same rows from a plugin that has no client-wide route, read one
   * signed proposal at a time.
   *
   * Only signed ones: an unsent proposal has no schedule, and a sent one that
   * has not been signed has terms the client has not agreed to. Showing those
   * on a payments page would read as money owed.
   */
  async #scheduleFromProposals(ctx: PortalCallerContext): Promise<PluginScheduleItem[]> {
    const { proposals } = await this.#get<{ proposals: PluginProposal[] }>(ctx, "/proposals", {
      clientId: ctx.clientId,
    });
    const signed = proposals.filter((proposal) => proposal.status === "signed");
    const lists = await Promise.all(
      signed.map(async (proposal) => {
        try {
          const { paymentSchedule } = await this.#get<{ paymentSchedule: PluginScheduleItem[] }>(
            ctx,
            `/proposals/${encodeURIComponent(proposal.id)}/payment-schedule`,
          );
          return paymentSchedule ?? [];
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
   * Either document, from the plugin's own download route.
   *
   * Both hashes are re-checked on the way out **by the plugin**, so bytes that
   * no longer match what was recorded are refused rather than served. Nothing
   * is re-checked here: a second opinion on a hash this side never computed
   * would be theatre.
   *
   * `source` worked on the legacy bridge and not here until CRE-801, because
   * an uploaded proposal's PDF was in the host object store and a plugin can
   * only reach that with `plugin.assets.read` -- a capability name that does
   * not exist on a stock Paperclip, so a manifest declaring it is refused at
   * install. The plugin now keeps those bytes in its own schema instead, which
   * needs no capability, and the two kinds differ here by one path segment.
   */
  async document(
    ctx: PortalCallerContext,
    kind: "signed" | "source",
    proposalId: string,
  ): Promise<PortalDocument> {
    const path = kind === "source" ? "source-document" : "signed-document";
    const result = await this.#get<{
      filename: string;
      contentType: string;
      contentBase64: string;
    }>(ctx, `/proposals/${encodeURIComponent(proposalId)}/${path}`);
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
      logins: sortLogins(
        credentials.credentials.map((credential): SharedLogin => ({
          id: credential.id,
          label: credential.label,
          username: credential.username,
          url: credential.url,
          sharedAt: credential.createdAt,
          // Whatever the plugin considers the mask, rather than a local
          // constant: two spellings of "hidden" on one screen reads as a bug.
          masked: credential.secret,
          note: credential.note ?? null,
          sortOrder: credential.sortOrder ?? null,
          projectId: credential.projectId ?? null,
          projectName: credential.projectName ?? null,
        })),
      ),
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

  async accountAccess(ctx: PortalCallerContext): Promise<AccountAccessView> {
    const data = await this.#get<{
      accountAccess: PluginAccountAccess;
      items: PluginAccountAccessItem[];
    }>(ctx, `/clients/${encodeURIComponent(ctx.clientId)}/account-access`);
    return { ...data.accountAccess, items: data.items };
  }

  /**
   * `notes` is sent only when the key is present on `input` -- absent means
   * "leave the note alone", and the plugin draws that distinction from
   * whether the body has the key at all, the same way this call does.
   */
  async saveAccountAccess(
    ctx: PortalCallerContext,
    input: SaveAccountAccessInput,
  ): Promise<AccountAccessView> {
    const body: Record<string, unknown> = {};
    if (input.checks !== undefined) body.checks = input.checks;
    if (input.fields !== undefined) body.fields = input.fields;
    if ("notes" in input) body.notes = input.notes;
    const data = await this.#api.call<{
      accountAccess: PluginAccountAccess;
      items: PluginAccountAccessItem[];
    }>(`/clients/${encodeURIComponent(ctx.clientId)}/account-access`, {
      method: "PATCH",
      clientScope: ctx.clientId,
      body,
    });
    return { ...data.accountAccess, items: data.items };
  }

  /**
   * CRE-827. The plugin owns the format check too -- see
   * `src/api/shared-drive-links.ts` there -- so a request that reaches here
   * with a bad link, or a project that is not this client's, still gets
   * refused server-side rather than trusting the browser's own check. The
   * client scope header already says which client this is; `clientId` is
   * not sent in the body, the same way a client-scoped `createCredential`
   * call does not send one either.
   */
  async createSharedDriveLink(
    ctx: PortalCallerContext,
    input: { clientProjectId: string; url: string },
  ): Promise<SharedDriveLink> {
    const data = await this.#post<{ sharedDriveLink: PluginSharedDriveLink }>(
      ctx,
      "/shared-drive-links",
      { clientProjectId: input.clientProjectId, url: input.url },
    );
    return data.sharedDriveLink;
  }

  async removeSharedDriveLink(ctx: PortalCallerContext, id: string): Promise<void> {
    await this.#api.call(`/shared-drive-links/${encodeURIComponent(id)}`, {
      method: "DELETE",
      clientScope: ctx.clientId,
    });
  }

  /**
   * The plugin already derives `position` as `done | now | next | later`
   * the same way `ladder()` does -- "the first rung not finished", trailing
   * done rungs stay done -- so this is a field reduction, not a second
   * derivation. `status`, `finished`, `active` and `progress` are for a
   * caller that wants the raw row or the step count; this screen draws the
   * ladder the same way the admin table's milestones do, from `label` and
   * `position` alone.
   */
  async projectPhases(
    ctx: PortalCallerContext,
    clientProjectId: string,
  ): Promise<PortalMilestone[]> {
    const data = await this.#get<{ phases: PluginPhase[] }>(
      ctx,
      `/clients/${encodeURIComponent(ctx.clientId)}/phases`,
      { clientProjectId },
    );
    return data.phases.map((phase) => ({
      key: phase.key,
      label: phase.label,
      state: phase.position,
    }));
  }

  /**
   * `sharedOnly` is applied by the plugin itself from the client scope on
   * every call this class makes -- there is no second argument here to get
   * wrong, unlike the legacy RPC where "reviewed and shared" has to be
   * trusted rather than requested.
   */
  async projectAudits(
    ctx: PortalCallerContext,
    clientProjectId: string,
  ): Promise<PortalAudit[]> {
    const data = await this.#get<{ audits: PluginSiteAudit[] }>(
      ctx,
      `/clients/${encodeURIComponent(ctx.clientId)}/site-audits`,
      { clientProjectId },
    );
    return data.audits.map((audit) => ({
      id: audit.id,
      slug: audit.slug,
      kind: audit.kind,
      subjectName: audit.subjectName,
      coverNote: audit.coverNote,
      reportUrl: audit.reportUrl,
      reviewedAt: audit.reviewedAt,
      sharedAt: audit.sharedAt,
      createdAt: audit.createdAt,
      versionCount: audit.versionCount,
      latestVersion: audit.latestVersion,
    }));
  }

  async revealLogin(
    _ctx: PortalCallerContext,
    _loginId: string,
    _actor: LoginRevealActor,
  ): Promise<string | null> {
    // The list puts a mask in `secret`. There is no documented decrypt on
    // this API, and inventing one would return a password this process
    // could not write to `activity_events` the way the admin-tables path
    // does. Refuse. This install answers from those tables until the import.
    throw new PortalError(
      501,
      "reveal_unavailable",
      "Copying a saved password is not available on this portal yet.",
    );
  }

  #toSubscription(row: PluginSubscription): PortalSubscription {
    return {
      id: row.id,
      provider: row.provider,
      planLabel: row.planLabel,
      status: row.status,
      amountCents: row.amountCents,
      currency: row.currency,
      interval: row.interval,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      canceledAt: row.canceledAt,
      renewsOn: row.renewsOn,
      endsOn: row.endsOn,
      // CRE-857 (`POST /subscriptions/:id/resume`) is merged on
      // `agent-platform@master` but not yet installed on the live plugin
      // (CRE-872) -- so `resumeSubscription` below 404s against this
      // install's real route table today. Forced false rather than
      // `row.cancelAtPeriodEnd && row.canceledAt === null`, which would
      // show a working-looking "Resume subscription" button the first time
      // any client's plan happens to be in a pending-cancellation state --
      // whether or not anyone has ever clicked Cancel through this portal.
      // Flip back to the real expression once CRE-872 lands; don't delete
      // the commented line, it's the thing to restore.
      resumable: false,
    };
  }

  async subscriptions(ctx: PortalCallerContext): Promise<PortalSubscription[]> {
    const data = await this.#get<{ subscriptions: PluginSubscription[] }>(
      ctx,
      `/clients/${encodeURIComponent(ctx.clientId)}/subscriptions`,
    );
    return data.subscriptions.map((row) => this.#toSubscription(row));
  }

  async cancelSubscription(
    ctx: PortalCallerContext,
    subscriptionId: string,
  ): Promise<SubscriptionActionResult> {
    const result = await this.#post<PluginSubscriptionActionResult>(
      ctx,
      `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
      {},
    );
    return {
      subscription: this.#toSubscription(result.subscription),
      requested: result.requested,
      message: result.message,
    };
  }

  async resumeSubscription(
    ctx: PortalCallerContext,
    subscriptionId: string,
  ): Promise<SubscriptionActionResult> {
    const result = await this.#post<PluginSubscriptionActionResult>(
      ctx,
      `/subscriptions/${encodeURIComponent(subscriptionId)}/resume`,
      {},
    );
    return {
      subscription: this.#toSubscription(result.subscription),
      requested: result.requested,
      message: result.message,
    };
  }

  /**
   * `GET /clients/:clientId/onboarding-invites` (unchanged by CRE-858: that
   * added the company-wide list, not this one). The most recently created
   * invite that is not revoked -- the same tie-break the old
   * `brand-kit-intake` email fallback used, `.order("created_at", {
   * ascending: false }).limit(1)` -- so a client with one superseded invite
   * and one live one still gets the live one's state.
   *
   * FLAGGED, NOT WORKED AROUND: this route's own serialiser (`inviteToWire`)
   * never carries a token, including here, where the caller is the invite's
   * own rightful client reading their own row -- the plugin currently has no
   * route that hands a client back the token to their own still-open invite.
   * `legacy-source.ts`'s implementation of this method does return it, which
   * is not a bug in that file: this is a real, narrower gap than the one
   * `inviteToWire`'s rule exists to close (a board-wide list leaking many
   * people's capabilities at once), and it is the portal's own client asking
   * for the one capability that is theirs. `BrandVoiceAccordion` on the
   * frontend draws the status either way and the link only when `token` is
   * not null, so this is a feature narrowing once a plugin-backed install
   * reaches this state, not a crash -- worth a future ask, not a blocker here.
   */
  async onboardingInvite(ctx: PortalCallerContext): Promise<PortalOnboardingInvite | null> {
    const data = await this.#get<{ invites: PluginOnboardingInvite[] }>(
      ctx,
      `/clients/${encodeURIComponent(ctx.clientId)}/onboarding-invites`,
    );
    const live = data.invites.filter((invite) => !invite.revoked);
    if (live.length === 0) return null;
    const chosen = live[0]!;
    return {
      id: chosen.id,
      // Never read from this route: see `PluginOnboardingInvite`'s header.
      token: null,
      clientId: chosen.clientId,
      businessName: chosen.businessName,
      contactName: chosen.contactName,
      contactEmail: chosen.contactEmail,
      tier: chosen.tier,
      note: chosen.note,
      expiresAt: chosen.expiresAt,
      revoked: chosen.revoked,
      expired: chosen.expired,
      live: chosen.live,
      lastOpenedAt: chosen.lastOpenedAt,
      completedAt: chosen.completedAt,
    };
  }
}

/** When the client was given this document. */
function sentAtOf(proposal: PluginProposal): string | null {
  return proposal.status === "draft" ? null : proposal.updatedAt ?? proposal.createdAt;
}
