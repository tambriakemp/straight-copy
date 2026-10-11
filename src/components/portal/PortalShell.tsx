// The client portal's frame: the side nav, the admin-preview strip, and
// the column the pages render into.
//
// One shell for every portal page, so the nav cannot say one thing on
// Home and another on a project. The counts on it are passed in rather
// than fetched here — Home already loads proposals and invoices to show
// them, and a shell that fetched its own would ask for the same rows a
// second time on every page.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { avatarFor } from "@/lib/avatar";

export type PortalView = "home" | "projects" | "proposals" | "payments";

export interface PortalNavCounts {
  proposals?: number;
  feedback?: number;
}

export default function PortalShell({
  clientId, clientName, businessName, adminPreview, onExitPreview,
  view, onView, counts = {}, children,
}: {
  clientId: string;
  clientName: string;
  businessName: string | null;
  adminPreview: boolean;
  onExitPreview?: () => void;
  /** Null on a page that is not one of the four nav destinations. */
  view: PortalView | null;
  onView: (v: PortalView) => void;
  counts?: PortalNavCounts;
  children: ReactNode;
}) {
  const me = avatarFor(clientName || businessName || "?");
  const item = (v: PortalView, label: string, n?: number) => (
    <button type="button" className={`cv-ni ${view === v ? "cv-ni--on" : ""}`} onClick={() => onView(v)}>
      {label}
      {n ? <span className="cv-ni__n">{n}</span> : null}
    </button>
  );

  return (
    <div className="cv-admin cv-portal">
      {adminPreview && (
        <div className="cv-portal__asadmin" role="status">
          <span style={{ fontWeight: 600 }}>Admin preview</span>
          <span style={{ flex: "1 1 240px" }}>
            You're viewing this portal as the client. Clients never see this bar.
          </span>
          <a href="/admin/clients">Back to admin</a>
          {onExitPreview && (
            <button type="button" onClick={onExitPreview}
              style={{ background: "none", border: 0, font: "inherit", color: "#fff", cursor: "pointer", padding: "10px 0", textDecoration: "underline" }}>
              Exit preview
            </button>
          )}
        </div>
      )}

      <div className="cv-portal__body">
        <nav aria-label="Portal" className="cv-card cv-portal__nav">
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 8px 20px" }}>
            <span style={{ width: 46, height: 46, borderRadius: "50%", background: "var(--cv-ink)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 600, fontSize: 18 }}>C</span>
            <span>
              <span style={{ display: "block", fontWeight: 600, fontSize: 17, lineHeight: 1.2 }}>Cre8 Visions</span>
              <span style={{ display: "block", fontSize: 13, color: "var(--cv-muted)" }}>Client portal</span>
            </span>
          </div>

          {item("home", "Home")}
          {item("projects", "Projects")}
          {item("proposals", "Proposals", counts.proposals)}
          {item("payments", "Payments")}
          <Link className="cv-ni" to={`/portal/${clientId}/feedback`}>
            Feedback board
            {counts.feedback ? <span className="cv-ni__n">{counts.feedback}</span> : null}
          </Link>

          <div style={{ borderTop: "1px dashed var(--cv-border-strong)", margin: "16px 8px 14px" }} />

          <div className="cv-portal__help">
            <div style={{ fontSize: 14, fontWeight: 600 }}>Need something?</div>
            <div style={{ fontSize: 13, color: "var(--cv-muted)" }}>
              Send a message and Cre8 Visions will get back to you.
            </div>
            <a className="cv-open cv-open--dark" style={{ minHeight: 44 }} href="mailto:info@cre8visions.com">
              Message us
            </a>
          </div>

          <div className="cv-portal__me">
            <span style={{ width: 38, height: 38, borderRadius: "50%", background: me.bg, color: me.fg, display: "grid", placeItems: "center", fontSize: 13, fontWeight: 600 }}>
              {me.initials}
            </span>
            <span style={{ fontSize: 14, minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 500, overflowWrap: "anywhere" }}>{clientName}</span>
              {businessName && (
                <span style={{ display: "block", fontSize: 13, color: "var(--cv-muted)", overflowWrap: "anywhere" }}>
                  {businessName}
                </span>
              )}
            </span>
          </div>
        </nav>

        <main className="cv-portal__main">{children}</main>
      </div>
    </div>
  );
}
