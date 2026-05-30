// Brain artifact prompt registry. Each entry maps to one acceptance criterion
// on the `brain_setup.generate_artifacts` task. Add the remaining prompts as
// they're finalized — the orchestrator will pick them up automatically.

export interface BrainArtifactContext {
  businessName: string;
  intake: Record<string, unknown>;         // onboarding intake_data
  brandKit: Record<string, unknown>;        // brand_kit_intake
  brandVoiceDoc: string;                    // markdown brand voice doc
  brandVoiceQuickRef: string | null;
}

export interface BrainArtifactDef {
  key: string;                              // stable identifier
  criterionText: string;                    // must match acceptance_criteria text on the task
  title: string;                            // shown on PDF cover
  subtitle: string;                         // shown on PDF cover under title
  filenamePrefix: string;                   // for storage path
  enabled: boolean;                         // false = skipped until prompt is filled in
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

// ---- 6. Pricing Decision Guide ---------------------------------------------
const PRICING_DECISION_PROMPT = (ctx: BrainArtifactContext) => `You are building a decision-making document for a client's AI Business Brain. Using the brand voice document and brand kit attached, generate a Pricing Decision Guide for this business.

This guide helps the client and their AI assistant make confident, consistent pricing decisions in any situation — new inquiries, custom requests, scope changes, discounts, and objections.
${contextBlock(ctx)}
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

// ---- Placeholder prompts (fill in then flip enabled=true) -------------------
const PLACEHOLDER = (label: string) => (_ctx: BrainArtifactContext) =>
  `TODO: ${label} prompt not yet configured.`;

export const BRAIN_ARTIFACTS: BrainArtifactDef[] = [
  {
    key: "icp",
    criterionText: "Ideal Customer Profile generated and reviewed",
    title: "Ideal Customer",
    subtitle: "Profile.",
    filenamePrefix: "ideal-customer-profile",
    enabled: true,
    buildPrompt: ICP_PROMPT,
  },
  {
    key: "offer_suite",
    criterionText: "Offer Suite generated and reviewed",
    title: "Offer",
    subtitle: "Suite.",
    filenamePrefix: "offer-suite",
    enabled: true,
    buildPrompt: OFFER_SUITE_PROMPT,
  },
  {
    key: "lead_intake_sop",
    criterionText: "Lead Intake SOP generated and reviewed",
    title: "Lead Intake",
    subtitle: "SOP.",
    filenamePrefix: "lead-intake-sop",
    enabled: true,
    buildPrompt: LEAD_INTAKE_PROMPT,
  },
  {
    key: "client_onboarding_sop",
    criterionText: "Client Onboarding SOP generated and reviewed",
    title: "Client Onboarding",
    subtitle: "SOP.",
    filenamePrefix: "client-onboarding-sop",
    enabled: true,
    buildPrompt: CLIENT_ONBOARDING_PROMPT,
  },
  {
    key: "content_creation_sop",
    criterionText: "Content Creation SOP generated and reviewed",
    title: "Content Creation",
    subtitle: "SOP.",
    filenamePrefix: "content-creation-sop",
    enabled: true,
    buildPrompt: CONTENT_CREATION_PROMPT,
  },
  {
    key: "weekly_review",
    criterionText: "Weekly Review Checklist generated and reviewed",
    title: "Weekly Review",
    subtitle: "Checklist.",
    filenamePrefix: "weekly-review-checklist",
    enabled: true,
    buildPrompt: WEEKLY_REVIEW_PROMPT,
  },
  {
    key: "pricing_guide",
    criterionText: "Pricing Decision Guide generated and reviewed",
    title: "Pricing Decision",
    subtitle: "Guide.",
    filenamePrefix: "pricing-decision-guide",
    enabled: true,
    buildPrompt: PRICING_DECISION_PROMPT,
  },
];
