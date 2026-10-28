// Pure logic for web-dev-discovery-chat's completion gate, split out so it's
// testable from the frontend test suite — the function itself reaches
// `npm:` and can't be imported there. See CLAUDE.md's house-style note on
// `_shared/agents/task-fields.ts` for why this split exists.
//
// CRE-780: the client's own [[DISCOVERY_COMPLETE]] marker isn't trusted on
// its own — three topics (social links, on-site contact details, wording)
// must show up in the Claude-extracted intake as actually having been
// asked, whatever the client answered, or the conversation keeps going.
export type GateTopic = "social" | "contact" | "wording";

export interface DiscoveryExtraction {
  social_links_asked?: unknown;
  site_contact_asked?: unknown;
  wording_asked?: unknown;
}

export function missingGateTopics(extracted: DiscoveryExtraction): GateTopic[] {
  const missing: GateTopic[] = [];
  if (extracted.social_links_asked !== true) missing.push("social");
  if (extracted.site_contact_asked !== true) missing.push("contact");
  if (extracted.wording_asked !== true) missing.push("wording");
  return missing;
}

// One canned follow-up per gated topic, asked in a fixed order — never a
// guess at what the client needs, always the exact same question.
export const GATE_QUESTIONS: Record<GateTopic, string> = {
  social: "Before we wrap up — do you have any social media profiles (Instagram, Facebook, LinkedIn, TikTok, etc.) you'd like linked from the new site? If not, just let me know and we'll leave it for now.",
  contact: "One more thing I need before we close out: what contact details do you want visible on the site? Phone number, public email, a physical address if that applies, your business hours, and the area you serve.",
  wording: "Last thing — is there any specific wording you want on the site? A tagline you already use, testimonials to feature, licenses or credentials to show, or any words you never want used?",
};
