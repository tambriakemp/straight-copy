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

/** The build spine: fixed-scope project work, sold once. */
export const BUILD_SECTIONS: ProposalSection[] = [
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

/**
 * The retainer spine: ongoing marketing work, sold monthly.
 *
 * A retainer is a different document from a build, not a build with the
 * sections renamed. Nobody buying monthly marketing cares about phase sign-off
 * or IP transfer; they care what lands each month, what it costs, what is
 * passed through at cost, and what the first ninety days look like. Forcing it
 * into the build spine produced proposals with four empty sections and no
 * month-by-month, which is the part clients actually read.
 */
export const RETAINER_SECTIONS: ProposalSection[] = [
  { key: "overview", heading: "Overview", purpose: "What the client is building and why this work matters now. Ends by naming how the tactics compound into one outcome." },
  { key: "goals", heading: "Goals & Objectives", purpose: "Five or six concrete outcomes this retainer is bought to produce. Each one measurable." },
  { key: "services", heading: "Scope of Services", purpose: "Every service, numbered. Each opens with its budget and deliverable on one line, then a paragraph on what it is and why it works, then labelled detail rows." },
  { key: "investment", heading: "Investment Summary", purpose: "The retainer table: service, monthly deliverable, investment. Pass-through costs stated separately, at cost, no markup." },
  { key: "timeline", heading: "What to Expect — Month by Month", purpose: "Month 1 Foundation, Month 2 Momentum, Month 3 and beyond Growth. What actually happens, not what is promised." },
  { key: "why_us", heading: "Why Cre8 Visions", purpose: "Why this agency for this work. Short. Ends on working in the client's voice, not the agency's." },
  { key: "terms", heading: "Terms & Next Steps", purpose: "Retainer amount and billing date, pass-throughs, contract term, notice period, onboarding start, reporting cadence, and how to say yes." },
];

export type ProposalKind = "build" | "retainer";

export const SPINES: Record<ProposalKind, ProposalSection[]> = {
  build: BUILD_SECTIONS,
  retainer: RETAINER_SECTIONS,
};

export function spineFor(kind: string | undefined | null): ProposalSection[] {
  return SPINES[(kind as ProposalKind)] ?? BUILD_SECTIONS;
}

/** Back-compat alias. Existing callers that predate the retainer spine. */
export const PROPOSAL_SECTIONS = BUILD_SECTIONS;

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

### Pick the spine first

Two shapes, and they are different documents — not one document with sections
renamed.

**BUILD** — fixed-scope project work, sold once, with a total and installments.
An app, a site, an automation. Fourteen sections, in this order, no additions,
no merges, no reordering:

${BUILD_SECTIONS.map((s, i) => `${String(i + 1).padStart(2, "0")}. ${s.heading} — ${s.purpose}`).join("\n")}

**RETAINER** — ongoing work, sold monthly. Marketing, social, content, ads,
community. Seven sections:

${RETAINER_SECTIONS.map((s, i) => `${String(i + 1).padStart(2, "0")}. ${s.heading} — ${s.purpose}`).join("\n")}

Anything with a monthly figure, a channel list, or a per-month cadence is a
retainer. Anything with a total and phases is a build. Set \`kind\` accordingly.

### Infer. Do not interrogate.

You will usually be given a rough brain-dump: a price, a list of tactics,
maybe a budget or two. That is enough. A list like "5 SEO articles a month,
2 reels + 2 statics a week, 1 email a week, $300 Facebook ads" already tells
you the services, their cadence, which costs pass through, what the goals are,
and what months one to three look like. Work all of that out yourself.

What you infer without asking:
  * Goals, from what the tactics are obviously for.
  * The service list and its order — highest-leverage first, not the order they
    were mentioned.
  * Which line items are pass-through (ad spend, influencer budget, tools the
    client keeps) versus included in the fee.
  * The month-by-month: foundation, then momentum, then growth.
  * Article topics, content mixes, targeting, campaign types, platform splits.
  * Everything covered by the standing rules you were given.

What you ask about — and only when it is genuinely absent and you cannot
responsibly guess:
  * A price nobody has stated.
  * Which client or project this is for, when it is ambiguous.
  * A commercial term the standing rules do not already fix.

One round of questions, maximum, and put them as multiple choice with your
recommended answer first wherever the answer is a choice rather than a number.
If you can write the proposal with two assumptions and one open question, do
that: write it, state the assumptions plainly at the top of your reply, and ask
the one question. A proposal she can edit beats an interview she has to sit
through.

The one thing never to invent is a price. If no figure has been given anywhere,
ask — a proposal with a made-up number is worse than no proposal.

### Voice

Editorial, not sales-y. Confident, not humble — "This delivers", never "we
believe this could potentially deliver". Reasoned, not asserted: every strategic
claim is followed by why. Warm but not casual. No exclamation marks, no emoji.

Never write: "we're passionate about", "our team of experts", "cutting-edge",
"world-class", "best-in-class", "innovative", "revolutionary", "game-changing",
"disruptive". Never write a sentence that could appear on any agency's website.
Never write a bullet that is a bare fragment — every bullet is a bold label, an
em-dash, then the explanation.

Specifics are the voice. "Articles compound over time — month 6 traffic will
dwarf month 1" and "the kind of content that ranks on Google and gets shared in
Facebook groups at 2am" are the register. Concrete, a little dry, never hyped.

Open a section with a one-sentence lead that sets the frame. Use "Here's why
this matters" to turn into a strategic argument. Use named, real comparisons
rather than vague appeals to authority. Close a strategic argument with a
bottom-line box.

### The thesis (build proposals only)

Section 04 is why a client picks this engagement over another: the one
strategic decision that is contrarian or counterintuitive but right, argued
rather than asserted. Derive it from the scope if you can — "web-first with a
native shell", "rebuild with disciplined scope", "one channel done properly
before four done badly". Only ask if the scope genuinely does not imply one.

### Section body format

Each section body is markdown. Use \`##\` for sub-headings, \`-\` for bullets,
and \`>\` for a bottom-line box. Do not repeat the section heading inside its
own body.

For a retainer's Scope of Services, each service is a \`##\` sub-heading
numbered in the heading itself, followed by a budget-and-deliverable line in
bold, a paragraph, then bulleted detail rows with bold labels.

For an Investment Summary, write the table as bulleted rows — service, monthly
deliverable, investment — then the total, then the pass-through note.`;

export interface ProposalContent {
  /** Which spine this proposal follows. Defaults to build. */
  kind?: ProposalKind;
  cover?: {
    client_name?: string;
    project_name?: string;
    tagline?: string;
    prepared_for?: string;
    prepared_by?: string;
    date?: string;
    /** Retainer covers carry the price on the cover, builds do not. */
    price_line?: string;
  };
  sections?: Array<{ key?: string; heading?: string; body?: string }>;
}

/** Which sections of this proposal's spine are missing. Empty means intact. */
export function missingSections(content: ProposalContent): string[] {
  const present = new Set(
    (content.sections ?? [])
      .filter((s) => (s.body ?? "").trim().length > 0)
      .map((s) => s.key),
  );
  return spineFor(content.kind).filter((s) => !present.has(s.key)).map((s) => s.key);
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
  const spine = spineFor(content.kind);
  const byKey = new Map(
    (content.sections ?? []).map((s) => [s.key ?? "", s]),
  );

  const toc = spine.map(
    (s, i) =>
      `<li><span class="num">${String(i + 1).padStart(2, "0")}</span><span class="h">${esc(s.heading)}</span><span class="p">${esc(s.purpose)}</span></li>`,
  ).join("");

  const body = spine.map((s, i) => {
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
.cv-proposal .price-line { font-family: Arial, sans-serif; font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: ${PALETTE.bronze}; margin: 0 0 24px; }
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
  ${cover.price_line ? `<p class="price-line">${esc(cover.price_line)}</p>` : ""}
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
