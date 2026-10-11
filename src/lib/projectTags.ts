// CRE-366: color mapping for the free-text `project` field on done_items /
// approvals / pipeline hot-leads. Matches the calendar card's existing
// pattern (WeeklyCalendarCard's TYPE_COLOR) of literal hex per category
// rather than the `--cv-*` theme tokens, since these colors are meaningful
// categorical labels shared with the brief-sections mockup, not shell chrome.

export interface ProjectTagStyle {
  label: string;
  bg: string;
  fg: string;
  border: string;
}

const KNOWN_PROJECT_TAGS: Record<string, ProjectTagStyle> = {
  "cre8visions.com": { label: "cre8visions.com", bg: "#eef0ff", fg: "#4338ca", border: "#dfe2ff" },
  menovia: { label: "Menovia", bg: "#f3effe", fg: "#6d28d9", border: "#e6dcfd" },
  outreach: { label: "Outreach", bg: "#fdf0f6", fg: "#be185d", border: "#fadbe9" },
  rentals: { label: "Rentals", bg: "#e6f6f3", fg: "#0f766e", border: "#c3ebe3" },
  inbox: { label: "Inbox", bg: "#f3f4f6", fg: "#4b5563", border: "#e5e7eb" },
  security: { label: "Security", bg: "#fff6e8", fg: "#b45309", border: "#fde6c2" },
  // CRE-388: the live paperclip_pending_items/prospect/proposal/invoice
  // "kind" values, reused as-is for the merged Needs-you-now list's
  // category pill instead of inventing a second label for the same thing.
  approval: { label: "Approval", bg: "#eef0ff", fg: "#4338ca", border: "#dfe2ff" },
  interaction: { label: "Interaction", bg: "#f3effe", fg: "#6d28d9", border: "#e6dcfd" },
  "prospect approvals": { label: "Prospect approvals", bg: "#fdf0f6", fg: "#be185d", border: "#fadbe9" },
  "proposal draft": { label: "Proposal draft", bg: "#fdf0f6", fg: "#be185d", border: "#fadbe9" },
  "client profile": { label: "Client profile", bg: "#e6f6f3", fg: "#0f766e", border: "#c3ebe3" },
  "overdue invoice": { label: "Overdue invoice", bg: "#fff6e8", fg: "#b45309", border: "#fde6c2" },
};

const FALLBACK_TAG: Omit<ProjectTagStyle, "label"> = { bg: "#f3f4f6", fg: "#4b5563", border: "#e5e7eb" };

/** `project` is a free string from the brief payload (CRE-366 §3) — match
 *  known categories case-insensitively (normalizing to their canonical
 *  display label), fall back to a neutral tag with the project's own text
 *  as typed rather than dropping it. */
export function projectTagStyle(project: string): ProjectTagStyle {
  const known = KNOWN_PROJECT_TAGS[project.trim().toLowerCase()];
  return known ?? { ...FALLBACK_TAG, label: project };
}
