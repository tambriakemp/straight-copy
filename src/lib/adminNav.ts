// Admin navigation, as data (CRE-332) — one source for the desktop side
// nav, the mobile bottom bar and the mobile ☰ drawer, so the three can't
// drift.

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
