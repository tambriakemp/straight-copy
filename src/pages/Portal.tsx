// The client portal's home, laid out to the Admin Journeys canvas.
//
// It was a wordmark header over a grid of project cards, and a client
// with one project never saw it at all — the page redirected straight
// into that project. The canvas makes Home a destination: what is
// waiting on you, what you owe, what has just happened. That is worth
// landing on whether you have one project or six, so the redirect is
// gone.
//
// Proposals and Payments were the old dark ProposalsSection and
// InvoiceSection dropped into the new shell — a stopgap when Home was
// rebuilt, and the thing that made the portal look half-finished. They
// are built to board 15 now, off the same pure modules the admin pages
// use (buildFamilies, bucketInvoices) so a client and Bree cannot read
// different numbers off the same rows. The two old sections are deleted
// rather than left unreferenced: an orphaned component that renders the
// previous design is one import away from coming back.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import PortalShell, { type PortalView } from "@/components/portal/PortalShell";
import ProjectTypeIcon from "@/components/admin/cv/ProjectTypeIcon";
import EmptyState from "@/components/admin/cv/EmptyState";
import CollapsibleCard from "@/components/admin/cv/CollapsibleCard";
import { projectTypeStyle } from "@/lib/projectType";
import { usd } from "@/lib/clientBalance";
import { buildFamilies } from "@/lib/proposalGroups";
import {
  clientGroup, CLIENT_GROUP_LABEL, CLIENT_GROUP_ORDER, type ClientProposalGroup,
} from "@/lib/proposalStatus";
import { bucketInvoices, type MoneyInvoice } from "@/lib/moneyRollup";
import { FileText, Receipt } from "lucide-react";

type Project = { id: string; type: string; name: string; status: string; updated_at: string };
type PortalClient = {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  tier: string;
  build_start_date: string | null;
  delivery_date: string | null;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;


interface PortalProposal {
  id: string; title: string; status: string; client_project_id: string;
  version: number; version_group_id: string | null;
  total_cents: number | null;
  sent_at: string | null; client_signed_at: string | null;
  agency_countersigned_at: string | null;
  declined_at: string | null;
}
interface PortalInvoice {
  id: string; label: string; amount_cents: number; status: string;
  due_date: string | null; sent_at?: string | null; paid_at?: string | null;
  checkout_url?: string | null; client_project_id?: string | null;
}

export default function Portal() {
  const { clientId } = useParams<{ clientId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const impersonationKey = clientId ? `cre8-portal-as-admin-${clientId}` : "";
  const adminPreview = useMemo(() => {
    if (!clientId) return false;
    if (searchParams.get("as") === "admin") {
      try { sessionStorage.setItem(impersonationKey, "1"); } catch { /* ignore */ }
      return true;
    }
    try { return sessionStorage.getItem(impersonationKey) === "1"; } catch { return false; }
  }, [clientId, searchParams, impersonationKey]);

  const exitPreview = () => {
    try { sessionStorage.removeItem(impersonationKey); } catch { /* ignore */ }
    if (searchParams.has("as")) {
      const next = new URLSearchParams(searchParams);
      next.delete("as");
      setSearchParams(next, { replace: true });
    }
    window.location.reload();
  };

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [client, setClient] = useState<PortalClient | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  // The view lives in the URL as ?v=, so a link from a project page can
  // land on Payments rather than on Home with a note to go and find it.
  const urlView = searchParams.get("v");
  const [view, setViewState] = useState<PortalView>(
    urlView === "projects" || urlView === "proposals" || urlView === "payments" ? urlView : "home",
  );
  const setView = (v: PortalView) => {
    setViewState(v);
    const next = new URLSearchParams(searchParams);
    if (v === "home") next.delete("v"); else next.set("v", v);
    setSearchParams(next, { replace: true });
  };
  const [proposals, setProposals] = useState<PortalProposal[]>([]);
  const [openInvoices, setOpenInvoices] = useState<PortalInvoice[]>([]);
  /** Every invoice on every schedule, paid ones included. */
  const [allInvoices, setAllInvoices] = useState<PortalInvoice[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/brand-kit-intake`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${PUB_KEY}` },
          body: JSON.stringify({ clientId, action: "resolve", asAdmin: adminPreview }),
        });
        if (resp.status === 404) { if (!cancelled) setNotFound(true); return; }
        if (!resp.ok) throw new Error("portal load failed");
        const data = await resp.json();
        if (cancelled) return;
        setClient(data.client);
        setProjects(Array.isArray(data.projects) ? data.projects : []);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId, adminPreview]);

  // Proposals and invoices, through the same public actions the sections
  // below use. Home summarises them; the sections are still what you act
  // on, so there is one source for each and no second copy to drift.
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      const call = async (fn: string, body: Record<string, unknown>) => {
        try {
          const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${PUB_KEY}` },
            body: JSON.stringify(body),
          });
          return r.ok ? await r.json() : null;
        } catch { return null; }
      };
      const [pr, inv, sched] = await Promise.all([
        call("proposal-sign", { action: "list", clientId }),
        call("project-invoices", { action: "portal-active", clientId }),
        call("project-invoices", { action: "portal-schedule", clientId }),
      ]);
      if (cancelled) return;
      setProposals((pr?.proposals ?? []) as PortalProposal[]);
      const open = (inv?.invoices ?? []) as PortalInvoice[];
      setOpenInvoices(open);

      // Every invoice on every schedule, in one flat list with its
      // project id attached — the Payments page needs paid ones too, and
      // the schedule shape is three levels deep.
      const flat: PortalInvoice[] = [];
      const seen = new Set<string>();
      for (const proj of (sched?.projects ?? []) as Array<{
        id: string; schedules?: Array<{ invoices?: PortalInvoice[] }>;
      }>) {
        for (const sc of proj.schedules ?? []) {
          for (const i of sc.invoices ?? []) {
            flat.push({ ...i, client_project_id: i.client_project_id ?? proj.id });
            seen.add(i.id);
          }
        }
      }
      // An invoice sent outside a schedule is still an invoice. Without
      // this a one-off bill is payable and invisible at the same time.
      for (const i of open) if (!seen.has(i.id)) flat.push(i);
      setAllInvoices(flat);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";

  const awaitingSignature = useMemo(
    () => proposals.filter((p) => !p.client_signed_at && !p.declined_at && p.status === "sent"),
    [proposals],
  );
  /** The same three buckets the admin Money page uses, so a client and
   *  Bree never read different numbers off the same invoices. */
  const money = useMemo(
    () => bucketInvoices(allInvoices as unknown as MoneyInvoice[]),
    [allInvoices],
  );
  const dueNowCents = money.chase.reduce((t, i) => t + (i.amount_cents ?? 0), 0);
  const comingUpCents = money.notBilledCents;
  const comingUp = money.billsNext;
  const paidCents = money.paid.reduce((t, i) => t + (i.amount_cents ?? 0), 0);

  /** The one list that says what the client has to do next. */
  const todo = useMemo(() => {
    const out: Array<{ key: string; icon: string; title: string; sub: string; to: string | null; cta: string }> = [];
    for (const p of awaitingSignature) {
      out.push({
        key: `p:${p.id}`, icon: "\u270e",
        title: `Sign the ${p.title}`,
        sub: p.sent_at ? `Sent ${new Date(p.sent_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "Waiting on you",
        to: `/portal/${clientId}/proposals/${p.id}${qs}`, cta: "Review and sign",
      });
    }
    for (const i of openInvoices) {
      out.push({
        key: `i:${i.id}`, icon: "\u0024",
        title: `Pay ${i.label}`,
        sub: `${usd(i.amount_cents)}${i.due_date ? ` · due ${i.due_date}` : ""}`,
        // Not a link: Payments is a view of THIS page, and a Link back to
        // the same URL left the client on Home wondering what happened.
        to: null, cta: "See payments",
      });
    }
    return out;
  }, [awaitingSignature, openInvoices, clientId, qs]);

  // ---- Proposals -------------------------------------------------------
  //
  // The same families the admin list builds, filed under the three
  // sections a CLIENT has. Versions matter here as much as they do on
  // our side: three rows of "Menovia Phase 2" under "Needs your
  // signature" is three things the client thinks they owe us.
  const proposalFamilies = useMemo(() => {
    const out = new Map<ClientProposalGroup, ReturnType<typeof buildFamilies<PortalProposal>>>();
    for (const f of buildFamilies(proposals)) {
      const g = clientGroup(f.current);
      if (!g) continue;
      out.set(g, [...(out.get(g) ?? []), f]);
    }
    return out;
  }, [proposals]);

  /** Signed proposals and paid invoices, newest first. */
  const recent = useMemo(() => {
    const out: Array<{ key: string; what: string; when: string; at: string }> = [];
    for (const p of proposals) {
      if (p.client_signed_at) {
        out.push({
          key: `s:${p.id}`, what: `${p.title} signed`,
          when: new Date(p.client_signed_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
          at: p.client_signed_at,
        });
      }
    }
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
  }, [proposals]);

  const shell = (body: React.ReactNode, v: PortalView | null = view) => (
    <PortalShell
      clientId={clientId!}
      clientName={client?.contact_name || client?.business_name || "there"}
      businessName={client?.business_name ?? null}
      adminPreview={adminPreview}
      onExitPreview={adminPreview ? exitPreview : undefined}
      view={v}
      onView={setView}
      counts={{ proposals: awaitingSignature.length, feedback: undefined }}
    >
      {body}
    </PortalShell>
  );

  if (loading) return shell(<p className="cv-page-sub">Loading…</p>, null);

  if (notFound || !client) {
    return (
      <div className="cv-admin cv-portal">
        <div className="cv-portal__body">
          <section className="cv-card cv-card-pad" style={{ margin: "0 auto", maxWidth: 520 }}>
            <h1 className="cv-page-title">This link isn't working</h1>
            <p className="cv-page-sub">
              We couldn't find a client for this portal link. Check the URL, or
              reply to our last email and we'll send a fresh one.
            </p>
          </section>
        </div>
      </div>
    );
  }

  // site_preview projects are plumbing, not work the client ordered.
  // Archived ones are work that finished: kept, but behind a link, the
  // same way the admin client page files them.
  const notPreview = projects.filter((p) => p.type !== "site_preview");
  const archivedProjects = notPreview.filter((p) => p.status === "archived");
  const liveProjects = notPreview.filter((p) => p.status !== "archived");
  const visible = showArchived ? [...liveProjects, ...archivedProjects] : liveProjects;
  const firstName = (client.contact_name || "").trim().split(/\s+/).slice(-1)[0] || client.business_name || "";

  if (!notPreview.length) {
    return shell(
      <div className="cv-pg">
        <div>
          <h1 className="cv-page-title">Welcome{firstName ? `, ${firstName}` : ""}</h1>
          <p className="cv-page-sub">Your Cre8 Visions team is setting up your first project.</p>
        </div>
        <section className="cv-card cv-card-pad">
          <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>
            We'll email you the moment there's something to look at.
          </p>
        </section>
      </div>,
    );
  }

  const projectRow = (p: Project) => {
    const t = projectTypeStyle(p.type);
    const needsYou = awaitingSignature.some((x) => x.client_project_id === p.id);
    return (
      <Link key={p.id} className="cv-it" to={`/portal/${clientId}/projects/${p.id}${qs}`}>
        <span className="cv-ic" style={{ background: t.bg, color: t.fg }}>
          <ProjectTypeIcon type={p.type} size={46} />
        </span>
        <span className="cv-it__what"><b>{p.name}</b><small>{t.label}</small></span>
        {p.status === "archived" ? (
          <span className="cv-chip cv-chip--gray">Archived</span>
        ) : (
          <span className={`cv-chip ${needsYou ? "cv-chip--amber" : "cv-chip--green"}`}>
            {needsYou ? "Waiting on you" : "In progress"}
          </span>
        )}
      </Link>
    );
  };

  const home = (
    <div className="cv-pg">
      <div>
        <h1 className="cv-page-title">Welcome back{firstName ? `, ${firstName}` : ""}</h1>
        <p className="cv-page-sub">Here's where everything stands with Cre8 Visions.</p>
      </div>

      {/* Only when there IS something. An empty "Waiting on you" card is a
          dark block at the top of the page that says you are behind on
          nothing, which is worse than no card. */}
      {todo.length > 0 && (
        <section className="cv-card cv-card-pad" style={{ background: "var(--cv-ink)", color: "#fff" }}>
          <div className="cv-card-head">
            <h2 className="cv-card-title" style={{ color: "#fff" }}>Waiting on you</h2>
            <span className="cv-chip" style={{ background: "#E8590C", color: "#fff" }}>{todo.length}</span>
          </div>
          {todo.map((t) => (
            <div key={t.key} className="cv-it cv-it--onink">
              <span className="cv-ic" style={{ background: "#262B36", color: "#fff" }}>{t.icon}</span>
              <span className="cv-it__what"><b>{t.title}</b><small>{t.sub}</small></span>
              {t.to ? (
                <Link className="cv-open cv-open--white" style={{ padding: "0 16px" }} to={t.to}>{t.cta}</Link>
              ) : (
                <button type="button" className="cv-open cv-open--white" style={{ padding: "0 16px" }}
                  onClick={() => setView("payments")}>{t.cta}</button>
              )}
            </div>
          ))}
        </section>
      )}

      <div className="cv-stat-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div className="cv-card cv-stat cv-stat--left">
          <span>Active projects</span><b>{liveProjects.length}</b>
          <small>Tap Projects to see each one</small>
        </div>
        <div className="cv-card cv-stat cv-stat--left">
          <span>Due now</span><b>{usd(dueNowCents)}</b>
          <small>{dueNowCents ? `${openInvoices.length} invoice${openInvoices.length === 1 ? "" : "s"} to pay` : "You're all caught up"}</small>
        </div>
        <div className="cv-card cv-stat cv-stat--left">
          <span>Coming up</span><b>{usd(comingUpCents)}</b>
          <small>{comingUp[0]?.label ?? "Nothing scheduled"}</small>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
        <section className="cv-card cv-card-pad" style={{ flex: "3 1 420px", minWidth: 0 }}>
          <div className="cv-card-head">
            <h2 className="cv-card-title">Your projects</h2>
            <span style={{ flex: 1 }} />
            {visible.length > 3 && (
              <button type="button" className="cv-open" style={{ padding: "0 16px" }} onClick={() => setView("projects")}>
                See all
              </button>
            )}
          </div>
          {visible.slice(0, 3).map(projectRow)}
        </section>

        <section className="cv-card cv-card-pad" style={{ flex: "2 1 300px", minWidth: 0 }}>
          <div className="cv-card-head"><h2 className="cv-card-title">Recent</h2></div>
          {!recent.length ? (
            <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>Nothing yet.</p>
          ) : (
            <div style={{ fontSize: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              {recent.map((r) => (
                <div key={r.key}>
                  {r.what}
                  <br />
                  <span style={{ fontSize: 13, color: "var(--cv-muted)" }}>{r.when}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );

  const projectsView = (
    <div className="cv-pg">
      <div>
        <h1 className="cv-page-title">Your projects</h1>
        <p className="cv-page-sub">Everything Cre8 Visions is building for you.</p>
      </div>
      <section className="cv-card cv-card-pad">
        {visible.map(projectRow)}
        {archivedProjects.length > 0 && (
          <div style={{
            display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12,
            padding: "14px 2px 0", fontSize: 14, color: "var(--cv-muted)",
          }}>
            <span style={{ flex: 1 }}>
              Archived: {archivedProjects.map((p) => p.name).join(", ")}
            </span>
            <button type="button" onClick={() => setShowArchived((v) => !v)}
              style={{ padding: "10px 0", background: "none", border: 0, font: "inherit", color: "var(--cv-accent)", cursor: "pointer" }}>
              {showArchived ? "Hide archived" : "Show archived"}
            </button>
          </div>
        )}
      </section>
    </div>
  );

  const projectName = (id: string | null | undefined) =>
    projects.find((p) => p.id === id)?.name ?? null;

  const when = (iso: string | null | undefined) => iso
    ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;

  const proposalsView = (
    <div className="cv-pg">
      <div>
        <h1 className="cv-page-title">Proposals</h1>
        <p className="cv-page-sub">
          Read, sign or decline a proposal here. Signed copies stay available to download.
        </p>
      </div>

      {!proposalFamilies.size ? (
        <EmptyState
          icon={FileText}
          title="Nothing to read yet"
          subtitle="When Cre8 Visions sends you a proposal, it appears here."
        />
      ) : CLIENT_GROUP_ORDER.map((group) => {
        const families = proposalFamilies.get(group) ?? [];
        if (!families.length) return null;
        const tone = group === "to_sign" ? "amber" : group === "signed" ? "green" : "gray";
        const tint = group === "to_sign"
          ? { bg: "#FFF1E3", fg: "#A8440A" }
          : group === "signed"
            ? { bg: "#E5F6EC", fg: "#17703D" }
            : { bg: "#EEF0F5", fg: "#3D4556" };
        // Declined folds away. The client already made that decision —
        // leaving it open puts a closed document the same size as the
        // one they still have to sign.
        const Section = group === "declined"
          ? ({ children }: { children: React.ReactNode }) => (
            <CollapsibleCard title={CLIENT_GROUP_LABEL[group]} count={families.length} tone="gray">
              {children}
            </CollapsibleCard>
          )
          : ({ children }: { children: React.ReactNode }) => (
            <section className="cv-card cv-card-pad">
              <div className="cv-card-head">
                <h2 className="cv-card-title">{CLIENT_GROUP_LABEL[group]}</h2>
                <span className={`cv-chip cv-chip--${tone}`}>{families.length}</span>
              </div>
              {children}
            </section>
          );
        return (
          <Section key={group}>
            {families.map((f) => {
              const p = f.current;
              const name = projectName(p.client_project_id);
              const line = group === "to_sign"
                ? [name, p.sent_at ? `sent ${when(p.sent_at)}` : null].filter(Boolean).join(" · ")
                : group === "declined"
                  ? `Declined ${when(p.declined_at) ?? ""}`.trim()
                  : [
                    name,
                    p.client_signed_at ? `signed ${when(p.client_signed_at)}` : null,
                    p.agency_countersigned_at ? "countersigned by Cre8 Visions" : null,
                  ].filter(Boolean).join(" · ");
              return (
                <div key={p.id} className="cv-it">
                  <span className="cv-ic" style={{ background: tint.bg, color: tint.fg }}>
                    <FileText size={22} />
                  </span>
                  <span className="cv-it__what">
                    <b>{p.title}</b>
                    <small>{line}</small>
                  </span>
                  {p.total_cents != null && <span className="cv-amt">{usd(p.total_cents)}</span>}
                  <Link
                    className={`cv-open ${group === "to_sign" ? "cv-open--dark" : ""}`}
                    style={{ padding: "0 16px" }}
                    to={`/portal/${clientId}/proposals/${p.id}${qs}`}
                  >
                    {group === "to_sign" ? "Review and sign" : "View"}
                  </Link>
                </div>
              );
            })}
          </Section>
        );
      })}
    </div>
  );

  // ---- Payments --------------------------------------------------------
  const invoiceRow = (i: PortalInvoice, right: React.ReactNode) => {
    const name = projectName(i.client_project_id);
    const sub = [
      name,
      i.paid_at ? `paid ${when(i.paid_at)}` : i.due_date ? `due ${i.due_date}` : "not billed yet",
    ].filter(Boolean).join(" · ");
    return (
      <div key={i.id} className="cv-it">
        <span className="cv-it__what"><b>{i.label}</b><small>{sub}</small></span>
        <span className="cv-amt">{usd(i.amount_cents)}</span>
        {right}
      </div>
    );
  };

  const paymentsView = (
    <div className="cv-pg">
      <div>
        <h1 className="cv-page-title">Payments</h1>
        <p className="cv-page-sub">Pay an invoice, see what's coming, and download receipts.</p>
      </div>

      <div className="cv-stat-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div className="cv-card cv-stat cv-stat--left"
          style={dueNowCents ? { background: "var(--cv-ink)", color: "#fff" } : undefined}>
          <span>Due now</span><b>{usd(dueNowCents)}</b>
          <small>{dueNowCents
            ? `${money.chase.length} invoice${money.chase.length === 1 ? "" : "s"} to pay`
            : "You're all caught up"}</small>
        </div>
        <div className="cv-card cv-stat cv-stat--left">
          <span>Coming up</span><b>{usd(comingUpCents)}</b>
          <small>{comingUp.length
            ? `${comingUp.length} payment${comingUp.length === 1 ? "" : "s"} not billed yet`
            : "Nothing scheduled"}</small>
        </div>
        <div className="cv-card cv-stat cv-stat--left">
          <span>Paid to date</span><b>{usd(paidCents)}</b>
          <small>{money.paid.length} payment{money.paid.length === 1 ? "" : "s"}</small>
        </div>
      </div>

      <section className="cv-card cv-card-pad">
        <div className="cv-card-head"><h2 className="cv-card-title">Due now</h2></div>
        {!money.chase.length ? (
          <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>
            Nothing to pay right now. When an invoice is sent it shows here with a
            "Pay now" button that opens secure checkout.
          </p>
        ) : money.chase.map((i) => invoiceRow(i as PortalInvoice, (
          (i as PortalInvoice).checkout_url
            ? (
              <a className="cv-open cv-open--dark" style={{ padding: "0 16px" }}
                href={(i as PortalInvoice).checkout_url ?? "#"} target="_blank" rel="noreferrer">
                Pay now
              </a>
            )
            // No link yet is not the same as nothing owed, and saying
            // nothing here is how a client concludes they are square.
            : <span className="cv-chip cv-chip--amber">Payment link on its way</span>
        )))}
      </section>

      {comingUp.length > 0 && (
        <section className="cv-card cv-card-pad">
          <div className="cv-card-head">
            <h2 className="cv-card-title">Coming up</h2>
            <span className="cv-chip cv-chip--gray">{comingUp.length}</span>
          </div>
          {comingUp.map((i) => invoiceRow(i as PortalInvoice,
            <span className="cv-chip cv-chip--gray">Not billed yet</span>))}
        </section>
      )}

      {money.paid.length > 0 && (
        <section className="cv-card cv-card-pad">
          <div className="cv-card-head">
            <h2 className="cv-card-title">Paid</h2>
            <span className="cv-chip cv-chip--green">{money.paid.length}</span>
          </div>
          {money.paid.map((i) => invoiceRow(i as PortalInvoice,
            <span className="cv-chip cv-chip--green">Paid</span>))}
        </section>
      )}

      {!allInvoices.length && (
        <EmptyState
          icon={Receipt}
          title="No invoices yet"
          subtitle="When there is something to pay, it appears here."
        />
      )}
    </div>
  );

  return shell(
    view === "projects" ? projectsView
      : view === "proposals" ? proposalsView
        : view === "payments" ? paymentsView
          : home,
  );
}
