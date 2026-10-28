// The QA harness's data, and the whole of its behaviour.
//
// Loaded only through a dynamic import from a branch that is dead unless
// `VITE_PORTAL_DEMO=1` was set at build time -- see `portalDemo.ts` for why
// the harness exists and what keeps it out of production. Nothing in this
// file is imported from any production path.
//
// TYPED AGAINST THE REAL WIRE CONTRACT, which is the point of it. Every
// fixture below is a `HomeView`/`AgreementsView`/`PaymentsView`/`LoginsView`
// from `clientPortalWire.ts` -- the same types the screens compile against
// and the same ones the edge function fills. So the harness cannot quietly
// drift into showing QA a shape the server stopped sending: the build fails
// the moment the contract changes under it. A hand-rolled JSON blob would
// have rotted silently, which is the usual fate of fixtures and the reason
// people stop trusting them.
//
// WHAT THE FIXTURES ARE CHOSEN FOR. Not a happy path. The screens are mostly
// lists, and what breaks a list is the awkward row, so the data carries the
// awkward rows on purpose: every `WaitingIcon`, every `PaymentState`, a
// proposal built here and a proposal that arrived as an uploaded PDF, a
// signed one and a declined one, a payment with a receipt and one without,
// a login request from an agent and one from a person, and -- for the 375px
// column Quinn could not reach -- labels and usernames long enough to
// overflow if anything is missing its wrapping rules.

import {
  initialsFor,
  ladder,
  stepPosition,
  type AgreementView,
  type AgreementsView,
  type HomeView,
  type LoginRequest,
  type LoginsView,
  type PaymentRow,
  type PaymentsView,
  type PortalBranding,
  type PortalMe,
  type SharedLogin,
  type SignRequest,
  type SignResult,
} from "@/lib/clientPortalWire";
import { PortalRequestError } from "@/lib/clientPortalApi";

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */
//
// Relative to the moment the harness loads, never fixed. A fixture dated
// 2026-10-28 reads as "Oct 28" forever and stops exercising `whenWord`'s
// Today/Yesterday branches the day after it is written -- so the one piece
// of formatting that distinguishes a live-looking portal from a dead one
// would be the piece no screenshot ever shows again.

const DAY = 86_400_000;
const START = Date.now();

function daysOut(days: number): string {
  return new Date(START + days * DAY).toISOString();
}

/* -------------------------------------------------------------------------- */
/* Who the demo client is                                                      */
/* -------------------------------------------------------------------------- */
//
// A made-up agency and a made-up client. No Cre8 Visions name, address or
// person anywhere in this file: a licensee runs this harness too, and a
// demo that greets their QA as us is a demo they have to fork before they
// can use it. `contactName` is set because mockups 14 and 16 draw the panel
// that reads it, and QA cannot review a panel that renders as its own
// fallback.

const BRANDING: PortalBranding = {
  agencyName: "Northhill Studio",
  contactName: "Rosa",
  replyWindow: "replies within a business day",
  contactEmail: "hello@example.invalid",
};

const ME: PortalMe = {
  clientId: "demo",
  displayName: "Maya Calder",
  businessName: "Glowskin Studio",
  initials: initialsFor("Maya Calder"),
};

/* -------------------------------------------------------------------------- */
/* Mutable state                                                               */
/* -------------------------------------------------------------------------- */
//
// A signature, a decline or a shared login has to stick, or the screen QA
// is reviewing snaps back under them mid-review and reads as a bug in the
// screen. Module scope, so a reload resets it -- which is the behaviour you
// want from a harness: every session starts from the same known board.

interface DemoState {
  agreements: AgreementView[];
  payments: PaymentRow[];
  logins: SharedLogin[];
  requests: LoginRequest[];
}

const state: DemoState = {
  agreements: [
    {
      // The one the screen opens on: awaiting a signature, built here, so
      // the sign panel renders with scope, line items and a deposit. This
      // is the row CRE-789's finding #1 is about.
      id: "ag-live",
      number: "NH-2026-034",
      title: "A website that books more cleanings",
      preparedFor: "Glowskin Studio",
      preparedBy: "Northhill Studio",
      sentAt: daysOut(-3),
      status: "sent",
      scopeHeading: "What we'll build",
      scopeBody:
        "Six pages — Home, Services, About, Team, New patients, Contact — with online booking and two rounds of revisions.",
      lineItems: [
        { description: "Website design & build", amountCents: 460_000 },
        { description: "Booking integration", amountCents: 60_000 },
      ],
      totalCents: 520_000,
      currency: "USD",
      instalmentSummary:
        "Deposit $2,080 today · $1,560 at design approval · $1,560 before launch",
      hasSourcePdf: false,
      hasSignedDocument: false,
      signedAt: null,
      signerName: null,
    },
    {
      // Arrived as an uploaded PDF: no scope, no line items. The upload path
      // stays alongside the builder, so half of real proposals look like
      // this and a harness that only had the other half would review the
      // screen at half coverage.
      id: "ag-pdf",
      number: "NH-2026-021",
      title: "Brand refresh — scope attached",
      preparedFor: "Glowskin Studio",
      preparedBy: "Northhill Studio",
      sentAt: daysOut(-26),
      status: "signed",
      scopeHeading: null,
      scopeBody: null,
      lineItems: [],
      totalCents: 180_000,
      currency: "USD",
      instalmentSummary: null,
      hasSourcePdf: true,
      hasSignedDocument: true,
      signedAt: daysOut(-24),
      signerName: "Maya Calder",
    },
    {
      // Declined, so the closed-agreement panel has something to draw.
      id: "ag-declined",
      number: "NH-2026-009",
      title: "Monthly content retainer",
      preparedFor: "Glowskin Studio",
      preparedBy: "Northhill Studio",
      sentAt: daysOut(-61),
      status: "declined",
      scopeHeading: "What we'll build",
      scopeBody: "Four posts a week, written and scheduled.",
      lineItems: [{ description: "Retainer, per month", amountCents: 90_000 }],
      totalCents: 90_000,
      currency: "USD",
      instalmentSummary: null,
      hasSourcePdf: false,
      hasSignedDocument: false,
      signedAt: null,
      signerName: null,
    },
  ],

  // One row per `PaymentState`, which is the whole point: "Ready to pay"
  // and "Later" are the two a client confuses, and they can only be
  // compared side by side.
  payments: [
    {
      id: "pay-1",
      label: "Deposit",
      dueOn: daysOut(-24),
      dueNote: null,
      amountCents: 208_000,
      currency: "USD",
      state: "paid",
      paidWith: "PayPal",
      paidAt: daysOut(-24),
      receiptUrl: "https://example.invalid/receipt/pay-1",
      payable: false,
    },
    {
      // Paid, but taken another way, so no receipt button is drawn. The
      // pair with the row above is what shows the absent button is a
      // decision rather than a bug.
      id: "pay-2",
      label: "Design approved",
      dueOn: daysOut(-9),
      dueNote: null,
      amountCents: 156_000,
      currency: "USD",
      state: "paid",
      paidWith: "Bank transfer",
      paidAt: daysOut(-8),
      receiptUrl: null,
      payable: false,
    },
    {
      id: "pay-3",
      label: "Content milestone",
      dueOn: daysOut(-2),
      dueNote: null,
      amountCents: 64_000,
      currency: "USD",
      state: "overdue",
      paidWith: null,
      paidAt: null,
      receiptUrl: null,
      payable: true,
    },
    {
      id: "pay-4",
      label: "Before launch",
      dueOn: daysOut(12),
      dueNote: null,
      amountCents: 156_000,
      currency: "USD",
      state: "ready",
      paidWith: null,
      paidAt: null,
      receiptUrl: null,
      payable: true,
    },
    {
      // A milestone rule with no date -- `dueNote` instead of `dueOn`, the
      // branch a date-only fixture never reaches.
      id: "pay-5",
      label: "Final handover",
      dueOn: null,
      dueNote: "When the site goes live",
      amountCents: 92_000,
      currency: "USD",
      state: "later",
      paidWith: null,
      paidAt: null,
      receiptUrl: null,
      payable: false,
    },
  ],

  // Invented services on reserved TLDs, not real ones. Two reasons, and the
  // second is the one a test pins: naming vendors inside a product we
  // license is the same trademark question as shipping their logos, and a
  // real URL in a fixture is a link a reviewer clicks straight off the
  // screen they were reviewing and onto somebody else's website.
  logins: [
    {
      id: "login-1",
      label: "Site host",
      username: "maya@glowskin.example",
      url: "https://account.sitehost.example",
      sharedAt: daysOut(-18),
      masked: "••••••••••",
    },
    {
      // Long label, long username, long URL. The 375px column is where this
      // either wraps or pushes the row off the screen, and it is exactly
      // what could not be checked without a harness.
      id: "login-2",
      label: "Email marketing — newsletter list (old agency account)",
      username: "studio.accounts.glowskin@longmailprovider.example",
      url: "https://login.mailtool.example/signin/with-account/very/long/path",
      sharedAt: daysOut(-11),
      masked: "••••••••••",
    },
    {
      // No username and no URL: both optional, both drawn by the row.
      id: "login-3",
      label: "Front desk iPad",
      username: null,
      url: null,
      sharedAt: daysOut(-4),
      masked: "••••••••••",
    },
  ],

  requests: [
    {
      // Asked by a person. Mockup 16's "<contact> asked for" panel.
      id: "req-1",
      label: "Business listing",
      note: "For the launch phase",
      requestedAt: daysOut(-2),
      urlHint: "listings.example",
      usernameHint: "the email it was set up with",
      askedByAgent: false,
    },
    {
      // Asked by an agent, which is shown rather than hidden -- a client is
      // entitled to know a machine asked for their password.
      id: "req-2",
      label: "Social account",
      note: null,
      requestedAt: daysOut(-1),
      urlHint: null,
      usernameHint: null,
      askedByAgent: true,
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Views                                                                       */
/* -------------------------------------------------------------------------- */

function homeView(): HomeView {
  const unpaid = state.payments.filter((row) => row.state !== "paid");
  const next = unpaid[0] ?? null;
  const signable = state.agreements.find((one) => one.status === "sent" || one.status === "viewed");

  const milestones = ladder([
    { key: "kickoff", label: "Kickoff", done: true },
    { key: "discovery", label: "Discovery", done: true },
    { key: "sitemap", label: "Sitemap", done: true },
    // "Words & design" is the client's wording for a phase called something
    // else internally, which is the case the wire contract calls out: the
    // label travels verbatim and is not derived from the key.
    { key: "copy_and_ux", label: "Words & design", done: true },
    { key: "build", label: "Build", done: false },
    { key: "review", label: "Your review", done: false },
    { key: "launch", label: "Launch", done: false },
  ]);
  // Through the same helper the server uses, rather than written down a
  // second time: a fixture whose "Step 5 of 7" disagreed with its own
  // progress bar would look like a bug in the screen.
  const step = stepPosition(milestones);

  return {
    branding: BRANDING,
    me: ME,
    headline: "Your new site is being built",
    stepNumber: step?.stepNumber ?? null,
    stepCount: step?.stepCount ?? null,
    targetDate: daysOut(16),
    milestones,
    // One row per `WaitingIcon`, with exactly one primary button.
    waitingOnYou: [
      ...(signable
        ? [
            {
              id: "todo-sign",
              title: `Review and sign ${signable.number}`,
              icon: "sign" as const,
              action: "Review and sign",
              href: "/portal/demo/agreements",
              primary: true,
            },
          ]
        : []),
      {
        id: "todo-upload",
        title: "Upload 6 treatment-room photos",
        icon: "upload" as const,
        action: "Upload",
        href: "/portal/demo/files",
        primary: false,
      },
      {
        id: "todo-review",
        title: "Check the homepage copy",
        icon: "review" as const,
        action: "Open",
        href: "/portal/demo/project",
        primary: false,
      },
      ...(next
        ? [
            {
              id: "todo-pay",
              title: `${next.label} — ${next.state === "overdue" ? "overdue" : "due soon"}`,
              icon: "pay" as const,
              action: "Pay",
              href: "/portal/demo/payments",
              primary: false,
            },
          ]
        : []),
      {
        // Informational: no href, so no button. The row that proves a
        // missing button is a decision.
        id: "todo-note",
        title: "We're waiting on your logo files from the printer",
        icon: null,
        action: "",
        href: null,
        primary: false,
      },
    ],
    nextPayment: next
      ? {
          invoiceId: next.id,
          amountCents: next.amountCents,
          currency: next.currency,
          label: next.label,
          dueOn: next.dueOn,
          providerName: "PayPal",
        }
      : null,
    // Both tones, and dated so `whenWord` renders Today and Yesterday.
    updates: [
      { id: "up-1", title: "Homepage draft is ready for you", occurredAt: daysOut(0), tone: "accent" },
      { id: "up-2", title: "Booking integration connected", occurredAt: daysOut(-1), tone: "positive" },
      { id: "up-3", title: "Sitemap approved", occurredAt: daysOut(-6), tone: "positive" },
    ],
  };
}

function agreementsView(): AgreementsView {
  return {
    branding: BRANDING,
    me: ME,
    agreements: state.agreements,
    signing: {
      consentText:
        "I've read the proposal and service agreement. Typing my name counts as my signature.",
      // More than one, so the style radiogroup renders. A single-style
      // fixture would hide that control from every screenshot.
      styles: [
        { key: "script", name: "Script", fontStack: "'Brush Script MT', cursive" },
        { key: "serif", name: "Serif", fontStack: "Georgia, 'Times New Roman', serif" },
        { key: "print", name: "Print", fontStack: "'Helvetica Neue', Arial, sans-serif" },
      ],
      defaultStyle: "script",
      hosted: false,
      depositProviderName: "PayPal",
      depositCents: 208_000,
    },
  };
}

function paymentsView(): PaymentsView {
  const totalCents = state.payments.reduce((sum, row) => sum + row.amountCents, 0);
  const paidCents = state.payments
    .filter((row) => row.state === "paid")
    .reduce((sum, row) => sum + row.amountCents, 0);
  const next = state.payments.find((row) => row.state !== "paid") ?? null;

  return {
    branding: BRANDING,
    me: ME,
    totalCents,
    paidCents,
    currency: "USD",
    next: next ? { amountCents: next.amountCents, dueOn: next.dueOn } : null,
    rows: state.payments,
    footnote: "Payments go straight to PayPal. We never see or store your card.",
  };
}

function loginsView(): LoginsView {
  return { branding: BRANDING, me: ME, logins: state.logins, requests: state.requests };
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

function sign(input: SignRequest): SignResult {
  const agreement = state.agreements.find((one) => one.id === input.proposalId);
  if (!agreement) throw new PortalRequestError(404, "not_found", "That agreement is not here.");

  // The same refusals the server makes. A harness that accepted a signature
  // the real server rejects would teach QA the wrong screen behaviour, and
  // consent is the one field an e-signature is worthless without.
  if (agreement.status !== "sent" && agreement.status !== "viewed") {
    throw new PortalRequestError(409, "not_signable", "That agreement is already closed.");
  }
  if (!input.consentGranted) {
    throw new PortalRequestError(400, "consent_required", "Tick the box to confirm you have read it.");
  }
  const signerName = input.signerName.trim();
  if (!signerName) {
    throw new PortalRequestError(400, "name_required", "Type your name to sign.");
  }

  const signedAt = new Date().toISOString();
  agreement.status = "signed";
  agreement.signedAt = signedAt;
  agreement.signerName = signerName;
  agreement.hasSignedDocument = true;

  const deposit = state.payments.find((row) => row.payable) ?? null;
  return {
    signedAt,
    nextHref: deposit ? "/portal/demo/payments" : null,
    depositInvoiceId: deposit?.id ?? null,
  };
}

function decline(proposalId: string): void {
  const agreement = state.agreements.find((one) => one.id === proposalId);
  if (!agreement) throw new PortalRequestError(404, "not_found", "That agreement is not here.");
  agreement.status = "declined";
}

function shareLogin(input: {
  requestId?: string | null;
  label?: string | null;
  url?: string | null;
  username?: string | null;
  secret: string;
}): void {
  // The secret is read, checked for presence, and dropped. It is never
  // stored, never echoed and never rendered -- the harness holds the same
  // line the product does, because a demo that showed a password back
  // would teach QA that reading one back is normal.
  if (!input.secret) {
    throw new PortalRequestError(400, "secret_required", "Enter the password to share it.");
  }

  const request = input.requestId
    ? state.requests.find((one) => one.id === input.requestId)
    : undefined;
  const label = (input.label ?? request?.label ?? "").trim();
  if (!label) throw new PortalRequestError(400, "label_required", "Give this login a name.");

  state.logins = [
    {
      id: `login-${state.logins.length + 1}-${Date.now()}`,
      label,
      username: input.username ?? null,
      url: input.url ?? null,
      sharedAt: new Date().toISOString(),
      masked: "••••••••••",
    },
    ...state.logins,
  ];
  if (request) state.requests = state.requests.filter((one) => one.id !== request.id);
}

function updateLogin(input: {
  id: string;
  label?: string;
  url?: string | null;
  username?: string | null;
}): void {
  const login = state.logins.find((one) => one.id === input.id);
  if (!login) throw new PortalRequestError(404, "not_found", "That login is not here.");
  if (input.label !== undefined) login.label = input.label;
  if (input.url !== undefined) login.url = input.url;
  if (input.username !== undefined) login.username = input.username;
}

function removeLogin(id: string): void {
  state.logins = state.logins.filter((one) => one.id !== id);
}

/* -------------------------------------------------------------------------- */
/* The transport                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A one-page PDF reading "Demo document".
 *
 * Real bytes rather than a stub string, because the download path builds a
 * Blob and hands it to the browser: a placeholder would open a viewer that
 * says the file is corrupt, and QA would have found a bug that is not there.
 */
const DEMO_PDF_BASE64 =
  "JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAw" +
  "IG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8" +
  "PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCAyMDAgMTAwXS9SZXNvdXJjZXM8" +
  "PC9Gb250PDwvRjEgNCAwIFI+Pj4+L0NvbnRlbnRzIDUgMCBSPj4KZW5kb2JqCjQgMCBvYmoKPDwv" +
  "VHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj4KZW5kb2JqCjUgMCBv" +
  "YmoKPDwvTGVuZ3RoIDQ0Pj4Kc3RyZWFtCkJUIC9GMSAxOCBUZiAyMCA0MCBUZCAoRGVtbyBkb2N1" +
  "bWVudCkgVGogRVQKZW5kc3RyZWFtCmVuZG9iagp0cmFpbGVyCjw8L1Jvb3QgMSAwIFI+PgolJUVP" +
  "Rgo=";

/**
 * Answers one `clientPortal` call from fixtures.
 *
 * Returns the same envelope `call()` in `clientPortalApi.ts` would have
 * parsed out of the edge function's response, and throws the same
 * `PortalRequestError` it would have thrown -- so every screen's error
 * handling is on the review path too, not just its happy state.
 */
export function demoCall<T>(action: string, body: Record<string, unknown>): T {
  switch (action) {
    case "home":
      return { view: homeView() } as T;
    case "agreements":
      return { view: agreementsView() } as T;
    case "payments":
      return { view: paymentsView() } as T;
    case "logins":
      return { view: loginsView() } as T;

    case "sign":
      return { result: sign(body as unknown as SignRequest) } as T;
    case "decline":
      decline(String(body.proposalId));
      return {} as T;

    case "checkout":
      // A real provider URL is a redirect off the portal, which would end
      // the review session. This goes to a page that exists and says what
      // happened instead.
      return { checkoutUrl: "https://example.invalid/checkout/demo" } as T;

    case "document":
      return {
        document: {
          form: "bytes",
          filename: `${String(body.proposalId ?? "document")}.pdf`,
          contentType: "application/pdf",
          contentBase64: DEMO_PDF_BASE64,
        },
      } as T;

    case "share-login":
      shareLogin(body as Parameters<typeof shareLogin>[0]);
      return {} as T;
    case "update-login":
      updateLogin(body as Parameters<typeof updateLogin>[0]);
      return {} as T;
    case "remove-login":
      removeLogin(String(body.id));
      return {} as T;

    default:
      // A new action that nobody taught the harness is a harness that
      // silently reviews less than it looks like it does. Loud instead.
      throw new PortalRequestError(
        501,
        "demo_unimplemented",
        `The demo harness has no answer for "${action}". Add one in portalDemoData.ts.`,
      );
  }
}
