// The frame around mockups 13-16: the dark top bar, the pill nav, the avatar.
//
// A SECOND SHELL, NOT A REPLACEMENT FOR `PortalShell`. That one is the
// light, side-navigation frame the project and feedback pages still use, and
// those pages are untouched by this card -- the brief is mockups 13-16 and
// says to ask before adding or renaming UI. Redrawing screens nobody drew
// would be exactly that.
//
// The consequence is visible and worth stating rather than hiding: Project
// and Files in the nav below lead to pages in the older frame. They work; the
// seam shows. Flagged on the card rather than fixed by redesigning two
// screens on my own initiative.
//
// WHY THE NAV IS A LIST OF LINKS AND NOT A VIEW SWITCHER
//
// The old portal kept its view in `?v=`, which made every destination the
// same URL. A client could not send "here is the payment page" to their
// bookkeeper, and the back button did nothing. These are real routes.

import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import type { PortalBranding, PortalMe } from "@/lib/clientPortalWire";

export type ClientPortalTab =
  | "home"
  | "project"
  | "agreements"
  | "payments"
  | "logins"
  | "files";

interface NavItem {
  tab: ClientPortalTab;
  label: string;
  to: (clientId: string) => string;
}

/**
 * The six destinations in mockup 13, in that order.
 *
 * Project and Files point at the pages that already serve them. There is no
 * mockup for either, so neither was rebuilt.
 */
const NAV: NavItem[] = [
  { tab: "home", label: "Home", to: (id) => `/portal/${id}` },
  { tab: "project", label: "Project", to: (id) => `/portal/${id}/project` },
  { tab: "agreements", label: "Agreements", to: (id) => `/portal/${id}/agreements` },
  { tab: "payments", label: "Payments", to: (id) => `/portal/${id}/payments` },
  { tab: "logins", label: "Logins", to: (id) => `/portal/${id}/logins` },
  { tab: "files", label: "Files", to: (id) => `/portal/${id}/files` },
];

export default function ClientPortalShell({
  clientId,
  branding,
  me,
  tab,
  adminPreview,
  viewAsGrant = false,
  actor = "",
  onExitPreview,
  children,
}: {
  clientId: string;
  branding: PortalBranding | null;
  me: PortalMe | null;
  tab: ClientPortalTab;
  adminPreview: boolean;
  /**
   * Whether the grant is a CRE-811 view-as token. Changes what the bar says,
   * because the two cases differ in a way that matters to the person reading
   * it: a token is READ-ONLY and the server will refuse a signature or a
   * payment made under it, and `?as=admin` with a real admin session is not.
   */
  viewAsGrant?: boolean;
  /** The admin, by name, when the token says. */
  actor?: string;
  onExitPreview?: () => void;
  children: ReactNode;
}) {
  const { search } = useLocation();
  // The `?as=admin` preview has to survive navigation, or the first click
  // inside a preview drops back out of it. A view-as token needs none of
  // this: it is in `sessionStorage`, so every link in the tab already carries
  // it and no URL has to.
  const keep = adminPreview && search.includes("as=admin") ? search : "";

  return (
    <div className="cp">
      {adminPreview && (
        <div className="cp__preview" role="status">
          <strong>{viewAsGrant ? "Viewing as client" : "Admin preview"}</strong>
          <span>
            {viewAsGrant
              ? `You are seeing exactly what the client sees${actor ? `, signed in as ${actor}` : ""}. This view is read-only — signing and paying are refused. Clients never see this bar.`
              : "You are viewing this portal as the client. Clients never see this bar."}
          </span>
          <a href="/admin/clients">Back to admin</a>
          {onExitPreview && (
            <button type="button" onClick={onExitPreview}>
              {viewAsGrant ? "End view-as" : "Exit preview"}
            </button>
          )}
        </div>
      )}

      <header className="cp__bar">
        <Link to={`/portal/${clientId}${keep}`} className="cp__brand">
          {/* Read, exactly like the name beside it. This tile held the two
              characters `C8` until CRE-797, so a portal branded "Northhill
              Studio" drew our mark against their name -- on the client-facing
              surface of something we license.

              Absent rather than derived when there is nothing to draw: for an
              install that chose no tile, and for a server older than the
              field (the function is deployed before the frontend is
              published, so that window is real). The tile is a 28px square in
              a flex row with a gap, so its absence closes up rather than
              leaving a hole, and nothing here invents a monogram to fill it.
              Deriving one would be this component having an opinion about
              somebody else's brand. */}
          {branding?.monogram ? (
            <span className="cp__mark" aria-hidden="true">
              {branding.monogram}
            </span>
          ) : null}
          <span className="cp__brandname">{branding?.agencyName ?? "Client portal"}</span>
          <span className="cp__brandnote">· client portal</span>
        </Link>

        <nav className="cp__nav" aria-label="Portal">
          {NAV.map((item) => (
            <Link
              key={item.tab}
              to={`${item.to(clientId)}${keep}`}
              className={`cp__navitem${item.tab === tab ? " cp__navitem--on" : ""}`}
              aria-current={item.tab === tab ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="cp__me">
          {/* Until the view has loaded there is no name to show. An empty
              circle holds the layout without asserting a name we do not have
              yet, which is what a placeholder set of initials would do. */}
          <span className="cp__avatar" aria-hidden="true">
            {me?.initials ?? ""}
          </span>
          <span className="cp__mename">{me?.displayName ?? ""}</span>
        </div>
      </header>

      <main className="cp__main">{children}</main>
    </div>
  );
}

/** The skeleton every screen shows while its one request is in flight. */
export function PortalLoading({ what }: { what: string }) {
  return (
    <div className="cp__state" role="status">
      Loading {what}…
    </div>
  );
}

/**
 * A failure, said in words a client can act on.
 *
 * The message comes from the server, which knows whether this was a refusal
 * or a fault. The retry is here because almost every one of these is worth
 * trying twice.
 */
export function PortalProblem({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="cp__state cp__state--bad" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="cp__btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
