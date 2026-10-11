// /admin/clients, laid out to the Admin Journeys canvas.
//
// It was a dark-themed table embedded in a light page through DarkEmbed —
// a leftover from before the admin was retoned, and the only screen left
// where opening a client meant reading a row of six columns to find out
// what was running for them. The canvas draws a card per client with its
// projects and their progress on the face of it, which is the question
// this page exists to answer.
//
// List is kept as a second mode because a roster you scan a column of is
// the right shape once there are more clients than fit on a screen. It is
// a table in this page's own language now, not the dark .crm-shell roster
// that used to be embedded here: that one brought its own surface, its own
// serif type and its own idea of which name a client goes by, so switching
// view looked like switching product.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, FolderKanban, Clock, Check } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import NewClientDialog from "@/components/admin/NewClientDialog";
import EmptyState from "@/components/admin/cv/EmptyState";
import { useClientDirectory } from "@/lib/useClientDirectory";
import {
  buildClientRows, applyFilter, matchesSearch,
  type ClientFilter, type ClientCardRow,
} from "@/lib/clientRows";
import { sumCounts } from "@/lib/taskCounts";

const FILTERS: Array<{ key: ClientFilter; label: string }> = [
  { key: "active", label: "Active" },
  { key: "needs_you", label: "Needs you" },
  { key: "archived", label: "Archived" },
];

function Stat({
  icon, iconBg, iconFg, label, value, dark = false,
}: {
  icon: React.ReactNode; iconBg: string; iconFg: string;
  label: string; value: number; dark?: boolean;
}) {
  return (
    <div className={`cv-card cv-stat ${dark ? "cv-stat--dark" : ""}`}>
      <span className="cv-ic" style={{ background: iconBg, color: iconFg }}>{icon}</span>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function ClientCard({ row, onOpen }: { row: ClientCardRow; onOpen: () => void }) {
  return (
    <section className="cv-card cv-card-pad cv-client-card">
      <div className="cv-client-card__head">
        <span
          className="cv-av"
          style={{ background: row.avatar.bg, color: row.avatar.fg, width: 52, height: 52, fontSize: 17 }}
        >
          {row.avatar.initials}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="cv-client-card__name">{row.name}</h2>
          {row.who && <div className="cv-client-card__who">{row.who}</div>}
        </div>
        <span className={`cv-chip cv-chip--${row.status.tone}`}>{row.status.label}</span>
      </div>

      {row.projects.length > 0 && (
        <div className="cv-client-card__projects">
          {row.projects.map((p) => (
            <div key={p.id} className="cv-pr">
              <i style={{ background: p.type.dot }} />
              <span className="cv-pr__nm">
                {p.name}
                <span className="cv-pr__ty">{p.type.label}</span>
              </span>
              <span className="cv-bar"><i style={{ width: `${p.counts.pct}%` }} /></span>
              <span className="cv-pr__pc">{p.counts.done} / {p.counts.total}</span>
            </div>
          ))}
          {row.extraProjects > 0 && (
            <div className="cv-more">+ {row.extraProjects} more project{row.extraProjects === 1 ? "" : "s"}</div>
          )}
        </div>
      )}

      <button type="button" className="cv-open" style={{ marginTop: "auto" }} onClick={onOpen}>
        Open client
      </button>
    </section>
  );
}

function ClientTable({ rows, onOpen }: { rows: ClientCardRow[]; onOpen: (id: string) => void }) {
  return (
    <section className="cv-card cv-card-pad" style={{ overflowX: "auto" }}>
      <table className="cv-table">
        <thead>
          <tr>
            <th>Client</th>
            <th>Projects</th>
            <th>Open</th>
            <th>Done</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} onClick={() => onOpen(row.id)}>
              <td>
                <span className="cv-table__who">
                  <span
                    className="cv-av"
                    style={{ background: row.avatar.bg, color: row.avatar.fg, width: 36, height: 36, borderRadius: 11, fontSize: 13 }}
                  >
                    {row.avatar.initials}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="cv-table__name" style={{ display: "block" }}>{row.name}</span>
                    {row.who && <span className="cv-table__sub">{row.who}</span>}
                  </span>
                </span>
              </td>
              <td className="cv-table__num">{row.projects.length + row.extraProjects}</td>
              <td className="cv-table__num">{row.totals.open}</td>
              <td className="cv-table__num">{row.totals.done}</td>
              <td><span className={`cv-chip cv-chip--${row.status.tone}`}>{row.status.label}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function ClientsList() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ClientFilter>("active");
  const [view, setView] = useState<"cards" | "list">("cards");
  const { clients, projectsByClient, counts, loading, reload } = useClientDirectory();

  const rows = useMemo(
    () => buildClientRows(clients, projectsByClient, counts),
    [clients, projectsByClient, counts],
  );

  const visible = useMemo(() => {
    return applyFilter(rows, filter).filter((r) =>
      matchesSearch(r, query, (projectsByClient.get(r.id) ?? []).map((p) => p.name)),
    );
  }, [rows, filter, query, projectsByClient]);

  // Headline figures read the whole agency, not the current filter — they
  // are what is true, not what you happen to be looking at.
  const live = useMemo(() => applyFilter(rows, "active"), [rows]);
  const totals = useMemo(() => sumCounts(live.map((r) => r.totals)), [live]);
  const activeProjects = useMemo(
    () => live.reduce((n, r) => n + r.projects.length + r.extraProjects, 0),
    [live],
  );
  const filterCounts: Record<ClientFilter, number> = {
    active: live.length,
    needs_you: applyFilter(rows, "needs_you").length,
    archived: applyFilter(rows, "archived").length,
  };

  return (
    <AdminLayout topBar={false}>
      <div className="cv-admin cv-page" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>

        <div className="cv-searchbar">
          <label className="cv-search">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search clients</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients, projects, tasks..."
            />
          </label>
          {/* The dialog's own body is still dark (.crm-shell); only its
              trigger is themed to this page, so the button beside the search
              is the canvas's ink pill rather than a dark control in a patch. */}
          <NewClientDialog
            label="+ New client"
            triggerClassName="cv-btn-ink"
            onCreated={(clientId) => { reload(); navigate(`/admin/clients/${clientId}`); }}
          />
        </div>

        <div>
          <h1 className="cv-page-title">Clients</h1>
          <p className="cv-page-sub">Every brand on your books and what is running for each one.</p>
        </div>

        <div className="cv-stat-row">
          <Stat dark icon={<Users size={22} />} iconBg="#262B36" iconFg="#FFFFFF"
            label="Active clients" value={live.length} />
          <Stat icon={<FolderKanban size={22} />} iconBg="#E5F6EC" iconFg="#1E8E4E"
            label="Active projects" value={activeProjects} />
          <Stat icon={<Clock size={22} />} iconBg="#FFF1E3" iconFg="#C2500A"
            label="Open tasks" value={totals.open} />
          <Stat icon={<Check size={22} />} iconBg="#E7EEFF" iconFg="#2F5BEA"
            label="Tasks done" value={totals.done} />
        </div>

        <div className="cv-tabrow">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`cv-tabpill ${filter === f.key ? "cv-tabpill--on" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}{filterCounts[f.key] > 0 ? ` · ${filterCounts[f.key]}` : ""}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <span className="cv-viewseg" role="group" aria-label="View">
            {(["cards", "list"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={`cv-viewseg__btn ${view === v ? "cv-viewseg__btn--on" : ""}`}
                onClick={() => setView(v)}
              >
                {v === "cards" ? "Cards" : "List"}
              </button>
            ))}
          </span>
        </div>

        {loading ? (
          <p className="cv-page-sub">Loading…</p>
        ) : !visible.length ? (
          <EmptyState
            title={query ? "Nothing matches that" : "No clients here"}
            subtitle={query ? "Try a shorter search." : "Nothing in this filter."}
          />
        ) : view === "list" ? (
          <ClientTable rows={visible} onOpen={(id) => navigate(`/admin/clients/${id}`)} />
        ) : (
          <div className="cv-client-grid">
            {visible.map((row) => (
              <ClientCard key={row.id} row={row} onOpen={() => navigate(`/admin/clients/${row.id}`)} />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
