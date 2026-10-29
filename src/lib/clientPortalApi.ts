// The browser half of the client portal.
//
// Every call goes to one edge function, `client-portal`, with the caller's
// own Supabase session attached by `portalFetch`. Nothing here holds a
// credential for anything else, and that is the point: the Client Portal
// plugin's API key is held by that function and never compiled into this
// bundle. If you are adding a feature and find yourself wanting a
// `VITE_CLIENT_PORTAL_*` variable, the answer is an action on the function.
//
// ONE ROUND TRIP PER SCREEN. Each of the four screens asks for its own view
// model and renders it. The composition -- joining proposals to schedules to
// invoices -- happened on the server, where one request can do it against a
// database rather than four requests doing it across the Atlantic.

import { portalFetch } from "@/lib/portalFetch";
import { isDemoClient } from "@/lib/portalDemo";
import type {
  AccountAccessView,
  AgreementsView,
  HomeView,
  LoginsView,
  PaymentsView,
  SharedDriveLink,
  SignRequest,
  SignResult,
} from "@/lib/clientPortalWire";

/** Mirrors `PortalDocument` in `supabase/functions/client-portal/source.ts`. */
type PortalDocument =
  | { form: "bytes"; filename: string; contentType: string; contentBase64: string }
  | { form: "url"; filename: string; url: string };

/**
 * A refusal from the server, with the code intact.
 *
 * `code` is the thing to branch on and `message` is written for the person
 * reading the screen, so components show `message` and never build their own
 * sentence from `code`.
 */
export class PortalRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "PortalRequestError";
    this.status = status;
    this.code = code;
  }
}

async function call<T>(
  clientId: string,
  action: string,
  body: Record<string, unknown>,
  adminPreview: boolean,
): Promise<T> {
  // The QA harness, and the only place it is reachable from. Both halves of
  // the condition matter: the first folds to `false` at build time with the
  // flag unset, which takes the `import()` below with it so the fixtures are
  // never emitted; the second keeps even a demo build answering from
  // fixtures for one reserved id and from the real server for every other.
  // See `portalDemo.ts`.
  if (import.meta.env.VITE_PORTAL_DEMO === "1" && isDemoClient(clientId)) {
    const { demoCall } = await import("@/lib/portalDemoData");
    return demoCall<T>(action, body);
  }

  let response: Response;
  try {
    response = await portalFetch("client-portal", { action, clientId, ...body }, adminPreview);
  } catch {
    // A network failure is not a server refusal, and saying "something went
    // wrong" for a dropped connection sends people to support for a problem
    // that a reload fixes.
    throw new PortalRequestError(
      0,
      "offline",
      "We could not reach the server. Check your connection and try again.",
    );
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new PortalRequestError(
      response.status,
      String(payload.code ?? "error"),
      String(payload.error ?? "Something went wrong. Please try again."),
    );
  }
  return payload as T;
}

async function view<T>(
  clientId: string,
  action: string,
  adminPreview: boolean,
  body: Record<string, unknown> = {},
): Promise<T> {
  const payload = await call<{ view: T }>(clientId, action, body, adminPreview);
  return payload.view;
}

export const clientPortal = {
  home: (clientId: string, preview: boolean) => view<HomeView>(clientId, "home", preview),
  agreements: (clientId: string, preview: boolean) =>
    view<AgreementsView>(clientId, "agreements", preview),
  payments: (clientId: string, preview: boolean) =>
    view<PaymentsView>(clientId, "payments", preview),
  logins: (clientId: string, preview: boolean) => view<LoginsView>(clientId, "logins", preview),

  async sign(clientId: string, input: SignRequest, preview: boolean): Promise<SignResult> {
    const payload = await call<{ result: SignResult }>(
      clientId,
      "sign",
      { ...input },
      preview,
    );
    return payload.result;
  },

  decline: (clientId: string, proposalId: string, reason: string | null, preview: boolean) =>
    call<unknown>(clientId, "decline", { proposalId, reason }, preview),

  async checkout(clientId: string, invoiceId: string, preview: boolean): Promise<string> {
    const payload = await call<{ checkoutUrl: string }>(
      clientId,
      "checkout",
      { invoiceId },
      preview,
    );
    return payload.checkoutUrl;
  },

  /**
   * Download a proposal PDF.
   *
   * The server answers in one of two forms and this handles both: the plugin
   * hands back bytes from its own table, the `/admin` tables hand back a
   * short-lived signed URL into object storage. Neither is a link that could
   * be put in an `href` -- the first is not an address at all, and the
   * second expires -- which is why this is a function and not a field on the
   * view.
   */
  async download(clientId: string, proposalId: string, kind: "signed" | "source", preview: boolean) {
    const payload = await call<{ document: PortalDocument }>(
      clientId,
      "document",
      { proposalId, kind },
      preview,
    );
    const doc = payload.document;
    if (doc.form === "url") {
      window.open(doc.url, "_blank", "noopener,noreferrer");
      return;
    }
    const bytes = Uint8Array.from(atob(doc.contentBase64), (char) => char.charCodeAt(0));
    const href = URL.createObjectURL(new Blob([bytes], { type: doc.contentType }));
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = doc.filename;
    anchor.click();
    // Revoked on the next tick rather than immediately: Safari has not
    // started reading the blob by the time `click()` returns.
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  },

  /**
   * Fetch a proposal PDF as something an `<iframe>` can point at, rather than
   * a save-to-disk action.
   *
   * Same two server shapes as `download`, held open instead of triggered: a
   * signed URL is handed back as-is (it already expires on its own), and
   * bytes become a blob URL the caller must `revoke()` once the preview is
   * no longer on screen -- an un-revoked one leaks for the life of the tab.
   */
  async openForPreview(
    clientId: string,
    proposalId: string,
    kind: "signed" | "source",
    preview: boolean,
  ): Promise<{ url: string; filename: string; revoke: () => void }> {
    const payload = await call<{ document: PortalDocument }>(
      clientId,
      "document",
      { proposalId, kind },
      preview,
    );
    const doc = payload.document;
    if (doc.form === "url") {
      return { url: doc.url, filename: doc.filename, revoke: () => {} };
    }
    const bytes = Uint8Array.from(atob(doc.contentBase64), (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: doc.contentType }));
    return { url, filename: doc.filename, revoke: () => URL.revokeObjectURL(url) };
  },

  shareLogin: (
    clientId: string,
    input: {
      requestId?: string | null;
      label?: string | null;
      url?: string | null;
      username?: string | null;
      secret: string;
    },
    preview: boolean,
  ) => call<unknown>(clientId, "share-login", { ...input }, preview),

  updateLogin: (
    clientId: string,
    input: { id: string; label?: string; url?: string | null; username?: string | null; secret?: string },
    preview: boolean,
  ) => call<unknown>(clientId, "update-login", { ...input }, preview),

  removeLogin: (clientId: string, id: string, preview: boolean) =>
    call<unknown>(clientId, "remove-login", { id }, preview),

  accountAccess: (clientId: string, preview: boolean) =>
    view<AccountAccessView>(clientId, "account-access", preview),

  /**
   * `notes` is a key on `input` only when the caller means to touch it --
   * omit it entirely to leave the note alone, and send `""` to withdraw it.
   * Never send `notes: undefined`: that is still a key, and the server
   * cannot tell it apart from `""`.
   */
  saveAccountAccess: (
    clientId: string,
    input: { checks?: Record<string, boolean>; fields?: Record<string, string>; notes?: string },
    preview: boolean,
  ) => view<AccountAccessView>(clientId, "save-account-access", preview, { ...input }),

  /**
   * CRE-827. Adds one link, tagged to a project. The server validates the
   * format and that the project is this client's either way.
   */
  async createSharedDriveLink(
    clientId: string,
    input: { clientProjectId: string; url: string },
    preview: boolean,
  ): Promise<SharedDriveLink> {
    const payload = await call<{ sharedDriveLink: SharedDriveLink }>(
      clientId,
      "create-shared-drive-link",
      { ...input },
      preview,
    );
    return payload.sharedDriveLink;
  },

  removeSharedDriveLink: (clientId: string, id: string, preview: boolean) =>
    call<unknown>(clientId, "remove-shared-drive-link", { id }, preview),

  /**
   * One password, fetched at the moment Copy is pressed.
   *
   * The caller writes it to the clipboard and does not store it. Null when
   * the login exists and has no password. A login that is not this client's
   * rejects, the same as a missing one.
   */
  async revealLogin(clientId: string, id: string, preview: boolean): Promise<string | null> {
    const payload = await call<{ password?: unknown }>(clientId, "reveal-login", { id }, preview);
    const password = payload.password;
    return typeof password === "string" && password.length > 0 ? password : null;
  },
};

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */
//
// Here and not on the server, because the server does not know the reader's
// locale or time zone. A pre-formatted "Nov 14" from a server in another
// region is a date that is wrong by a day for somebody.

/** `$2,400`, and `$2,400.50` only when there are cents to show. */
export function money(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** `Nov 14`. Null in, empty string out, so callers can concatenate safely. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * `Oct 25, 2026`. For a date on a contract, which needs its year.
 *
 * Every other date on these screens is `shortDate` and omits it, because
 * "due Nov 14" is about the next few weeks. A proposal is a document that
 * gets filed, forwarded and read back a year later.
 */
export function documentDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * `Today`, `Yesterday`, or `Oct 3`.
 *
 * The two words are worth the branch: "Today" on the updates list is the
 * difference between a portal that looks live and one that looks like a
 * record of things that happened to somebody once.
 */
export function whenWord(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.floor(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000,
  );
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return shortDate(iso);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** `Good morning` / `Good afternoon` / `Good evening`, in the reader's day. */
export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
