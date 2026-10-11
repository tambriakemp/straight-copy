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
import { toast } from "sonner";
import { FileSearch, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import EmptyState from "@/components/admin/cv/EmptyState";
import { auditKind } from "@/lib/auditKinds";

export interface PortalAudit {
  id: string;
  slug: string;
  kind: string | null;
  client_name: string;
  cover_note: string | null;
  report_url: string | null;
  reviewed_at: string | null;
  shared_at: string | null;
  created_at: string;
  versionCount: number;
  latestVersion: number;
}

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

export default function AuditsSection({ clientProjectId }: { clientProjectId: string }) {
  const [audits, setAudits] = useState<PortalAudit[] | null>(null);

  const load = useCallback(async () => {
    // Through the RPC, not the table.
    //
    // The portal is a link, not a session, so there is nothing for RLS
    // to let in — and client_audits carries the report's PASSWORD, which
    // is exactly the column an anon SELECT policy would hand out.
    // portal_project_audits is SECURITY DEFINER, returns the client-safe
    // columns only, and only for a report that is both reviewed and
    // shared.
    const { data, error } = await supabase
      .rpc("portal_project_audits", { _client_project_id: clientProjectId });
    if (error) {
      // Until the migration runs the function does not exist. The tab
      // reads empty rather than throwing a toast on every portal load.
      if (!/does not exist|not find the function|schema cache/i.test(error.message)) {
        toast.error(error.message);
      }
      setAudits([]);
      return;
    }
    setAudits((data ?? []).map((r) => ({
      id: r.id, slug: r.slug, kind: r.kind, client_name: r.client_name,
      cover_note: r.cover_note, report_url: r.report_url,
      reviewed_at: r.reviewed_at, shared_at: r.shared_at, created_at: r.created_at,
      versionCount: r.version_count ?? 1, latestVersion: r.version_count ?? 1,
    })));
  }, [clientProjectId]);

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
                    Version {a.latestVersion}
                    {a.shared_at ? ` · shared ${fmt(a.shared_at)}` : ""}
                    {earlier ? ` · ${earlier} earlier version${earlier === 1 ? "" : "s"}` : ""}
                  </small>
                </span>
                {isNew(a.shared_at) && <span className="cv-chip cv-chip--blue">New</span>}
                <a
                  className="cv-open cv-open--dark"
                  style={{ padding: "0 16px" }}
                  href={a.report_url || `/audit/${a.slug}`}
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
