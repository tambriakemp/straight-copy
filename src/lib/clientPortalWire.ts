// SHARED WIRE CONTRACT -- mirror.
//
// The canonical copy is `supabase/functions/_shared/client-portal-wire.ts`.
// Everything below the line is identical to it, byte for byte, and
// `src/test/client-portal-wire.test.ts` fails if it stops being. Edit the
// canonical copy and re-run that test; it prints the first line that differs.
//
// Why a copy at all: `tsconfig.app.json` includes only `src`, so the Deno
// side of this contract is never typechecked by the build the frontend ships
// through, and an import reaching out of `src` would not be either. This file
// is the half the browser compiles against.
//
// ===========================================================================
//
// What the client portal screens read, and what they send back.
//
// This is the whole contract between the four client screens (mockups 13-16)
// and the `client-portal` edge function. Two things it is deliberately NOT:
//
//   * It is not the Client Portal plugin's API shape. The plugin speaks a
//     general-purpose v1 API designed for any first-party front end; these
//     are view models for four specific screens, with the composition already
//     done. The translation happens once, on the server, where the plugin
//     credential lives -- see `client-portal/plugin.ts`.
//   * It is not the database. Nothing here is a table row, and no field is
//     named after a column. That is what lets the same shapes be served from
//     the plugin or from the `/admin` tables underneath them while the
//     migration in CP-6 is still outstanding.
//
// MONEY IS INTEGER CENTS, ALWAYS, in a field ending `Cents`, with a sibling
// `currency`. The plugin API has the same rule and for the same reason: a
// float that has been through JSON is not the number anybody agreed to pay.
//
// DATES ARE ISO STRINGS OR NULL. Formatting is the browser's job, because the
// browser is the only party that knows the reader's locale and time zone. A
// server that pre-formatted "Nov 14" would be guessing at both.

/* -------------------------------------------------------------------------- */
/* What revision of this contract a server speaks                              */
/* -------------------------------------------------------------------------- */

/**
 * This contract's revision, bumped by hand when a field is added.
 *
 * It exists because the two halves are deployed separately AND IN AN ORDER --
 * `docs/client-portal.md` spells out why the edge function goes out before
 * the frontend is published -- and the gap between those two steps is exactly
 * the window in which one half is speaking a shape the other does not. The
 * `health` action reports this, so "has the new field landed on the server
 * yet" is a request somebody can make rather than a thing they assume.
 *
 * The promise is the one the plugin's own v1 API makes, and for the same
 * reason: a revision never removes a field, never renames one, and never
 * changes what an enum member means. It MAY add an optional field. So every
 * reader of this contract treats an absent optional field as "a server older
 * than this copy" and draws what it would draw for an unset value -- never as
 * an error, and never by substituting a guess of its own.
 *
 *   1.1.0  `PortalBranding.monogram` (CRE-797). Optional; null means draw no
 *          tile at all. The tile beside the agency name was the two
 *          characters `C8` compiled into the component until this field
 *          existed, which put our mark on a licensee's client's screen.
 *   1.0.0  The four screens, mockups 13-16 (CRE-776).
 */
export const PORTAL_WIRE_VERSION = "1.1.0";

/** The agency, as the client sees it. Never hardcoded: licensees are not us. */
export interface PortalBranding {
  /** "Cre8 Visions" -- the name in the top bar. */
  agencyName: string;
  /**
   * Up to three characters for the tile beside the name, or null for no tile.
   *
   * THE FIELD THE FIRST LINE OF THIS INTERFACE WAS MISSING. The name was read
   * from `agencyName` and the tile next to it was `C8`, written into
   * `ClientPortalShell`, so an install branded "Northhill Studio" drew our
   * monogram against their name (CRE-797). A monogram is branding, and
   * branding belongs to whoever is licensed to show it.
   *
   * Resolved on the server by `monogramFor`, which is also what the demo
   * harness uses, so there is one answer rather than one per caller:
   *
   *   * what the install configured, when it configured something;
   *   * otherwise `initialsFor(agencyName)` -- the only fallback that is
   *     right for whoever installed this;
   *   * null, meaning the tile is not drawn, for an install that says so and
   *     for a name that yields no legible initials.
   *
   * Optional rather than required, because of the deploy order above: a
   * server that predates 1.1.0 sends no `monogram` at all, and the tile is
   * then absent for as long as that lasts. The component never derives one
   * for itself -- a component that derives a monogram is a component with an
   * opinion about somebody else's brand, and there is no default it could
   * pick that is right for every licensee. Least of all ours.
   */
  monogram?: string | null;
  /**
   * The person a client messages, by first name. Mockups 14 and 16 put this
   * in running text ("Message Tambria", "TAMBRIA ASKED FOR"), which is
   * exactly the kind of string that keeps rendering perfectly after the
   * person leaves. It is read, never written into a component.
   */
  contactName: string | null;
  /** "replies within a business day", or null to say nothing. */
  replyWindow: string | null;
  /**
   * Where "Ask a question" goes.
   *
   * Configured rather than written into the component for the same reason as
   * the name beside it: an address that keeps rendering perfectly after the
   * mailbox is closed sends a client's question nowhere, and nothing tells
   * anybody. Null hides the button rather than offering one that fails.
   */
  contactEmail: string | null;
}

/** Who is signed in. */
export interface PortalMe {
  clientId: string;
  /** The person, when we know them: "Maya". */
  displayName: string;
  /** The business: "Glowskin Studio". */
  businessName: string | null;
  /** Up to two letters for the avatar. Computed once, server-side. */
  initials: string;
}

export type MilestoneState = "done" | "now" | "next" | "later";

/**
 * One segment of the progress bar on the home screen.
 *
 * `label` is the client-facing wording and never the internal key: mockup 13
 * shows "Words & design", which is a phase called something else everywhere
 * else in the system. Whoever renamed it for the client owns that string, and
 * it travels verbatim.
 */
export interface PortalMilestone {
  key: string;
  label: string;
  state: MilestoneState;
}

/**
 * Which icon mockup 13 draws on the left of a waiting row.
 *
 * A NAME, NOT A CHARACTER, and that is deliberate. A glyph here is a bet
 * that the client's machine has a font covering it: several of the obvious
 * candidates (U+1F5BC a picture frame, U+1F441 an eye, U+270E a pencil) are
 * `Emoji_Presentation=No`, so a browser looks for them in the element's TEXT
 * font stack and never falls through to the colour-emoji font that does have
 * them. When the text fonts come up empty the client gets a tofu box. Naming
 * the icon and drawing it as an SVG cannot fail that way on any machine, and
 * it keeps the slot closed: a licensee's plugin names an icon from this list
 * rather than posting arbitrary characters into the client's screen.
 */
export type WaitingIcon = "sign" | "upload" | "review" | "pay";

/** A thing the client has to do. The whole point of the home screen. */
export interface WaitingItem {
  id: string;
  /** "Upload 6 treatment-room photos" */
  title: string;
  /** The icon on the left in mockup 13. Null draws no icon at all. */
  icon: WaitingIcon | null;
  /** The button label: "Upload", "Open", "Review and sign". */
  action: string;
  /**
   * Where the button goes, as a path within the portal. Null means the row
   * is informational and the button is not drawn at all -- better than a
   * button that goes nowhere, which teaches a client the page is decoration.
   */
  href: string | null;
  /** `true` draws the violet (primary) button. One per list at most. */
  primary: boolean;
}

/** The "Next payment" card on the home screen. */
export interface NextPayment {
  invoiceId: string;
  amountCents: number;
  currency: string;
  /** "Milestone 2" */
  label: string;
  dueOn: string | null;
  /**
   * The provider the button names: "PayPal" in mockup 13. Null when no
   * payment provider is wired, and the button then says "Pay now" rather
   * than naming a company that will not be taking the money.
   */
  providerName: string | null;
}

/** One line in "Latest from the team". */
export interface TeamUpdate {
  id: string;
  title: string;
  occurredAt: string;
  /** Violet for something that needs them, teal for something that happened. */
  tone: "accent" | "positive";
}

/** Mockup 13. */
export interface HomeView {
  branding: PortalBranding;
  me: PortalMe;
  /** "Your new site is being built". Null when there is no live project. */
  headline: string | null;
  /** 1-based, for "Step 5 of 7". Null when no milestones are shared. */
  stepNumber: number | null;
  stepCount: number | null;
  /** The date being worked towards, if one is known. */
  targetDate: string | null;
  milestones: PortalMilestone[];
  waitingOnYou: WaitingItem[];
  nextPayment: NextPayment | null;
  updates: TeamUpdate[];
}

/* -------------------------------------------------------------------------- */
/* Agreements (mockup 14)                                                      */
/* -------------------------------------------------------------------------- */

export interface AgreementLineItem {
  description: string;
  amountCents: number;
}

/**
 * A proposal as the client reads it.
 *
 * `scope` and `lineItems` are the two blocks mockup 14 draws. A proposal that
 * came in as an uploaded PDF has neither, and carries `pdfUrl` instead -- the
 * PDF upload path stays alongside the builder, so the client screen has to
 * render both or half of them cannot be signed.
 */
export interface AgreementView {
  id: string;
  /** "CV-2026-034" */
  number: string;
  title: string;
  /** "Mesa Dental" */
  preparedFor: string;
  preparedBy: string;
  sentAt: string | null;
  status: "sent" | "viewed" | "signed" | "declined" | "expired" | "void" | "draft";
  /** The "What we'll build" paragraph, when the proposal was built here. */
  scopeHeading: string | null;
  scopeBody: string | null;
  lineItems: AgreementLineItem[];
  totalCents: number;
  currency: string;
  /** "Deposit $2,080 today · $1,560 at design approval · $1,560 before launch" */
  instalmentSummary: string | null;
  /**
   * Whether there is a source PDF, and whether there is a sealed signed one.
   *
   * Flags and not URLs. Both documents are fetched through the portal's own
   * edge function with the caller's session attached, so there is no address
   * a browser could be handed that would work on its own -- and a field
   * called `url` holding something that is not one is how a link that
   * silently resolves against the current page gets shipped.
   */
  hasSourcePdf: boolean;
  hasSignedDocument: boolean;
  signedAt: string | null;
  signerName: string | null;
}

/** What the sign panel needs, which only the server can answer. */
export interface SigningOptions {
  /** The licensee's own consent wording, stored verbatim on the signature. */
  consentText: string;
  /**
   * The faces a signer may adopt, each with a CSS font stack to preview in.
   * Read rather than hardcoded: a list typed into this screen would drift
   * from the list the sealed PDF can actually draw the first time one is
   * added, and the mismatch would only show up on the signed document.
   */
  styles: Array<{ key: string; name: string; fontStack: string }>;
  defaultStyle: string | null;
  /**
   * `true` when signing happens at a vendor rather than in this panel. The
   * screen then sends the client to the vendor instead of capturing a
   * signature it is not entitled to capture.
   */
  hosted: boolean;
  /** "PayPal", for "Then pay the $2,080 deposit with PayPal". */
  depositProviderName: string | null;
  depositCents: number | null;
}

export interface AgreementsView {
  branding: PortalBranding;
  me: PortalMe;
  /** Newest first. The screen opens on the first one awaiting a signature. */
  agreements: AgreementView[];
  signing: SigningOptions;
}

/** What the browser sends to sign. No signature image, no file: a typed name. */
export interface SignRequest {
  proposalId: string;
  signerName: string;
  signatureStyle: string | null;
  consentGranted: boolean;
}

export interface SignResult {
  signedAt: string;
  /** Where to send the client next, which is the deposit when there is one. */
  nextHref: string | null;
  /** Set when a deposit is payable immediately: mockup 14's whole last line. */
  depositInvoiceId: string | null;
}

/* -------------------------------------------------------------------------- */
/* Payments (mockup 15)                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The status of one payment, as a client reads it.
 *
 * Four states and not the provider's twenty. "Ready to pay" and "Later" are
 * the two that matter: a client who cannot tell them apart either pays
 * nothing or asks to pay something that is not billable yet.
 */
export type PaymentState = "paid" | "ready" | "later" | "overdue";

export interface PaymentRow {
  id: string;
  /** "Deposit", "Design approved", "Launch" -- the licensee's words. */
  label: string;
  /** "Oct 3" is a date; "Before launch" is a milestone rule with no date. */
  dueOn: string | null;
  dueNote: string | null;
  amountCents: number;
  currency: string;
  state: PaymentState;
  /** "PayPal", shown next to Paid. Null when it was taken another way. */
  paidWith: string | null;
  paidAt: string | null;
  /**
   * The provider's own receipt, when the provider gave us one.
   *
   * A real external address, unlike the document flags above: it is the
   * vendor's page and the client opens it directly. Null when the payment
   * was taken somewhere that does not issue one, and the button is then not
   * drawn rather than drawn and dead.
   */
  receiptUrl: string | null;
  /** `true` when this row can be paid right now. */
  payable: boolean;
}

export interface PaymentsView {
  branding: PortalBranding;
  me: PortalMe;
  totalCents: number;
  paidCents: number;
  currency: string;
  /** The "Next" tile. Null when nothing is outstanding. */
  next: { amountCents: number; dueOn: string | null } | null;
  rows: PaymentRow[];
  /** "Payments go straight to PayPal. We never see or store your card." */
  footnote: string;
}

/* -------------------------------------------------------------------------- */
/* Saved logins (mockup 16)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A login the client has shared.
 *
 * There is no field here for the password, and no variant of this type that
 * has one. A client may share a login and may not read one back: write-only
 * is what makes it safe to put a vault behind a portal session at all,
 * because a stolen session cannot harvest what was shared through it.
 */
export interface SharedLogin {
  id: string;
  label: string;
  username: string | null;
  url: string | null;
  sharedAt: string;
  /** Always the mask. Present so the row has something to draw. */
  masked: string;
}

/** An outstanding ask: the right-hand panel of mockup 16. */
export interface LoginRequest {
  id: string;
  /** "Google Business Profile" */
  label: string;
  /** "For the launch phase" */
  note: string | null;
  requestedAt: string;
  urlHint: string | null;
  usernameHint: string | null;
  /** True when an agent asked rather than a person. Shown, not hidden. */
  askedByAgent: boolean;
}

export interface LoginsView {
  branding: PortalBranding;
  me: PortalMe;
  logins: SharedLogin[];
  requests: LoginRequest[];
}

/* -------------------------------------------------------------------------- */
/* Pure helpers both sides use                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Up to two initials for an avatar.
 *
 * Takes the first letter of the first and last words, which is what reads as
 * a monogram. A single word gives one letter rather than two from the same
 * word, because "MA" for "Maya" looks like a different person's initials.
 */
export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]![0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]![0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * The monogram for the tile beside the agency name, or null for no tile.
 *
 * `configured` is whatever the install chose, and it wins: an agency whose
 * mark is not its initials ("C8" for Cre8 Visions, "&" for an ampersand
 * logo) has no other way to say so. Three answers, in order:
 *
 *   * the literal `none`, which means DRAW NO TILE. A real answer and not an
 *     unset value: a wordmark that wants no tile beside it is a design
 *     decision, and the alternative is handing a licensee initials they
 *     deliberately did not ask for.
 *   * anything else configured, trimmed and clipped to three characters. A
 *     longer string is not a monogram, and the tile is a 28px square: it
 *     would render as a smear rather than as the thing somebody typed.
 *     Clipped with `Array.from` and not `slice`, so a mark that starts
 *     outside the BMP loses a whole character rather than half of one.
 *   * nothing configured: the initials of the agency name.
 *
 * Null when none of that yields something legible. `initialsFor` answers "?"
 * for a blank name, and a tile with a question mark in it reads to a client
 * as a bug on their own portal -- so no tile is the better answer, and it is
 * the one a licensee gets before they have configured anything at all.
 */
export function monogramFor(
  configured: string | null | undefined,
  agencyName: string,
): string | null {
  const chosen = (configured ?? "").trim();
  if (chosen.toLowerCase() === "none") return null;
  if (chosen.length > 0) return Array.from(chosen).slice(0, 3).join("");
  const initials = initialsFor(agencyName);
  return initials === "?" ? null : initials;
}

/**
 * The ladder, in the order the progress bar draws it.
 *
 * "Now" is the first milestone that is not done -- not the one whose state
 * says so. A phase nobody remembered to start is still the next thing that
 * has to happen, and a ladder with no Now at all reads as a project that has
 * stopped.
 *
 * Trailing done milestones after an unfinished one stay done. Work does get
 * done out of order, and demoting it would tell the client it has to happen
 * again.
 *
 * "Next" is the next milestone that is NOT DONE, rather than the one at the
 * following index. `src/lib/journeyPhases.ts` uses the index, and on a
 * project where a later phase finished early that leaves a ladder with a Now
 * and no Next at all. The two states draw identically on mockup 13, so this
 * costs nothing today and is the answer anybody reading the field expects.
 */
export function ladder(
  steps: Array<{ key: string; label: string; done: boolean }>,
): PortalMilestone[] {
  const open = steps.flatMap((step, index) => (step.done ? [] : [index]));
  const [nowAt, nextAt] = open;
  return steps.map((step, index) => ({
    key: step.key,
    label: step.label,
    state: step.done
      ? "done"
      : index === nowAt
        ? "now"
        : index === nextAt
          ? "next"
          : "later",
  }));
}

/**
 * "Step 5 of 7", as two numbers.
 *
 * Counts the current step as the position of `now`, so a client reading
 * "step 5 of 7" and counting filled segments gets the same answer. Null when
 * nothing is in flight: a finished project should read as finished rather
 * than as "step 7 of 7" forever.
 */
export function stepPosition(
  milestones: PortalMilestone[],
): { stepNumber: number; stepCount: number } | null {
  if (milestones.length === 0) return null;
  const index = milestones.findIndex((milestone) => milestone.state === "now");
  if (index === -1) return null;
  return { stepNumber: index + 1, stepCount: milestones.length };
}

/**
 * Which payments can be paid, and which are merely future.
 *
 * The rule is the one a client would state: a payment is payable when it has
 * been billed and not yet paid. Everything that is scheduled but not billed
 * is "Later", including one whose date has passed -- a date is a plan, and
 * billing is the event. Showing "Ready to pay" for something nobody has
 * invoiced produces a client trying to pay an amount the agency has no
 * record of asking for.
 */
export function paymentState(input: {
  paidAt: string | null;
  issued: boolean;
  dueOn: string | null;
  now: Date;
}): PaymentState {
  if (input.paidAt) return "paid";
  if (!input.issued) return "later";
  if (input.dueOn) {
    const due = Date.parse(input.dueOn);
    // A due date that does not parse is treated as no due date rather than as
    // overdue. The alternative marks every row red the day somebody types a
    // date in a format this did not expect.
    if (!Number.isNaN(due) && due < input.now.getTime()) return "overdue";
  }
  return "ready";
}

/** The money tiles on the payments screen, from the rows themselves. */
export function paymentTotals(rows: PaymentRow[]): {
  totalCents: number;
  paidCents: number;
  next: { amountCents: number; dueOn: string | null } | null;
} {
  let totalCents = 0;
  let paidCents = 0;
  for (const row of rows) {
    totalCents += row.amountCents;
    if (row.state === "paid") paidCents += row.amountCents;
  }
  // The next one to fall due, not the next one in the list: a schedule is
  // edited by hand and the order it is stored in is not a promise.
  const outstanding = rows
    .filter((row) => row.state !== "paid")
    .sort((a, b) => {
      if (a.dueOn && b.dueOn) return a.dueOn.localeCompare(b.dueOn);
      // A row with no date sorts last -- "Before launch" is not sooner than
      // a dated instalment just because nobody dated it.
      if (a.dueOn) return -1;
      if (b.dueOn) return 1;
      return 0;
    });
  const next = outstanding[0];
  return {
    totalCents,
    paidCents,
    next: next ? { amountCents: next.amountCents, dueOn: next.dueOn } : null,
  };
}

/**
 * The one-line summary under the investment table on mockup 14.
 *
 * Built from the instalments rather than written by hand, so it cannot
 * disagree with the payment schedule the client is about to be billed on.
 * Returns null for a single instalment: "Deposit $5,200 today" under a total
 * of $5,200 is noise.
 */
export function instalmentSummary(
  instalments: Array<{ label: string; amountCents: number }>,
  formatMoney: (cents: number) => string,
): string | null {
  if (instalments.length < 2) return null;
  return instalments
    .map((instalment) => `${instalment.label} ${formatMoney(instalment.amountCents)}`)
    .join(" · ");
}
