// Admin navigation, as data. Lives apart from the menu component so the menu
// file exports only a component (keeps fast refresh working).

export interface NavItem {
  to: string;
  label: string;
  glyph: string;
  exact?: boolean;
}

/**
 * The menu holds what you visit occasionally.
 *
 * Agents is the home page and has its own tab in the bar, so listing it here
 * too would be a second door to the same room. Clients, Tasks and the
 * Knowledge Base live in each agent's Workspace rail now — they were removed
 * rather than duplicated, because a menu that still offers a thing you moved
 * teaches people the old route.
 *
 * The coding queue went the same way, into the engineering queue lead's rail.
 * It is that agent's whole job, and reading the queue's health next to the
 * agent that reorders it beats reading it on a page of its own.
 */
export const NAV: NavItem[] = [
  { to: "/admin/agents", label: "Agents", glyph: "✦" },
  { to: "/admin/tasks", label: "Tasks / Queue", glyph: "✓" },
  { to: "/admin/wiki", label: "Wiki", glyph: "≡" },
  { to: "/admin/tokens", label: "Tokens", glyph: "⚙" },
  { to: "/admin/invites", label: "Invites", glyph: "✉" },
  { to: "/admin/ventures", label: "Ventures", glyph: "◈" },
  { to: "/admin/portfolio", label: "Portfolio", glyph: "◐" },
  { to: "/admin/profile", label: "Profile", glyph: "☺" },
];
