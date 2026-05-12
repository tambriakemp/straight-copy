import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type Proposal = {
  id: string;
  title: string;
  description: string | null;
  status: "draft" | "sent" | "signed" | "voided";
  client_signature_name: string | null;
  client_signed_at: string | null;
  created_at: string;
  source_url?: string | null;
  signed_pdf_url?: string | null;
};

function collectAuditData() {
  const nav: any = typeof navigator !== "undefined" ? navigator : {};
  const scr: any = typeof screen !== "undefined" ? screen : {};
  const win: any = typeof window !== "undefined" ? window : {};
  let timezone = ""; let timezoneOffset = "";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const off = new Date().getTimezoneOffset();
    const sign = off <= 0 ? "+" : "-";
    const abs = Math.abs(off);
    timezoneOffset = `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  } catch {}
  return {
    userAgent: nav.userAgent || "",
    platform: nav.userAgentData?.platform || nav.platform || "",
    language: nav.language || "",
    languages: Array.isArray(nav.languages) ? nav.languages.slice(0, 6) : [],
    timezone, timezoneOffset,
    screen: { width: scr.width || null, height: scr.height || null, pixelRatio: win.devicePixelRatio || null, colorDepth: scr.colorDepth || null },
    viewport: { width: win.innerWidth || null, height: win.innerHeight || null },
    referrer: typeof document !== "undefined" ? document.referrer || "" : "",
    pageUrl: typeof location !== "undefined" ? location.href : "",
    signedAtLocal: new Date().toString(),
    signedAtIso: new Date().toISOString(),
  };
}

async function callFn(body: Record<string, unknown>) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/proposal-sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${PUB_KEY}` },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "Request failed");
  return data;
}

function ProposalCard({ clientId, contactName, proposal, onSigned }: {
  clientId: string; contactName: string | null; proposal: Proposal; onSigned: () => void;
}) {
  const [open, setOpen] = useState(proposal.status !== "signed");
  const [detail, setDetail] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSign, setShowSign] = useState(false);
  const [mode, setMode] = useState<"typed" | "drawn">("typed");
  const [typedName, setTypedName] = useState(contactName ?? "");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  const isSigned = proposal.status === "signed";
  const isVoided = proposal.status === "voided";

  const loadDetail = async () => {
    setLoading(true);
    try {
      const data = await callFn({ action: "get", clientId, proposalId: proposal.id });
      setDetail(data.proposal as Proposal);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open && !detail) void loadDetail(); /* eslint-disable-next-line */ }, [open]);

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 2.2;
    ctx.strokeStyle = "#1A1916"; ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasDrawn(false);
  };

  useEffect(() => {
    if (showSign && mode === "drawn") requestAnimationFrame(initCanvas);
    // eslint-disable-next-line
  }, [showSign, mode]);

  const point = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current;
    if (!c) return null;
    const rect = c.getBoundingClientRect();
    let cx: number, cy: number;
    if ("touches" in e && e.touches.length) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
    else if ("clientX" in e) { cx = (e as any).clientX; cy = (e as any).clientY; }
    else return null;
    return { x: cx - rect.left, y: cy - rect.top };
  };
  const startDraw = (e: React.MouseEvent | React.TouchEvent) => { e.preventDefault(); const p = point(e); if (!p) return; drawingRef.current = true; lastRef.current = p; };
  const moveDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current) return; e.preventDefault();
    const p = point(e); const ctx = canvasRef.current?.getContext("2d");
    if (!p || !ctx || !lastRef.current) return;
    ctx.beginPath(); ctx.moveTo(lastRef.current.x, lastRef.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    lastRef.current = p; if (!hasDrawn) setHasDrawn(true);
  };
  const endDraw = () => { drawingRef.current = false; lastRef.current = null; };

  const submit = async () => {
    if (submitting) return;
    if (!agreed) return toast.error("Please confirm you agree.");
    let signatureData = ""; let signatureName = "";
    if (mode === "typed") {
      signatureName = typedName.trim();
      if (signatureName.length < 2) return toast.error("Type your full legal name.");
      signatureData = signatureName;
    } else {
      const c = canvasRef.current;
      if (!c || !hasDrawn) return toast.error("Draw your signature.");
      signatureData = c.toDataURL("image/png");
      signatureName = (typedName.trim() || contactName || "").trim();
      if (signatureName.length < 2) return toast.error("Also type your printed name.");
    }
    setSubmitting(true);
    try {
      await callFn({
        action: "sign", clientId, proposalId: proposal.id,
        signatureType: mode, signatureName, signatureData, agreed: true,
        audit: collectAuditData(),
      });
      toast.success("Proposal signed");
      setShowSign(false);
      onSigned();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Signing failed");
    } finally {
      setSubmitting(false);
    }
  };

  const downloadSigned = async () => {
    try {
      const data = await callFn({ action: "download", clientId, proposalId: proposal.id, variant: "signed" });
      if (!data.pdfUrl) throw new Error("Not available");
      window.open(data.pdfUrl, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  };

  const signedDate = proposal.client_signed_at
    ? new Date(proposal.client_signed_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <section className={`portal-access ${open ? "is-open" : "is-closed"}`}>
      <button type="button" className="portal-access__toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <div className="portal-access__toggle-left">
          <div className="portal-access__eyebrow">Proposal</div>
          <h2 className="portal-access__title">{proposal.title}</h2>
        </div>
        <div className="portal-access__toggle-right">
          <span className={`portal-access__status ${isSigned ? "is-done" : ""}`}>
            {isSigned ? `Signed ${signedDate}` : isVoided ? "Voided" : "Awaiting signature"}
          </span>
          <span className={`portal-access__chev ${open ? "is-open" : ""}`}>›</span>
        </div>
      </button>

      {open && (
        <div className="portal-access__body">
          {proposal.description && <p className="portal-access__intro">{proposal.description}</p>}

          {loading && <p style={{ color: "var(--crm-taupe)" }}>Loading…</p>}

          {!loading && detail?.source_url && (
            <iframe
              src={detail.source_url}
              title={proposal.title}
              style={{ width: "100%", height: 520, border: "1px solid var(--crm-border-dark)", borderRadius: 8, background: "#fff" }}
            />
          )}

          {!isSigned && !isVoided && !loading && (
            <div style={{ marginTop: 16 }}>
              {!showSign ? (
                <button className="crm-btn crm-btn--primary" onClick={() => setShowSign(true)}>
                  Sign this proposal
                </button>
              ) : (
                <div style={{ marginTop: 8, padding: 16, border: "1px solid var(--crm-border-dark)", borderRadius: 8 }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <button className={`crm-btn crm-btn--sm ${mode === "typed" ? "crm-btn--primary" : "crm-btn--ghost"}`} onClick={() => setMode("typed")}>Type</button>
                    <button className={`crm-btn crm-btn--sm ${mode === "drawn" ? "crm-btn--primary" : "crm-btn--ghost"}`} onClick={() => setMode("drawn")}>Draw</button>
                  </div>

                  {mode === "typed" ? (
                    <div>
                      <label className="crm-label">Full legal name</label>
                      <input className="crm-input" value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder="Your name" />
                    </div>
                  ) : (
                    <div>
                      <label className="crm-label">Draw signature</label>
                      <canvas
                        ref={canvasRef}
                        style={{ width: "100%", height: 140, border: "1px solid var(--crm-border-dark)", borderRadius: 6, background: "#fff", touchAction: "none" }}
                        onMouseDown={startDraw} onMouseMove={moveDraw} onMouseUp={endDraw} onMouseLeave={endDraw}
                        onTouchStart={startDraw} onTouchMove={moveDraw} onTouchEnd={endDraw}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button type="button" className="crm-btn crm-btn--ghost crm-btn--sm" onClick={initCanvas}>Clear</button>
                      </div>
                      <label className="crm-label" style={{ marginTop: 12 }}>Printed name</label>
                      <input className="crm-input" value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder="Your name" />
                    </div>
                  )}

                  <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 14, fontSize: 14, color: "var(--crm-stone)" }}>
                    <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 4 }} />
                    <span>I have read this proposal and agree to be electronically bound by my signature.</span>
                  </label>

                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <button className="crm-btn crm-btn--ghost" onClick={() => setShowSign(false)} disabled={submitting}>Cancel</button>
                    <button className="crm-btn crm-btn--primary" onClick={submit} disabled={submitting}>
                      {submitting ? "Signing…" : "Sign proposal"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isSigned && (
            <div style={{ marginTop: 16 }}>
              <p className="portal-access__intro">
                Signed {signedDate} by <strong>{proposal.client_signature_name}</strong>. A copy is on file.
              </p>
              <button className="crm-btn crm-btn--bronze crm-btn--sm" onClick={downloadSigned}>
                ⇣ Download signed PDF
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function ProposalsSection({ clientId, contactName }: { clientId: string; contactName: string | null }) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await callFn({ action: "list", clientId });
      setProposals((data.proposals ?? []) as Proposal[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [clientId]);

  if (loading) return null;
  const visible = proposals.filter((p) => p.status !== "voided" && p.status !== "draft");
  if (visible.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {visible.map((p) => (
        <ProposalCard key={p.id} clientId={clientId} contactName={contactName} proposal={p} onSigned={load} />
      ))}
    </div>
  );
}
