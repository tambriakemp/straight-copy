// Admin navigation, as data. Lives apart from the menu component so the menu
// file exports only a component (keeps fast refresh working).

export interface NavItem {
  to: string;
  label: string;
  glyph: string;
  exact?: boolean;
  group: string;
}

export const NAV_GROUPS = ["Workspace", "Business", "Account"] as const;

export const NAV: NavItem[] = [
  { to: "/admin", label: "Agents", glyph: "◎", exact: true, group: "Workspace" },
  // Clients, Tasks and the Knowledge Base are the three things you reach for
  // while working, so they sit together under Workspace — and each is also
  // reachable inside an agent's own rail, at the same routes.
  { to: "/admin/clients", label: "Clients", glyph: "▦", group: "Workspace" },
  { to: "/admin/tasks", label: "Tasks", glyph: "✓", group: "Workspace" },
  { to: "/admin/wiki", label: "Knowledge Base", glyph: "❒", group: "Workspace" },
  { to: "/admin/ventures", label: "Ventures", glyph: "◈", group: "Business" },
  { to: "/admin/portfolio", label: "Portfolio", glyph: "◐", group: "Business" },
  // Previews is deliberately absent. A preview belongs to one project and is
  // shown there; a separate top-level list of them was a second place for the
  // same thing to be, and the two drifted.
  { to: "/admin/invites", label: "Invites", glyph: "✉", group: "Account" },
  { to: "/admin/tokens", label: "Settings", glyph: "⚙", group: "Account" },
  { to: "/admin/profile", label: "Profile", glyph: "☺", group: "Account" },
];
