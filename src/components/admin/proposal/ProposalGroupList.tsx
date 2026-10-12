// The grouped proposal list, shared by /admin/proposals and the project
// page's Proposals tab.
//
// One component because the two are the same list at different scopes,
// and the project page's old panel proved the cost of two: it was dark
// where the rest of the admin is light, it called a superseded version
// "SUPERSEDED" where the main list called it nothing at all, and it had
// its own upload form. A proposal should not look like a different
// object depending on which page you reached it from.
import { FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import EmptyState from "@/components/admin/cv/EmptyState";
import CollapsibleCard from "@/components/admin/cv/CollapsibleCard";
import { usd } from "@/lib/clientBalance";
import {
  trailFor, daysOut, GROUP_LABEL, GROUP_ORDER, STALE_DAYS, type ProposalGroup,
} from "@/lib/proposalStatus";
import { groupFamilies, versionLine, type VersionedProposal } from "@/lib/proposalGroups";

export interface ListProposal extends VersionedProposal {
  client_id: string;
  client_project_id: string;
  title: string;
  total_cents: number | null;
}

const GROUP_TONE: Record<ProposalGroup, string> = {
  countersign: "blue", awaiting: "amber", signed: "green",
  declined: "red", draft: "gray", superseded: "gray",
};
const DOC_TINT: Record<ProposalGroup, { bg: string; fg: string }> = {
  countersign: { bg: "#E7EEFF", fg: "#2447C0" },
  awaiting: { bg: "#FFF1E3", fg: "#A8440A" },
  signed: { bg: "#E5F6EC", fg: "#17703D" },
  declined: { bg: "#FBE9E7", fg: "#A32A1C" },
  draft: { bg: "#EEF0F5", fg: "#3D4556" },
  superseded: { bg: "#EEF0F5", fg: "#3D4556" },
};

function Trail({ p }: { p: ListProposal }) {
  return (
    <span className="cv-trail" style={{ marginTop: 6 }}>
      {trailFor(p).map((s, i) => (
        <span key={i} style={{ display: "contents" }}>
          <i className={s.bad ? "cv-trail__bad" : s.done ? "" : "cv-trail__no"} />
          <span>{s.label}</span>
        </span>
      ))}
    </span>
  );
}

export default function ProposalGroupList({
  proposals, subtitleFor, showEmpty = true,
}: {
  proposals: ListProposal[];
  /** The line under the title — who and which project, or just the project. */
  subtitleFor: (p: ListProposal) => string;
  showEmpty?: boolean;
}) {
  const navigate = useNavigate();
  const grouped = groupFamilies(proposals);

  const copyClientLink = async (p: ListProposal) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/portal/${p.client_id}/proposals/${p.id}`);
      toast.success("Client link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  };

  if (!proposals.length) {
    return showEmpty
      ? <EmptyState icon={FileText} title="No proposals yet" subtitle="Upload one to get started." />
      : null;
  }

  return (
    <>
      {GROUP_ORDER.map((group) => {
        const families = grouped.get(group) ?? [];
        if (!families.length) return null;
        const tint = DOC_TINT[group];
        // Declined is history, not work. Open by default it takes the
        // same room as the proposals someone still owes an answer on,
        // and reads as something to act on.
        const Section = group === "declined"
          ? ({ children }: { children: React.ReactNode }) => (
            <CollapsibleCard title={GROUP_LABEL[group]} count={families.length}
              tone={GROUP_TONE[group] as "red"}>
              {children}
            </CollapsibleCard>
          )
          : ({ children }: { children: React.ReactNode }) => (
            <section className="cv-card cv-card-pad">
              <div className="cv-card-head">
                <h2 className="cv-card-title">{GROUP_LABEL[group]}</h2>
                <span className={`cv-chip cv-chip--${GROUP_TONE[group]}`}>{families.length}</span>
              </div>
              {children}
            </section>
          );
        return (
          <Section key={group}>
            {families.map((f) => {
              const p = f.current;
              const out = daysOut(p);
              return (
                <div key={p.id}>
                  <div className="cv-prow">
                    <span className="cv-ic" style={{ background: tint.bg, color: tint.fg }}>
                      <FileText size={22} />
                    </span>
                    <span className="cv-prow__what">
                      <strong>{p.title}</strong>
                      <small>{subtitleFor(p)} · {versionLine(f)}</small>
                      <Trail p={p} />
                    </span>

                    {out != null && out >= STALE_DAYS && (
                      <span className="cv-chip cv-chip--red">{out} days out</span>
                    )}

                    <span className={`cv-amt ${p.total_cents ? "" : "cv-amt--none"}`}>
                      {p.total_cents ? usd(p.total_cents) : "No total set"}
                    </span>

                    <span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {group === "awaiting" && (
                        <button type="button" className="cv-open" style={{ padding: "0 16px" }}
                          onClick={() => copyClientLink(p)}>
                          Copy client link
                        </button>
                      )}
                      {group === "declined" && (
                        <button type="button" className="cv-open" style={{ padding: "0 16px" }}
                          onClick={() => navigate(`/admin/proposals/new?project=${p.client_project_id}&client=${p.client_id}&supersedes=${p.id}`)}>
                          Send a new version
                        </button>
                      )}
                      <button
                        type="button"
                        className={`cv-open ${group === "countersign" ? "cv-open--dark" : ""}`}
                        style={{ padding: "0 16px" }}
                        onClick={() => navigate(`/admin/proposals/${p.id}`)}
                      >
                        View
                      </button>
                    </span>
                  </div>

                  {/* Earlier versions, small and underneath. They are
                      history, not work: a row the same size as the live
                      one reads as another thing the client owes an
                      answer to. */}
                  {f.earlier.map((e) => (
                    <div
                      key={e.id}
                      style={{
                        display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10,
                        padding: "8px 16px", marginLeft: 24, fontSize: 13, color: "var(--cv-muted)",
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>v{e.version}</span>
                      <span style={{ flex: "1 1 160px", minWidth: 0, overflowWrap: "break-word" }}>{e.title}</span>
                      <span className="cv-chip cv-chip--gray">
                        {(e.status ?? "").toLowerCase() === "voided" ? "Voided" : "Superseded"}
                      </span>
                      <button type="button" className="cv-mini" onClick={() => navigate(`/admin/proposals/${e.id}`)}>
                        View
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
          </Section>
        );
      })}
    </>
  );
}
