// One client, laid out to the Admin Journeys canvas: who they are and what
// they owe down the left, their projects and what has happened down the
// right.
//
// It was six tabs — Overview, Intake, Proposals, Payments, Project & Tasks,
// Files & Portal — and five of them were about a project rather than a
// client. A client has one proposal only in the sense that one of their
// projects does; the Payments tab was literally a loop over projects. The
// canvas moves all five onto the project page, where the thing they
// describe actually lives, and leaves the client page the three questions
// that are about the client: what are we doing for them, what do we know
// about them, and how do we get into their accounts.
//
// Overview is gone as a tab because the canvas prints it: the identity
// card down the left is the whole of what that tab held.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import EmptyState from "@/components/admin/cv/EmptyState";
import ProjectTypeIcon from "@/components/admin/cv/ProjectTypeIcon";
import { avatarFor } from "@/lib/avatar";
import { projectTypeStyle } from "@/lib/projectType";
import { countsFor } from "@/lib/taskCounts";
import { usd } from "@/lib/clientBalance";
import { useClientRecord, type ClientProjectRow, type ClientRecord } from "./useClientRecord";

type Tab = "projects" | "notes" | "logins";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** `intake_submitted` → `Intake submitted`. The column is free text. */
function humanise(s: string | null | undefined): string {
  const v = (s ?? "").replace(/[_-]+/g, " ").trim();
  if (!v) return "—";
  return v.charAt(0).toUpperCase() + v.slice(1);
}

/**
 * The portal actions under the avatar: the canvas's two, and under them
 * the two that came off ClientPortalActions' row of four dark icon
 * buttons — a shape from the old dark admin with no labels on it at all.
 *
 * All four as buttons rather than the last two as a quiet line of text.
 * The line said "these are lesser" when what they actually are is rarer,
 * and "sync this client to SureContact" is not something you can do
 * anywhere else in the admin.
 */
function PortalActions({ clientId }: { clientId: string }) {
  const copy = async (path: string, label: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy link");
    }
  };

  const syncSureContact = async () => {
    const t = toast.loading("Syncing to SureContact…");
    try {
      const { data, error } = await supabase.functions.invoke("sync-client-to-surecontact", { body: { clientId } });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Sync failed");
      toast.success("Synced to SureContact", { id: t });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed", { id: t });
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
      <button type="button" className="cv-open cv-open--dark" onClick={() => copy(`/portal/${clientId}`, "Portal link")}>
        Copy portal link
      </button>
      <a className="cv-open" href={`/portal/${clientId}?as=admin`} target="_blank" rel="noreferrer">
        Open portal
      </a>
      <button type="button" className="cv-open" onClick={() => copy(`/portal/${clientId}?focus=contract`, "Contract link")}>
        Contract link
      </button>
      <button type="button" className="cv-open" onClick={syncSureContact}>
        Sync to SureContact
      </button>
    </div>
  );
}

function IdentityCard({ client, clientId }: { client: ClientRecord; clientId: string }) {
  // The avatar is of the business when there is one, so the square beside
  // "Dr. Khadra Kahin" is the same "Me" you clicked on the Clients list.
  const av = avatarFor(client.business_name || client.contact_name || "?", client.internal);
  const status = client.archived
    ? { label: "Archived", tone: "gray" }
    : client.internal
      ? { label: "Internal", tone: "gray" }
      : { label: "Active", tone: "green" };

  return (
    <section className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 8 }}>
        <span
          className="cv-av"
          style={{ background: av.bg, color: av.fg, width: 76, height: 76, borderRadius: 24, fontSize: 24 }}
        >
          {av.initials}
        </span>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{client.contact_name || "—"}</div>
          <div style={{ fontSize: 14, color: "var(--cv-muted)" }}>{client.business_name || ""}</div>
        </div>
        <span className={`cv-chip cv-chip--${status.tone}`}>{status.label}</span>
      </div>

      <PortalActions clientId={clientId} />

      <div style={{ borderTop: "1px dashed var(--cv-border-strong)" }} />

      <dl className="cv-deflist">
        <div><dt>Email</dt><dd>{client.contact_email || "—"}</dd></div>
        <div><dt>Phone</dt><dd>{client.contact_phone || "—"}</dd></div>
        <div><dt>Client since</dt><dd>{fmtDate(client.created_at)}</dd></div>
        <div><dt>Tier</dt><dd>{humanise(client.tier)}</dd></div>
        <div><dt>Stage</dt><dd>{humanise(client.pipeline_stage)}</dd></div>
      </dl>
    </section>
  );
}

function BalanceCard({ balance }: { balance: ReturnType<typeof useClientRecord>["balance"] }) {
  return (
    <section
      className="cv-card cv-card-pad"
      style={{ background: "var(--cv-ink)", color: "#fff", display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontSize: 14, color: "#C9CFDB" }}>Balance due</span>
        <span className="cv-chip" style={{ background: "#262B36", color: "#fff" }}>{balance.nextLabel}</span>
      </div>
      <div style={{ fontSize: 34, fontWeight: 600, lineHeight: 1 }}>{usd(balance.dueCents)}</div>
      <div style={{ fontSize: 13, color: "#C9CFDB" }}>
        {balance.empty
          ? "Nothing invoiced on any of this client's projects yet."
          : balance.next
            ? [balance.next.label, balance.next.projectName].filter(Boolean).join(", ")
            : "Every invoice on this client's projects has been paid."}
      </div>
      {!balance.empty && (
        <>
          <span className="cv-bar cv-bar--invert"><i style={{ width: `${balance.pct}%` }} /></span>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#C9CFDB" }}>
            <span>Paid {usd(balance.paidCents)}</span>
            <span>of {usd(balance.totalCents)}</span>
          </div>
        </>
      )}
    </section>
  );
}

function ProjectRow({
  project, done, total, open, onOpen,
}: {
  project: ClientProjectRow; done: number; total: number; open: number; onOpen: () => void;
}) {
  const type = projectTypeStyle(project.type);
  const pct = total === 0 ? 0 : Math.floor((done / total) * 100);
  return (
    <button type="button" className="cv-proj" onClick={onOpen} style={{ textAlign: "left", border: 0, font: "inherit", cursor: "pointer", width: "100%" }}>
      <ProjectTypeIcon type={project.type} />
      <span style={{ flex: "1 1 200px", minWidth: 0 }}>
        <span className="cv-proj__name">{project.name}</span>
        <span className="cv-proj__type">{type.label}</span>
      </span>
      <span className="cv-proj__meter">
        <span className="cv-proj__meter-top">
          <span>{total === 0 ? "No tasks yet" : `${done} of ${total} tasks`}</span>
          <span>{pct}%</span>
        </span>
        <span className="cv-bar"><i style={{ width: `${pct}%` }} /></span>
      </span>
      <span className={`cv-chip ${open > 0 ? "cv-chip--amber" : "cv-chip--gray"}`}>
        {open > 0 ? `${open} open` : "No open tasks"}
      </span>
    </button>
  );
}

export default function ClientDetailView({ clientId }: { clientId: string }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("projects");
  const [showArchived, setShowArchived] = useState(false);
  const { client, projects, counts, notes, secrets, balance, loading } = useClientRecord(clientId);

  const { live, archived } = useMemo(() => {
    const isArchived = (p: ClientProjectRow) => p.status === "archived";
    return { live: projects.filter((p) => !isArchived(p)), archived: projects.filter(isArchived) };
  }, [projects]);

  const shown = showArchived ? [...live, ...archived] : live;

  if (loading) {
    return (
      <div className="cv-admin cv-page" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <p className="cv-page-sub">Loading…</p>
      </div>
    );
  }
  if (!client) {
    return (
      <div className="cv-admin cv-page" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <a className="cv-back" href="/admin/clients">← All clients</a>
        <EmptyState title="Client not found" subtitle="It may have been deleted." />
      </div>
    );
  }

  const TABS: Array<{ key: Tab; label: string; count?: number }> = [
    { key: "projects", label: "Projects", count: projects.length },
    { key: "notes", label: "Notes", count: notes.length },
    { key: "logins", label: "Logins", count: secrets.length },
  ];

  return (
    <div className="cv-admin cv-page" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
      <div>
        <a className="cv-back" href="/admin/clients">← All clients</a>
        <h1 className="cv-page-title">{client.contact_name || client.business_name || "Untitled"}</h1>
      </div>

      <div className="cv-split">
        <aside className="cv-split__side">
          <IdentityCard client={client} clientId={clientId} />
          <BalanceCard balance={balance} />
        </aside>

        <div className="cv-split__main">
          <div className="cv-tabrow">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`cv-tabpill ${tab === t.key ? "cv-tabpill--on" : ""}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}{t.count ? ` · ${t.count}` : ""}
              </button>
            ))}
          </div>

          {tab === "projects" && (
            <section className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <h2 className="cv-card-title">Projects</h2>
                <button
                  type="button"
                  className="cv-btn-ink cv-btn-ink--sm"
                  onClick={() => navigate(`/admin/clients/${clientId}?new=project`)}
                >
                  + New project
                </button>
              </div>

              {!shown.length ? (
                <EmptyState title="No projects yet" subtitle="Nothing is running for this client." />
              ) : shown.map((p) => {
                const c = countsFor(counts, p.id);
                return (
                  <ProjectRow
                    key={p.id} project={p} done={c.done} total={c.total} open={c.open}
                    onOpen={() => navigate(`/admin/clients/${clientId}/projects/${p.id}`)}
                  />
                );
              })}

              {archived.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "4px 18px 0", fontSize: 14, color: "var(--cv-muted)" }}>
                  <span style={{ flex: 1 }}>
                    Archived: {archived.map((p) => `${p.name} · ${projectTypeStyle(p.type).label}`).join(", ")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowArchived((v) => !v)}
                    style={{ padding: "10px 0", background: "none", border: 0, font: "inherit", color: "var(--cv-accent)", cursor: "pointer" }}
                  >
                    {showArchived ? "Hide archived" : "Show archived"}
                  </button>
                </div>
              )}
            </section>
          )}

          {tab === "notes" && (
            <section className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <h2 className="cv-card-title">Notes</h2>
              {client.notes && <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-wrap" }}>{client.notes}</p>}
              {!notes.length && !client.notes ? (
                <EmptyState title="No notes yet" subtitle="Notes written on this client's projects show up here." />
              ) : notes.map((n) => {
                const project = projects.find((p) => p.id === n.client_project_id);
                return (
                  <div key={n.id} className="cv-proj" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                    <div style={{ fontSize: 12, color: "var(--cv-muted)" }}>
                      {project?.name ?? "Project"} · {fmtDate(n.created_at)}
                    </div>
                    <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{n.body}</div>
                  </div>
                );
              })}
            </section>
          )}

          {tab === "logins" && (
            <section className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <h2 className="cv-card-title">Logins</h2>
              <p style={{ margin: 0, fontSize: 13, color: "var(--cv-muted)" }}>
                Stored per project. Values are never read back here — open the
                project to set or replace one.
              </p>
              {!secrets.length ? (
                <EmptyState title="No logins stored" subtitle="Nothing saved for this client's projects." />
              ) : secrets.map((s) => {
                const project = projects.find((p) => p.id === s.client_project_id);
                return (
                  <div key={`${s.client_project_id}:${s.key}`} className="cv-proj">
                    <span style={{ flex: "1 1 200px", minWidth: 0 }}>
                      <span className="cv-proj__name">{s.key}</span>
                      <span className="cv-proj__type">{project?.name ?? "Project"}</span>
                    </span>
                    {s.hint && <span className="cv-chip cv-chip--gray">{s.hint}</span>}
                    <span style={{ fontSize: 13, color: "var(--cv-muted)" }}>Updated {fmtDate(s.updated_at)}</span>
                  </div>
                );
              })}
            </section>
          )}

          <section className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 className="cv-card-title">Recent activity</h2>
            <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>
              Emails, approvals, payments and agent updates for this client will
              read here, newest first. Not wired up yet.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
