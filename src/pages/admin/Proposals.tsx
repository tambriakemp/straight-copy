// /admin/proposals, laid out to the Admin Journeys canvas.
//
// It was five tabs over one flat list, which meant the first question the
// page asked you was "which tab?" when the thing you actually want to know
// is what is waiting on somebody. The canvas groups by exactly that:
// what needs your countersignature, what is out with a client, what is
// signed, what was declined. Nothing is hidden behind a tab, so a
// proposal that has been sitting for fifty-one days cannot be in the tab
// you did not open.
//
// Grouping reads off the timestamps rather than `status` — see
// @/lib/proposalStatus for why.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FileText, Plus } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import EmptyState from "@/components/admin/cv/EmptyState";
import { usd } from "@/lib/clientBalance";
import { loadAdminOperations, projectMap, type AdminOperations, type ProposalRollup } from "@/lib/adminOperations";
import {
  proposalGroup, trailFor, daysOut, GROUP_LABEL, GROUP_ORDER, STALE_DAYS,
  type ProposalGroup,
} from "@/lib/proposalStatus";

const GROUP_TONE: Record<ProposalGroup, string> = {
  countersign: "blue", awaiting: "amber", signed: "green", declined: "red", draft: "gray",
};
const DOC_TINT: Record<ProposalGroup, { bg: string; fg: string }> = {
  countersign: { bg: "#E7EEFF", fg: "#2447C0" },
  awaiting: { bg: "#FFF1E3", fg: "#A8440A" },
  signed: { bg: "#E5F6EC", fg: "#17703D" },
  declined: { bg: "#FBE9E7", fg: "#A32A1C" },
  draft: { bg: "#EEF0F5", fg: "#3D4556" },
};

function Trail({ proposal }: { proposal: ProposalRollup }) {
  return (
    <span className="cv-trail" style={{ marginTop: 6 }}>
      {trailFor(proposal).map((s, i) => (
        <span key={i} style={{ display: "contents" }}>
          <i className={s.bad ? "cv-trail__bad" : s.done ? "" : "cv-trail__no"} />
          <span>{s.label}</span>
        </span>
      ))}
    </span>
  );
}

export default function Proposals() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminOperations | null>(null);
  const [copying, setCopying] = useState<string | null>(null);

  useEffect(() => {
    loadAdminOperations().then(setData).catch((e) => toast.error(e.message || "Failed to load proposals"));
  }, []);

  const projects = useMemo(() => projectMap(data?.projects ?? []), [data]);

  const grouped = useMemo(() => {
    const out = new Map<ProposalGroup, ProposalRollup[]>();
    for (const p of data?.proposals ?? []) {
      const g = proposalGroup(p);
      out.set(g, [...(out.get(g) ?? []), p]);
    }
    return out;
  }, [data]);

  // Version counts per group, so a row can say "Version 3 (2 earlier
  // versions)" without a second query.
  const versionsInGroup = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of data?.proposals ?? []) {
      const key = p.version_group_id ?? p.id;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [data]);

  const copyClientLink = async (p: ProposalRollup) => {
    setCopying(p.id);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/portal/${p.client_id}?proposal=${p.id}`);
      toast.success("Client link copied");
    } catch {
      toast.error("Could not copy the link");
    } finally {
      setCopying(null);
    }
  };

  const awaiting = grouped.get("awaiting") ?? [];
  const signed = grouped.get("signed") ?? [];
  const declined = grouped.get("declined") ?? [];
  const countersign = grouped.get("countersign") ?? [];
  const oldest = awaiting.reduce<number | null>((max, p) => {
    const d = daysOut(p);
    return d != null && (max == null || d > max) ? d : max;
  }, null);
  const signedTotal = signed.reduce((s, p) => s + (p.total_cents ?? 0), 0);
  const lastDeclined = declined[0]?.declined_at;

  return (
    <AdminLayout topBar={false}>
      <div className="cv-admin cv-page" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
          <div style={{ flex: "1 1 300px", minWidth: 0 }}>
            <h1 className="cv-page-title">Proposals</h1>
            <p className="cv-page-sub">Every proposal across your clients, grouped by what happens next.</p>
          </div>
          <button
            type="button" className="cv-open cv-open--dark" style={{ padding: "0 20px" }}
            onClick={() => navigate("/admin/proposals/new")}
          >
            <Plus size={16} style={{ marginRight: 7 }} /> Upload proposal
          </button>
        </div>

        <div className="cv-stat-row">
          <div className="cv-card cv-stat cv-stat--dark">
            <span>Waiting on the client</span>
            <b>{awaiting.length}</b>
            <small>{oldest != null ? `Out for ${oldest} day${oldest === 1 ? "" : "s"}` : "Nothing out"}</small>
          </div>
          <div className="cv-card cv-stat">
            <span>Signed</span>
            <b>{signed.length}</b>
            <small>{signedTotal > 0 ? `${usd(signedTotal)} recorded` : "No totals recorded"}</small>
          </div>
          <div className="cv-card cv-stat">
            <span>Declined</span>
            <b>{declined.length}</b>
            <small>
              {lastDeclined
                ? new Date(lastDeclined).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                : "None"}
            </small>
          </div>
          <div className="cv-card cv-stat">
            <span>Needs your countersignature</span>
            <b>{countersign.length}</b>
            {/* Normally 0: signing countersigns in the same step. A row
                here means that step half-failed. */}
            <small>{countersign.length ? "Signing did not finish" : "All caught up"}</small>
          </div>
        </div>

        {!data ? (
          <p className="cv-page-sub">Loading…</p>
        ) : !data.proposals.length ? (
          <EmptyState icon={FileText} title="No proposals yet" subtitle="Upload one to get started." />
        ) : GROUP_ORDER.map((group) => {
          const rows = grouped.get(group) ?? [];
          if (!rows.length) return null;
          const tint = DOC_TINT[group];
          return (
            <section key={group} className="cv-card cv-card-pad">
              <div className="cv-card-head">
                <h2 className="cv-card-title">{GROUP_LABEL[group]}</h2>
                <span className={`cv-chip cv-chip--${GROUP_TONE[group]}`}>{rows.length}</span>
              </div>
              {rows.map((p) => {
                const project = projects[p.client_project_id];
                const out = daysOut(p);
                const earlier = (versionsInGroup.get(p.version_group_id ?? p.id) ?? 1) - 1;
                return (
                  <div key={p.id} className="cv-prow">
                    <span className="cv-ic" style={{ background: tint.bg, color: tint.fg }}>
                      <FileText size={22} />
                    </span>
                    <span className="cv-prow__what">
                      <strong>{p.title}</strong>
                      <small>
                        {data.clientNames[p.client_id] ?? "—"} · {project?.name ?? "—"} · Version {p.version}
                        {earlier > 0 ? ` (${earlier} earlier version${earlier === 1 ? "" : "s"})` : ""}
                      </small>
                      <Trail proposal={p} />
                    </span>

                    {out != null && out >= STALE_DAYS && (
                      <span className="cv-chip cv-chip--red">{out} days out</span>
                    )}

                    <span className={`cv-amt ${p.total_cents ? "" : "cv-amt--none"}`}>
                      {p.total_cents ? usd(p.total_cents) : "No total set"}
                    </span>

                    <span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {group === "awaiting" && (
                        <button
                          type="button" className="cv-open" style={{ padding: "0 16px" }}
                          disabled={copying === p.id}
                          onClick={() => copyClientLink(p)}
                        >
                          Copy client link
                        </button>
                      )}
                      {group === "declined" && project && (
                        <button
                          type="button" className="cv-open" style={{ padding: "0 16px" }}
                          onClick={() => navigate(`/admin/proposals/new?project=${project.id}&client=${p.client_id}`)}
                        >
                          Send a new version
                        </button>
                      )}
                      {/* View, even in the countersign group. proposal-sign
                          countersigns in the same step as the client's
                          signature, so there is no separate action to offer
                          — a row sitting there means that step half-failed,
                          and the thing to do is look at it. */}
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
                );
              })}
            </section>
          );
        })}
      </div>
    </AdminLayout>
  );
}
