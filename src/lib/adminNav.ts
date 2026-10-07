// Admin navigation, as data. Lives apart from the menu component so the menu
// file exports only a component (keeps fast refresh working).

import {
  Sun,
  Workflow,
  Target,
  Users,
  FileText,
  CreditCard,
  Megaphone,
  Grid2x2,
  type LucideIcon,
} from "lucide-react";

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

// ============================================================
// CRE-332 — nav for the new light .cv-admin side-nav shell.
// One source of data for the desktop side nav, the mobile bottom
// bar and the mobile ☰ drawer, so the three can't drift the way
// WorkspaceMenu / MobileTabBar / MobileTopBar did above.
// ============================================================

export interface CvNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface CvNavSection {
  title: string;
  items: CvNavItem[];
}

const cvToday: CvNavItem = { to: "/admin/today", label: "Today", icon: Sun };
const cvPipeline: CvNavItem = { to: "/admin/pipeline", label: "Pipeline", icon: Workflow };
const cvProspects: CvNavItem = { to: "/admin/prospects", label: "Prospects", icon: Target };
const cvClients: CvNavItem = { to: "/admin/clients", label: "Clients", icon: Users };
const cvProposals: CvNavItem = { to: "/admin/proposals", label: "Proposals", icon: FileText };
const cvMoney: CvNavItem = { to: "/admin/money", label: "Money", icon: CreditCard };
const cvMarketing: CvNavItem = { to: "/admin/marketing", label: "Marketing", icon: Megaphone };
const cvMore: CvNavItem = { to: "/admin/more", label: "More", icon: Grid2x2 };

/**
 * Whether a nav item should show active for the current path. One spot for
 * the exception: /admin/prospects is a pure redirect to /admin/approvals
 * until Phase 3 (the Oct 12 outreach hold), so Prospects should still
 * highlight once you land there — otherwise clicking it looks like it goes
 * nowhere.
 */
export function isCvNavActive(pathname: string, to: string): boolean {
  if (to === "/admin/prospects" && pathname.startsWith("/admin/approvals")) return true;
  if (to === "/admin/clients") return pathname === to;
  return pathname === to || pathname.startsWith(to + "/");
}

/** Desktop side nav: Bree's three sections (Oct 7, 2026 decision). */
export const CV_ADMIN_NAV: CvNavSection[] = [
  { title: "Daily", items: [cvToday, cvPipeline, cvProspects] },
  { title: "Work", items: [cvClients, cvProposals, cvMoney, cvMarketing] },
  { title: "Workspace", items: [cvMore] },
];

/** Mobile bottom bar: Today, Pipeline, Prospects, Clients, More — approved. */
export const CV_MOBILE_BOTTOM_NAV: CvNavItem[] = [cvToday, cvPipeline, cvProspects, cvClients, cvMore];

/** The rest, for the mobile ☰ drawer. */
export const CV_MOBILE_DRAWER_NAV: CvNavItem[] = [cvProposals, cvMoney, cvMarketing];
