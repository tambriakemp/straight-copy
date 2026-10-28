// Mockup 13: the client's home.
//
// Five things, in the order a client cares about them: where the work is up
// to, what is waiting on THEM, what they owe, what they have on with us, and
// what has happened lately. The second is the reason the page exists -- a
// portal that only reports status is a page nobody opens twice.
//
// The fourth is Bree's decision of 28 Oct, and it is the answer to a question
// this screen had been shipped without: the hero line, the target date and
// the team feed are all presentation with nowhere to be typed in, so on the
// plugin backend all three were simply absent and the screen opened on a
// greeting and a progress bar. "The client's current projects plus any tasks
// waiting on them" is content derived from records that exist, which is why
// it needs no editor and cannot go stale.

import { Link, useParams } from "react-router-dom";
import ClientPortalShell, {
  PortalLoading,
  PortalProblem,
} from "@/components/portal/ClientPortalShell";
import { useAdminPreview, usePortalView } from "@/components/portal/useClientPortal";
import { clientPortal, greeting, money, shortDate, whenWord } from "@/lib/clientPortalApi";
import { WAITING_ICONS } from "@/lib/clientPortalIcons";
import type { HomeView, PortalMilestone, PortalProject } from "@/lib/clientPortalWire";

export default function ClientHome() {
  const { clientId } = useParams<{ clientId: string }>();
  const { adminPreview, exitPreview } = useAdminPreview(clientId);
  const load = usePortalView<HomeView>(
    clientId ? () => clientPortal.home(clientId, adminPreview) : null,
    [clientId, adminPreview],
  );

  const view = load.data;

  return (
    <ClientPortalShell
      clientId={clientId ?? ""}
      branding={view?.branding ?? null}
      me={view?.me ?? null}
      tab="home"
      adminPreview={adminPreview}
      onExitPreview={exitPreview}
    >
      {load.error && !view ? (
        <PortalProblem message={load.error} onRetry={load.reload} />
      ) : !view ? (
        <PortalLoading what="your project" />
      ) : (
        <>
          <Hero view={view} />
          <ProjectsCard projects={view.projects} />
          <div className="cp__cards">
            <WaitingCard view={view} />
            <NextPaymentCard view={view} clientId={clientId ?? ""} />
            <UpdatesCard view={view} />
          </div>
        </>
      )}
    </ClientPortalShell>
  );
}

function Hero({ view }: { view: HomeView }) {
  const { stepNumber, stepCount, targetDate } = view;
  return (
    <section className="cp-hero">
      <p className="cp-hero__hello">
        {greeting()}, {view.me.displayName}
      </p>
      {view.headline && <h1 className="cp-hero__head">{view.headline} ✨</h1>}

      {stepNumber !== null && stepCount !== null && (
        <p className="cp-hero__step">
          Step {stepNumber} of {stepCount}
          {targetDate && (
            <>
              {" · we\u2019re on track for "}
              <strong>{shortDate(targetDate)}</strong>
            </>
          )}
        </p>
      )}

      {view.milestones.length > 0 && <Progress milestones={view.milestones} />}
    </section>
  );
}

/**
 * The segmented bar.
 *
 * A list and not a single bar with a percentage, because the labels under it
 * are the information: "we are at 71%" tells a client nothing they can act
 * on, and "Building" tells them what is happening this week.
 */
function Progress({ milestones }: { milestones: PortalMilestone[] }) {
  const done = milestones.filter((milestone) => milestone.state === "done").length;
  return (
    <ol
      className="cp-steps"
      // One accessible sentence for the whole bar. A screen reader walking
      // seven unlabelled coloured divs learns nothing from them.
      aria-label={`${done} of ${milestones.length} steps complete`}
    >
      {milestones.map((milestone) => (
        <li key={milestone.key} className={`cp-step cp-step--${milestone.state}`}>
          <span className="cp-step__bar" aria-hidden="true" />
          <span className="cp-step__label">{milestone.label}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * "Your projects", full width between the hero and the three cards.
 *
 * Its own row rather than a fourth card: `.cp__cards` is
 * `auto-fit, minmax(260px, 1fr)` in a 1092px column, so it fits three and a
 * fourth would sit alone under the first of them with two empty columns
 * beside it. A list that can run to several rows also wants the width.
 *
 * NOT DRAWN AT ALL when the field is absent, which is different from drawing
 * an empty one. `projects` is optional in the wire contract because the
 * function and the frontend deploy separately and in that order, so for the
 * length of a deploy the browser can be newer than the server. An absent
 * field means "this server does not send projects"; an empty array means
 * "this client has none", and only the second deserves the sentence saying
 * so.
 */
function ProjectsCard({ projects }: { projects: HomeView["projects"] }) {
  if (!projects) return null;
  return (
    <section className="cp-card cp-projects">
      <h2 className="cp-card__title">
        Your projects{projects.length > 0 && <> · {projects.length}</>}
      </h2>
      {projects.length === 0 ? (
        <p className="cp-card__calm">
          Nothing on the go right now. We will add your next project here.
        </p>
      ) : (
        <ul className="cp-projects__list">
          {projects.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ProjectRow({ project }: { project: PortalProject }) {
  // Joined here rather than on the server: which of the three a given source
  // can answer varies, and a pre-joined string would arrive carrying the
  // separators for the ones it could not.
  const meta = [
    project.kind,
    project.statusLabel,
    project.updatedAt ? `updated ${whenWord(project.updatedAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="cp-projects__row">
      <span className="cp-projects__text">
        <span className="cp-projects__name">{project.name}</span>
        {/* Omitted rather than empty when a source can answer none of the
            three, so the row is one line instead of one line and a gap. */}
        {meta && <span className="cp-projects__meta">{meta}</span>}
      </span>
      {/* No link for a project this portal has no page for -- see
          `pluginProjects`. A row with no button is still a project whose
          state the client can read, which is the point of the list; a button
          that 404s is worse than its absence. */}
      {project.href && (
        <Link className="cp__btn" to={project.href}>
          Open
        </Link>
      )}
    </li>
  );
}

function WaitingCard({ view }: { view: HomeView }) {
  const items = view.waitingOnYou;
  return (
    <section className="cp-card">
      <h2 className="cp-card__title">
        Waiting on you{items.length > 0 && <> · {items.length}</>}
      </h2>
      {items.length === 0 ? (
        // Not an empty state with an illustration: "nothing" here is good
        // news and should read as good news.
        <p className="cp-card__calm">Nothing right now. We will tell you when we need something.</p>
      ) : (
        <ul className="cp-todo">
          {items.map((item) => (
            <li key={item.id} className="cp-todo__row">
              {item.icon && (
                <span className="cp-todo__icon" aria-hidden="true">
                  {WAITING_ICONS[item.icon]}
                </span>
              )}
              <span className="cp-todo__title">{item.title}</span>
              {item.href && (
                <Link
                  className={`cp__btn${item.primary ? " cp__btn--primary" : ""}`}
                  to={item.href}
                >
                  {item.action}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NextPaymentCard({ view, clientId }: { view: HomeView; clientId: string }) {
  const next = view.nextPayment;
  return (
    <section className="cp-card">
      <h2 className="cp-card__title">Next payment</h2>
      {!next ? (
        <p className="cp-card__calm">Nothing due. You are all paid up.</p>
      ) : (
        <>
          <p className="cp-amount">{money(next.amountCents, next.currency)}</p>
          <p className="cp-card__sub">
            {next.label}
            {next.dueOn && ` · due ${shortDate(next.dueOn)}`}
          </p>
          {/* A link to Payments rather than a checkout started from here.
              Starting one takes a round trip that can fail, and failing it
              on the home screen leaves a client on a page with no payments
              table to fall back to. */}
          <Link className="cp__btn cp__btn--primary cp-amount__pay" to={`/portal/${clientId}/payments`}>
            {next.providerName ? `Pay with ${next.providerName}` : "Pay now"}
          </Link>
        </>
      )}
    </section>
  );
}

function UpdatesCard({ view }: { view: HomeView }) {
  return (
    <section className="cp-card">
      <h2 className="cp-card__title">Latest from the team</h2>
      {view.updates.length === 0 ? (
        <p className="cp-card__calm">Nothing to report yet.</p>
      ) : (
        <ul className="cp-feed">
          {view.updates.map((update) => (
            <li key={update.id} className="cp-feed__row">
              <span className={`cp-feed__dot cp-feed__dot--${update.tone}`} aria-hidden="true" />
              <span>
                <span className="cp-feed__title">{update.title}</span>
                <span className="cp-feed__when">{whenWord(update.occurredAt)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
