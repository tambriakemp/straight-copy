export const WIKI_DEPARTMENTS = [
  "CEO","Sales","Hiring","Finance and Data","Masterminds","Client Experience",
  "Podcasting","Website","Content & Repurposing","Opt Ins","Tech",
  "Course Creation","Marketing & Visibility","Other",
] as const;

export const WIKI_DOC_TYPES = [
  "SOP","Vendor Info","Client Resource","Reference","Policy","Other",
] as const;

export const WIKI_STATUSES = ["Draft","Active","Archived"] as const;
export const WIKI_ACCESS = ["Founder Only","All Staff"] as const;

export type WikiDepartment = (typeof WIKI_DEPARTMENTS)[number];
export type WikiDocType = (typeof WIKI_DOC_TYPES)[number];
export type WikiStatus = (typeof WIKI_STATUSES)[number];
export type WikiAccess = (typeof WIKI_ACCESS)[number];

export interface WikiDocument {
  id: string;
  title: string;
  slug: string;
  department: WikiDepartment;
  doc_type: WikiDocType;
  content: string;
  owner: string | null;
  status: WikiStatus;
  access_level: WikiAccess;
  tags: string[];
  last_reviewed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "untitled";
}

export function isStale(reviewedAt: string | null): boolean {
  if (!reviewedAt) return true;
  const sixMonthsMs = 1000 * 60 * 60 * 24 * 183;
  return Date.now() - new Date(reviewedAt).getTime() > sixMonthsMs;
}

export function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
