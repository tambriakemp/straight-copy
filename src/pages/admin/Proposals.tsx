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
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import ProposalGroupList from "@/components/admin/proposal/ProposalGroupList";
import { ReadOnlyNotice } from "@/components/admin/ReadOnlyNotice";
import { usd } from "@/lib/clientBalance";
import { loadAdminOperations, projectMap, type AdminOperations } from "@/lib/adminOperations";
import { daysOut } from "@/lib/proposalStatus";
import { groupFamilies } from "@/lib/proposalGroups";

export default function Proposals() {
  const [data, setData] = useState<AdminOperations | null>(null);
  const [copying, setCopying] = useState<string | null>(null);

  useEffect(() => {
    loadAdminOperations().then(setData).catch((e) => toast.error(e.message || "Failed to load proposals"));
  }, []);

  const projects = useMemo(() => projectMap(data?.projects ?? []), [data]);

  // Counted in families, not rows: three versions of one proposal is one
  // thing waiting on a client, and counting the rows put "3" on a tile
  // where the client owed exactly one answer.
  const grouped = useMemo(() => groupFamilies(data?.proposals ?? []), [data]);
  const awaiting = grouped.get("awaiting") ?? [];
  const signed = grouped.get("signed") ?? [];
  const declined = grouped.get("declined") ?? [];
  const countersign = grouped.get("countersign") ?? [];

  const oldest = awaiting.reduce<number | null>((max, f) => {
    const d = daysOut(f.current);
    return d != null && (max == null || d > max) ? d : max;
  }, null);
  const signedTotal = signed.reduce((s, f) => s + (f.current.total_cents ?? 0), 0);
  const lastDeclined = declined[0]?.current.declined_at;

  return (
    <AdminLayout topBar={false}>
      <div className="cv-admin cv-page" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
          <div style={{ flex: "1 1 300px", minWidth: 0 }}>
            <h1 className="cv-page-title">Proposals</h1>
            <p className="cv-page-sub">Every proposal across your clients, grouped by what happens next.</p>
          </div>
          <ReadOnlyNotice subject="proposal list" />
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
        ) : (
          <ProposalGroupList
            proposals={data.proposals}
            subtitleFor={(p) =>
              `${data.clientNames[p.client_id] ?? "—"} · ${projects[p.client_project_id]?.name ?? "—"}`}
          />
        )}
      </div>
    </AdminLayout>
  );
}
