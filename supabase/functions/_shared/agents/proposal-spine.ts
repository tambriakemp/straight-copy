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

/**
 * A proposal is an ordered list of sections the AGENT decides on.
 *
 * There used to be two hardcoded spines here — a 14-section build and a
 * 7-section retainer — and a `missingSections` gate that refused any draft not
 * carrying every one of them. Two things were wrong with that.
 *
 * The spines did not match the documents Cre8 Visions actually sends. The real
 * Menovia retainer has twelve sections, not seven, and different ones: The
 * Opportunity, Engagement Summary, The Strategic Thesis, What We're Doing,
 * Creative & Voice, The First 90 Days, Reporting & What You'll Know,
 * Investment & Pass-Throughs, What's Included, What's Not Included, Terms &
 * Next Steps, Acceptance. The agent was being asked to write a document the
 * agency does not sell.
 *
 * And the gate never let anything through. On 20 Aug the agent tried four
 * times to draft one proposal: rejected for missing eight build sections
 * (it had written a retainer), rejected again for missing three retainer
 * sections, then twice more on a NOT NULL column. Zero proposals have ever
 * been created by an agent. A gate that blocks produced nothing for two weeks.
 *
 * Hardcoding the correct twelve would only move the problem to the next kind of
 * proposal. So the structure is the agent's call, taken from the brief and from
 * the real documents it can read. What stays is `reviewProposal` below, which
 * reports rather than refuses.
 */
export interface ProposalContent {
  /** Free text — "marketing retainer", "app build", whatever this is. */
  kind?: string;
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
  sections?: ProposalSectionContent[];
}

export interface ProposalSectionContent {
  heading?: string;
  /** One line for the contents page, as the real documents carry. */
  summary?: string;
  body?: string;
}

/** Sections with something actually written in them, in document order. */
export function writtenSections(content: ProposalContent): ProposalSectionContent[] {
  return (content.sections ?? []).filter((s) => (s.body ?? "").trim().length > 0);
}

/**
 * What any document going to a client for signature needs, whatever it sells.
 *
 * These are commercial and legal necessities, not structure imposed on the
 * argument. A proposal with no pricing or no acceptance page is a real
 * exposure; a proposal without a "Strategic Thesis" section is just a
 * different proposal.
 */
export const NON_NEGOTIABLES = [
  {
    key: "price",
    label: "what it costs and when it is paid",
    match: /invest|pricing|price|payment|fee|retainer|cost|budget/i,
  },
  {
    key: "included",
    label: "what is included",
    match: /included|deliverable|scope of (?:services|work)|what (?:we|you)/i,
  },
  {
    key: "excluded",
    label: "what is explicitly not included",
    match: /not included|exclusion|out of scope|excluded/i,
  },
  { key: "terms", label: "terms", match: /terms|conditions|agreement/i },
  {
    key: "acceptance",
    // Deliberately NOT matching "next steps". The real Menovia proposal has
    // both a "Terms & Next Steps" section and a separate "Acceptance" one, so
    // "next steps" would report the signature page as present on a document
    // that has no signature page. On a review that only ever reports, a false
    // pass costs an unsigned contract and a false flag costs one sentence.
    label: "an acceptance or signature section",
    match: /acceptance|signature|sign(?:ing|ed|[- ]?off)\b/i,
  },
] as const;

export interface ProposalReview {
  /** Non-negotiables with no section that looks like them. */
  missing: string[];
  /** Human-readable, for the agent to relay to Bree. */
  notes: string[];
  sectionCount: number;
  bodyChars: number;
}

/**
 * Look over a draft and say what is worth knowing. NEVER blocks a save.
 *
 * The agent surfaces this alongside the draft — "Twelve sections. Terms and
 * Acceptance are in. Pass-through ad spend is a range rather than a number,
 * confirm before this goes out." Bree signs off either way; the point is that
 * she signs off on something complete rather than finding the hole after she
 * has sent it.
 */
export function reviewProposal(content: ProposalContent): ProposalReview {
  const sections = writtenSections(content);
  const haystack = sections
    .map((s) => `${s.heading ?? ""}\n${s.summary ?? ""}\n${s.body ?? ""}`)
    .join("\n");

  const missing = NON_NEGOTIABLES
    .filter((n) => !n.match.test(haystack))
    .map((n) => n.label);

  const bodyChars = sections.reduce((n, s) => n + (s.body ?? "").trim().length, 0);
  const notes: string[] = [];

  if (!sections.length) notes.push("Nothing is written yet.");
  for (const label of missing) notes.push(`No section covers ${label}.`);

  const untitled = sections.filter((s) => !(s.heading ?? "").trim()).length;
  if (untitled) notes.push(`${untitled} section(s) have no heading.`);

  return { missing, notes, sectionCount: sections.length, bodyChars };
}

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

### Decide the structure yourself

There is no fixed list of sections. Work out what this engagement needs from
the brief, and write that.

Read a real proposal before you start — the reference documents are the
authority on how these read, not this description. A marketing retainer and an
app build are genuinely different documents, not one document with sections
renamed, and a third kind of engagement may want a shape neither of them uses.

Some guidance that holds across all of them. Open by establishing why this
project exists in the client's world, not with your credentials. Put the money
and the timeline near the front where they can be found. Make the argument
once, properly, in its own section. End with what signing means.

Anything with a monthly figure, a channel list or a per-month cadence is
ongoing work; anything with a total and phases is a fixed-scope build. That
changes what the document needs — phase sign-off and IP transfer matter to a
build and mean nothing to a retainer, which instead wants a month-by-month and
a pass-through policy.

### Five things every proposal needs

Whatever it is selling, a document going to a client for signature has to
cover: what it costs and when it is paid; what is included; what is explicitly
NOT included; terms; and acceptance. Those are commercial and legal
necessities. Everything else is your call.

If you cannot cover one of them because you do not have the information, write
the section anyway and say plainly what is outstanding, then tell Bree. Do not
silently omit it.


Only three sections actually block a draft, because a client would notice them
missing: for a build, the opportunity, the summary and the investment; for a
retainer, the overview, the scope of services and the investment. Everything
else is judgement. Never stall, never ask permission to skip a section, and
never hand back a partial draft with a note about what you could not write —
write the whole document in one pass the way you would if nobody had given you
a template at all, then say in one line what you assumed.


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

Write the proposal. Then, above it, one short block: "Assumed: ..." listing what
you decided. That is the whole protocol. She corrects a line; she does not sit
an interview.

Specifically, decide these rather than asking:
  * The legal entity name — it is the company name in the CRM.
  * The signer and their title — the named contact, and the title their role
    implies. If there is only an email, read the name from it.
  * The three phase names, for a build or a retainer.
  * Billing date, payment terms, late-payment handling, warranty, revisions.
  * Whether AI and tooling costs sit inside a client's agreement to cover
    "additional costs". They do. Say so in the pass-through line.
  * How deep to scope a service whose depth was not stated — pick what the
    budget supports and say it flexes with performance.
  * The strategic thesis. Derive it from the scope and assert it as the argument
    you are making. Do not put it to her as a question.

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

  // Document order, exactly as written. There is no spine to reorder against
  // and nothing to slot into — the agent decided the structure, so the
  // renderer's job is to present it, not to second-guess it.
  const ordered = writtenSections(content).map((s) => ({
    heading: (s.heading ?? "").trim() || "Untitled section",
    purpose: (s.summary ?? "").trim(),
    body: (s.body ?? "").trim(),
  }));

const toc = ordered.map(
    (s, i) =>
      `<li><span class="num">${String(i + 1).padStart(2, "0")}</span><span class="h">${esc(s.heading)}</span><span class="p">${esc(s.purpose ?? "")}</span></li>`,
  ).join("");

  const body = ordered.map((s, i) => {
    return `<section class="sec">
      <p class="eyebrow">${String(i + 1).padStart(2, "0")} — ${esc(s.heading).toUpperCase()}</p>
      <h2>${esc(s.heading)}</h2>
      <hr />
      ${s.body ? mdToHtml(s.body) : `<p class="gap">This section has not been written yet.</p>`}
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
