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

export default function AuditsSection({
  clientProjectId, asAdmin = false,
}: {
  clientProjectId: string;
  /** Admin preview sees unshared reports too, flagged as not yet sent. */
  asAdmin?: boolean;
}) {
  const [audits, setAudits] = useState<PortalAudit[] | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("client_audits")
      .select("id, slug, kind, client_name, cover_note, report_url, reviewed_at, shared_at, created_at")
      .eq("client_project_id", clientProjectId)
      .order("created_at", { ascending: false });
    if (error) {
      // A missing column means the migration has not run yet. The tab
      // reads empty rather than throwing a toast on every portal load.
      if (!/does not exist/i.test(error.message)) toast.error(error.message);
      setAudits([]);
      return;
    }
    const rows = (data ?? []) as Array<Omit<PortalAudit, "versionCount" | "latestVersion">>;
    const ids = rows.map((r) => r.id);
    const counts = new Map<string, number>();
    if (ids.length) {
      const { data: vs } = await supabase
        .from("audit_report_versions")
        .select("client_audit_id").in("client_audit_id", ids);
      for (const v of vs ?? []) {
        counts.set(v.client_audit_id, (counts.get(v.client_audit_id) ?? 0) + 1);
      }
    }
    setAudits(rows.map((r) => {
      const n = counts.get(r.id) ?? 1;
      return { ...r, versionCount: n, latestVersion: n };
    }));
  }, [clientProjectId]);

  useEffect(() => { void load(); }, [load]);

  if (audits === null) return <p className="cv-page-sub">Loading…</p>;

  // Reviewed AND shared, unless you are the admin looking at the preview.
  const visible = asAdmin
    ? audits
    : audits.filter((a) => a.reviewed_at && a.shared_at);

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
            const unsent = !a.shared_at;
            return (
              <div key={a.id} className="cv-it">
                <span className="cv-ic" style={{ background: k.bg, color: k.fg }}>
                  <FileSearch size={22} />
                </span>
                <span className="cv-it__what">
                  <b>{k.label}</b>
                  <small>
                    Version {a.latestVersion}
                    {a.shared_at ? ` · shared ${fmt(a.shared_at)}` : " · not sent yet"}
                    {earlier ? ` · ${earlier} earlier version${earlier === 1 ? "" : "s"}` : ""}
                  </small>
                </span>
                {unsent
                  ? <span className="cv-chip cv-chip--amber">Not sent</span>
                  : isNew(a.shared_at) && <span className="cv-chip cv-chip--blue">New</span>}
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
