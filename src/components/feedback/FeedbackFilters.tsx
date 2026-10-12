// The row of filters above the comment list, on both boards.
//
// One component because the admin board and the client board must filter
// the same way: a client who says "I left three comments on Home" and an
// admin looking at a list that is quietly scoped differently is a support
// conversation nobody can win.
//
// The page picker is the important one. The rail used to print every page
// and every comment in one column, so finding the comments for the page
// you were actually looking at meant scrolling past forty "0 open" rows.
// Picking a page here ALSO moves the stage to it — they are the same
// choice, and two controls that disagree about which page you are on is
// worse than either.
import { Search } from "lucide-react";
import {
  foldersOf, pageLabel, STATUS_FILTER_OPTIONS, type BoardPage, type StatusFilter,
} from "@/lib/feedbackBoard";

export default function FeedbackFilters({
  pages, pageFilter, onPageFilter, status, onStatus, query, onQuery, openCount,
}: {
  pages: BoardPage[];
  /** A page key, or "all". */
  pageFilter: string;
  onPageFilter: (v: string) => void;
  status: StatusFilter;
  onStatus: (v: StatusFilter) => void;
  query: string;
  onQuery: (v: string) => void;
  openCount: number;
}) {
  const folders = foldersOf(pages);
  return (
    <>
      <label className="cv-search" style={{ borderRadius: 12, minHeight: 46 }}>
        <Search size={18} aria-hidden="true" />
        <span className="sr-only">Search comments</span>
        <input type="search" value={query} onChange={(e) => onQuery(e.target.value)}
          placeholder="Search comments..." />
      </label>

      <div className="cv-fb__filters">
        <label className="sr-only" htmlFor="fb-page">Which page</label>
        <select id="fb-page" className="cv-select" value={pageFilter}
          onChange={(e) => onPageFilter(e.target.value)}>
          <option value="all">All pages</option>
          {/* Grouped, so a page picked here is found the same way it is
              found in the Pages tab — by its folder first. */}
          {folders.map((f) => (
            <optgroup key={f.name} label={f.name}>
              {f.pages.map((p) => (
                <option key={p.key} value={p.key}>{pageLabel(p)}</option>
              ))}
            </optgroup>
          ))}
        </select>

        <label className="sr-only" htmlFor="fb-status">Which status</label>
        <select id="fb-status" className="cv-select" value={status}
          onChange={(e) => onStatus(e.target.value as StatusFilter)}>
          {STATUS_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: "var(--cv-muted)" }}>{openCount} open</span>
      </div>
    </>
  );
}
