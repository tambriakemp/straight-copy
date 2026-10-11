// Uploading a proposal, laid out to the Admin Journeys canvas.
//
// It was a disclosure inside the project's Proposals panel: a file input,
// a title, a total and a repeating installment row, stacked in a column
// about 400px wide. This is the form where you set what a client is about
// to be asked to pay, and it deserves the page.
//
// Same three calls as the panel's version — upload-url, create, and
// supersede when this replaces a version — because they are the only way
// to reach the PDF bucket, and two implementations of "upload a proposal"
// would disagree about the payment terms within a week.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { FileUp, Plus, X } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { usd } from "@/lib/clientBalance";
import { termRows, termsCoverTotal } from "@/lib/proposalTerms";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const MAX_PDF_BYTES = 25 * 1024 * 1024;

type Trigger = "on_signature" | "on_completion" | "date";
interface Term { label: string; trigger: Trigger; amountType: "percent" | "fixed"; amountValue: number; dueDate?: string | null }

const DEFAULT_TERMS: Term[] = [
  { label: "Deposit", trigger: "on_signature", amountType: "percent", amountValue: 50 },
  { label: "Final", trigger: "on_completion", amountType: "percent", amountValue: 50 },
];

const TRIGGER_LABEL: Record<Trigger, string> = {
  on_signature: "When the client signs",
  on_completion: "When the work is complete",
  date: "On a date",
};

async function callFn(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/proposal-sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "Request failed");
  return data as Record<string, unknown>;
}

export default function ProposalUpload() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const clientId = params.get("client") ?? "";
  const projectId = params.get("project") ?? "";
  const supersedesId = params.get("supersedes") ?? "";

  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [projectName, setProjectName] = useState("");
  const [supersedes, setSupersedes] = useState<{ title: string; version: number } | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState("");
  const [isNewVersion, setIsNewVersion] = useState(!!supersedesId);
  const [totalDollars, setTotalDollars] = useState("");
  const [paymentDueDays, setPaymentDueDays] = useState("14");
  const [terms, setTerms] = useState<Term[]>(DEFAULT_TERMS);
  const [sendTo, setSendTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"send" | "save" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      if (clientId) {
        const { data } = await supabase.from("clients")
          .select("contact_name, business_name, contact_email").eq("id", clientId).maybeSingle();
        setClientName(data?.contact_name || data?.business_name || "");
        setSendTo((e) => e || data?.contact_email || "");
      }
      if (projectId) {
        const { data } = await supabase.from("client_projects").select("name").eq("id", projectId).maybeSingle();
        setProjectName(data?.name ?? "");
      }
      if (supersedesId) {
        const { data } = await supabase.from("client_proposals")
          .select("title, version").eq("id", supersedesId).maybeSingle();
        if (data) {
          setSupersedes({ title: data.title, version: data.version });
          // Prefilled: a new version of a proposal keeps its name, and
          // retyping it is how two versions end up with different titles.
          setTitle((t) => t || data.title);
        }
      }
    })();
  }, [clientId, projectId, supersedesId]);

  const totalCents = useMemo(() => {
    const n = parseFloat(totalDollars.replace(/[$,\s]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
  }, [totalDollars]);

  const rows = useMemo(() => termRows(terms, totalCents), [terms, totalCents]);
  const covers = useMemo(() => termsCoverTotal(rows, totalCents), [rows, totalCents]);

  const pickFile = (f: File | null) => {
    if (!f) return;
    if (f.type !== "application/pdf") { toast.error("Only PDF files are supported"); return; }
    if (f.size > MAX_PDF_BYTES) { toast.error("PDF must be under 25 MB"); return; }
    setFile(f);
    // The filename is usually the proposal's name already.
    setTitle((t) => t || f.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " "));
  };

  const submit = async (andSend: boolean) => {
    if (!clientId || !projectId) { toast.error("Open this from a project, so it knows who it is for"); return; }
    if (!file) { toast.error("Choose the proposal PDF"); return; }
    if (!title.trim()) { toast.error("Give the proposal a title"); return; }
    // Required since CRE-287: a proposal with no amount is how an upload
    // ended up signable with no deposit schedule behind it at all.
    if (!totalCents) { toast.error("Set the total — a proposal with no amount cannot bill"); return; }
    if (terms.some((t) => !t.label.trim() || !Number.isFinite(t.amountValue) || t.amountValue <= 0)) {
      toast.error("Finish each payment, or remove it");
      return;
    }
    if (andSend && !sendTo.trim()) { toast.error("Who should it go to?"); return; }

    setBusy(andSend ? "send" : "save");
    try {
      const up = await callFn({ action: "upload-url", clientId, clientProjectId: projectId, filename: file.name });
      const put = await fetch(up.signedUrl as string, {
        method: "PUT", headers: { "Content-Type": "application/pdf" }, body: file,
      });
      if (!put.ok) throw new Error("Upload failed");

      const created = await callFn({
        action: "create",
        clientId, clientProjectId: projectId,
        title: title.trim(),
        description: note.trim() || undefined,
        sourcePdfPath: up.path,
        totalCents,
        paymentDueDays: paymentDueDays.trim() ? parseInt(paymentDueDays, 10) : undefined,
        paymentTerms: terms.length ? terms : undefined,
      });
      const newId = (created.proposal as { id: string }).id;

      if (isNewVersion && supersedesId) {
        try {
          await callFn({ action: "supersede", clientId, proposalId: supersedesId, supersededByProposalId: newId });
        } catch (e) {
          // The new proposal is saved. A failed link means the old one is
          // still showing as current, not that anything was lost — so this
          // is a warning to go fix, not a failure of the upload.
          toast.error(`Uploaded, but the old version is still marked current: ${e instanceof Error ? e.message : "unknown error"}`);
        }
      }

      if (andSend) {
        await callFn({ action: "notify", clientId, proposalId: newId });
        toast.success(`Sent to ${sendTo.trim()}`);
      } else {
        toast.success("Saved. Nothing has been sent.");
      }
      navigate(`/admin/proposals/${newId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  const setTerm = (i: number, patch: Partial<Term>) =>
    setTerms((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  return (
    <AdminLayout topBar={false}>
      <div className="cv-admin cv-page" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <section className="cv-card cv-card-pad" style={{ maxWidth: 780, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <div style={{ fontSize: 14, color: "var(--cv-muted)" }}>
              {[clientName, projectName].filter(Boolean).join(" / ") || "No project selected"}
            </div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600 }}>Upload a proposal</h1>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0] ?? null); }}
            style={{
              display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16,
              border: `2px dashed ${dragging ? "var(--cv-accent)" : "#C9CFDB"}`,
              borderRadius: 18, padding: 22,
              background: dragging ? "var(--cv-accent-tint)" : undefined,
            }}
          >
            <span className="cv-ic" style={{ background: "#E7EEFF", color: "#2447C0" }}><FileUp size={22} /></span>
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              <div style={{ fontWeight: 500, overflowWrap: "anywhere" }}>
                {file ? file.name : "Drop the proposal PDF here"}
              </div>
              <div style={{ fontSize: 13, color: "var(--cv-muted)" }}>
                {file
                  ? `${(file.size / 1024 / 1024).toFixed(1)} MB · the client reads and signs this exact file`
                  : "PDF only. The client reads and signs this exact file."}
              </div>
            </div>
            {file
              ? <button type="button" className="cv-mini" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}>
                  <X size={14} style={{ marginRight: 6 }} /> Remove
                </button>
              : <button type="button" className="cv-open cv-open--dark" style={{ padding: "0 20px" }} onClick={() => fileRef.current?.click()}>
                  Choose file
                </button>}
            <input
              ref={fileRef} type="file" accept="application/pdf" hidden
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <label className="cv-field">
            Title
            <input className="cv-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Menovia Phase 2" />
          </label>

          {supersedes && (
            <label className="cv-field">
              This is
              <select
                className="cv-select"
                value={isNewVersion ? "version" : "new"}
                onChange={(e) => setIsNewVersion(e.target.value === "version")}
              >
                <option value="version">A new version of "{supersedes.title}" (replaces version {supersedes.version})</option>
                <option value="new">A brand new proposal</option>
              </select>
            </label>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Payment terms</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <label className="cv-field">
                Total
                <input className="cv-input" value={totalDollars} onChange={(e) => setTotalDollars(e.target.value)} placeholder="$5,000" />
              </label>
              <label className="cv-field">
                Invoices due after (days)
                <input className="cv-input" type="number" min={0} value={paymentDueDays} onChange={(e) => setPaymentDueDays(e.target.value)} />
              </label>
            </div>

            {terms.map((t, i) => (
              <div key={i} className="cv-term">
                <label className="cv-field">
                  Payment
                  <input className="cv-input" value={t.label} onChange={(e) => setTerm(i, { label: e.target.value })} />
                </label>
                <label className="cv-field">
                  Share
                  <input
                    className="cv-input"
                    value={t.amountType === "percent" ? `${t.amountValue}%` : String(t.amountValue)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const percent = !raw.includes("$");
                      const n = parseFloat(raw.replace(/[%$,\s]/g, ""));
                      setTerm(i, { amountType: percent ? "percent" : "fixed", amountValue: Number.isFinite(n) ? n : 0 });
                    }}
                  />
                </label>
                <label className="cv-field">
                  Bill it
                  <span style={{ display: "flex", gap: 8 }}>
                    <select
                      className="cv-select" value={t.trigger}
                      onChange={(e) => setTerm(i, { trigger: e.target.value as Trigger })}
                    >
                      {(Object.keys(TRIGGER_LABEL) as Trigger[]).map((k) => (
                        <option key={k} value={k}>{TRIGGER_LABEL[k]}</option>
                      ))}
                    </select>
                    {terms.length > 1 && (
                      <button
                        type="button" className="cv-mini" aria-label={`Remove ${t.label || "payment"}`}
                        onClick={() => setTerms((ts) => ts.filter((_, j) => j !== i))}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </span>
                </label>
                {t.trigger === "date" && (
                  <label className="cv-field" style={{ gridColumn: "1 / -1" }}>
                    Date
                    <input
                      className="cv-input" type="date" value={t.dueDate ?? ""}
                      onChange={(e) => setTerm(i, { dueDate: e.target.value || null })}
                    />
                  </label>
                )}
              </div>
            ))}

            <button
              type="button" className="cv-open" style={{ alignSelf: "flex-start", padding: "0 18px" }}
              onClick={() => setTerms((ts) => [...ts, { label: "", trigger: "on_completion", amountType: "percent", amountValue: 0 }])}
            >
              <Plus size={15} style={{ marginRight: 6 }} /> Add a payment
            </button>

            {covers === false && (
              <p style={{ margin: 0, fontSize: 13, color: "var(--cv-tone-red-fg)" }}>
                These payments come to {usd(rows.reduce((s, r) => s + (r.amountCents ?? 0), 0))}, not {usd(totalCents ?? 0)}.
              </p>
            )}
            <p style={{ margin: 0, fontSize: 13, color: "var(--cv-muted)" }}>
              When the client signs, these terms become the project's payment schedule.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Send to</h2>
            <label className="cv-field">
              Email
              <input className="cv-input" type="email" value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="client@example.com" />
            </label>
            <label className="cv-field">
              Note to the client (optional)
              <textarea
                className="cv-textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Add a short note that goes in the email..."
              />
            </label>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end" }}>
            <button
              type="button" className="cv-open" style={{ padding: "0 20px" }}
              onClick={() => navigate(projectId && clientId ? `/admin/clients/${clientId}/projects/${projectId}` : "/admin/proposals")}
            >
              Cancel
            </button>
            {/* Saving and sending are separate because uploading one does
                not send it: no email, no send date, and every follow-up
                threshold measures from that date. */}
            <button type="button" className="cv-open" style={{ padding: "0 20px" }} disabled={!!busy} onClick={() => submit(false)}>
              {busy === "save" ? "Saving…" : "Save without sending"}
            </button>
            <button type="button" className="cv-open cv-open--dark" style={{ padding: "0 20px" }} disabled={!!busy} onClick={() => submit(true)}>
              {busy === "send" ? "Sending…" : "Upload and send"}
            </button>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
