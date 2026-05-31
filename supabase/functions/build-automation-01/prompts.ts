// Prompts for build-automation-01 orchestrator. Each function returns a
// Claude prompt string. Outputs are interpreted by index.ts.

export interface BrandCtx {
  businessName: string;
  oneLiner: string;
  audience: string;
  primaryColor: string;     // hex
  accentColor: string;      // hex
  headingFont: string;
  bodyFont: string;
  logoUrl: string | null;
  brandVoiceDoc: string;
  brandVoiceQuickRef: string | null;
  intake: Record<string, unknown>;
  brandKit: Record<string, unknown>;
  leadMagnetTitle: string;
  leadMagnetUrl?: string;   // filled in after step 1
}

function ctxBlock(c: BrandCtx): string {
  return `
BUSINESS: ${c.businessName}
ONE-LINER: ${c.oneLiner}
AUDIENCE: ${c.audience}
PRIMARY COLOR: ${c.primaryColor}
ACCENT COLOR: ${c.accentColor}
HEADING FONT: ${c.headingFont}
BODY FONT: ${c.bodyFont}
LOGO URL: ${c.logoUrl ?? "(none)"}
LEAD MAGNET TITLE: ${c.leadMagnetTitle}

BRAND VOICE DOC:
${c.brandVoiceDoc}

${c.brandVoiceQuickRef ? `BRAND VOICE QUICK REF:\n${c.brandVoiceQuickRef}\n` : ""}
INTAKE JSON:
${JSON.stringify(c.intake, null, 2)}

BRAND KIT JSON:
${JSON.stringify(c.brandKit, null, 2)}
`;
}

// Returns markdown for a one-page lead magnet, broken into a JSON envelope so
// we can render it cleanly to PDF.
export const LEAD_MAGNET_PROMPT = (c: BrandCtx) => `You are writing a one-page downloadable lead magnet PDF for ${c.businessName}.

${ctxBlock(c)}

TASK
Write a tightly-edited, on-brand one-page lead magnet titled "${c.leadMagnetTitle}".
It must deliver one concrete, immediately-usable framework / checklist / tool that the ideal customer can apply in under 10 minutes.

OUTPUT FORMAT — return ONLY valid JSON, no prose, no code fences:
{
  "title": "<final title, can refine the working title>",
  "subtitle": "<one short subtitle line in brand voice>",
  "intro": "<2-3 short paragraphs that hook the reader and frame the problem>",
  "sections": [
    { "heading": "<short heading>", "body": "<1-2 short paragraphs OR a checklist using '- ' bullets at the start of lines>" }
  ],
  "cta": "<one short closing sentence inviting them to take the next step with ${c.businessName}>"
}

Constraints:
- 3 to 5 sections.
- Voice: ${c.businessName}'s brand voice exactly.
- No mentions of "AI" or "I wrote this for you".
- No filler. Specific, opinionated, useful.`;

// Produces full branded HTML for one nurture email. Returns ONLY HTML.
export interface NurtureEmailSpec {
  key: string;
  subject: string;
  purpose: string;
  delayDays: number;
  includeLeadMagnetLink: boolean;
}

export const NURTURE_EMAILS: NurtureEmailSpec[] = [
  { key: "email_1_welcome",    subject: `Your ${"{{lead_magnet_title}}"} is here`,         purpose: "Deliver the lead magnet, welcome them by name, set expectations for what's coming.", delayDays: 0, includeLeadMagnetLink: true },
  { key: "email_2_quick_win",  subject: "A 10-minute quick win you can try today",          purpose: "One small actionable tactic they can apply immediately from the lead magnet's framework.", delayDays: 2, includeLeadMagnetLink: false },
  { key: "email_3_founder",    subject: "Why we started doing this work",                   purpose: "Founder story / origin story that builds trust and shared values with the audience.", delayDays: 4, includeLeadMagnetLink: false },
  { key: "email_4_proof",      subject: "How [client] got [outcome] in [timeframe]",        purpose: "Social proof: a short case study or testimonial illustrating the transformation.", delayDays: 6, includeLeadMagnetLink: false },
  { key: "email_5_invite",     subject: "Ready when you are",                               purpose: "Soft CTA inviting them to book a call / explore the offer. No hard sell.", delayDays: 9, includeLeadMagnetLink: false },
];

export const NURTURE_EMAIL_PROMPT = (c: BrandCtx, spec: NurtureEmailSpec) => `You are writing a branded HTML email for ${c.businessName}'s lead nurture sequence.

${ctxBlock(c)}

EMAIL ${spec.key.toUpperCase()}
- Subject line idea: ${spec.subject}
- Purpose: ${spec.purpose}
- Send: ${spec.delayDays === 0 ? "Immediately after opt-in" : `${spec.delayDays} days after opt-in`}
${spec.includeLeadMagnetLink ? `- MUST include a prominent download button linking to {{lead_magnet_url}}` : "- Do not include the lead magnet download link"}

OUTPUT FORMAT — return ONLY valid JSON, no prose, no code fences:
{
  "subject": "<final subject line, on-brand, no emoji unless brand voice demands>",
  "preheader": "<short preheader text shown in inbox preview>",
  "html": "<complete HTML email body, see rules below>"
}

HTML RULES
- A self-contained HTML fragment (NO <html>, <head>, or <body> tags — just the email content).
- Use inline styles only. No external CSS, no <style> blocks.
- Outer wrapper: a single <table> with max-width 600px, centered.
- Hero band at the top using background-color: ${c.primaryColor} with white headline text.
- Headlines use a serif fallback stack: font-family: "${c.headingFont}", Georgia, serif.
- Body text uses sans fallback stack: font-family: "${c.bodyFont}", Helvetica, Arial, sans-serif; size 16px; color #1a1a1a; line-height 1.6.
- One primary button styled as: background-color: ${c.accentColor}; color: #ffffff; padding: 14px 28px; border-radius: 4px; text-decoration: none; font-weight: 600; display: inline-block.
${c.logoUrl ? `- Include the logo at the top: <img src="${c.logoUrl}" alt="${c.businessName}" style="max-height:48px;display:block;margin:0 auto 16px;" />` : "- No logo image available — skip the logo."}
- Footer band: small grey text (color #666) with "${c.businessName}" and the brand one-liner "${c.oneLiner}".
- Use {{first_name}} for the recipient's first name (with a sensible fallback like "Hi there,").
${spec.includeLeadMagnetLink ? `- The primary CTA button text should be "Download ${c.leadMagnetTitle}" and link to {{lead_magnet_url}}.` : ""}

Write the body in ${c.businessName}'s exact brand voice. 150-280 words. Specific, warm, and useful.`;

// Landing page copy block + brand snippet, returned as one Markdown document the
// agency pastes into SureContact's landing-page builder.
export const LANDING_PAGE_COPY_PROMPT = (c: BrandCtx) => `You are writing the copy for ${c.businessName}'s lead-magnet landing page.

${ctxBlock(c)}

OUTPUT FORMAT — return ONLY valid JSON, no prose, no code fences:
{
  "headline": "<benefit-driven headline, 6-10 words>",
  "subhead": "<one supporting sentence that names the audience and the outcome>",
  "bullets": ["<benefit 1>", "<benefit 2>", "<benefit 3>"],
  "form_label": "<short label above the email input>",
  "cta_button": "<2-4 word button text>",
  "trust_line": "<one short line under the form, e.g. 'No spam. Unsubscribe anytime.'>",
  "footer_line": "<one short brand footer line>"
}

Voice: ${c.businessName}'s brand voice exactly. Specific. Audience-aware. No clichés.`;
