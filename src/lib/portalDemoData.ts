// The QA harness's data, and the whole of its behaviour.
//
// Loaded only through a dynamic import from a branch that is dead unless
// `VITE_PORTAL_DEMO=1` was set at build time -- see `portalDemo.ts` for why
// the harness exists and what keeps it out of production. Nothing in this
// file is imported from any production path.
//
// TYPED AGAINST THE REAL WIRE CONTRACT, which is the point of it. Every
// fixture below is a `HomeView`/`AgreementsView`/`PaymentsView`/`LoginsView`
// from `clientPortalWire.ts`, or -- for Project and Files, CRE-819, which
// read three other endpoints directly instead -- the same types those call
// sites compile against (`ResolvedClient`/`ResolvedProjectRow`, `PhaseNode`,
// `ProjectFile`). So the harness cannot quietly drift into showing QA a
// shape the server stopped sending: the build fails the moment any of those
// contracts changes under it. A hand-rolled JSON blob would have rotted
// silently, which is the usual fate of fixtures and the reason people stop
// trusting them.
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
  monogramFor,
  payWaitingItem,
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
  type PortalProject,
  type SharedDriveLink,
  type SharedLogin,
  type SignRequest,
  type SignResult,
} from "@/lib/clientPortalWire";
import { money, PortalRequestError } from "@/lib/clientPortalApi";
// Type-only, so this stays what the test below checks it is: data, with no
// route to the browser's real client. `ResolvedClient`/`ResolvedProjectRow`
// and `ProjectFile` are erased at build time like every other type import --
// neither hook is ever called from here.
import type { ResolvedClient, ResolvedProjectRow } from "@/components/portal/useClientPortal";
import type { ProjectFile } from "@/components/portal/useClientFiles";
import { isDone, type PhaseNode } from "@/lib/journeyPhases";

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

const AGENCY_NAME = "Northhill Studio";

const BRANDING: PortalBranding = {
  agencyName: AGENCY_NAME,
  // Resolved the way the server resolves it, from an install that has
  // configured no mark -- so what QA reviews is the fallback a licensee
  // actually gets ("NS"), not a literal written for the harness. This is the
  // case CRE-797 was found in: the harness's made-up agency name is what made
  // a hardcoded `C8` visible, and a monogram pasted in here would have hidden
  // it again.
  monogram: monogramFor(null, AGENCY_NAME),
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
  /** CRE-827. Seeded with a sample link, tagged to `DEMO_PROJECT`, so the
   *  Files tab reviews in its "already set" state, same as the sent
   *  agreements and shared logins. */
  sharedDriveLinks: SharedDriveLink[];
}

const state: DemoState = {
  sharedDriveLinks: [
    { id: "sdl-demo-1", clientProjectId: "proj-main", url: "https://drive.example.invalid/folders/demo-glowskin-studio" },
  ],
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
    {
      // Superseded by a later version. The server collapses "voided" and
      // "superseded" into this one status (see `legacy-source.ts`), and it
      // is the row CRE-825's "closed-out versions" toggle hides by default.
      id: "ag-superseded",
      number: "NH-2025-098",
      title: "Logo refresh (v1)",
      preparedFor: "Glowskin Studio",
      preparedBy: "Northhill Studio",
      sentAt: daysOut(-210),
      status: "void",
      scopeHeading: "What we'll build",
      scopeBody: "A new logo mark and a one-page style sheet.",
      lineItems: [{ description: "Logo design", amountCents: 45_000 }],
      totalCents: 45_000,
      currency: "USD",
      instalmentSummary: null,
      hasSourcePdf: false,
      hasSignedDocument: false,
      signedAt: null,
      signerName: null,
    },
    {
      // Never answered in time. The other closed-out status the same
      // toggle hides, so the fixture set has both of the statuses that
      // line's "default" filter has to catch.
      id: "ag-expired",
      number: "NH-2025-071",
      title: "Holiday landing page",
      preparedFor: "Glowskin Studio",
      preparedBy: "Northhill Studio",
      sentAt: daysOut(-400),
      status: "expired",
      scopeHeading: "What we'll build",
      scopeBody: "A seasonal landing page with a countdown timer.",
      lineItems: [],
      totalCents: 35_000,
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
  // CRE-831: every payment but one names the project it is for, and the odd
  // one out is filed under none -- so the harness shows both the grouping and
  // the "Other payments" group, and the project filter appears at all. One
  // project across every row would draw neither, which is the state a
  // reviewer would wrongly read as the feature being absent.
  payments: [
    {
      id: "pay-1",
      projectId: "proj-main",
      projectName: "Glowskin Studio website",
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
      projectId: "proj-main",
      projectName: "Glowskin Studio website",
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
      projectId: "proj-main",
      projectName: "Glowskin Studio website",
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
      projectId: "proj-main",
      projectName: "Glowskin Studio website",
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
      // Filed under no project: a real shape, and the one that puts a second
      // group on the table.
      projectId: null,
      projectName: null,
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
      projectId: "demo-site",
      projectName: "Glowskin Studio website",
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

/**
 * The project list, with the three rows that break it.
 *
 * One with everything, one a client can see but not open, and one whose name
 * is long enough to need the wrap rule at 375px -- the width the row's `Open`
 * button gets pushed off if `min-width: 0` is ever dropped from
 * `.cp-projects__text`, which is the shape of CRE-796 on two other screens.
 *
 * The first row carries an `href` and the other two do not, which is the
 * difference the screen draws: one Open button and two rows without one.
 * Open goes to the redesigned project screen, the same path the server
 * builds.
 */
const PROJECTS: PortalProject[] = [
  {
    id: "proj-site",
    name: "Glowskin Studio website",
    kind: "Website",
    statusLabel: "In progress",
    href: "/portal/demo/project/demo-site",
    updatedAt: daysOut(-1),
  },
  {
    id: "proj-automation",
    name: "Booking reminders and review requests automation for the front desk",
    kind: "Automation",
    statusLabel: "Starting soon",
    href: null,
    updatedAt: null,
  },
  {
    // Every optional field empty: the row is a name and nothing else, which
    // is what a project the plugin can name and say nothing else about looks
    // like. It proves the meta line is omitted rather than rendered blank.
    id: "proj-bare",
    name: "Spring campaign",
    kind: null,
    statusLabel: null,
    href: null,
    updatedAt: null,
  },
];

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
  const payRow = payWaitingItem(next, "demo", money);

  return {
    branding: BRANDING,
    me: ME,
    projects: PROJECTS,
    sharedDriveLinks: state.sharedDriveLinks,
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
        // CRE-827: a client shares files from their own drive now, not an
        // upload button on this screen -- the waiting item sends them to
        // that link instead of a control that no longer exists.
        id: "todo-upload",
        title: "Share 6 treatment-room photos from your drive",
        icon: "upload" as const,
        action: "Open",
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
      // Composed by the function both sources call, not written out here.
      // This row used to read "Content milestone — overdue", which is a
      // sentence no server has ever sent: the harness was showing QA a row
      // that did not exist. It is also the row CRE-776's 28 Oct decision
      // added, so the demo was previewing it before the servers had it.
      ...(payRow ? [payRow] : []),
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
  return {
    branding: BRANDING,
    me: ME,
    logins: state.logins,
    requests: state.requests,
    // The demo harness answers `reveal-login` below (CRE-824), the same as
    // the admin-tables bridge it stands in for -- not the plugin, which
    // never can.
    canCopyPassword: true,
  };
}

/* -------------------------------------------------------------------------- */
/* Project and Files (CRE-819)                                                 */
/* -------------------------------------------------------------------------- */
//
// Neither screen is reached through `demoCall`. CRE-784/CRE-808 built them to
// read three other endpoints directly -- `brand-kit-intake`'s `resolve`, the
// `portal_project_phases` RPC, `client-files`' `list` -- so `demoable` alone
// rendered an empty page: `isDemoClient` had no answer at any of those three
// sites. These exports are that answer, one per site, imported the same
// dynamic way `demoCall` already is wherever a call site needs them --
// `useClientPortal.ts`, `ClientProject.tsx`, `useClientFiles.ts`.
//
// One project, not three: `useResolvedProject` redirects to a chooser the
// moment it sees more than one live project, and that chooser is not a
// screen this harness has fixtures for. The project ladder mirrors Home's
// milestones exactly -- same keys, same done/open split -- because it is
// the same client on the same journey, just read through a different door.

const DEMO_PROJECT: ResolvedProjectRow = {
  id: "proj-main",
  type: "web_development",
  name: "Glowskin Studio website",
  status: "active",
  updated_at: daysOut(-1),
};

/** `brand-kit-intake`'s `resolve`, narrowed to what `useResolvedProject` reads. */
export function demoResolveProject(): {
  client: ResolvedClient;
  contactEmail: string | null;
  projects: ResolvedProjectRow[];
} {
  return {
    client: {
      business_name: ME.businessName,
      contact_name: ME.displayName,
      tier: "standard",
      build_start_date: daysOut(-34).slice(0, 10),
      delivery_date: daysOut(16).slice(0, 10),
      delivery_video_url: null,
    },
    contactEmail: BRANDING.contactEmail,
    projects: [DEMO_PROJECT],
  };
}

/**
 * `portal_project_phases`, for "Where things stand".
 *
 * Same four keys and the same done/open line as `homeView`'s milestone
 * ladder -- "Build" is in progress on both screens, not just on the one
 * that was fixtured first.
 */
export function demoProjectPhases(): PhaseNode[] {
  return [
    { id: "ph-kickoff", key: "kickoff", label: "Kickoff", order_index: 0, status: "done", completed_at: daysOut(-34) },
    { id: "ph-discovery", key: "discovery", label: "Discovery", order_index: 1, status: "done", completed_at: daysOut(-27) },
    { id: "ph-sitemap", key: "sitemap", label: "Sitemap", order_index: 2, status: "done", completed_at: daysOut(-20) },
    { id: "ph-copy", key: "copy_and_ux", label: "Words & design", order_index: 3, status: "done", completed_at: daysOut(-10) },
    { id: "ph-build", key: "build", label: "Build", order_index: 4, status: "in_progress", started_at: daysOut(-6) },
    { id: "ph-review", key: "review", label: "Your review", order_index: 5, status: null },
    { id: "ph-launch", key: "launch", label: "Launch", order_index: 6, status: null },
  ];
}

/**
 * `client-files`' `list`, both directions.
 *
 * `file-brand-kit`'s name is the one this card exists for: long, and with
 * no space or hyphen for a narrow column to break on, which is exactly the
 * shape CRE-808's own fixture never had one of.
 */
export function demoProjectFiles(): ProjectFile[] {
  return [
    {
      id: "file-brand-kit",
      name: "Glowskin_Studio_Brand_Guidelines_FINAL_v3_approved_2026.pdf",
      size_bytes: 2_458_112,
      mime: "application/pdf",
      direction: "to_client",
      category: "Brand kit",
      uploaded_by_name: AGENCY_NAME,
      visible_to_client: true,
      created_at: daysOut(-5),
      status: "stored",
      downloadable: true,
    },
    {
      // A previewable image, so the row's name renders as the clickable
      // button variant and not just the plain one above.
      id: "file-homepage-mock",
      name: "Homepage mockup.png",
      size_bytes: 812_000,
      mime: "image/png",
      direction: "to_client",
      category: "Design",
      uploaded_by_name: AGENCY_NAME,
      visible_to_client: true,
      created_at: daysOut(-1),
      status: "stored",
      downloadable: true,
    },
    {
      // The one row in "Sent by you", so that list is not empty either.
      id: "file-treatment-room-1",
      name: "treatment-room-1.jpg",
      size_bytes: 1_240_000,
      mime: "image/jpeg",
      direction: "from_client",
      category: null,
      uploaded_by_name: ME.displayName,
      visible_to_client: true,
      created_at: daysOut(-2),
      status: "stored",
      downloadable: true,
    },
  ];
}

/**
 * Where `open()` sends the demo harness for one file, since CRE-822 stopped
 * `demoProjectFiles` carrying a link of its own -- a list never does, in the
 * harness or out of it. Kept beside the fixture rather than on it, because
 * `ProjectFile` is the real wire shape and a link is not part of it.
 */
const DEMO_FILE_URLS: Record<string, string> = {
  "file-brand-kit": "https://example.invalid/files/brand-guidelines.pdf",
  "file-homepage-mock": "https://example.invalid/files/homepage-mockup.png",
  "file-treatment-room-1": "https://example.invalid/files/treatment-room-1.jpg",
};

export function demoFileUrl(id: string): string | null {
  return DEMO_FILE_URLS[id] ?? null;
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

/**
 * Passwords for the harness, kept off the view.
 *
 * The list fixture carries a mask. Copy asks `reveal-login`, which is the
 * only action that reads this map. A reviewer who stringifies a view will
 * not find a password in it.
 */
const demoPasswords = new Map<string, string>([
  ["login-1", "not-a-real-host-password"],
  ["login-2", "not-a-real-mail-password"],
  ["login-3", "not-a-real-ipad-password"],
]);

function shareLogin(input: {
  requestId?: string | null;
  label?: string | null;
  url?: string | null;
  username?: string | null;
  secret: string;
}): void {
  if (!input.secret) {
    throw new PortalRequestError(400, "secret_required", "Enter the password to share it.");
  }

  const request = input.requestId
    ? state.requests.find((one) => one.id === input.requestId)
    : undefined;
  const label = (input.label ?? request?.label ?? "").trim();
  if (!label) throw new PortalRequestError(400, "label_required", "Give this login a name.");

  const id = `login-${state.logins.length + 1}-${Date.now()}`;
  demoPasswords.set(id, input.secret);
  state.logins = [
    {
      id,
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
  demoPasswords.delete(id);
}

function revealLogin(id: string): { ok: true; password: string | null } {
  const login = state.logins.find((one) => one.id === id);
  if (!login) {
    throw new PortalRequestError(404, "not_found", "That login could not be found.");
  }
  return { ok: true, password: demoPasswords.get(id) ?? null };
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
    case "reveal-login":
      return revealLogin(String(body.id)) as T;

    case "create-shared-drive-link": {
      const link: SharedDriveLink = {
        id: `sdl-demo-${state.sharedDriveLinks.length + 1}`,
        clientProjectId: String(body.clientProjectId ?? ""),
        url: String(body.url ?? ""),
      };
      state.sharedDriveLinks.push(link);
      return { sharedDriveLink: link } as T;
    }
    case "remove-shared-drive-link":
      state.sharedDriveLinks = state.sharedDriveLinks.filter((link) => link.id !== String(body.id));
      return {} as T;

    case "project-phases":
      // Same fixture `demoProjectPhases()` always was, through the same
      // `ladder()` the real sources now answer with -- one path, so the
      // harness and production agree on what "Build is in progress" means.
      return {
        milestones: ladder(
          demoProjectPhases().map((node) => ({
            key: node.key,
            label: node.label,
            done: isDone(node),
          })),
        ),
      } as T;

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
