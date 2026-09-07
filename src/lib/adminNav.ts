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
 *
 * The coding queue went the same way, into the engineering queue lead's rail.
 * It is that agent's whole job, and reading the queue's health next to the
 * agent that reorders it beats reading it on a page of its own.
 */
export const NAV: NavItem[] = [
  { to: "/admin/ventures", label: "Ventures", glyph: "◈", group: "Business" },
  { to: "/admin/portfolio", label: "Portfolio", glyph: "◐", group: "Business" },
  { to: "/admin/invites", label: "Invites", glyph: "✉", group: "Account" },
  { to: "/admin/tokens", label: "Settings", glyph: "⚙", group: "Account" },
  { to: "/admin/profile", label: "Profile", glyph: "☺", group: "Account" },
];

/**
 * Which of the two bar chips is lit, for a given location.
 *
 * Pure and here rather than inline in the menu so it can be tested: the two
 * chips overlap on every `/admin/agents/*` URL — Clients IS an agent workspace
 * view — and "both lit" or "neither lit" are both silent, plausible-looking
 * bugs that a component test would not catch either.
 */
export function activeChip(pathname: string, search: string): "agents" | "clients" | null {
  const view = new URLSearchParams(search).get("view");
  if (pathname.startsWith("/admin/clients")) return "clients";
  if (pathname.startsWith("/admin/agents")) return view === "clients" ? "clients" : "agents";
  if (pathname === "/admin") return "agents";
  return null;
}
