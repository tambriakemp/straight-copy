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
 *   1.8.0  `PortalSubscription`, `SubscriptionActionResult` and
 *          `PortalOnboardingInvite` (CRE-822, G5/G6): the recurring-plan card
 *          and the "complete your Brand Voice chat" banner on the project
 *          page, both of which used to be read off `brand-kit-intake`'s
 *          `resolve` action rather than this contract. Wholly new shapes --
 *          there is nothing optional to default, because a server older
 *          than this copy has no such actions at all, and the page already
 *          falls back to not drawing the card it would otherwise feed.
 *   1.7.0  `PaymentRow.projectId` and `.projectName` (CRE-831). Which project
 *          a payment is for, so the Payments tab can say it on the row,
 *          group the table by project and offer a project filter. Optional:
 *          absent is a server older than this copy, and null is a payment
 *          that is genuinely not filed under a project -- both draw in one
 *          "Other payments" group with no project named, which is the honest
 *          drawing of "we do not know" and of "there is nothing to know".
 *          A client with one project sees no grouping and no filter either
 *          way, because one group is a table.
 *   1.6.0  `HomeView.sharedDriveLinks` (CRE-827): the client's own shared-
 *          drive links, replacing the Files tab's upload button. A client may
 *          have more than one, each tagged to one of their projects --
 *          revised the same day it shipped, from a single link, once a
 *          client with two live projects needed two folders. Optional;
 *          absent or empty draws the same "no link yet" prompt a server
 *          older than this copy would, which is also what a licensee who has
 *          not adopted the Files plugin surface sees forever.
 *   1.5.0  `AccountAccessView` and `AccountAccessItem` (CRE-822, G4): the
 *          "Set Up Your Accounts" form, moved off the `/admin` jsonb column
 *          it used to read and write in clear. A server older than this
 *          copy has no such view; there is nothing optional to default,
 *          because the whole shape is new.
 *   1.4.0  `SharedLogin.projectId` and `.projectName`. Optional. Absent, or
 *          null, is a login that is not tied to one project -- the same
 *          drawing as a server older than this copy.
 *   1.3.0  Field coverage from the plugin's migration 009 (CRE-822):
 *          `HomeView.buildStartDate`, `.deliveryDate`, `.deliveryVideoUrl`;
 *          `SharedLogin.note` and `.sortOrder`; `AgreementView.versionGroupId`,
 *          `.paymentDueDays`, `.paymentTerms`, `.firstViewedAt`, `.declinedAt`
 *          and `.declineReason`. Every one of these existed on `/admin` with
 *          nowhere on the plugin to read it from, so a server older than this
 *          copy answers none of them -- drawn as null, same as an install
 *          that genuinely has nothing to say.
 *   1.2.0  `HomeView.projects` (CRE-776, Bree's decision of 28 Oct). The home
 *          screen lists the client's own projects rather than deriving one
 *          hero line from the first of them. Optional, so a frontend built
 *          against this copy renders nothing extra against a server that
 *          predates it instead of an empty card.
 *   1.1.0  `PortalBranding.monogram` (CRE-797). Optional; null means draw no
 *          tile at all. The tile beside the agency name was the two
 *          characters `C8` compiled into the component until this field
 *          existed, which put our mark on a licensee's client's screen.
 *   1.0.0  The four screens, mockups 13-16 (CRE-776).
 */
export const PORTAL_WIRE_VERSION = "1.8.0";

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

/**
 * One of the client's projects, as the home screen lists them.
 *
 * THE FIELD THAT SETTLED QUESTION 1 ON CRE-776. The home screen used to open
 * on a hero line, a target date and a "Latest from the team" feed, all three
 * of which are presentation with nowhere to be typed in: the plugin has no
 * editor for them and no mockup draws one, so on the plugin backend they were
 * simply absent. Bree's answer was to show what the system already knows
 * instead -- the client's current projects, and the tasks waiting on them.
 * Both are derived from records that exist, which is why neither needs a
 * screen somebody has to remember to fill in.
 *
 * Every field here is read from the project, and `name` is the project's own
 * name rather than anything composed for the client. Paperclip projects are
 * the source of truth; a second client-facing name would be a second thing to
 * keep true.
 */
export interface PortalProject {
  id: string;
  /** "Glowskin Studio website" -- the project's name, verbatim. */
  name: string;
  /**
   * What kind of work it is, in a client's words: "Website", "Automation".
   *
   * Null rather than the stored key when nothing maps. `site_preview` on a
   * client's screen is the same class of mistake as a monogram nobody chose:
   * correct in the database and meaningless to the person reading it.
   */
  kind: string | null;
  /** "In progress", "On hold". Null says nothing rather than guessing. */
  statusLabel: string | null;
  /**
   * Where the client opens it, or null to draw no link.
   *
   * Null is a real answer and not a missing one. The project page is the
   * `/admin` one -- the seam CRE-784 is about -- and it is addressed by an
   * `/admin` project id. A project that exists only in the plugin has no such
   * id until CP-6 has linked it, and a row with no link beats a link to a
   * page that 404s.
   */
  href: string | null;
  /** When it last moved, for "updated 3 days ago". Null when unknown. */
  updatedAt: string | null;
}

/**
 * A link to a shared drive folder the client keeps their files in (CRE-827).
 *
 * `clientProjectId` is required, not optional: this is never a general link
 * for the whole client the way the first version of this card shipped --
 * every link belongs to exactly one project, which is what lets the Files
 * tab on a project page show only the links that are actually for it, and
 * lets the board group them by project.
 */
export interface SharedDriveLink {
  id: string;
  clientProjectId: string;
  url: string;
}

/**
 * One row on the Audits tab (CRE-822, G8).
 *
 * Never carries a password, sealed or otherwise -- the gate at `/audit/:slug`
 * answers a boolean (`verify`) rather than a value this view could leak.
 * `subjectName` is free text on the row itself, not the client's name read
 * through a join: a report is sometimes about a site that is not the one the
 * client is named for.
 */
export interface PortalAudit {
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
  /**
   * The client's current projects, newest movement first. Archived ones are
   * not here: a portal is for work in flight.
   *
   * Optional for the reason the version note above gives, and not because an
   * empty list is unexpected -- a client between projects legitimately has
   * none, and the card then says so. Absent means "a server older than this
   * copy", and a reader draws no card at all rather than an empty one.
   */
  projects?: PortalProject[];
  /**
   * The client's own build-start and delivery dates, and the walkthrough
   * video once there is one -- CRE-822's three additions to the client row.
   *
   * `deliveryDate` is **not** `targetDate` below, and the two exist side by
   * side on purpose: `targetDate` is the date the project is currently being
   * told to expect and moves as the work does, while `deliveryDate` is what
   * was agreed. Collapsing them would let a slipped target rewrite the
   * promise with nothing recording that it had.
   *
   * Optional for the reason every field in this changelog entry is: a server
   * older than 1.3.0 answers none of the three, and absent draws what null
   * already draws here -- nothing extra, not an error.
   */
  buildStartDate?: string | null;
  deliveryDate?: string | null;
  deliveryVideoUrl?: string | null;
  /**
   * Where the client keeps their files now (CRE-827), one or more links,
   * each tagged to a project.
   *
   * Set by the client on the Files tab, read here and there alike. An empty
   * array means nothing has been pasted yet for any project -- the Files
   * tab's empty state, not an error. Optional for a server older than
   * 1.6.0, same drawing.
   */
  sharedDriveLinks?: SharedDriveLink[];
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
  /**
   * Groups this proposal with its earlier and later versions (CRE-822).
   * Null means a proposal that is its own family, which is never the same as
   * an id nobody has grouped -- it is never back-filled to this row's own id.
   */
  versionGroupId?: string | null;
  /** What the document itself states, not the materialised schedule. */
  paymentDueDays?: number | null;
  paymentTerms?: string | null;
  /**
   * The rest of `timeline` (CRE-822); `sentAt` above already carries the
   * send. `firstViewedAt` is the earliest view and `declinedAt` the latest
   * decline, both derived from the event trail rather than stored -- see
   * `docs/API.md`. All null on a draft, or on a server that predates them.
   */
  firstViewedAt?: string | null;
  declinedAt?: string | null;
  declineReason?: string | null;
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
  /**
   * The project this payment is for, and its name (CRE-831).
   *
   * Both optional, and null is as real an answer as a value: a one-off
   * charge, or a plan filed under no project, belongs to no project and is
   * drawn in its own group rather than attached to a guess. `projectName`
   * is resolved on the server from the client's own project list, so a row
   * naming a project that is not this client's resolves to null and the row
   * says nothing instead of lending it a name.
   */
  projectId?: string | null;
  projectName?: string | null;
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
  /**
   * The line under the label, written by whoever shared the login (CRE-822).
   * Not secret and not sealed -- the same decision `username` has had since
   * `001`, for the same reason: a field every list has to draw should not
   * need unsealing on every read.
   */
  note?: string | null;
  /**
   * Where this row sits when somebody has placed it. Null, not `0`, for an
   * unplaced row -- `0` is a real position, and folding the two together
   * would silently reorder every login nobody has touched.
   */
  sortOrder?: number | null;
  /**
   * The project this login is filed against, when it has one.
   *
   * Absent on a login that is not tied to a project, and absent on a server
   * older than 1.4.0. Both are drawn as a row with no project label.
   */
  projectId?: string | null;
  /** The project's name, for that label. Null when there is no project. */
  projectName?: string | null;
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
/* The account-access form (CRE-822, G4)                                       */
/* -------------------------------------------------------------------------- */

/** One account the agency asks a client to set up. A row, not code -- the
 * previous version of this form hardcoded four product names in two files
 * that had to agree with each other. */
export interface AccountAccessItem {
  key: string;
  label: string;
  description: string | null;
  helpUrl: string | null;
  required: boolean;
  /** Which `clients.tier` this applies to. Null means every tier. */
  tier: string | null;
  /** The parent item a sub-item (a social platform) belongs under. */
  parentKey: string | null;
  /**
   * True for an item answered with a saved login rather than a text field --
   * "Website access" is collected through `credentials`, never through
   * `fields`, so a password never lands in a plain column.
   */
  collectsSecret: boolean;
  sortOrder: number;
}

/**
 * The form as one client has answered it.
 *
 * `notes` never carries the text, on purpose: the field this form's own copy
 * tells a client to put a password in used to be read straight back out to
 * the browser, which meant a stolen portal session could read a password out
 * of the portal rather than only send one in. `present` says whether a note
 * exists; `credentialId` is where it lives, in the same vault -- and the
 * same reveal, with its reason and its re-authentication -- as every other
 * saved login. The textarea now draws "Sent 14 Oct -- replace it", the way
 * the Logins screen draws a row of dots.
 *
 * `complete` is computed fresh on every read from `items` and `checks`; it
 * is never stored. `submittedAt` is the stored event -- the first time the
 * form was ever complete -- and an untick afterwards does not clear it: the
 * submission really happened, and erasing the date of it because somebody
 * unchecked a box later is the bug this shape exists to not have.
 */
export interface AccountAccessView {
  checks: Record<string, boolean>;
  fields: Record<string, string>;
  notes: { present: boolean; credentialId: string | null };
  submittedAt: string | null;
  complete: boolean;
  updatedAt: string | null;
  /** Already filtered to this client's tier. Empty on an install with
   * nothing configured -- drawn as nothing to do, not as an error. */
  items: AccountAccessItem[];
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
 * The payment rows, in the groups the Payments tab draws (CRE-831).
 *
 * Bree asked for three things on 29 October and they are one shape: say which
 * project each payment is for, group the table by project, and let a client
 * filter to one project. The grouping is the data structure; the column and
 * the filter read off it.
 *
 * ORDER IS THE ROWS' OWN ORDER, NOT THE PROJECTS' NAMES. A group appears
 * where its earliest row appears, so the project with the next payment due is
 * the first thing a client reads. Sorting the groups alphabetically would put
 * a finished engagement above a bill due on Friday.
 *
 * The unfiled rows -- no project, or a project this client does not own --
 * come last, in one group with a null `projectId`. Last rather than first
 * because they are the ones a client has least context for.
 *
 * A single group is still a group: the caller decides whether to draw a
 * heading, and `ClientPayments` does not when there is only one, because a
 * heading over the whole table is a label and not a grouping.
 */
export function groupPaymentsByProject(
  rows: PaymentRow[],
): Array<{ projectId: string | null; projectName: string | null; rows: PaymentRow[] }> {
  const groups: Array<{ projectId: string | null; projectName: string | null; rows: PaymentRow[] }> =
    [];
  const byId = new Map<string, number>();
  let unfiled: number | null = null;

  for (const row of rows) {
    // A row with an id and no name is unfiled, deliberately: the name is the
    // only part of the group a client can read, so a group headed by a uuid
    // is worse than one headed "Other payments".
    const id = row.projectName ? (row.projectId ?? null) : null;
    if (id === null) {
      if (unfiled === null) {
        unfiled = groups.length;
        groups.push({ projectId: null, projectName: null, rows: [] });
      }
      groups[unfiled]!.rows.push(row);
      continue;
    }
    let at = byId.get(id);
    if (at === undefined) {
      at = groups.length;
      byId.set(id, at);
      groups.push({ projectId: id, projectName: row.projectName ?? null, rows: [] });
    }
    groups[at]!.rows.push(row);
  }

  // The unfiled group to the end, wherever it was met.
  if (unfiled !== null && unfiled !== groups.length - 1) {
    const [group] = groups.splice(unfiled, 1);
    groups.push(group!);
  }
  return groups;
}

/**
 * "Pay the deposit" as a row in Waiting on you.
 *
 * Bree named paying an invoice as one of the two things that belong in that
 * list (28 Oct), and it was the one missing: signing a proposal has always
 * produced a row, while a bill the client could pay today appeared only as
 * the Next payment card. That card is the amount; this is the task. A client
 * reading a list headed "Waiting on you · 1" was being told the money was
 * not one of the things waiting on them.
 *
 * The amount travels in the title because the two cards stack on a phone, so
 * the figure is a scroll away rather than beside it.
 *
 * HERE RATHER THAN IN `client-portal-shape.ts`, which is where the rest of
 * the composition lives, because the QA harness needs it too and cannot
 * reach a module outside `src`. A fixture that wrote this row out by hand is
 * a fixture that shows QA a row no server sends -- which is exactly what the
 * harness did before this moved: it read "Content milestone — overdue",
 * a sentence neither source has ever produced.
 *
 * `formatMoney` is a parameter for the same reason `instalmentSummary` takes
 * one: this contract does not own formatting, because the browser is the
 * only party that knows the reader's locale.
 *
 * `null` when nothing is payable -- an unbilled instalment is a plan, not a
 * task, and offering one sends a client to pay an amount nobody has asked
 * for.
 */
export function payWaitingItem(
  next: PaymentRow | null | undefined,
  clientId: string,
  formatMoney: (cents: number, currency: string) => string,
): WaitingItem | null {
  if (!next) return null;
  const amount = formatMoney(next.amountCents, next.currency);
  return {
    id: `invoice:${next.id}`,
    title:
      next.state === "overdue"
        ? `Pay ${next.label} · ${amount} — overdue`
        : `Pay ${next.label} · ${amount}`,
    icon: "pay",
    action: "Pay",
    href: `/portal/${encodeURIComponent(clientId)}/payments`,
    // `markFirstPrimary` decides this, and it hands the violet button to the
    // first row with a link. Proposals are pushed before this one, so
    // signing a contract outranks paying for it -- which is the right way
    // round, because the bill exists because of the contract.
    primary: false,
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

/* -------------------------------------------------------------------------- */
/* The recurring plan (CRE-822, G5)                                            */
/* -------------------------------------------------------------------------- */

/**
 * One billed plan, with no provider handle on it.
 *
 * `renewsOn` and `endsOn` are the same underlying date read through the
 * question a client is actually asking -- when a plan is set to stop, the
 * date is the last day of service; when it is not, the same date is the next
 * renewal. One column, two names, so no screen has to choose between "renews
 * 14 March" and "ends 14 March".
 *
 * `resumable` is computed by whichever source answered, not inferred here
 * from `cancelAtPeriodEnd`/`canceledAt` -- the two sources mean different
 * things by "cancelled". The plugin only ever asks a provider to stop at the
 * end of the paid period, so a plan it has not yet heard back about is still
 * resumable right up until `canceledAt` is actually set. The `/admin` bridge
 * still cancels immediately (see `cancel-subscription`), so a plan it shows
 * as cancelled is also, today, one SureCart will still let it un-cancel --
 * which is a real, different rule, and the reason this is a field on the row
 * rather than a formula the screen applies to both alike.
 */
export interface PortalSubscription {
  id: string;
  provider: string | null;
  planLabel: string | null;
  status: string | null;
  amountCents: number | null;
  currency: string | null;
  interval: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  renewsOn: string | null;
  endsOn: string | null;
  resumable: boolean;
}

/**
 * What `cancel` and `resume` both return: "we have asked", not "done".
 *
 * Neither action writes `status`, `cancelAtPeriodEnd` or `canceledAt` --
 * those belong to the payment provider and arrive on its webhook, so
 * `subscription` on this response is the row exactly as it still is. `message`
 * is written by the server rather than the screen, because the first screen
 * to decide for itself what `requested: true` means is the one that tells a
 * client their plan has stopped when it has not.
 */
export interface SubscriptionActionResult {
  subscription: PortalSubscription;
  requested: boolean;
  message: string;
}

/* -------------------------------------------------------------------------- */
/* Onboarding invites (CRE-822, G6)                                            */
/* -------------------------------------------------------------------------- */

/**
 * The "complete your Brand Voice chat" invite, as the project page shows it.
 *
 * `token` is present from an agency caller's create/list action, same as
 * everywhere else it is handed out deliberately. It is ALSO present when the
 * client reads their own still-open invite, which is a real and different
 * case from a board-wide list: nobody else's capability is in the response,
 * and the client cannot continue their own onboarding chat without it -- the
 * link was never delivered to this session any other way. `/admin` answers
 * this today (`legacy-source.ts`); the plugin's own read route for one
 * client never carries a token at all (`inviteToWire`, used by `GET
 * /clients/:clientId/onboarding-invites`), so a client on the plugin-backed
 * path sees the status but not a working link until that gap is closed --
 * flagged, not silently worked around. See `plugin-source.ts#onboardingInvite`.
 */
export interface PortalOnboardingInvite {
  id: string;
  token: string | null;
  clientId: string | null;
  businessName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  tier: string | null;
  note: string | null;
  expiresAt: string | null;
  revoked: boolean;
  expired: boolean;
  /** Not revoked, not expired, not already filled in. */
  live: boolean;
  lastOpenedAt: string | null;
  completedAt: string | null;
}
