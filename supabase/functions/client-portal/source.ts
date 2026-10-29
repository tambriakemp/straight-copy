// What a data source for the client portal has to be able to answer.
//
// There are two implementations and there will be one. `plugin-source.ts`
// calls the Client Portal plugin, which is where this is going;
// `legacy-source.ts` reads the `/admin` tables, which is where the data still
// is until the CP-6 import has run and been approved.
//
// WHY BOTH, RATHER THAN JUST THE PLUGIN
//
// The card says reads and writes go through the plugin API from the server
// side, and they do -- `plugin-source.ts` is the implementation this is for,
// and it is the one that runs the moment the three CLIENT_PORTAL_* variables
// are set. What the card does not say is that the portal should go blank in
// the meantime, and it would: the plugin has never been installed anywhere,
// and the import that moves fifty clients' proposals, invoices and logins
// into it is CP-6, which is explicitly gated on the owner's approval and has
// not happened.
//
// So the screens are rewritten once, against one shape, and the shape is
// served from whichever source this install has. On the day CP-6 lands, the
// change is three environment variables and the deletion of one file. No
// screen changes, because no screen knows which source answered it.
//
// WHAT A REVEAL IS, AND IS NOT
//
// `revealLogin` returns one decrypted password, for one login, at the moment
// Copy is tapped. The list view still carries a mask and nothing else. The
// caller has already been resolved to this client (or to an admin previewing
// this client). The legacy source decrypts only a row whose `client_id`
// matches, and it writes an audit row before the password is returned. The
// plugin source has no such door and refuses, rather than guessing an
// endpoint that would hand a secret back with no audit.

import type {
  AccountAccessView,
  AgreementsView,
  HomeView,
  LoginsView,
  PaymentsView,
  PortalBranding,
  SharedDriveLink,
  SignRequest,
  SignResult,
} from "../_shared/client-portal-wire.ts";

/** The signed-in caller, already resolved from their session. */
export interface PortalCallerContext {
  clientId: string;
  /** True when an admin is previewing the portal as this client. */
  preview: boolean;
  branding: PortalBranding;
  now: Date;
}

/**
 * A document, in whichever of the two forms its backend can produce.
 *
 * A union rather than one shape, because the two backends genuinely differ
 * and flattening them would mean one of them doing pointless work. The
 * plugin holds the sealed PDF in its own table and hands back bytes; the
 * `/admin` tables hold a path in object storage and hand back a short-lived
 * signed URL. Making the legacy side download and re-encode a PDF through an
 * edge function, so that both returned bytes, would add a round trip and a
 * copy to produce an identical file.
 */
export type PortalDocument =
  | { form: "bytes"; filename: string; contentType: string; contentBase64: string }
  | { form: "url"; filename: string; url: string };

export interface ShareLoginInput {
  /** Set when answering an ask; the ask supplies the label and the address. */
  requestId: string | null;
  label: string | null;
  url: string | null;
  username: string | null;
  secret: string;
}

export interface UpdateLoginInput {
  id: string;
  label?: string;
  url?: string | null;
  username?: string | null;
  /** Omitted means "leave the password alone"; present means rotate it. */
  secret?: string;
}

/**
 * CRE-822, G4.
 *
 * `notes` is checked for presence, not for truthiness: absent means "leave
 * the note alone", and `""` means "withdraw it". A caller that cannot
 * distinguish those two would delete a client's note on the first save of
 * any OTHER field on this form, because the auto-save sends the whole form
 * on every debounce and the textarea the note used to pre-fill is gone.
 */
export interface SaveAccountAccessInput {
  checks?: Record<string, boolean>;
  fields?: Record<string, string>;
  notes?: string;
}

/**
 * Who asked to copy one password, for the audit row.
 *
 * `userId` is the auth user (or the view-as token's subject). `actorLabel`
 * is set for a view-as grant, where the subject is not a portal user and the
 * token already carries the admin's name. Neither is the password.
 */
export interface LoginRevealActor {
  userId: string;
  via: "portal" | "admin" | "view_as";
  actorLabel: string | null;
}

/**
 * Every read and write the four client screens make.
 *
 * Narrow on purpose. A source that exposed a general query would be a source
 * through which a bug in one screen could read a row no screen was supposed
 * to show, and the whole point of resolving the caller once and scoping
 * everything to their client id is that there is no such door.
 */
export interface PortalSource {
  /** Which implementation answered. Reported by the health action, not to clients. */
  readonly kind: "plugin" | "admin-tables";

  home(ctx: PortalCallerContext): Promise<HomeView>;
  agreements(ctx: PortalCallerContext): Promise<AgreementsView>;
  payments(ctx: PortalCallerContext): Promise<PaymentsView>;
  logins(ctx: PortalCallerContext): Promise<LoginsView>;

  sign(ctx: PortalCallerContext, input: SignRequest): Promise<SignResult>;
  decline(ctx: PortalCallerContext, proposalId: string, reason: string | null): Promise<void>;

  /**
   * Start a payment, and return where to send the browser.
   *
   * Returns a URL and never takes money. The money is taken at the provider,
   * and the fact of it coming back arrives at the plugin's webhook rather
   * than here -- which is why there is no `markPaid` on this interface. A
   * portal that could mark its own invoices paid would be a portal in which
   * a client could.
   */
  checkout(ctx: PortalCallerContext, invoiceId: string): Promise<{ checkoutUrl: string }>;

  /**
   * A document, as bytes, for the browser to turn into a file.
   *
   * Base64 inside JSON rather than a URL, because there is no address a
   * browser could be given that would work on its own: every read here is
   * authorised by the caller's session, and a signed URL would be a second
   * way in with its own lifetime. The documents are tens of kilobytes.
   */
  document(
    ctx: PortalCallerContext,
    kind: "signed" | "source",
    proposalId: string,
  ): Promise<PortalDocument>;

  shareLogin(ctx: PortalCallerContext, input: ShareLoginInput): Promise<void>;
  updateLogin(ctx: PortalCallerContext, input: UpdateLoginInput): Promise<void>;
  removeLogin(ctx: PortalCallerContext, id: string): Promise<void>;

  /** "Set Up Your Accounts" (CRE-822, G4): the checklist, the note's
   * presence (never its text) and the attachments' category live here --
   * the attachments themselves are plain Files, not this. */
  accountAccess(ctx: PortalCallerContext): Promise<AccountAccessView>;
  saveAccountAccess(
    ctx: PortalCallerContext,
    input: SaveAccountAccessInput,
  ): Promise<AccountAccessView>;

  /**
   * Add one of the client's shared-drive links (CRE-827), replacing the
   * Files tab's upload button. `url` is validated by the implementation.
   * The reader already gets the current list from `home()` -- these are the
   * two writes `HomeView` has no field for.
   */
  createSharedDriveLink(
    ctx: PortalCallerContext,
    input: { clientProjectId: string; url: string },
  ): Promise<SharedDriveLink>;
  removeSharedDriveLink(ctx: PortalCallerContext, id: string): Promise<void>;

  /**
   * One decrypted password, for one login shared with this client.
   *
   * Null when the row exists and has no password stored. A login that is
   * not this client's is a not-found, the same answer as a missing id.
   * Implementations must not log the password, and must not return it
   * unless the reveal itself was recorded.
   */
  revealLogin(
    ctx: PortalCallerContext,
    loginId: string,
    actor: LoginRevealActor,
  ): Promise<string | null>;
}

/** A refusal with a status the portal can pass through to the browser. */
export class PortalError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "PortalError";
    this.status = status;
    this.code = code;
  }
}

export function notFound(what: string): PortalError {
  // One message for "does not exist" and "is not yours", deliberately: the
  // difference is exactly the thing an attacker would be probing for.
  return new PortalError(404, "not_found", `${what} could not be found.`);
}

export function badRequest(code: string, message: string): PortalError {
  return new PortalError(400, code, message);
}
