// Brain artifact prompt registry. Each entry maps to one acceptance criterion
// on the `brain_setup.generate_artifacts` task. Add the remaining prompts as
// they're finalized — the orchestrator will pick them up automatically.

export interface BrainArtifactContext {
  businessName: string;
  intake: Record<string, unknown>;         // onboarding intake_data
  brandKit: Record<string, unknown>;        // brand_kit_intake
  brandVoiceDoc: string;                    // markdown brand voice doc
  brandVoiceQuickRef: string | null;
  // Markdown bodies of previously-generated brain artifacts in this same task,
  // keyed by artifact `key`. Used by skill files that reference offer suite,
  // pricing guide, weekly review, etc.
  previousArtifacts: Record<string, string>;
}

export type ArtifactFormat = "pdf" | "md";

// journey_item_key of the project_task this artifact attaches to.
export type ArtifactTaskKey =
  | "brain_setup.generate_artifacts"
  | "brain_setup.generate_skills";

export interface BrainArtifactDef {
  key: string;                              // stable identifier
  taskKey: ArtifactTaskKey;                 // which project_task to attach to
  criterionText: string;                    // must match acceptance_criteria text on the task
  title: string;                            // shown on PDF cover (PDF artifacts only)
  subtitle: string;                         // shown on PDF cover under title
  filenamePrefix: string;                   // for storage path
  enabled: boolean;                         // false = skipped until prompt is filled in
  format: ArtifactFormat;                   // "pdf" => editorial PDF; "md" => raw markdown attachment
  buildPrompt: (ctx: BrainArtifactContext) => string;
}

// ---- Shared context block reused across prompts -------------------------------
function contextBlock(ctx: BrainArtifactContext): string {
  const intake = JSON.stringify(ctx.intake ?? {}, null, 2);
  const brandKit = JSON.stringify(ctx.brandKit ?? {}, null, 2);
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUSINESS CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Business name: ${ctx.businessName}

ONBOARDING INTAKE (verbatim from the client):
${intake}

BRAND KIT INTAKE (verbatim from the client):
${brandKit}

BRAND VOICE DOCUMENT (already generated for this client):
${ctx.brandVoiceDoc}

${ctx.brandVoiceQuickRef ? `BRAND VOICE QUICK REFERENCE:\n${ctx.brandVoiceQuickRef}\n` : ""}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

// Helper that injects one or more prior artifacts as additional context.
function priorArtifactBlock(ctx: BrainArtifactContext, keys: Array<{ key: string; label: string }>): string {
  const parts: string[] = [];
  for (const { key, label } of keys) {
    const body = ctx.previousArtifacts?.[key];
    if (body && body.trim()) {
      parts.push(`\n━━━ ${label.toUpperCase()} ━━━\n${body}\n`);
    } else {
      parts.push(`\n━━━ ${label.toUpperCase()} ━━━\n(not yet generated — infer from brand voice and intake)\n`);
    }
  }
  return parts.join("\n");
}

// ---- 1. Ideal Customer Profile ----------------------------------------------
const ICP_PROMPT = (ctx: BrainArtifactContext) => `You are building a business intelligence document for a client's AI Business Brain. Using the brand voice document and brand kit attached, generate a detailed Ideal Customer Profile (ICP) for this business.
${contextBlock(ctx)}
The ICP must include:

## 1. DEMOGRAPHICS
- Age range
- Gender (if relevant)
- Location (local, national, or global)
- Income range or business revenue range
- Job title or life stage
- Education level (if relevant)

## 2. PSYCHOGRAPHICS
- Core values and beliefs
- Biggest fears and frustrations
- Deepest desires and goals
- How they make purchasing decisions
- What they read, watch, and follow
- What they talk about with friends and colleagues

## 3. RELATIONSHIP WITH THIS BUSINESS
- What problem brings them to this business
- What transformation they are seeking
- What objections they have before buying
- What makes them a perfect fit client
- What makes them a wrong fit client

## 4. VOICE OF CUSTOMER
- Exact phrases they use to describe their problem (write these in first person as if the customer is speaking)
- Exact phrases they use to describe their desired outcome

QUALITY STANDARDS:
- Write in clear, specific language. Avoid generic marketing language.
- Every section should be immediately usable as context for AI content generation, sales conversations, and offer development.
- If information for a specific field is not available in the attached documents, make a reasonable inference based on the business type and note it with (inferred).
- Format the output with markdown headers (## for major sections, ### for subsections, - for bullets).`;

// ---- 2. Offer Suite ---------------------------------------------------------
const OFFER_SUITE_PROMPT = (ctx: BrainArtifactContext) => `You are building a business intelligence document for a client's AI Business Brain. Using the brand voice document and brand kit attached, generate a complete Offer Suite document for this business.
${contextBlock(ctx)}
The Offer Suite must include the following for each offer:

## OFFER NAME

### OFFER TYPE
(service, product, course, membership, retainer, etc.)

### WHO IT'S FOR
One sentence describing the ideal buyer.

### THE PROBLEM IT SOLVES
Two to three sentences.

### THE TRANSFORMATION
What the client's life or business looks like after.

### WHAT'S INCLUDED
Bullet list of deliverables or components.

### HOW IT'S DELIVERED
Format, timeline, and access method.

### INVESTMENT
Price point or range.

### THE PROMISE
One bold sentence that captures what this offer guarantees.

### BEST FOR CONVERSATIONS WHEN
Triggers that signal this offer is the right fit.

---

After listing all offers, add a final section called **OFFER ECOSYSTEM** that shows how the offers relate to each other — which one is the entry point, which one is the ascension path, and what the client journey looks like from first purchase to highest tier.

QUALITY STANDARDS:
- Write in clear, specific language. Every section should be immediately usable by an AI assistant to recommend the right offer in sales conversations and content.
- If specific information is not available, make a reasonable inference based on the business type and note it with (inferred).
- Format the output with markdown headers (## for offer names, ### for subsections, - for bullets).`;

// ---- 3. Lead Intake SOP -----------------------------------------------------
const LEAD_INTAKE_PROMPT = (ctx: BrainArtifactContext) => `You are building an operational document for a client's AI Business Brain. Using the brand voice document and brand kit attached, generate a Lead Intake SOP for this business.

This SOP defines exactly what happens from the moment a new inquiry arrives to the moment the lead is either converted or archived. It will be used to train an AI assistant to handle leads in the client's voice.
${contextBlock(ctx)}
The Lead Intake SOP must include:

## PURPOSE
Why this SOP exists and what outcome it produces.

## TRIGGER
What counts as a new lead — DM, website form submission, email inquiry, referral, etc.

## RESPONSE TIME STANDARD
How quickly leads must be responded to and why.

## STEP-BY-STEP PROCESS
1. How the lead is received and logged
2. The first response — what to say, what tone to use, what questions to ask
3. How to qualify the lead — what questions determine fit
4. What happens if the lead is a fit — next steps
5. What happens if the lead is not a fit — how to decline gracefully
6. Follow-up cadence — when and how many times to follow up before archiving
7. How to archive unresponsive or unconverted leads

## AI RESPONSE TEMPLATES
Write three template responses in the client's brand voice:

### Initial response to a new inquiry
### Follow-up message for a lead who hasn't responded
### Graceful decline for a lead who is not a fit

Write everything in plain language. The AI assistant will use this SOP as a reference every time a new inquiry arrives. Format with markdown headers (## major sections, ### subsections, numbered/bulleted lists).`;

// ---- 4. Client Onboarding SOP -----------------------------------------------
const CLIENT_ONBOARDING_PROMPT = (ctx: BrainArtifactContext) => `You are building an operational document for a client's AI Business Brain. Using the brand voice document and brand kit attached, generate a Client Onboarding SOP for this business.

This SOP defines exactly what happens from the moment a new client pays to the moment they are fully set up and active. It will be used by the client and their AI assistant to onboard every new client consistently.
${contextBlock(ctx)}
The Client Onboarding SOP must include:

## PURPOSE
Why this SOP exists and what it produces.

## TRIGGER
What starts the onboarding process — payment received, contract signed, etc.

## ONBOARDING TIMELINE
Day by day or step by step — what happens and in what order from day 1 through the client's first full week.

## STEP-BY-STEP PROCESS
1. What the client sends or confirms immediately after signing
2. What the business delivers in the first 24 hours
3. What the client needs to complete before work begins
4. How the first working session or delivery is structured
5. What the client receives at the end of onboarding that confirms they are fully set up

## WELCOME COMMUNICATION TEMPLATES
Write two template messages in the client's brand voice:

### Welcome message sent immediately after payment
### Day 3 check-in to confirm the client is set up and has everything they need

## WHAT GREAT ONBOARDING LOOKS LIKE
Two to three sentences describing what a client should feel and know by the end of onboarding.

Write everything in clear, specific language that the client can use today. Format with markdown headers.`;

// ---- 5. Content Creation SOP ------------------------------------------------
const CONTENT_CREATION_PROMPT = (ctx: BrainArtifactContext) => `You are building an operational document for a client's AI Business Brain. Using the brand voice document and brand kit attached, generate a Content Creation SOP for this business.

This SOP defines how content is created, approved, and published for this business. It will be used by the client and their AI assistant to produce consistent, on-brand content every week.
${contextBlock(ctx)}
The Content Creation SOP must include:

## PURPOSE
Why this SOP exists and what it produces.

## CONTENT PILLARS
Three to five topics this business consistently creates content around. Each pillar should have a name, a one-sentence description, and an example content angle.

## CONTENT TYPES AND CADENCE
- What types of content are produced (posts, reels, stories, emails, etc.)
- How often each type is published
- Which platforms each type goes to

## CONTENT CREATION PROCESS
Step by step from idea to published:
1. Where ideas come from — prompts, client submissions, content calendar
2. How captions are written — tone, structure, length, call to action format
3. How visuals are selected or created — what fits the brand, what doesn't
4. How content is approved before publishing
5. How content is scheduled and published

## BRAND VOICE QUICK RULES FOR CONTENT
Pull the most important voice rules from the brand voice document and restate them here as a short checklist the AI checks every caption against before finalizing.

## WHAT TO NEVER POST
Three to five things that are off-brand for this business — topics, tones, or styles to avoid.

Write everything in clear, specific language the AI can use to generate on-brand content without additional guidance. Format with markdown headers.`;

// ---- 6. Weekly Review Checklist --------------------------------------------
const WEEKLY_REVIEW_PROMPT = (ctx: BrainArtifactContext) => `You are building an operational document for a client's AI Business Brain. Using the brand voice document and brand kit attached, generate a Weekly Review Checklist for this business.

This checklist is completed every week — ideally the same day each week — to review what happened, what is working, and what to focus on next. It will be used by the client and their AI assistant to keep the business running consistently and intentionally.
${contextBlock(ctx)}
The Weekly Review Checklist must include:

## PURPOSE
Why this review exists and what it produces.

## WHEN TO RUN IT
Recommended day and time. Why consistency matters.

## THE CHECKLIST — organized into four sections:

### SECTION 1 — LOOK BACK (what happened this week)
- Revenue received this week
- New leads that came in
- New clients signed
- Content published and how it performed
- Client work completed or delivered
- Any fires, issues, or things that went wrong

### SECTION 2 — LOOK AT NOW (current state)
- Open proposals or quotes
- Active clients and their current stage
- Outstanding tasks or deliverables due this week
- Anything waiting on someone else
- Cash position and invoices outstanding

### SECTION 3 — LOOK AHEAD (next week priorities)
- Top three priorities for next week
- Any content that needs to be created or approved
- Any client milestones or deliveries due
- Any decisions that need to be made

### SECTION 4 — BRAIN CHECK-IN (updating the AI)
- Anything new in the business the AI should know about — new offers, pricing changes, new services, updated FAQs
- Any voice or messaging shifts to update in the brand voice document
- Any new SOPs or processes to add to the Brain

## CLOSING QUESTION
One reflective question the client answers in writing each week. Make it specific to this business and its goals.

Write everything in clear, specific language. The checklist should take no more than 20 minutes to complete. Format with markdown headers.`;

// ---- 7. Pricing Decision Guide ---------------------------------------------
const PRICING_DECISION_PROMPT = (ctx: BrainArtifactContext) => `You are building a decision-making document for a client's AI Business Brain. Using the brand voice document and brand kit attached, generate a Pricing Decision Guide for this business.

This guide helps the client and their AI assistant make confident, consistent pricing decisions in any situation — new inquiries, custom requests, scope changes, discounts, and objections.
${contextBlock(ctx)}${priorArtifactBlock(ctx, [{ key: "offer_suite", label: "Offer Suite (already generated)" }])}
The Pricing Decision Guide must include:

## PURPOSE
Why this guide exists and what it produces.

## THE OFFER MENU WITH PRICES
List every offer with its price or price range. This is the source of truth the AI references before any pricing conversation.

## HOW TO QUOTE CUSTOM OR OUT-OF-SCOPE REQUESTS
Step by step — how to assess a custom request, how to determine a price, how to present it to the client.

## HOW TO HANDLE THE MOST COMMON PRICING OBJECTIONS
For each objection, write the exact response to give in the client's brand voice:

- "Can you do it cheaper?"
- "I need to think about it"
- "That's more than I budgeted"
- "Can I pay in installments?"
- "What's your cheapest option?"

## DISCOUNT POLICY
When discounts are acceptable, when they are not, and what the maximum discount is without approval.

## SCOPE CREEP RESPONSE
Exact language to use when a client asks for something outside the original agreement. How to address it, how to price it, and how to keep the relationship intact.

## WHEN TO WALK AWAY
Two to three clear signals that a prospect is not the right client regardless of price. What to say when you decide not to take the work.

Write every response in the client's brand voice. The AI assistant should be able to handle any pricing conversation using only this document. Format with markdown headers.`;

// ============================================================================
// SKILL FILES (Markdown attachments uploaded to the client's Claude Project)
// ============================================================================
//
// Each of these returns a complete, ready-to-upload markdown file. They are
// written so that the model outputs ONLY the markdown body (no preamble).
// ============================================================================

const SKILL_OUTPUT_RULES = `
OUTPUT RULES — READ CAREFULLY:
- Output ONLY the markdown document. No preamble, no explanation, no code fence wrappers.
- Start the file at the top-level heading "# <skill-name>".
- Write everything in this client's brand voice as established in the brand voice document.
- Be specific to this business. Avoid generic advice. Pull concrete details from the intake and brand voice doc.
- Format cleanly with markdown headers (#, ##, ###), bullet lists, and numbered lists.`;

// ---- Skill 1: content-writer ------------------------------------------------
const CONTENT_WRITER_SKILL = (ctx: BrainArtifactContext) => `You are creating a skill file for a client's AI Business Brain. Using the brand voice document and brand kit attached, generate a content writing skill file in markdown format. This file will be uploaded to the client's Claude Project and used every time content needs to be written for their business.

The output must be a complete markdown document saved as content-writer.md
${contextBlock(ctx)}
Use this exact structure:

# content-writer

## Purpose
One sentence describing what this skill does.

## Voice Rules
Bullet list of the most critical voice rules pulled directly from the brand voice document. These are non-negotiable. The AI checks every piece of content against these before finalizing.

## Forbidden Words and Phrases
A list of words, phrases, tones, and approaches that are off-brand for this business and must never appear in content.

## Caption Formula
The repeatable structure the AI follows when writing a social media caption for this business:
- Hook — how to open and why it works for this audience
- Body — how to develop the idea
- Close — how to end and what call to action format to use

## Platform-Specific Rules
For each platform this business posts on, write the following:
- Platform name
- Ideal caption length
- Tone adjustments specific to this platform
- Hashtag approach
- One example of what great content looks like here for this brand

## Headline and Hook Formula
How to write scroll-stopping headlines and opening lines for this business. Include three proven hook structures with a fill-in-the-blank template for each.

## Email Writing Rules
How emails from this business are structured — subject line format, opening line style, body length, paragraph structure, and sign-off.

## How to Use This Skill
Two example prompts that would activate this skill correctly and produce on-brand content output.
${SKILL_OUTPUT_RULES}`;

// ---- Skill 2: sop-builder ---------------------------------------------------
const SOP_BUILDER_SKILL = (ctx: BrainArtifactContext) => `You are creating a skill file for a client's AI Business Brain. Using the brand voice document attached, generate an SOP builder skill file in markdown format.

This skill file teaches the AI Brain how to write SOPs for this specific business. It will be uploaded to the client's Claude Project.
${contextBlock(ctx)}${priorArtifactBlock(ctx, [
  { key: "lead_intake_sop", label: "Lead Intake SOP (reference example)" },
  { key: "client_onboarding_sop", label: "Client Onboarding SOP (reference example)" },
  { key: "content_creation_sop", label: "Content Creation SOP (reference example)" },
])}
Use this exact structure:

# sop-builder

## Purpose
One sentence describing what this skill does.

## What Makes a Good SOP for This Business
Three to five principles that define a well-written SOP for this specific business — based on their communication style, operational complexity, and team size.

## SOP Structure
The exact structure every SOP for this business follows:
- Purpose
- Trigger
- Who runs it
- Steps (numbered, one action each)
- Definition of done
- Common mistakes

## Writing Rules for SOPs
How SOPs are written for this business — plain language, sentence length, use of bullet points vs numbered lists, how much detail each step needs.

## How to Use This Skill
Instructions for prompting the AI to build a new SOP. Include two example prompts.
${SKILL_OUTPUT_RULES}`;

// ---- Skill 3: email-responder -----------------------------------------------
const EMAIL_RESPONDER_SKILL = (ctx: BrainArtifactContext) => `You are creating a skill file for a client's AI Business Brain. Using the brand voice document attached, generate an email responder skill file in markdown format.

This skill file teaches the AI Brain how to draft email responses for this specific business. It will be uploaded to the client's Claude Project.
${contextBlock(ctx)}
Use this exact structure:

# email-responder

## Purpose
One sentence describing what this skill does.

## Email Voice Rules
How emails from this business sound — pulled from the brand voice document. Specific rules for tone, formality level, sentence length, and how to open and close.

## Response Templates by Situation
For each situation, write a template response in the client's brand voice:
- Responding to a new inquiry
- Following up on a proposal
- Delivering completed work
- Responding to a complaint or concern
- Declining a request politely
- Sending a check-in to an existing client

## Subject Line Formulas
Three formulas for writing subject lines that get opened — specific to this business's audience.

## What to Never Say in an Email
Phrases, tones, and approaches that are off-brand for this business.

## How to Use This Skill
Instructions for prompting the AI to draft an email. Include two example prompts.
${SKILL_OUTPUT_RULES}`;

// ---- Skill 4: offer-builder -------------------------------------------------
const OFFER_BUILDER_SKILL = (ctx: BrainArtifactContext) => `You are creating a skill file for a client's AI Business Brain. Using the brand voice document and offer suite attached, generate an offer builder skill file in markdown format.

This skill file teaches the AI Brain how to position, describe, and present offers for this specific business. It will be uploaded to the client's Claude Project.
${contextBlock(ctx)}${priorArtifactBlock(ctx, [
  { key: "offer_suite", label: "Offer Suite (already generated)" },
  { key: "pricing_guide", label: "Pricing Decision Guide (already generated)" },
])}
Use this exact structure:

# offer-builder

## Purpose
One sentence describing what this skill does.

## How This Business Talks About Its Offers
Pulled from the brand voice document — how offers are positioned, what language is used, what is emphasized, what is never said.

## Offer Description Formula
The structure the AI follows when writing an offer description:
- Who it's for
- The problem it solves
- The transformation it produces
- What's included
- The investment
- The call to action

## Sales Page Section Formulas
How to write each section of a sales page or offer page for this business:
- Headline formula
- Problem section
- Solution section
- Deliverables section
- Investment section
- FAQ section

## How to Talk About Price
Exact language and framing to use when presenting investment — pulled from the pricing decision guide and brand voice.

## How to Use This Skill
Instructions for prompting the AI to build a new offer description or sales page section. Include two example prompts.
${SKILL_OUTPUT_RULES}`;

// ---- Skill 5: weekly-review -------------------------------------------------
const WEEKLY_REVIEW_SKILL = (ctx: BrainArtifactContext) => `You are creating a skill file for a client's AI Business Brain. Using the brand voice document and weekly review checklist attached, generate a weekly review skill file in markdown format.

This skill file teaches the AI Brain how to assist with the weekly review process for this specific business. It will be uploaded to the client's Claude Project.
${contextBlock(ctx)}${priorArtifactBlock(ctx, [
  { key: "weekly_review", label: "Weekly Review Checklist (already generated)" },
])}
Use this exact structure:

# weekly-review

## Purpose
One sentence describing what this skill does.

## How to Run the Weekly Review with the AI
Step by step — how the client interacts with the AI to complete their weekly review. What they share, what the AI does with it, what the output looks like.

## What the AI Does During a Weekly Review
- What it analyzes
- What it summarizes
- What it flags as needing attention
- What it suggests for the week ahead

## The Weekly Review Prompt
The exact prompt the client pastes at the start of every weekly review session to activate this skill and get the AI into the right mode.

## How to Update the Brain After the Review
Instructions for what to tell the AI after the review so it can update its knowledge about the business — new offers, pricing changes, completed milestones, lessons learned.

## How to Use This Skill
Two example prompts that would produce great weekly review outputs for this business.
${SKILL_OUTPUT_RULES}`;

// ============================================================================
// REGISTRY — order matters. Skills go LAST so prior artifact markdown is
// available in ctx.previousArtifacts when each skill prompt is built.
// ============================================================================

export const BRAIN_ARTIFACTS: BrainArtifactDef[] = [
  {
    key: "icp",
    taskKey: "brain_setup.generate_artifacts",
    criterionText: "Ideal Customer Profile generated and reviewed",
    title: "Ideal Customer",
    subtitle: "Profile.",
    filenamePrefix: "ideal-customer-profile",
    enabled: true,
    format: "pdf",
    buildPrompt: ICP_PROMPT,
  },
  {
    key: "offer_suite",
    taskKey: "brain_setup.generate_artifacts",
    criterionText: "Offer Suite generated and reviewed",
    title: "Offer",
    subtitle: "Suite.",
    filenamePrefix: "offer-suite",
    enabled: true,
    format: "pdf",
    buildPrompt: OFFER_SUITE_PROMPT,
  },
  {
    key: "lead_intake_sop",
    taskKey: "brain_setup.generate_artifacts",
    criterionText: "Lead Intake SOP generated and reviewed",
    title: "Lead Intake",
    subtitle: "SOP.",
    filenamePrefix: "lead-intake-sop",
    enabled: true,
    format: "pdf",
    buildPrompt: LEAD_INTAKE_PROMPT,
  },
  {
    key: "client_onboarding_sop",
    taskKey: "brain_setup.generate_artifacts",
    criterionText: "Client Onboarding SOP generated and reviewed",
    title: "Client Onboarding",
    subtitle: "SOP.",
    filenamePrefix: "client-onboarding-sop",
    enabled: true,
    format: "pdf",
    buildPrompt: CLIENT_ONBOARDING_PROMPT,
  },
  {
    key: "content_creation_sop",
    taskKey: "brain_setup.generate_artifacts",
    criterionText: "Content Creation SOP generated and reviewed",
    title: "Content Creation",
    subtitle: "SOP.",
    filenamePrefix: "content-creation-sop",
    enabled: true,
    format: "pdf",
    buildPrompt: CONTENT_CREATION_PROMPT,
  },
  {
    key: "weekly_review",
    taskKey: "brain_setup.generate_artifacts",
    criterionText: "Weekly Review Checklist generated and reviewed",
    title: "Weekly Review",
    subtitle: "Checklist.",
    filenamePrefix: "weekly-review-checklist",
    enabled: true,
    format: "pdf",
    buildPrompt: WEEKLY_REVIEW_PROMPT,
  },
  {
    key: "pricing_guide",
    taskKey: "brain_setup.generate_artifacts",
    criterionText: "Pricing Decision Guide generated and reviewed",
    title: "Pricing Decision",
    subtitle: "Guide.",
    filenamePrefix: "pricing-decision-guide",
    enabled: true,
    format: "pdf",
    buildPrompt: PRICING_DECISION_PROMPT,
  },
  // ---- Skill files (markdown attached to brain_setup.generate_skills task).
  //      Order matters — later skills reference earlier artifacts. ----
  {
    key: "skill_content_writer",
    taskKey: "brain_setup.generate_skills",
    criterionText: "content-writer.md uploaded",
    title: "Skill",
    subtitle: "content-writer.",
    filenamePrefix: "content-writer",
    enabled: true,
    format: "md",
    buildPrompt: CONTENT_WRITER_SKILL,
  },
  {
    key: "skill_sop_builder",
    taskKey: "brain_setup.generate_skills",
    criterionText: "sop-builder.md generated and reviewed",
    title: "Skill",
    subtitle: "sop-builder.",
    filenamePrefix: "sop-builder",
    enabled: true,
    format: "md",
    buildPrompt: SOP_BUILDER_SKILL,
  },
  {
    key: "skill_email_responder",
    taskKey: "brain_setup.generate_skills",
    criterionText: "email-responder.md generated and reviewed",
    title: "Skill",
    subtitle: "email-responder.",
    filenamePrefix: "email-responder",
    enabled: true,
    format: "md",
    buildPrompt: EMAIL_RESPONDER_SKILL,
  },
  {
    key: "skill_offer_builder",
    taskKey: "brain_setup.generate_skills",
    criterionText: "offer-builder.md generated and reviewed",
    title: "Skill",
    subtitle: "offer-builder.",
    filenamePrefix: "offer-builder",
    enabled: true,
    format: "md",
    buildPrompt: OFFER_BUILDER_SKILL,
  },
  {
    key: "skill_weekly_review",
    taskKey: "brain_setup.generate_skills",
    criterionText: "weekly-review.md generated and reviewed",
    title: "Skill",
    subtitle: "weekly-review.",
    filenamePrefix: "weekly-review",
    enabled: true,
    format: "md",
    buildPrompt: WEEKLY_REVIEW_SKILL,
  },
];

