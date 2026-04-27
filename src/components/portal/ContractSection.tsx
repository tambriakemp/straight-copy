import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { ContractTemplate } from "@/lib/contract-templates";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type SignedContract = {
  id: string;
  tier: string;
  template_version: string;
  client_signature_name: string;
  client_signature_type: "typed" | "drawn";
  client_signed_at: string;
  agency_signer_name: string;
  agency_countersigned_at: string;
  pdf_path: string | null;
  pdf_url: string | null;
};

export default function ContractSection({
  clientId,
  contactName,
}: {
  clientId: string;
  contactName: string | null;
}) {
  // Collapsed by default; we expand automatically when there's no signed
  // contract yet (so the client sees the document and the sign CTA).
  const [open, setOpen] = useState(false);
  const [userToggled, setUserToggled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<ContractTemplate | null>(null);
  const [contract, setContract] = useState<SignedContract | null>(null);

  // Sign flow state
  const [showSignPanel, setShowSignPanel] = useState(false);
  const [mode, setMode] = useState<"typed" | "drawn">("typed");
  const [typedName, setTypedName] = useState(contactName ?? "");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Drawn signature
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    void loadContract();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const loadContract = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/contract-sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${PUB_KEY}` },
        body: JSON.stringify({ action: "get", clientId }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed to load contract");
      setTemplate(data.template);
      setContract(data.contract);
      // Auto-expand only when unsigned — keep collapsed once signed unless
      // the client explicitly opens it.
      if (!userToggled) {
        setOpen(!data.contract);
      }
    } catch (e) {
      console.error("[contract] load failed", e);
    } finally {
      setLoading(false);
    }
  };

  // ---------- Drawing ----------
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
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "#1A1916";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasDrawn(false);
  };

  useEffect(() => {
    if (showSignPanel && mode === "drawn") {
      // Defer to give canvas its size
      requestAnimationFrame(initCanvas);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSignPanel, mode]);

  const pointFromEvent = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    let cx: number, cy: number;
    if ("touches" in e && e.touches.length) {
      cx = e.touches[0].clientX;
      cy = e.touches[0].clientY;
    } else if ("clientX" in e) {
      cx = (e as MouseEvent).clientX;
      cy = (e as MouseEvent).clientY;
    } else {
      return null;
    }
    return { x: cx - rect.left, y: cy - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const p = pointFromEvent(e);
    if (!p) return;
    drawingRef.current = true;
    lastPointRef.current = p;
  };

  const moveDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const p = pointFromEvent(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (!p || !ctx || !lastPointRef.current) return;
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPointRef.current = p;
    if (!hasDrawn) setHasDrawn(true);
  };

  const endDraw = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const clearCanvas = () => initCanvas();

  // ---------- Submit ----------
  const submit = async () => {
    if (submitting) return;
    if (!agreed) {
      toast.error("Please confirm you agree to the terms.");
      return;
    }
    let signatureData = "";
    let signatureName = "";
    if (mode === "typed") {
      signatureName = typedName.trim();
      if (signatureName.length < 2) {
        toast.error("Please type your full legal name.");
        return;
      }
      signatureData = signatureName;
    } else {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawn) {
        toast.error("Please draw your signature.");
        return;
      }
      signatureData = canvas.toDataURL("image/png");
      signatureName = (typedName.trim() || contactName || "").trim();
      if (signatureName.length < 2) {
        toast.error("Please also type your printed name below.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/contract-sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${PUB_KEY}` },
        body: JSON.stringify({
          action: "sign",
          clientId,
          signatureType: mode,
          signatureName,
          signatureData,
          agreed: true,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.error || "Signing failed");
      toast.success("Contract signed");
      setShowSignPanel(false);
      await loadContract();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Signing failed");
    } finally {
      setSubmitting(false);
    }
  };

  const downloadPdf = async () => {
    if (!contract) return;
    const filename = `cre8-visions-service-agreement-${contract.id}.pdf`;
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/contract-sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${PUB_KEY}` },
        body: JSON.stringify({ action: "download", clientId, contractId: contract.id }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.pdfUrl) throw new Error(data.error || "Download failed");

      // Fetch as blob so the browser actually downloads the PDF instead of
      // navigating away or being blocked as a cross-origin popup.
      try {
        const fileResp = await fetch(data.pdfUrl);
        if (!fileResp.ok) throw new Error("Could not retrieve PDF");
        const blob = await fileResp.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      } catch {
        // Fallback: open the signed URL in a new tab.
        window.open(data.pdfUrl, "_blank", "noopener");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  };

  if (loading) return null;
  if (!template) return null;

  const isSigned = !!contract;
  const signedDate = contract
    ? new Date(contract.client_signed_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <section className={`portal-access ${open ? "is-open" : "is-closed"}`}>
      <button
        type="button"
        className="portal-access__toggle"
        onClick={() => {
          setUserToggled(true);
          setOpen((v) => !v);
        }}
        aria-expanded={open}
      >
        <div className="portal-access__toggle-left">
          <div className="portal-access__eyebrow">Node 01 · Intake</div>
          <h2 className="portal-access__title">
            Sign Your <em>Agreement</em>.
          </h2>
        </div>
        <div className="portal-access__toggle-right">
          <span className={`portal-access__status ${isSigned ? "is-done" : ""}`}>
            {isSigned ? `Signed ${signedDate}` : "Awaiting signature"}
          </span>
          <span className={`portal-access__chev ${open ? "is-open" : ""}`}>›</span>
        </div>
      </button>

      {open && (
        <div className="portal-access__body">
          {isSigned && contract ? (
            <div className="portal-contract__signed">
              <p className="portal-access__intro">
                Your <strong>{template.title}</strong> is signed and countersigned. A copy is on file
                for both parties.
              </p>
              <div className="portal-contract__sig-grid">
                <div className="portal-contract__sig-card">
                  <div className="portal-contract__sig-label">Client</div>
                  <div
                    className="portal-contract__sig-script"
                    style={{ fontFamily: "'Great Vibes', cursive" }}
                  >
                    {contract.client_signature_name}
                  </div>
                  <div className="portal-contract__sig-meta">
                    {contract.client_signature_name}
                    <br />
                    Signed{" "}
                    {new Date(contract.client_signed_at).toLocaleDateString(undefined, {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                </div>
                <div className="portal-contract__sig-card">
                  <div className="portal-contract__sig-label">Agency</div>
                  <div
                    className="portal-contract__sig-script"
                    style={{ fontFamily: "'Great Vibes', cursive" }}
                  >
                    {contract.agency_signer_name}
                  </div>
                  <div className="portal-contract__sig-meta">
                    {contract.agency_signer_name}
                    <br />
                    Cre8 Visions, LLC
                    <br />
                    Countersigned{" "}
                    {new Date(contract.agency_countersigned_at).toLocaleDateString(undefined, {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                </div>
              </div>
              <div className="portal-access__footer">
                <span className="portal-access__badge">✓ Fully executed</span>
                <button type="button" className="portal-contract__btn" onClick={downloadPdf}>
                  Download signed PDF
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="portal-access__intro">
                Please review the <strong>{template.title}</strong> below. When you're ready, sign at
                the bottom — we'll countersign automatically and you'll get a fully executed PDF for
                your records.
              </p>

              <div className="portal-contract__doc">
                <div className="portal-contract__doc-head">
                  <div className="portal-contract__doc-title">{template.title}</div>
                  <div className="portal-contract__doc-meta">
                    {template.effectiveLine} · Version {template.version}
                  </div>
                </div>
                <div className="portal-contract__doc-body">
                  {template.sections.map((s) => (
                    <div key={s.heading} className="portal-contract__section">
                      <div className="portal-contract__section-heading">{s.heading}</div>
                      <p className="portal-contract__section-body">{s.body}</p>
                    </div>
                  ))}
                </div>
              </div>

              {!showSignPanel ? (
                <div className="portal-access__footer" style={{ marginTop: 16 }}>
                  <span className="portal-access__save">Ready when you are.</span>
                  <button
                    type="button"
                    className="portal-contract__btn portal-contract__btn--primary"
                    onClick={() => setShowSignPanel(true)}
                  >
                    Sign contract →
                  </button>
                </div>
              ) : (
                <div className="portal-contract__sign-panel">
                  <div className="portal-contract__sign-tabs">
                    <button
                      type="button"
                      className={`portal-contract__tab ${mode === "typed" ? "is-active" : ""}`}
                      onClick={() => setMode("typed")}
                    >
                      Type
                    </button>
                    <button
                      type="button"
                      className={`portal-contract__tab ${mode === "drawn" ? "is-active" : ""}`}
                      onClick={() => setMode("drawn")}
                    >
                      Draw
                    </button>
                  </div>

                  {mode === "typed" ? (
                    <>
                      <label className="portal-access__field-label">Your full legal name</label>
                      <input
                        type="text"
                        className="portal-contract__input"
                        value={typedName}
                        onChange={(e) => setTypedName(e.target.value)}
                        placeholder="e.g. Jane Doe"
                        maxLength={120}
                      />
                      {typedName.trim().length >= 2 && (
                        <div
                          className="portal-contract__sig-script portal-contract__sig-preview"
                          style={{ fontFamily: "'Great Vibes', cursive" }}
                        >
                          {typedName.trim()}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <label className="portal-access__field-label">Draw your signature</label>
                      <div className="portal-contract__canvas-wrap">
                        <canvas
                          ref={canvasRef}
                          className="portal-contract__canvas"
                          onMouseDown={startDraw}
                          onMouseMove={moveDraw}
                          onMouseUp={endDraw}
                          onMouseLeave={endDraw}
                          onTouchStart={startDraw}
                          onTouchMove={moveDraw}
                          onTouchEnd={endDraw}
                        />
                      </div>
                      <button
                        type="button"
                        className="portal-contract__btn portal-contract__btn--ghost"
                        onClick={clearCanvas}
                      >
                        Clear
                      </button>
                      <label className="portal-access__field-label" style={{ marginTop: 12 }}>
                        Printed name
                      </label>
                      <input
                        type="text"
                        className="portal-contract__input"
                        value={typedName}
                        onChange={(e) => setTypedName(e.target.value)}
                        placeholder="e.g. Jane Doe"
                        maxLength={120}
                      />
                    </>
                  )}

                  <label className="portal-contract__agree">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                    />
                    <span>
                      I have read and agree to the terms of the {template.title}. My electronic
                      signature has the same legal effect as a handwritten one.
                    </span>
                  </label>

                  <div className="portal-access__footer" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="portal-contract__btn portal-contract__btn--ghost"
                      onClick={() => setShowSignPanel(false)}
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="portal-contract__btn portal-contract__btn--primary"
                      onClick={submit}
                      disabled={submitting || !agreed}
                    >
                      {submitting ? "Signing…" : "Sign & Submit"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
