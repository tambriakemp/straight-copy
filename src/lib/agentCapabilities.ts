// What each agent does, in at most three lines.
//
// Mirrors the `capabilities` field in supabase/functions/_shared/agents/
// registry.ts. It is duplicated rather than fetched on purpose: the registry
// lives in a Deno edge function the browser cannot import, and the alternative
// — an API round trip to render three bullets — makes the page depend on a
// function being deployed just to describe itself. Keep the two in step when
// an agent's job changes.
export const AGENT_CAPABILITIES: Record<string, string[]> = {
  "revenue-analyst": [
    "Reads cash and run-rate across the agency and every venture",
    "Writes the weekly money brief, with what moved and why",
    "Flags data that looks wrong before you quote it to someone",
  ],
  "launch-ops": [
    "Tracks every open launch against its goal, at pace",
    "Finds the funnel stage people are dropping out of",
    "Drafts the cart-closing reminder for your approval",
  ],
  "client-triage": [
    "Sweeps overdue tasks, unpaid invoices and unsigned proposals",
    "Ranks them by what is costing money or trust",
    "Opens chase tasks and drafts the client email",
  ],
  developer: [
    "Judges whether queued tasks are specified well enough to run",
    "Orders the queue by what unblocks the most work",
    "Summarises what came back and needs review",
  ],
  "social-media": [
    "Chases a new client until CoPost is connected and photos are in",
    "Writes the caption and hashtags for every post still waiting on one",
    "Books the next two weeks to CoPost, unattended for cleared clients",
  ],
  "client-engagement": [
    "Keeps every client in SureContact, tagged and current",
    "Writes proposals to the locked Cre8 Visions structure",
    "Sends, tracks opens and clicks, and follows up when they go quiet",
  ],
};

/** Three bullets for an agent, or none if we don't have a description for it. */
export function capabilitiesFor(key: string): string[] {
  return (AGENT_CAPABILITIES[key] ?? []).slice(0, 3);
}
