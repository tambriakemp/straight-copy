// The Cre8 Visions proposal: its locked structure, its voice, and how it renders.
//
// The structure is the product. A proposal that reorders or merges sections is
// not a Cre8 Visions proposal, so the section list lives here as data rather
// than as prose the model might paraphrase — the same array both instructs the
// model and drives the renderer, which means a section the agent invents has
// nowhere to render and a section it drops shows up as an obvious gap.
//
// Cover and Contents are chrome: the cover is rendered from structured fields,
// the contents from this array. The fourteen sections below are the document.

export interface ProposalSection {
  key: string;
  /** Printed heading. The eyebrow is "NN — HEADING" in caps. */
  heading: string;
  /** One line for the table of contents, and the brief for the model. */
  purpose: string;
}

export const PROPOSAL_SECTIONS: ProposalSection[] = [
  { key: "opportunity", heading: "The Opportunity", purpose: "Why this project exists — the client's world, their situation, the vision." },
  { key: "summary", heading: "Project Summary", purpose: "Investment, timeline and installments up front, what they are receiving, engagement details." },
  { key: "building", heading: "What We're Building", purpose: "The product itself, broken into surfaces and components, ending with the AI layer." },
  { key: "approach", heading: "The Strategic Approach", purpose: "The thesis. The one strategic decision that is contrarian but right, and why." },
  { key: "ai", heading: "AI in Development", purpose: "How AI compresses timeline and cost, where it is used, how its cost is handled." },
  { key: "process", heading: "The Process", purpose: "Three phases. Each with what happens, deliverables, and review and sign-off." },
  { key: "investment", heading: "Investment & Payment Schedule", purpose: "Pricing, the installment breakdown, payment methods, late payment terms." },
  { key: "included", heading: "What's Included", purpose: "The full deliverables list, phase by phase." },
  { key: "not_included", heading: "What's Not Included", purpose: "Scope carve-outs: operational costs, content and marketing, ongoing services, out-of-scope features." },
  { key: "ownership", heading: "Ownership & IP", purpose: "What transfers on final payment, what Cre8 Visions retains, third-party components." },
  { key: "revisions", heading: "Revisions & Change Orders", purpose: "Design-phase revisions, development-phase revisions, how change orders work." },
  { key: "support", heading: "Post-Launch Support", purpose: "The 30-day warranty, and the options after it — retainer or marketing plan." },
  { key: "terms", heading: "Terms & Conditions", purpose: "Confidentiality, data and privacy, cancellation, communication, liability, governing law." },
  { key: "acceptance", heading: "Acceptance", purpose: "What signing means. The signature blocks themselves are added by the portal." },
];

export const PROJECT_TYPES = [
  "automation_build",
  "site_preview",
  "app_development",
  "web_development",
  "marketing",
] as const;

/** Warm neutrals and bronze. Never introduce a colour that isn't here. */
export const PALETTE = {
  cream: "#F5F2EE",
  warmWhite: "#FAFAF8",
  stone: "#C8C0B4",
  taupe: "#A89F94",
  charcoal: "#2A2825",
  ink: "#1A1916",
  mist: "#E8E4DF",
  sand: "#D4CCBF",
  bronze: "#8B7355",
  softGray: "#9A938A",
} as const;

/**
 * The writing brief. Stable text — it sits in the cached prompt prefix, so it
 * must never carry a date, a client name, or anything else that varies.
 */
export const PROPOSAL_DNA = `## How a Cre8 Visions proposal is written

**Structure is locked.** Exactly these fourteen sections, in this order, no
additions, no merges, no reordering:

${PROPOSAL_SECTIONS.map((s, i) => `${String(i + 1).padStart(2, "0")}. ${s.heading} — ${s.purpose}`).join("\n")}

**Voice.** Editorial, not sales-y. Confident, not humble — "This delivers", never
"we believe this could potentially deliver". Reasoned, not asserted: every
strategic claim is followed by why. Warm but not casual — this is a business
document. No exclamation marks, no emoji.

Never write: "we're passionate about", "our team of experts", "cutting-edge",
"world-class", "best-in-class", "innovative", "revolutionary", "game-changing",
"disruptive". Never write a sentence that could appear on any agency's website.
Never write a bullet that is a bare fragment — every bullet is a bold label, an
em-dash, then the explanation.

**Patterns that carry the voice.** Open a section with a one-sentence lead that
sets the frame. Use "Here's why this matters" to turn into a strategic argument.
Use named, real comparisons rather than vague appeals to authority. Close a
strategic argument with a bottom-line box that states the conclusion plainly.

**The thesis is not optional.** Section 04 is the whole reason a client picks
this engagement over another: the one strategic decision that is contrarian or
counterintuitive but right, argued rather than asserted. If you do not have one,
do not invent filler — ask: "What is the one strategic decision here that most
people would get wrong?"

**Never guess terms.** Total investment, installment split, timeline, phase
sequence, warranty period, governing law, AI cost handling and revisions policy
are commercial commitments. If you have not been told one, ask. A proposal with
an invented price is worse than no proposal.

Defaults you may assume unless told otherwise, and should state you assumed:
30-day warranty, Georgia governing law, two rounds of design revisions, app
store submission handled for app builds.

## Section body format

Each section body is markdown. Use \`##\` for sub-headings inside a section,
\`-\` for bullets, and \`>\` for a bottom-line box. Do not repeat the section
heading inside its own body.`;

/** What the model must be told before it can ask the right questions. */
export const INTAKE_CHECKLIST = `Before writing, you need all of this. Ask for whatever is missing, in one
message rather than one question at a time:

  * Client — name and entity, their title, new or long-standing, and any prior
    work or existing assets this builds on or replaces.
  * Project — its name, what it is in one sentence, who uses it, the core scope
    in plain language, any named tech stack, rough screen count, and whether
    there is more than one audience.
  * Terms — total investment, how many installments and how they split, timeline
    in weeks, the phase sequence, warranty period, governing law, who covers AI
    running costs, and the revisions policy.
  * Thesis — the one strategic decision that differentiates this engagement.

If the owner gives you most of it, do not stall on the rest: write the proposal,
and say plainly at the top of your reply which fields you assumed and which you
still need before it can go out.`;

export interface ProposalContent {
  cover?: {
    client_name?: string;
    project_name?: string;
    tagline?: string;
    prepared_for?: string;
    prepared_by?: string;
    date?: string;
  };
  sections?: Array<{ key?: string; heading?: string; body?: string }>;
}

/** Which locked sections a draft is missing. Empty means the spine is intact. */
export function missingSections(content: ProposalContent): string[] {
  const present = new Set(
    (content.sections ?? [])
      .filter((s) => (s.body ?? "").trim().length > 0)
      .map((s) => s.key),
  );
  return PROPOSAL_SECTIONS.filter((s) => !present.has(s.key)).map((s) => s.key);
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Minimal markdown → HTML for section bodies. Deliberately not a full parser:
 * the brief above tells the model to use exactly these four constructs, and a
 * narrow renderer makes it obvious when it hasn't.
 */
function mdToHtml(md: string): string {
  const out: string[] = [];
  let list: string[] = [];
  let quote: string[] = [];

  const flushList = () => {
    if (list.length) { out.push(`<ul>${list.join("")}</ul>`); list = []; }
  };
  const flushQuote = () => {
    if (quote.length) { out.push(`<blockquote>${quote.join(" ")}</blockquote>`); quote = []; }
  };
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");

  for (const rawLine of md.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) { flushList(); flushQuote(); continue; }
    if (line.startsWith("## ")) {
      flushList(); flushQuote();
      out.push(`<h3>${inline(line.slice(3).trim())}</h3>`);
    } else if (/^[-*]\s+/.test(line)) {
      flushQuote();
      list.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`);
    } else if (line.startsWith(">")) {
      flushList();
      quote.push(inline(line.replace(/^>\s?/, "")));
    } else {
      flushList(); flushQuote();
      out.push(`<p>${inline(line.trim())}</p>`);
    }
  }
  flushList(); flushQuote();
  return out.join("");
}

/**
 * Render a proposal to self-contained HTML for the portal and for print.
 *
 * Styles are inlined in a single <style> block rather than pulled from the app
 * so the same markup survives being printed to PDF or pasted into an email
 * without the palette drifting.
 */
export function renderProposalHtml(title: string, content: ProposalContent): string {
  const cover = content.cover ?? {};
  const byKey = new Map(
    (content.sections ?? []).map((s) => [s.key ?? "", s]),
  );

  const toc = PROPOSAL_SECTIONS.map(
    (s, i) =>
      `<li><span class="num">${String(i + 1).padStart(2, "0")}</span><span class="h">${esc(s.heading)}</span><span class="p">${esc(s.purpose)}</span></li>`,
  ).join("");

  const body = PROPOSAL_SECTIONS.map((s, i) => {
    const found = byKey.get(s.key);
    const text = (found?.body ?? "").trim();
    return `<section class="sec">
      <p class="eyebrow">${String(i + 1).padStart(2, "0")} — ${esc(s.heading).toUpperCase()}</p>
      <h2>${esc(found?.heading || s.heading)}</h2>
      <hr />
      ${text ? mdToHtml(text) : `<p class="gap">This section has not been written yet.</p>`}
    </section>`;
  }).join("");

  return `<article class="cv-proposal">
<style>
.cv-proposal { color: ${PALETTE.charcoal}; background: ${PALETTE.warmWhite}; font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 1.65; }
.cv-proposal .cover { padding: 48px 0 40px; border-bottom: 1px solid ${PALETTE.sand}; }
.cv-proposal .wordmark { color: ${PALETTE.bronze}; font-size: 11px; letter-spacing: .18em; text-transform: uppercase; font-weight: 700; margin: 0 0 24px; }
.cv-proposal h1 { font-family: Georgia, 'Times New Roman', serif; font-size: 44px; line-height: 1.1; color: ${PALETTE.ink}; margin: 0 0 12px; font-weight: 400; }
.cv-proposal .tagline { font-family: Georgia, serif; font-style: italic; font-size: 19px; color: ${PALETTE.taupe}; margin: 0 0 28px; }
.cv-proposal .meta { font-size: 12px; color: ${PALETTE.softGray}; letter-spacing: .04em; }
.cv-proposal .meta strong { color: ${PALETTE.charcoal}; font-weight: 600; }
.cv-proposal .toc { list-style: none; padding: 0; margin: 32px 0 0; }
.cv-proposal .toc li { display: grid; grid-template-columns: 40px 1fr; gap: 4px 12px; padding: 10px 0; border-bottom: 1px solid ${PALETTE.mist}; }
.cv-proposal .toc .num { color: ${PALETTE.bronze}; font-size: 12px; font-weight: 700; letter-spacing: .08em; }
.cv-proposal .toc .h { font-family: Georgia, serif; font-size: 17px; color: ${PALETTE.ink}; }
.cv-proposal .toc .p { grid-column: 2; font-size: 13px; color: ${PALETTE.taupe}; }
.cv-proposal .sec { padding: 40px 0 8px; }
.cv-proposal .eyebrow { color: ${PALETTE.bronze}; font-size: 11px; font-weight: 700; letter-spacing: .18em; margin: 0 0 10px; }
.cv-proposal h2 { font-family: Georgia, serif; font-weight: 400; font-size: 32px; line-height: 1.15; color: ${PALETTE.ink}; margin: 0 0 16px; }
.cv-proposal h3 { font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: ${PALETTE.ink}; margin: 28px 0 10px; }
.cv-proposal hr { border: 0; border-top: 1px solid ${PALETTE.sand}; margin: 0 0 22px; }
.cv-proposal p { margin: 0 0 14px; }
.cv-proposal ul { margin: 0 0 16px; padding-left: 18px; }
.cv-proposal li { margin: 0 0 8px; }
.cv-proposal li::marker { color: ${PALETTE.bronze}; }
.cv-proposal blockquote { margin: 20px 0; padding: 18px 22px; background: ${PALETTE.cream}; border-left: 4px solid ${PALETTE.bronze}; font-family: Georgia, serif; font-style: italic; font-size: 17px; color: ${PALETTE.ink}; }
.cv-proposal .gap { color: ${PALETTE.softGray}; font-style: italic; }
</style>
<header class="cover">
  <p class="wordmark">Cre8 Visions · Proposal · Confidential</p>
  <h1>${esc(cover.project_name || title)}</h1>
  ${cover.tagline ? `<p class="tagline">${esc(cover.tagline)}</p>` : ""}
  <p class="meta">
    ${cover.prepared_for ? `Prepared for <strong>${esc(cover.prepared_for)}</strong>` : ""}
    ${cover.prepared_by ? ` · Prepared by <strong>${esc(cover.prepared_by)}</strong>` : ""}
    ${cover.date ? ` · ${esc(cover.date)}` : ""}
  </p>
</header>
<nav><ol class="toc">${toc}</ol></nav>
${body}
</article>`;
}
