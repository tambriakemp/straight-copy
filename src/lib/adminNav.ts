// Admin navigation, as data. Lives apart from the menu component so the menu
// file exports only a component (keeps fast refresh working).

export interface NavItem {
  to: string;
  label: string;
  glyph: string;
  exact?: boolean;
  group: string;
}

export const NAV_GROUPS = ["Workspace", "Business", "Reference", "Account"] as const;

export const NAV: NavItem[] = [
  { to: "/admin", label: "Dashboard", glyph: "◆", exact: true, group: "Workspace" },
  { to: "/admin/agents", label: "Agents", glyph: "◎", group: "Workspace" },
  { to: "/admin/tasks", label: "Tasks", glyph: "✓", group: "Workspace" },
  { to: "/admin/clients", label: "Clients", glyph: "▦", group: "Business" },
  { to: "/admin/ventures", label: "Ventures", glyph: "◈", group: "Business" },
  { to: "/admin/portfolio", label: "Portfolio", glyph: "◐", group: "Business" },
  { to: "/admin/wiki", label: "Knowledge Base", glyph: "❒", group: "Reference" },
  { to: "/admin/previews", label: "Previews", glyph: "▤", group: "Reference" },
  { to: "/admin/invites", label: "Invites", glyph: "✉", group: "Account" },
  { to: "/admin/tokens", label: "Settings", glyph: "⚙", group: "Account" },
  { to: "/admin/profile", label: "Profile", glyph: "☺", group: "Account" },
];
