// Mockup 13: the client's home.
//
// Four things, in the order a client cares about them: where the work is up
// to, what is waiting on THEM, what they owe, and what has happened lately.
// The second is the reason the page exists -- a portal that only reports
// status is a page nobody opens twice.

import { Link, useParams } from "react-router-dom";
import ClientPortalShell, {
  PortalLoading,
  PortalProblem,
} from "@/components/portal/ClientPortalShell";
import { useAdminPreview, usePortalView } from "@/components/portal/useClientPortal";
import { clientPortal, greeting, money, shortDate, whenWord } from "@/lib/clientPortalApi";
import { WAITING_ICONS } from "@/lib/clientPortalIcons";
import type { HomeView, PortalMilestone } from "@/lib/clientPortalWire";

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
