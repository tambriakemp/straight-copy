// Mockup 14: read a proposal, sign it, go to the deposit.
//
// THE DOCUMENT IS ON A LIGHT CARD INSIDE A DARK PAGE, deliberately and not
// by accident of the design. A contract is a document; it is going to be
// printed, forwarded and read on a phone in a waiting room, and documents are
// dark text on light paper. The panel beside it is chrome and stays dark.
//
// WHAT SIGNING IS, HERE
//
// A typed name, a ticked box, and a POST. There is no canvas and no uploaded
// image, because what ESIGN wants evidenced is intent, consent, attribution
// and an unaltered record -- and a drawn squiggle evidences none of those any
// better than a typed name does. The record is made on the server: the
// consent wording comes from there, is stored verbatim against the
// signature, and is shown here rather than written into this file, so
// rewording it never leaves an old signature quoting text nobody agreed to.
//
// THE BUTTON IS DISABLED UNTIL BOTH HALVES ARE TRUE, and the reason is said
// out loud underneath rather than left for the client to work out from a
// greyed-out rectangle.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import ClientPortalShell, {
  PortalLoading,
  PortalProblem,
} from "@/components/portal/ClientPortalShell";
import { useAdminPreview, usePortalView } from "@/components/portal/useClientPortal";
import {
  PortalRequestError,
  clientPortal,
  documentDate,
  money,
  shortDate,
} from "@/lib/clientPortalApi";
import type { AgreementView, AgreementsView } from "@/lib/clientPortalWire";

export default function ClientAgreements() {
  const { clientId } = useParams<{ clientId: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { adminPreview, exitPreview } = useAdminPreview(clientId);

  const load = usePortalView<AgreementsView>(
    clientId ? () => clientPortal.agreements(clientId, adminPreview) : null,
    [clientId, adminPreview],
  );
  const view = load.data;

  // Which agreement is open: the one named in the URL, or the first that is
  // waiting on the client, or the newest. A client arriving from the home
  // screen lands on the one they were told about; a client clicking
  // "Agreements" lands on the one that needs them.
  const wanted = params.get("id");
  const current: AgreementView | null = useMemo(() => {
    const all = view?.agreements ?? [];
    if (all.length === 0) return null;
    return (
      all.find((agreement) => agreement.id === wanted) ??
      all.find((agreement) => agreement.status === "sent" || agreement.status === "viewed") ??
      all[0]
    );
  }, [view, wanted]);

  return (
    <ClientPortalShell
      clientId={clientId ?? ""}
      branding={view?.branding ?? null}
      me={view?.me ?? null}
      tab="agreements"
      adminPreview={adminPreview}
      onExitPreview={exitPreview}
    >
      {load.error && !view ? (
        <PortalProblem message={load.error} onRetry={load.reload} />
      ) : !view ? (
        <PortalLoading what="your agreements" />
      ) : !current ? (
        <div className="cp__state">
          There is nothing to sign yet. We will send your proposal here when it is ready.
        </div>
      ) : (
        <div className="cp-sign">
          <Document
            agreement={current}
            clientId={clientId ?? ""}
            adminPreview={adminPreview}
          />
          <div className="cp-sign__side">
            {view.agreements.length > 1 && (
              <Picker
                agreements={view.agreements}
                currentId={current.id}
                onPick={(id) => {
                  const next = new URLSearchParams(params);
                  next.set("id", id);
                  setParams(next, { replace: true });
                }}
              />
            )}
            <SignPanel
              key={current.id}
              clientId={clientId ?? ""}
              view={view}
              agreement={current}
              adminPreview={adminPreview}
              onSigned={(href) => {
                load.reload();
                if (href) navigate(href);
              }}
            />
            <QuestionsPanel
              view={view}
              clientId={clientId ?? ""}
              agreement={current}
              adminPreview={adminPreview}
              onDeclined={load.reload}
            />
          </div>
        </div>
      )}
    </ClientPortalShell>
  );
}

/* -------------------------------------------------------------------------- */

function Document({
  agreement,
  clientId,
  adminPreview,
}: {
  agreement: AgreementView;
  clientId: string;
  adminPreview: boolean;
}) {
  return (
    <article className="cp-doc">
      <p className="cp-doc__number">Proposal {agreement.number}</p>
      <h1 className="cp-doc__title">{agreement.title}</h1>
      <p className="cp-doc__meta">
        For {agreement.preparedFor} · prepared by {agreement.preparedBy}
        {/* With the year, unlike every other date on these screens. This one
            is on a contract, and a contract dated "Oct 25" is a contract
            somebody has to work out the year of later. */}
        {agreement.sentAt && ` · ${documentDate(agreement.sentAt)}`}
      </p>

      <hr className="cp-doc__rule" />

      {agreement.scopeBody && (
        <>
          <h2 className="cp-doc__h2">{agreement.scopeHeading ?? "What we\u2019ll build"}</h2>
          {/* Paragraph breaks preserved; no markdown, no HTML. This is a
              contract and what it says is what was written, not what a
              renderer made of it. */}
          {agreement.scopeBody.split(/\n{2,}/).map((para, index) => (
            <p className="cp-doc__p" key={index}>
              {para}
            </p>
          ))}
        </>
      )}

      {agreement.lineItems.length > 0 && (
        <>
          <h2 className="cp-doc__h2">Investment</h2>
          <table className="cp-doc__table">
            <tbody>
              {agreement.lineItems.map((item, index) => (
                <tr key={index}>
                  <td>{item.description}</td>
                  <td className="cp-doc__num">{money(item.amountCents, agreement.currency)}</td>
                </tr>
              ))}
              <tr className="cp-doc__total">
                <td>Total</td>
                <td className="cp-doc__num">{money(agreement.totalCents, agreement.currency)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {agreement.lineItems.length === 0 && agreement.totalCents > 0 && (
        <p className="cp-doc__p">
          <strong>Total {money(agreement.totalCents, agreement.currency)}</strong>
        </p>
      )}

      {agreement.instalmentSummary && (
        <p className="cp-doc__terms">{agreement.instalmentSummary}</p>
      )}

      {/* An uploaded proposal has no blocks to lay out, so the document
          itself is the thing to read. Fetched on click rather than linked:
          the server answers with bytes or with a URL that expires, and
          neither is something that could sit in an `href`. */}
      {agreement.hasSourcePdf && (
        <p className="cp-doc__p">
          <DocumentButton
            clientId={clientId}
            proposalId={agreement.id}
            kind="source"
            adminPreview={adminPreview}
            label="Read the full proposal (PDF)"
          />
        </p>
      )}

      {agreement.hasSignedDocument && (
        <p className="cp-doc__p">
          <DocumentButton
            clientId={clientId}
            proposalId={agreement.id}
            kind="signed"
            adminPreview={adminPreview}
            label="Download your signed copy (PDF)"
          />
        </p>
      )}
    </article>
  );
}

/**
 * A download that is a request, not a link.
 *
 * Says when it fails. A download that silently does nothing is the single
 * most common way a client decides a portal is broken, and the two reasons
 * this one can fail -- the seal no longer matching, and the backend having no
 * route to the original -- are both worth reading rather than guessing at.
 */
function DocumentButton({
  clientId,
  proposalId,
  kind,
  adminPreview,
  label,
}: {
  clientId: string;
  proposalId: string;
  kind: "signed" | "source";
  adminPreview: boolean;
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className="cp-doc__link"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          clientPortal
            .download(clientId, proposalId, kind, adminPreview)
            .catch((caught: unknown) => {
              setError(
                caught instanceof PortalRequestError
                  ? caught.message
                  : "That document could not be opened.",
              );
            })
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Opening…" : label}
      </button>
      {error && <span className="cp-doc__warn">{error}</span>}
    </>
  );
}

function Picker({
  agreements,
  currentId,
  onPick,
}: {
  agreements: AgreementView[];
  currentId: string;
  onPick: (id: string) => void;
}) {
  return (
    <section className="cp-panel">
      <h2 className="cp-panel__title">Your agreements</h2>
      <ul className="cp-picker">
        {agreements.map((agreement) => (
          <li key={agreement.id}>
            <button
              type="button"
              className={`cp-picker__item${agreement.id === currentId ? " cp-picker__item--on" : ""}`}
              onClick={() => onPick(agreement.id)}
            >
              <span>{agreement.title}</span>
              <span className={`cp-pill cp-pill--${agreement.status}`}>{STATUS_WORD[agreement.status]}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const STATUS_WORD: Record<AgreementView["status"], string> = {
  draft: "Draft",
  sent: "To sign",
  viewed: "To sign",
  signed: "Signed",
  declined: "Declined",
  expired: "Expired",
  void: "Closed",
};

function SignPanel({
  clientId,
  view,
  agreement,
  adminPreview,
  onSigned,
}: {
  clientId: string;
  view: AgreementsView;
  agreement: AgreementView;
  adminPreview: boolean;
  onSigned: (href: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [style, setStyle] = useState<string | null>(view.signing.defaultStyle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStyle(view.signing.defaultStyle);
  }, [view.signing.defaultStyle]);

  const typed = name.trim();
  const ready = typed.length > 0 && agreed && !busy;

  const sign = useCallback(async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const result = await clientPortal.sign(
        clientId,
        { proposalId: agreement.id, signerName: typed, signatureStyle: style, consentGranted: true },
        adminPreview,
      );
      onSigned(result.nextHref);
    } catch (caught) {
      setError(
        caught instanceof PortalRequestError
          ? caught.message
          : "That could not be signed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }, [ready, clientId, agreement.id, typed, style, adminPreview, onSigned]);

  if (agreement.status === "signed") {
    return (
      <section className="cp-panel">
        <h2 className="cp-panel__title">Signed</h2>
        <p className="cp-panel__body">
          {agreement.signerName ? `${agreement.signerName} signed this` : "This is signed"}
          {agreement.signedAt && ` on ${shortDate(agreement.signedAt)}`}. Thank you.
        </p>
      </section>
    );
  }

  if (agreement.status !== "sent" && agreement.status !== "viewed") {
    return (
      <section className="cp-panel">
        <h2 className="cp-panel__title">{STATUS_WORD[agreement.status]}</h2>
        <p className="cp-panel__body">
          This agreement is closed. Ask us for a new one and we will re-quote it.
        </p>
      </section>
    );
  }

  // A hosted e-sign provider signs at the vendor, not here. Capturing a
  // signature in this panel and storing it under a vendor's name would be a
  // false statement in the audit trail, so the panel says where to go
  // instead of pretending it can take one.
  if (view.signing.hosted) {
    return (
      <section className="cp-panel">
        <h2 className="cp-panel__title">Sign</h2>
        <p className="cp-panel__body">
          This agreement is signed through our e-signature provider. Check your email for the
          link, or ask us to send it again.
        </p>
      </section>
    );
  }

  return (
    <section className="cp-panel">
      <h2 className="cp-panel__title">Sign</h2>

      <label className="cp-field">
        <span className="cp-field__label">Type your full name</span>
        <input
          className="cp-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          spellCheck={false}
        />
      </label>

      {/* The mark, as it will be recorded. Shown the moment there is a name
          to show: a signature the signer never saw is a signature they
          cannot be said to have adopted. */}
      <p className="cp-signature" style={{ fontFamily: fontFor(view, style) }}>
        {typed || " "}
      </p>

      {view.signing.styles.length > 1 && (
        <div className="cp-styles" role="radiogroup" aria-label="Choose how your signature looks">
          {view.signing.styles.map((option) => (
            <button
              type="button"
              key={option.key}
              role="radio"
              aria-checked={style === option.key}
              className={`cp-styles__one${style === option.key ? " cp-styles__one--on" : ""}`}
              style={{ fontFamily: option.fontStack }}
              onClick={() => setStyle(option.key)}
            >
              {typed || option.name}
            </button>
          ))}
        </div>
      )}

      <label className="cp-consent">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
        />
        <span>{view.signing.consentText}</span>
      </label>

      {error && (
        <p className="cp-panel__error" role="alert">
          {error}
        </p>
      )}

      <button type="button" className="cp__btn cp__btn--primary cp__btn--wide" disabled={!ready} onClick={() => void sign()}>
        {busy ? "Signing…" : "Sign & continue to deposit →"}
      </button>

      {/* Why the button is off, said rather than implied. */}
      {!ready && !busy && (
        <p className="cp-panel__hint">
          {typed.length === 0
            ? "Type your name above to sign."
            : "Tick the box to confirm you have read it."}
        </p>
      )}

      {view.signing.depositCents !== null && (
        <p className="cp-panel__hint">
          Then pay the {money(view.signing.depositCents, agreement.currency)} deposit
          {view.signing.depositProviderName && ` with ${view.signing.depositProviderName}`}
        </p>
      )}

    </section>
  );
}

/**
 * Declining asks once more, and asks why.
 *
 * A decline is final -- the price and the timeline were quoted for a decision
 * made then, so signing it weeks later is not offered. A single click that
 * closes a deal permanently deserves a second one. The reason is optional:
 * requiring it would make people pick something untrue from a list.
 */
function DeclineConfirm({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string | null) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="cp-decline">
      <p className="cp-panel__hint">
        This closes the proposal for good. If you want changes instead, ask us a question and we
        will send a new one.
      </p>
      <input
        className="cp-input"
        placeholder="Anything you want to tell us? (optional)"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <div className="cp-panel__row">
        <button type="button" className="cp__btn" onClick={onCancel} disabled={busy}>
          Keep it open
        </button>
        <button
          type="button"
          className="cp__btn cp__btn--danger"
          disabled={busy}
          onClick={() => onConfirm(reason.trim() || null)}
        >
          {busy ? "Sending…" : "Decline it"}
        </button>
      </div>
    </div>
  );
}

/**
 * "Ask a question" and "Decline", side by side -- which is where mockup 14
 * puts them, and it is the right place for a reason worth keeping.
 *
 * Declining is final: the price and the timeline were quoted for a decision
 * made then, so a declined proposal cannot be signed later. Sitting next to
 * "Ask a question" offers the way out to the client who actually wants
 * changes, at the moment they are deciding. Under the Sign button it would
 * read as the other half of a pair of equal choices.
 */
function QuestionsPanel({
  view,
  clientId,
  agreement,
  adminPreview,
  onDeclined,
}: {
  view: AgreementsView;
  clientId: string;
  agreement: AgreementView;
  adminPreview: boolean;
  onDeclined: () => void;
}) {
  const who = view.branding.contactName;
  const [declining, setDeclining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = agreement.status === "sent" || agreement.status === "viewed";

  return (
    <section className="cp-panel">
      <h2 className="cp-panel__title">Questions?</h2>
      <p className="cp-panel__body">
        {who ? `Message ${who}` : "Send us a message"}
        {view.branding.replyWindow && ` · ${view.branding.replyWindow}`}
      </p>
      {/* `mailto:` and not a form. A message typed into a portal goes into a
          queue nobody promised to watch; a message in their own sent folder
          is one the client can chase. */}
      {error && (
        <p className="cp-panel__error" role="alert">
          {error}
        </p>
      )}

      {declining ? (
        <DeclineConfirm
          busy={busy}
          onCancel={() => setDeclining(false)}
          onConfirm={async (reason) => {
            setBusy(true);
            setError(null);
            try {
              await clientPortal.decline(clientId, agreement.id, reason, adminPreview);
              setDeclining(false);
              onDeclined();
            } catch (caught) {
              setError(
                caught instanceof PortalRequestError
                  ? caught.message
                  : "That could not be sent. Please try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : (
        <div className="cp-panel__row">
          {view.branding.contactEmail && (
            <a className="cp__btn" href={`mailto:${view.branding.contactEmail}`}>
              Ask a question
            </a>
          )}
          {/* Only while there is something to decline. A closed proposal
              with a live Decline button invites a second final answer. */}
          {open && (
            <button type="button" className="cp__btn" onClick={() => setDeclining(true)}>
              Decline
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** The CSS stack for the chosen face, or the page font if there is no choice. */
function fontFor(view: AgreementsView, style: string | null): string | undefined {
  if (!style) return undefined;
  return view.signing.styles.find((option) => option.key === style)?.fontStack;
}
