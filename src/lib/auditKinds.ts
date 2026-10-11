// What kinds of audit exist, and which project types each one applies to.
//
// The catalogue is here rather than in the database because it is a
// product decision, not client data: adding "Core Web Vitals" to the list
// is a code change with a review, and an agent inventing an audit kind at
// 3am is not. The client_audits row stores the KEY; this says what the
// key means.
//
// Pure and tested because the applicability map is the whole feature —
// showing a marketing client an "App store readiness" audit, or hiding
// the security audit from the web project that needs it most, both look
// completely normal on screen.

export interface AuditKind {
  key: string;
  label: string;
  /** One line, shown where there is room for it. */
  blurb: string;
  /** The tinted square's fill and glyph colour. */
  bg: string;
  fg: string;
  /** Project types this audit is offered for. Empty means every type. */
  appliesTo: string[];
}

const WEB = "web_development";
const APP = "app_development";
const MKT = "marketing";
const AUTO = "automation_build";
const PREVIEW = "site_preview";

/**
 * The catalogue. Confirm or edit this list — it is the one thing here
 * that is a guess rather than a reading of the spec, and it is meant to
 * be edited rather than generated.
 */
export const AUDIT_KINDS: AuditKind[] = [
  { key: "security", label: "Security audit", blurb: "Exposed endpoints, out-of-date plugins, and anything a stranger could reach.",
    bg: "#FBE9E7", fg: "#A32A1C", appliesTo: [WEB, APP, AUTO] },
  { key: "performance", label: "Speed and performance", blurb: "How fast it loads, and what is slowing it down.",
    bg: "#E7EEFF", fg: "#2447C0", appliesTo: [WEB, APP, PREVIEW] },
  { key: "seo", label: "Search visibility (SEO)", blurb: "Whether people searching for this can find it.",
    bg: "#E5F6EC", fg: "#17703D", appliesTo: [WEB, MKT, PREVIEW] },
  { key: "accessibility", label: "Accessibility", blurb: "Whether everyone can use it, including with a screen reader.",
    bg: "#F3E8FF", fg: "#6B2FB8", appliesTo: [WEB, APP, PREVIEW] },
  { key: "mobile", label: "Mobile experience", blurb: "How it behaves on a phone, not just a laptop.",
    bg: "#FFF1E3", fg: "#A8440A", appliesTo: [WEB, PREVIEW] },
  { key: "links", label: "Broken links and errors", blurb: "Dead links, missing pages and server errors.",
    bg: "#FBE9E7", fg: "#A32A1C", appliesTo: [WEB, PREVIEW] },
  { key: "analytics", label: "Analytics and tracking", blurb: "Whether what happens on the site is actually being measured.",
    bg: "#E7EEFF", fg: "#2447C0", appliesTo: [WEB, APP, MKT, AUTO] },
  { key: "privacy", label: "Data and privacy", blurb: "What data is collected, where it goes, and what you must disclose.",
    bg: "#EEF0F5", fg: "#3D4556", appliesTo: [WEB, APP, AUTO] },
  { key: "content", label: "Content review", blurb: "Whether the words still say what the business does.",
    bg: "#E5F6EC", fg: "#17703D", appliesTo: [WEB, MKT, PREVIEW] },
  { key: "brand", label: "Brand consistency", blurb: "Whether it looks like one company across every surface.",
    bg: "#F3E8FF", fg: "#6B2FB8", appliesTo: [WEB, MKT, PREVIEW] },
  { key: "email", label: "Email deliverability", blurb: "SPF, DKIM and whether your email reaches the inbox.",
    bg: "#FFF1E3", fg: "#A8440A", appliesTo: [MKT, AUTO] },
  { key: "social", label: "Social presence", blurb: "What the profiles say, and whether they are still live.",
    bg: "#E7EEFF", fg: "#2447C0", appliesTo: [MKT] },
  { key: "store", label: "App store readiness", blurb: "Listing, screenshots, permissions and review-guideline risks.",
    bg: "#F3E8FF", fg: "#6B2FB8", appliesTo: [APP] },
  { key: "integrations", label: "Integration health", blurb: "Whether the connected tools are still talking to each other.",
    bg: "#EEF0F5", fg: "#3D4556", appliesTo: [AUTO, MKT] },
];

const BY_KEY = new Map(AUDIT_KINDS.map((k) => [k.key, k]));

const UNKNOWN: Omit<AuditKind, "key" | "label"> = {
  blurb: "", bg: "#EEF0F5", fg: "#3D4556", appliesTo: [],
};

/**
 * A kind by key.
 *
 * An unrecognised key keeps its own text rather than disappearing: a row
 * already in the database for an audit nobody has catalogued is still a
 * report the client paid for, and hiding it is worse than showing it
 * under an ugly name.
 */
export function auditKind(key: string | null | undefined): AuditKind {
  const k = (key ?? "").trim().toLowerCase();
  const known = BY_KEY.get(k);
  if (known) return known;
  return { key: k, label: humanise(k), ...UNKNOWN };
}

function humanise(key: string): string {
  if (!key) return "Audit";
  const words = key.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The audits offered for a project of this type. */
export function kindsForProjectType(type: string | null | undefined): AuditKind[] {
  const t = (type ?? "").trim().toLowerCase();
  // An unknown project type gets everything rather than nothing. A new
  // project type should not silently have no audits available — that
  // reads as "we do not audit this", which is a claim nobody made.
  if (!t || !KNOWN_TYPES.has(t)) return AUDIT_KINDS;
  return AUDIT_KINDS.filter((k) => k.appliesTo.length === 0 || k.appliesTo.includes(t));
}

const KNOWN_TYPES = new Set([WEB, APP, MKT, AUTO, PREVIEW]);

/**
 * Two different questions, and they must not be confused:
 *
 *   kindsForProjectType — which audits are OFFERED for a project of this
 *   type. This is the filter Bree asked for: fourteen in the catalogue,
 *   only the relevant ones on a given project.
 *
 *   Which audits a project SHOWS — every row attached to it, whatever
 *   its kind. A report that was run was run deliberately, and filtering
 *   stored audits by type is how a client stops seeing a report they
 *   were sent last month.
 */
