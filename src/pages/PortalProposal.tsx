// The proposal a client reads and signs, laid out to the Admin Journeys
// canvas: the document on the left, what it costs and what they are being
// asked to do on the right.
//
// It was a card in a list, opening into a side panel. A proposal is the
// one page in the portal where a client is asked to commit money, and
// reading it in a drawer over the rest of their portal is the wrong
// amount of room for that. This is its own page, which is also what makes
// "Copy client link" in the admin worth anything — a link that drops
// someone on a dashboard and expects them to find the proposal is not a
// link to the proposal.
//
// Signing goes through the same proposal-sign `sign` action as before,
// with the same audit payload: the signature's legal weight comes from
// what is recorded with it, and this page records the same things.
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { usd } from "@/lib/clientBalance";
import { clientStatusLabel } from "@/lib/proposalStatus";
import { describeTerm, termRows } from "@/lib/proposalTerms";
import { collectSigningAudit } from "@/lib/signingAudit";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

interface PortalProposal {
  id: string;
  title: string;
  status: string;
  total_cents: number | null;
  payment_due_days: number | null;
  payment_terms: unknown;
  sent_at: string | null;
  first_viewed_at: string | null;
  client_signed_at: string | null;
  agency_countersigned_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  client_signature_name: string | null;
}

async function callFn(body: Record<string, unknown>) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/proposal-sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${PUB_KEY}` },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "Request failed");
  return data as Record<string, unknown>;
}

export default function PortalProposal() {
  const { clientId, proposalId } = useParams<{ clientId: string; proposalId: string }>();
  const navigate = useNavigate();
  const [p, setP] = useState<PortalProposal | null>(null);
  const [who, setWho] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<"read" | "sign" | "decline">("read");
  const [typedName, setTypedName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!clientId || !proposalId) return;
    setLoading(true);
    try {
      // `get` is the portal-safe read: it refuses a draft, a voided one
      // and anything superseded, so a stale link cannot show a client a
      // proposal that is no longer the one on the table.
      const data = await callFn({ action: "get", clientId, proposalId });
      // `get` hands back the row AND both signed URLs AND the client, so
      // there is no second call to make. Asking `download` separately was
      // a round trip for something already in hand — and it reads
      // `pdfUrl` where this reads `source_url`, which is how the page
      // ended up saying "no PDF" over a file that was right there.
      const row = (data.proposal ?? null) as (PortalProposal & {
        source_url?: string | null; signed_pdf_url?: string | null;
      }) | null;
      setP(row);
      const client = (data.client ?? {}) as { contact_name?: string | null; business_name?: string | null };
      const name = client.contact_name || client.business_name || "";
      setWho(name);
      setTypedName((t) => t || name);
      // The signed copy once there is one — that is the document that
      // matters, and showing the unsigned original after signing reads as
      // though the signature did not take.
      setPdfUrl(row?.signed_pdf_url || row?.source_url || null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open that proposal");
      setP(null);
    } finally {
      setLoading(false);
    }
  }, [clientId, proposalId]);

  useEffect(() => { void load(); }, [load]);

  const sign = async () => {
    const name = typedName.trim();
    if (name.length < 2) { toast.error("Type your full legal name"); return; }
    if (!agreed) { toast.error("Tick the box to confirm you agree to the terms"); return; }
    setBusy(true);
    try {
      await callFn({
        action: "sign", clientId, proposalId,
        signatureType: "typed", signatureName: name, signatureData: name, agreed: true,
        audit: collectSigningAudit(),
      });
      toast.success("Signed — thank you");
      setStep("read");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Signing failed");
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    try {
      await callFn({ action: "decline", clientId, proposalId, reason: reason.trim() || undefined, confirm: true });
      toast.success("Thanks for letting us know.");
      setStep("read");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record that");
    } finally {
      setBusy(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="cv-admin" style={{ minHeight: "100vh", boxSizing: "border-box", padding: 20, background: "var(--cv-bg)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <header className="cv-card" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "16px 22px" }}>
          <span style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--cv-ink)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 600 }}>C</span>
          <span style={{ flex: 1, fontWeight: 600 }}>
            Cre8 Visions <span style={{ fontWeight: 400, color: "var(--cv-muted)" }}>· Client portal</span>
          </span>
          {who && <span style={{ fontSize: 14, color: "var(--cv-muted)" }}>{who}</span>}
        </header>
        {children}
      </div>
    </div>
  );

  if (loading) return shell(<p className="cv-page-sub">Loading…</p>);
  if (!p) {
    return shell(
      <section className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h1 className="cv-page-title">This proposal isn't available</h1>
        <p className="cv-page-sub">
          The link may be out of date, or a newer version has replaced it.
          Get in touch and we'll send the current one.
        </p>
        <button type="button" className="cv-open" style={{ alignSelf: "flex-start", padding: "0 20px" }}
          onClick={() => navigate(`/portal/${clientId}`)}>
          Back to your portal
        </button>
      </section>,
    );
  }

  const status = clientStatusLabel(p);
  const terms = termRows(p.payment_terms, p.total_cents);
  const open = !p.client_signed_at && !p.declined_at;

  return shell(
    <>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <h1 className="cv-page-title">{p.title}</h1>
        <span className={`cv-chip cv-chip--${status.tone}`}>{status.label}</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
        <section className="cv-card cv-card-pad cv-doc-col">
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <span style={{ flex: 1, fontWeight: 500 }}>Your proposal</span>
            <a
              className="cv-open" href={pdfUrl ?? undefined} target="_blank" rel="noreferrer"
              style={{ padding: "0 16px", minHeight: 44, ...(pdfUrl ? {} : { opacity: 0.5, pointerEvents: "none" as const }) }}
            >
              <Download size={15} style={{ marginRight: 7 }} /> Download PDF
            </a>
          </div>
          <div className="cv-paper">
            <div className="cv-paper__sheet">
              {pdfUrl
                ? <iframe // page-width, not 100: a US Letter page is 816px and this
                      // frame is narrower than that on most screens, so 100%
                      // clipped the right edge and gave the viewer its own
                      // horizontal scrollbar. Verified in Chromium against a
                      // ruled test PDF — 100 clips, page-width fits.
                      src={`${pdfUrl}#navpanes=0&toolbar=1&zoom=page-width`} title={p.title} />
                : <div className="cv-paper__none">The document is being prepared. Please check back shortly.</div>}
            </div>
          </div>
        </section>

        <aside className="cv-doc-side">
          <section className="cv-card cv-card-pad" style={{ background: "var(--cv-ink)", color: "#fff" }}>
            <div style={{ fontSize: 14, color: "#C9CFDB" }}>Total</div>
            <div style={{ fontSize: 32, fontWeight: 600, lineHeight: 1.2 }}>
              {p.total_cents ? usd(p.total_cents) : "To be confirmed"}
            </div>
            {terms.map((t, i) => (
              <div key={i} className="cv-row cv-row--onink" style={i === 0 ? { marginTop: 8 } : undefined}>
                <span>{t.label}<small>{describeTerm(t, true)}</small></span>
                <b style={{ fontWeight: 500 }}>{t.amountCents != null ? usd(t.amountCents) : t.share}</b>
              </div>
            ))}
          </section>

          {p.declined_at ? (
            <section className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <h2 className="cv-card-title">You declined this proposal</h2>
              <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>
                Nothing further is owed. If that was a mistake, or things have
                changed, just reply to our last email.
              </p>
            </section>
          ) : p.client_signed_at ? (
            <section className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <h2 className="cv-card-title">Signed — thank you</h2>
              <div className="cv-sig cv-sig--sm">{p.client_signature_name ?? who}</div>
              <p style={{ margin: 0, fontSize: 13, color: "var(--cv-muted)" }}>
                Signed {new Date(p.client_signed_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.
                Your signed copy is above and yours to download.
              </p>
            </section>
          ) : step === "sign" ? (
            <section className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <button type="button" className="cv-back" style={{ background: "none", border: 0, font: "inherit", fontSize: 14, color: "var(--cv-muted)", cursor: "pointer", minHeight: 44, padding: 0, textAlign: "left" }}
                onClick={() => setStep("read")}>
                ← Back
              </button>
              <h2 className="cv-card-title">Sign the proposal</h2>
              <label className="cv-field">
                Type your full legal name
                <input className="cv-input" value={typedName} onChange={(e) => setTypedName(e.target.value)} autoFocus />
              </label>
              <div style={{ background: "var(--cv-sunken)", borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 12, color: "var(--cv-muted)" }}>Your signature</div>
                <div className="cv-sig">{typedName}</div>
              </div>
              <label style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 10, fontSize: 14, color: "var(--cv-ink)" }}>
                <input
                  type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
                  style={{ width: 20, height: 20, marginTop: 2, accentColor: "var(--cv-ink)" }}
                />
                I have read this proposal and agree to its terms. Typing my name counts as my signature.
              </label>
              <button type="button" className="cv-open cv-open--dark" disabled={busy} onClick={sign}>
                {busy ? "Signing…" : "Sign proposal"}
              </button>
              <p style={{ margin: 0, fontSize: 13, color: "var(--cv-muted)" }}>
                The date and time of signing are recorded with your signature.
              </p>
            </section>
          ) : step === "decline" ? (
            <section className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <button type="button" style={{ background: "none", border: 0, font: "inherit", fontSize: 14, color: "var(--cv-muted)", cursor: "pointer", minHeight: 44, padding: 0, textAlign: "left" }}
                onClick={() => setStep("read")}>
                ← Back
              </button>
              <h2 className="cv-card-title">Decline this proposal</h2>
              <label className="cv-field">
                Anything you'd like us to know? (optional)
                <textarea className="cv-textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <button type="button" className="cv-open cv-open--dark" disabled={busy} onClick={decline}>
                {busy ? "Sending…" : "Decline"}
              </button>
              <p style={{ margin: 0, fontSize: 13, color: "var(--cv-muted)" }}>
                Nothing is charged, and we'll stop chasing you about it.
              </p>
            </section>
          ) : (
            <section className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h2 className="cv-card-title">Ready to move forward?</h2>
              <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>
                Read the proposal, then approve and sign it here. Nothing is
                charged until your deposit invoice arrives.
              </p>
              <button type="button" className="cv-open cv-open--dark" disabled={!open} onClick={() => setStep("sign")}>
                Approve and sign
              </button>
              {/* Saying no is a first-class outcome. Without it the only way
                  to decline is silence, and silence reads as "hasn't got to
                  it yet" — so we keep nudging about a decision already made. */}
              <button type="button" className="cv-open" onClick={() => setStep("decline")}>
                Decline
              </button>
              <a href={`/portal/${clientId}`} style={{ fontSize: 14, textAlign: "center", padding: "10px 0" }}>
                Have a question? Message Cre8 Visions
              </a>
            </section>
          )}
        </aside>
      </div>
    </>,
  );
}
