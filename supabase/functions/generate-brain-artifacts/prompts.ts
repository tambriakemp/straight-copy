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
    enabled: false,
    buildPrompt: PLACEHOLDER("Offer Suite"),
  },
  {
    key: "lead_intake_sop",
    criterionText: "Lead Intake SOP generated and reviewed",
    title: "Lead Intake",
    subtitle: "SOP.",
    filenamePrefix: "lead-intake-sop",
    enabled: false,
    buildPrompt: PLACEHOLDER("Lead Intake SOP"),
  },
  {
    key: "client_onboarding_sop",
    criterionText: "Client Onboarding SOP generated and reviewed",
    title: "Client Onboarding",
    subtitle: "SOP.",
    filenamePrefix: "client-onboarding-sop",
    enabled: false,
    buildPrompt: PLACEHOLDER("Client Onboarding SOP"),
  },
  {
    key: "content_creation_sop",
    criterionText: "Content Creation SOP generated and reviewed",
    title: "Content Creation",
    subtitle: "SOP.",
    filenamePrefix: "content-creation-sop",
    enabled: false,
    buildPrompt: PLACEHOLDER("Content Creation SOP"),
  },
  {
    key: "weekly_review",
    criterionText: "Weekly Review Checklist generated and reviewed",
    title: "Weekly Review",
    subtitle: "Checklist.",
    filenamePrefix: "weekly-review-checklist",
    enabled: false,
    buildPrompt: PLACEHOLDER("Weekly Review Checklist"),
  },
  {
    key: "pricing_guide",
    criterionText: "Pricing Decision Guide generated and reviewed",
    title: "Pricing Decision",
    subtitle: "Guide.",
    filenamePrefix: "pricing-decision-guide",
    enabled: false,
    buildPrompt: PLACEHOLDER("Pricing Decision Guide"),
  },
];
