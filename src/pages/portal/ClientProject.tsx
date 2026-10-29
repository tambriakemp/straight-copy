// Mockup 17: the project itself, on the dark client surface.
//
// This is the Overview tab of the old project page (`PortalProject.tsx`),
// redrawn in the `.cp` system and reached by its own route instead of a
// redirect into that page. The to-do list, the phase ladder, the feedback
// board link and the discovery chat are the same four things that page
// already computes and fetches -- lifted, not rewritten, per the card.
//
// WHAT STAYED BEHIND. The old page's other tabs -- Audits, Logins, Brand --
// have no mockup here: Logins and Payments already have their own nav items
// and their own dark screens, Audits has no nav item at all, and Brand's
// chat is a different conversation than the one mockup 17 draws. None of
// that is dropped; it is simply not this card's to redraw. `AuditsSection`,
// `PortalLoginsSection` and the Brand tab keep working at the old address
// for a client with more than one project, or for `/admin`.
import { Link, Navigate, useParams } from "react-router-dom";
import ClientPortalShell, {
  PortalLoading,
  PortalProblem,
} from "@/components/portal/ClientPortalShell";
import {
  useAdminPreview,
  usePortalView,
  useResolvedProject,
  type ResolvedProjectRow,
} from "@/components/portal/useClientPortal";
import { clientPortal } from "@/lib/clientPortalApi";
import ClientDiscoveryChat from "@/components/portal/ClientDiscoveryChat";
import { phaseLadder, phaseSummary, PHASE_WORD, type PhaseNode } from "@/lib/journeyPhases";
import { supabase } from "@/integrations/supabase/client";
import { supabasePortal } from "@/integrations/supabase/portalClient";
import { portalFetch } from "@/lib/portalFetch";
import { isDemoClient } from "@/lib/portalDemo";
import { useEffect, useState } from "react";
import type { HomeView } from "@/lib/clientPortalWire";
// Pure string maps, free of `Deno` and of anything the edge function needs a
// credential for -- `AgentProposalPanel.tsx` already imports runtime code
// from `_shared/` the same way. The chip on this screen and the one on the
// home screen's project list read the SAME word for the SAME project kind
// because both read it from here rather than from `projectType.ts`, which
// is a different, older vocabulary ("Web development") built for the admin
// side.
import { projectKindLabel } from "../../../supabase/functions/_shared/client-portal-shape";
import { TODO_DONE_ICON, TODO_ICONS, type TodoIconKey } from "@/lib/clientPortalIcons";

type TodoKey = TodoIconKey;
type TodoState = "done" | "now" | "later";

interface TodoItem {
  key: TodoKey;
  title: string;
  sub: string;
  state: TodoState;
  href?: string;
  /** Scrolls to the discovery chat below, which lives on this same page. */
  onClick?: () => void;
  cta: string;
}

export default function ClientProject() {
  const { clientId } = useParams<{ clientId: string }>();
  const { adminPreview, viewAsGrant, actor, exitPreview } = useAdminPreview(clientId);

  const shell = usePortalView<HomeView>(
    clientId ? () => clientPortal.home(clientId, adminPreview) : null,
    [clientId, adminPreview],
  );
  const resolved = useResolvedProject(clientId, adminPreview);

  if (resolved.status === "choose") {
    return <Navigate replace to={`/portal/${clientId}/projects`} />;
  }

  return (
    <ClientPortalShell
      clientId={clientId ?? ""}
      branding={shell.data?.branding ?? null}
      me={shell.data?.me ?? null}
      tab="project"
      adminPreview={adminPreview}
      viewAsGrant={viewAsGrant}
      actor={actor}
      onExitPreview={exitPreview}
    >
      {shell.error && !shell.data ? (
        <PortalProblem message={shell.error} onRetry={shell.reload} />
      ) : resolved.status === "error" ? (
        <PortalProblem message="Something went wrong. Please try again." />
      ) : resolved.status === "missing" ? (
        <div className="cp__state">Your project has not been set up yet. We will tell you when it is.</div>
      ) : resolved.status === "loading" || !shell.data || !resolved.data ? (
        <PortalLoading what="your project" />
      ) : (
        <ProjectBody
          clientId={clientId ?? ""}
          me={shell.data.me}
          contactEmail={resolved.data.contactEmail}
          client={resolved.data.client}
          // The plugin's own answer, since CRE-822 gave it one (migration
          // 009). `resolved.data.client` still carries the three admin-table
          // columns as a fallback for a server that predates them -- the
          // usual rule for an optional field this contract's version bumped.
          header={{
            buildStartDate: shell.data.buildStartDate ?? null,
            deliveryDate: shell.data.deliveryDate ?? null,
            deliveryVideoUrl: shell.data.deliveryVideoUrl ?? null,
          }}
          project={resolved.project!}
          adminPreview={adminPreview}
          viewAs={viewAsGrant}
        />
      )}
    </ClientPortalShell>
  );
}

/**
 * What a view-as session cannot reach on this screen, and why.
 *
 * CRE-818. Three of the four things below this line are not read through an
 * allowlisted edge function: the phase ladder and the contract row come
 * through `supabasePortal` (PostgREST), and the discovery chat's history does
 * too. A view-as session has NO Supabase session at all -- the token is the
 * whole credential -- so RLS answers those with nothing whatever
 * `VIEW_AS_READS` says. The fourth, the page-review count, is an edge
 * function (`preview-approvals`) that is deliberately not on the allowlist.
 *
 * The failure is silent in every case: no rows reads as an empty ladder, a
 * missing contract row reads as "not signed yet", and no approvals read as
 * "nothing to review". Each of those is a SENTENCE THE PORTAL WOULD BE
 * TELLING AN ADMIN ABOUT A CLIENT, and three of them would be false. So the
 * reads are skipped rather than attempted, and the screen says which four
 * blocks are missing -- an admin who can see the gap can go and look properly
 * in `/admin`, and one who cannot see it believes the zero.
 */
function ViewAsGaps() {
  return (
    <section className="cp-panel">
      <h2 className="cp-panel__title">Four things a preview cannot show</h2>
      <p className="cp-panel__body" style={{ marginBottom: 0 }}>
        The to-do list, the phase ladder, the page-review count and the discovery chat are
        read with the client's own sign-in, which a preview does not have. They are left out
        rather than drawn empty, because an empty one reads as a real answer — no contract
        signed, no pages to review, nothing started. The client's admin page has all four.
        Everything else on this screen is what the client sees.
      </p>
    </section>
  );
}

function ProjectBody({
  clientId,
  me,
  contactEmail,
  client,
  header,
  project,
  adminPreview,
  viewAs,
}: {
  clientId: string;
  me: HomeView["me"];
  contactEmail: string | null;
  client: { business_name: string | null; contact_name: string | null; build_start_date: string | null; delivery_date: string | null; delivery_video_url: string | null };
  header: { buildStartDate: string | null; deliveryDate: string | null; deliveryVideoUrl: string | null };
  project: ResolvedProjectRow;
  adminPreview: boolean;
  /** A CRE-811 view-as grant, which is read-only AND sessionless. See `ViewAsGaps`. */
  viewAs: boolean;
}) {
  const buildStartDate = header.buildStartDate ?? client.build_start_date;
  const deliveryDate = header.deliveryDate ?? client.delivery_date;
  const deliveryVideoUrl = header.deliveryVideoUrl ?? client.delivery_video_url;
  const sb = adminPreview ? supabase : supabasePortal;
  const [phases, setPhases] = useState<PhaseNode[]>([]);
  const [previewProgress, setPreviewProgress] = useState({ approved: 0, total: 0 });
  const [contractSigned, setContractSigned] = useState(false);

  // The phase ladder and the page-review count.
  useEffect(() => {
    if (viewAs) return;
    let cancelled = false;

    // The QA harness. Project has no preview-approvals fixture, so this
    // reads as a project with nothing to review yet -- the honest state a
    // real project with no preview pages is in, not a gap (CRE-819).
    if (import.meta.env.VITE_PORTAL_DEMO === "1" && isDemoClient(clientId)) {
      void import("@/lib/portalDemoData").then(({ demoProjectPhases }) => {
        if (cancelled) return;
        setPhases(demoProjectPhases());
        setPreviewProgress({ approved: 0, total: 0 });
      });
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      const { data } = await sb.rpc("portal_project_phases", { _client_project_id: project.id });
      if (!cancelled) setPhases((data ?? []) as PhaseNode[]);

      try {
        const r = await portalFetch(
          "preview-approvals",
          { action: "list", client_project_id: project.id },
          adminPreview,
        );
        if (!r.ok) throw new Error("no preview");
        const out = (await r.json()) as { pages?: Array<{ approval?: unknown }> };
        const pages = out.pages ?? [];
        if (!cancelled) {
          setPreviewProgress({
            approved: pages.filter((p) => !!p.approval).length,
            total: pages.length,
          });
        }
      } catch {
        // No preview on this project is the ordinary case, not a fault.
        if (!cancelled) setPreviewProgress({ approved: 0, total: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id, sb, adminPreview, clientId, viewAs]);

  // Whether the contract for this project has been signed -- gates the
  // discovery chat exactly as it does on the old project page.
  useEffect(() => {
    if (viewAs) return;
    let cancelled = false;

    // The QA harness has no `client_contracts` row for this id, and shows
    // the contract as still open -- the same state the home screen's
    // "Review and sign" fixture is already in (CRE-819).
    if (import.meta.env.VITE_PORTAL_DEMO === "1" && isDemoClient(clientId)) {
      setContractSigned(false);
      return;
    }

    (async () => {
      try {
        const { data } = await sb
          .from("client_contracts")
          .select("id, client_signed_at")
          .eq("client_project_id", project.id)
          .not("client_signed_at", "is", null)
          .limit(1)
          .maybeSingle();
        if (!cancelled) setContractSigned(!!data?.client_signed_at);
      } catch {
        if (!cancelled) setContractSigned(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id, sb, clientId, viewAs]);

  const isAutomation = project.type === "automation_build";
  const isWebDev = project.type === "web_development";
  const isPreviewable =
    project.type === "app_development" || project.type === "web_development" || project.type === "marketing";

  // Every row of the to-do list is derived from `contractSigned` or
  // `previewProgress`, neither of which a view-as session could read. An
  // unsigned-looking contract and a zero page count would make this list read
  // "nothing has happened yet" for a client six weeks in. `ViewAsGaps` says
  // so instead.
  const todo: TodoItem[] = [];
  if (!viewAs && (isAutomation || isWebDev)) {
    todo.push({
      key: "contract",
      title: "Sign the contract",
      sub: contractSigned ? "Signed. Thank you!" : "It takes a minute, and nothing starts until it's done.",
      state: contractSigned ? "done" : "now",
      href: `/portal/${clientId}/agreements`,
      cta: contractSigned ? "View" : "Open the contract",
    });
  }
  if (!viewAs && isWebDev) {
    todo.push({
      key: "discovery",
      title: "Answer the discovery questions",
      sub: contractSigned
        ? "A short guided chat about your goals, pages and content. About 10 minutes, and you can stop and come back."
        : "Opens once the contract is signed.",
      state: contractSigned ? "now" : "later",
      onClick: contractSigned
        ? () => document.getElementById("cp-discovery")?.scrollIntoView({ behavior: "smooth", block: "start" })
        : undefined,
      cta: "Start the chat",
    });
  }
  if (isPreviewable && previewProgress.total > 0) {
    const left = previewProgress.total - previewProgress.approved;
    todo.push({
      key: "review",
      title: left ? `Review ${left} page${left === 1 ? "" : "s"}` : "Pages reviewed",
      sub: left
        ? "Click anywhere on a page to leave a comment, then approve it when it's right."
        : `All ${previewProgress.total} approved. Thank you!`,
      state: left ? "now" : "done",
      href: `/portal/${clientId}/projects/${project.id}/feedback`,
      cta: "Open feedback board",
    });
  }
  const openTodo = todo.filter((item) => item.state !== "done").length;

  const ladder = phaseLadder(phases);
  const ladderLine = phaseSummary(ladder);
  const kindLabel = projectKindLabel(project.type);
  const businessName = client.business_name || "Your brand";

  return (
    <>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
          <h1 className="cp-h1" style={{ marginBottom: 0 }}>
            {project.name || businessName}
          </h1>
          {kindLabel && <span className="cp-pill cp-pill--sent">{kindLabel}</span>}
          {openTodo > 0 && <span className="cp-pill cp-pill--amber">Waiting on you</span>}
        </div>
        <p className="cp-sub">
          Welcome{me.displayName ? `, ${me.displayName}` : ""}.
          {contactEmail ? ` We'll keep you posted at ${contactEmail}.` : ""}
        </p>
      </div>

      {viewAs && <ViewAsGaps />}

      {todo.length > 0 && (
        <section className="cp-card">
          <div className="cp-card-head">
            <h2 className="cp-card__title" style={{ margin: 0 }}>
              Your to-do
            </h2>
            <span className="cp-pill cp-pill--amber">{openTodo ? `${openTodo} open` : "All done"}</span>
          </div>
          <ul className="cp-todo">
            {todo.map((item) => (
              <li key={item.key} className="cp-todo__row">
                <span className="cp-todo__icon" aria-hidden="true">
                  {item.state === "done" ? TODO_DONE_ICON : TODO_ICONS[item.key]}
                </span>
                <span className="cp-todo__what">
                  <span className={`cp-todo__title${item.state === "done" ? " cp-todo__title--done" : ""}`}>
                    {item.title}
                  </span>
                  <span className="cp-todo__sub">{item.sub}</span>
                </span>
                {item.state !== "later" && item.href ? (
                  <Link className="cp__btn cp__btn--primary" to={item.href}>
                    {item.cta}
                  </Link>
                ) : item.state !== "later" && item.onClick ? (
                  <button type="button" className="cp__btn cp__btn--primary" onClick={item.onClick}>
                    {item.cta}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(ladder.length > 0 || buildStartDate || deliveryDate) && (
        <section className="cp-card">
          <div className="cp-card-head">
            <h2 className="cp-card__title" style={{ margin: 0 }}>
              Where things stand
            </h2>
            {deliveryDate && (
              <span style={{ color: "var(--cp-dim)", fontSize: 13 }}>
                Estimated delivery{" "}
                {new Date(`${deliveryDate}T12:00:00`).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            )}
          </div>
          {ladder.length > 0 && (
            <ol className="cp-steps" aria-label={`${ladder.filter((p) => p.state === "done").length} of ${ladder.length} phases complete`}>
              {ladder.map((phase) => (
                <li key={phase.id} className={`cp-step cp-step--${phase.state}`}>
                  <span className="cp-step__bar" aria-hidden="true" />
                  <span className="cp-step__label">{phase.label}</span>
                  <span className="cp-step__when">{PHASE_WORD[phase.state]}</span>
                </li>
              ))}
            </ol>
          )}
          {(ladderLine || buildStartDate) && (
            <p className="cp-steps__foot">
              {buildStartDate &&
                `Build started ${new Date(`${buildStartDate}T12:00:00`).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}. `}
              {ladderLine}
            </p>
          )}
        </section>
      )}

      {isPreviewable && !viewAs && (
        <section className="cp-card">
          <div className="cp-outlink">
            <div style={{ flex: "2 1 280px", minWidth: 0 }}>
              <h2 className="cp-card__title" style={{ margin: "0 0 6px" }}>
                Page reviews
              </h2>
              <p className="cp-sub" style={{ marginBottom: 10 }}>
                {previewProgress.total
                  ? `${previewProgress.approved} of ${previewProgress.total} pages approved`
                  : "Nothing to review yet — we'll email you when there is."}
              </p>
              <span className="cp-bar">
                <i
                  style={{
                    width: previewProgress.total
                      ? `${Math.round((previewProgress.approved / previewProgress.total) * 100)}%`
                      : "0%",
                  }}
                />
              </span>
              <p className="cp-outlink__note">
                Opens the review board where you comment and approve — same tool, not rebuilt here.
              </p>
            </div>
            <Link className="cp__btn cp__btn--primary" to={`/portal/${clientId}/projects/${project.id}/feedback`}>
              Open feedback board ↗
            </Link>
          </div>
        </section>
      )}

      {/* Not merely empty in a view-as session: the chat auto-greets when it
          finds no history, and the greet is a POST to `web-dev-discovery-chat`
          that would 401 and raise a toast. Not mounted at all is the honest
          version AND the quiet one. */}
      {isWebDev && !viewAs && (
        <div id="cp-discovery" style={{ scrollMarginTop: 24 }}>
          <ClientDiscoveryChat
            clientId={clientId}
            projectId={project.id}
            contactName={client.contact_name}
            contractSigned={contractSigned}
            adminPreview={adminPreview}
          />
        </div>
      )}

      <section className="cp-card">
        <div className="cp-outlink">
          <div style={{ flex: "1 1 280px", minWidth: 0 }}>
            <h2 className="cp-card__title" style={{ margin: "0 0 6px" }}>
              Delivery walkthrough
            </h2>
            <p className="cp-sub" style={{ margin: 0 }}>
              {deliveryVideoUrl
                ? "Your walkthrough is ready."
                : "When your project launches, a video walking you through it shows up here."}
            </p>
          </div>
          {deliveryVideoUrl ? (
            <a className="cp__btn cp__btn--primary" href={deliveryVideoUrl} target="_blank" rel="noreferrer">
              Watch the walkthrough
            </a>
          ) : (
            <span className="cp-pill">After launch</span>
          )}
        </div>
      </section>
    </>
  );
}
