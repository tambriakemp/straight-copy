// The Audits tab on a client's project, laid out to the canvas: one row
// per report, newest version on top, with the note we wrote above it.
//
// Reports are hosted behind /audit/:slug with a password (CRE-225), so
// "Open report" goes there rather than streaming a PDF into the portal —
// the password gate is the thing that makes a report safe to share, and
// a second route around it would be a second thing to get wrong.
//
// A client only ever sees a report that has been reviewed AND shared.
// Both are separate timestamps on purpose: reviewed means someone here
// read it, shared means it went out. An audit that is written but not
// checked is not a thing to show anybody.
import { useCallback, useEffect, useState } from "react";
import { FileSearch, ExternalLink } from "lucide-react";
import { clientPortal } from "@/lib/clientPortalApi";
import EmptyState from "@/components/admin/cv/EmptyState";
import { auditKind } from "@/lib/auditKinds";
import type { PortalAudit } from "@/lib/clientPortalWire";

/** Shared within the last fortnight — worth a nudge, not forever. */
const NEW_DAYS = 14;

function isNew(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && Date.now() - d.getTime() < NEW_DAYS * 86_400_000;
}

function fmt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AuditsSection({
  clientId, clientProjectId, adminPreview,
}: { clientId: string; clientProjectId: string; adminPreview: boolean }) {
  const [audits, setAudits] = useState<PortalAudit[] | null>(null);

  const load = useCallback(async () => {
    // Through `client-portal`, not the table or the RPC it used to call
    // directly: `client_audits` carries the report's password, which is
    // exactly the column an open SELECT policy would hand out, and the RPC
    // checked only that the project existed, not that it was this caller's.
    try {
      const data = await clientPortal.projectAudits(clientId, clientProjectId, adminPreview);
      setAudits(data);
    } catch {
      // A tab that fails to load reads as empty, not as a toast on every
      // portal visit -- the same tolerance the RPC it replaces had for an
      // install where the migration had not run yet.
      setAudits([]);
    }
  }, [clientId, clientProjectId, adminPreview]);

  useEffect(() => { void load(); }, [load]);

  if (audits === null) return <p className="cv-page-sub">Loading…</p>;

  // The filtering happens in the RPC now, which is the only place it can
  // be trusted: a client holding a portal link is not a caller we get to
  // ask nicely. Admin preview therefore sees exactly what the client
  // sees — which is the point of a preview.
  const visible = audits;

  return (
    <div className="cv-pg">
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <div style={{ flex: "1 1 300px" }}>
          <h2 className="cv-card-title" style={{ fontSize: 22 }}>Audits</h2>
          <p className="cv-page-sub">
            Reports Cre8 Visions has run on this project and shared with you.
            The newest version is on top.
          </p>
        </div>
      </div>

      {!visible.length ? (
        <EmptyState
          icon={FileSearch}
          title="No reports yet"
          subtitle="When we run an audit on this project, the report appears here."
        />
      ) : (
        <section className="cv-card cv-card-pad">
          {visible.map((a) => {
            const k = auditKind(a.kind);
            const earlier = Math.max(0, a.versionCount - 1);
            return (
              <div key={a.id} className="cv-it">
                <span className="cv-ic" style={{ background: k.bg, color: k.fg }}>
                  <FileSearch size={22} />
                </span>
                <span className="cv-it__what">
                  <b>{k.label}</b>
                  <small>
                    {/* Null, not 0, for a legacy-imported report nobody
                        numbered -- see `PortalAudit.latestVersion`. */}
                    {a.latestVersion !== null && `Version ${a.latestVersion}`}
                    {a.sharedAt ? ` · shared ${fmt(a.sharedAt)}` : ""}
                    {earlier ? ` · ${earlier} earlier version${earlier === 1 ? "" : "s"}` : ""}
                  </small>
                </span>
                {isNew(a.sharedAt) && <span className="cv-chip cv-chip--blue">New</span>}
                <a
                  className="cv-open cv-open--dark"
                  style={{ padding: "0 16px" }}
                  href={a.reportUrl || `/audit/${a.slug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open report <ExternalLink size={14} style={{ marginLeft: 6 }} />
                </a>
              </div>
            );
          })}
        </section>
      )}

      {visible.length > 0 && (
        <p className="cv-page-sub" style={{ margin: 0 }}>
          Each report opens with the note we wrote for you, then the full PDF.
          Questions about a finding? Use "Message us".
        </p>
      )}
    </div>
  );
}
