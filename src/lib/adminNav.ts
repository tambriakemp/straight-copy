// Admin navigation, as data. Lives apart from the menu component so the menu
// file exports only a component (keeps fast refresh working).

export interface NavItem {
  to: string;
  label: string;
  glyph: string;
  exact?: boolean;
  group: string;
}

export const NAV_GROUPS = ["Business", "Account"] as const;

/**
 * The menu holds what you visit occasionally.
 *
 * Agents is the home page and has its own tab in the bar, so listing it here
 * too would be a second door to the same room. Clients, Tasks and the
 * Knowledge Base live in each agent's Workspace rail now — they were removed
 * rather than duplicated, because a menu that still offers a thing you moved
 * teaches people the old route.
 */
export const NAV: NavItem[] = [
  { to: "/admin/ventures", label: "Ventures", glyph: "◈", group: "Business" },
  { to: "/admin/portfolio", label: "Portfolio", glyph: "◐", group: "Business" },
  { to: "/admin/invites", label: "Invites", glyph: "✉", group: "Account" },
  { to: "/admin/tokens", label: "Settings", glyph: "⚙", group: "Account" },
  { to: "/admin/profile", label: "Profile", glyph: "☺", group: "Account" },
];
