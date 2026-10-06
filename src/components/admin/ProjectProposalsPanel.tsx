import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import Panel, { PanelButton } from "@/components/admin/project/PanelChrome";
import { T } from "@/lib/cre8Design";
import { Upload, Download, Trash2, FileSignature, ExternalLink, Activity, Send, Eye } from "lucide-react";
import ProposalActivityLog from "@/components/admin/ProposalActivityLog";
import SidePanel from "@/components/admin/SidePanel";
import PdfFrame from "@/components/PdfFrame";
import {
  renderProposalHtml, writtenSections,
  type ProposalContent,
} from "../../../supabase/functions/_shared/agents/proposal-spine";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

type PaymentTerm = {
  label: string;
  trigger: "on_signature" | "on_completion" | "date";
  amountType: "percent" | "fixed";
  amountValue: number;
  dueDate?: string | null;
};

type Proposal = {
  id: string;
  client_id: string;
  client_project_id: string;
  title: string;
  description: string | null;
  status: "draft" | "ready" | "sent" | "signed" | "voided" | "declined" | "superseded";
  sent_at?: string | null;
  sent_to?: string | null;
  source_pdf_path: string | null;
  /** Agent-written proposals live here and have no PDF until they are sent. */
  content: unknown;
  total_cents: number | null;
  payment_due_days: number | null;
  payment_terms: PaymentTerm[] | null;
  client_signature_name: string | null;
  client_signed_at: string | null;
  declined_at?: string | null;
  decline_reason?: string | null;
  signed_pdf_path: string | null;
  created_at: string;
  version: number;
  version_group_id: string;
  supersedes_id: string | null;
};

const fmtUSD = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

/** "$5,000 — $2,500 deposit on signature + $2,500 final on completion." Same
 *  math the deposit automation runs at signature time, shown up front so
 *  nobody has to open the PDF to know what they're agreeing to. */
function depositSplitLine(p: Proposal): string | null {
  if (p.total_cents == null) return null;
  if (!p.payment_terms?.length) return fmtUSD(p.total_cents);
  const parts = p.payment_terms.map((t) => {
    const cents = t.amountType === "percent"
      ? Math.round(p.total_cents! * (t.amountValue / 100))
      : Math.round(t.amountValue);
    const when = t.trigger === "on_signature" ? "on signature" : t.trigger === "on_completion" ? "on completion" : t.dueDate ? `by ${t.dueDate}` : "on a set date";
    return `${fmtUSD(cents)} ${t.label.toLowerCase()} ${when}`;
  });
  return `${fmtUSD(p.total_cents)} — ${parts.join(" + ")}`;
}

/** Groups proposals by version_group_id, newest version first within each
 *  group, groups ordered by their current (highest-version) row's created_at
 *  descending — so the most recently active proposal thread sorts to the top
 *  the same way the flat list used to. */
function groupVersions(proposals: Proposal[]): Proposal[][] {
  const byGroup = new Map<string, Proposal[]>();
  for (const p of proposals) {
    const key = p.version_group_id || p.id;
    const arr = byGroup.get(key) ?? [];
    arr.push(p);
    byGroup.set(key, arr);
  }
  const groups = Array.from(byGroup.values()).map((g) =>
    [...g].sort((a, b) => b.version - a.version));
  groups.sort((a, b) => new Date(b[0].created_at).getTime() - new Date(a[0].created_at).getTime());
  return groups;
}

type Props = {
  clientId: string;
  clientProjectId: string;
  portalUrl?: string;
};

/**
 * Standalone Proposals panel for admin project tabs. Renders the toolbar
 * (upload + copy portal link) plus the proposal list and upload dialog.
 */
export default function ProjectProposalsPanel({ clientId, clientProjectId, portalUrl }: Props) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [openUpload, setOpenUpload] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  // Total price is required (CRE-287). The installment breakdown underneath
  // stays optional — left empty, the proposal still has an amount but no
  // schedule gets created at signature, and the admin email on signing says
  // so, so nobody assumes a deposit went out that never did.
  const [totalDollars, setTotalDollars] = useState("");
  const [paymentDueDays, setPaymentDueDays] = useState("14");
  const [terms, setTerms] = useState<PaymentTerm[]>([
    { label: "Deposit", trigger: "on_signature", amountType: "percent", amountValue: 50 },
    { label: "Final", trigger: "on_completion", amountType: "percent", amountValue: 50 },
  ]);
  // "New version of…" — picking one marks it superseded the moment this
  // upload lands, so there is never a window where both read as current.
  const [supersedesId, setSupersedesId] = useState<string>("");
  // Timelines are collapsed by default — on a project with several proposals,
  // every log expanded at once buries the proposals themselves.
  const [openLog, setOpenLog] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [notifying, setNotifying] = useState<string | null>(null);
  const [markingReady, setMarkingReady] = useState<string | null>(null);
  // Pairing two already-existing proposals (the backfill case, and the
  // standalone "Archive / mark superseded" action CRE-287 asked for): which
  // card has its picker open, and which replacement is selected in it.
  const [supersedePickerFor, setSupersedePickerFor] = useState<string | null>(null);
  const [supersedeTarget, setSupersedeTarget] = useState<string>("");
  const [superseding, setSuperseding] = useState<string | null>(null);

  const callFn = async (body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/proposal-sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Request failed");
    return data;
  };

  /**
   * Tell the client the proposal is waiting.
   *
   * Uploading one saves it as 'draft' or 'ready' — nothing is sent yet. No
   * email, no SureContact activity, and no send date, which is what every
   * follow-up threshold measures from. So this is a separate, deliberate
   * step, and it is the one that makes the 'sent' status true.
   */
  const notifyClient = async (p: Proposal) => {
    if (notifying) return;
    setNotifying(p.id);
    try {
      const data = await callFn({ action: "notify", clientId, proposalId: p.id });
      toast.success(
        data.renotified
          ? `Reminder sent to ${data.to}`
          : `Sent to ${data.to} — follow-up clock started`,
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send");
    } finally {
      setNotifying(null);
    }
  };

  const markReady = async (p: Proposal) => {
    setMarkingReady(p.id);
    try {
      await callFn({ action: "mark-ready", clientId, proposalId: p.id });
      toast.success("Marked ready to send");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not mark ready");
    } finally {
      setMarkingReady(null);
    }
  };

  const supersedeProposal = async (oldId: string, newId: string) => {
    setSuperseding(oldId);
    try {
      await callFn({ action: "supersede", clientId, proposalId: oldId, supersededByProposalId: newId });
      toast.success("Marked superseded");
      setSupersedePickerFor(null);
      setSupersedeTarget("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not mark superseded");
    } finally {
      setSuperseding(null);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await callFn({ action: "list", clientId, clientProjectId });
      setProposals((data.proposals ?? []) as Proposal[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [clientId, clientProjectId]);

  // Blank terms are valid (plain PDF, no schedule) — but a started row has to
  // be finished, so a half-filled installment doesn't silently vanish into
  // "no terms" at signature time.
  const termsAreValid = () => {
    if (terms.length === 0) return true;
    for (const t of terms) {
      if (!t.label.trim()) return false;
      if (!(t.amountValue > 0)) return false;
      if (t.trigger === "date" && !t.dueDate) return false;
    }
    return true;
  };

  const upload = async () => {
    if (!title.trim()) return toast.error("Title required");
    if (!file) return toast.error("Select a PDF");
    if (file.type !== "application/pdf") return toast.error("Only PDF files are supported");
    if (file.size > 25 * 1024 * 1024) return toast.error("PDF must be under 25MB");
    if (!termsAreValid()) return toast.error("Finish each installment, or remove it");
    // Required since CRE-287 — a proposal with no amount on it is how the
    // 9/23 Menovia upload ended up signable with no deposit schedule behind
    // it at all.
    if (!totalDollars.trim()) return toast.error("Proposal amount is required");
    const totalCents = Math.round(parseFloat(totalDollars) * 100);
    if (!totalCents || totalCents <= 0) return toast.error("Total price must be a positive amount");
    setUploading(true);
    try {
      const up = await callFn({
        action: "upload-url",
        clientId,
        clientProjectId,
        filename: file.name,
      });
      const putResp = await fetch(up.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });
      if (!putResp.ok) throw new Error("Upload failed");
      const created = await callFn({
        action: "create",
        clientId,
        clientProjectId,
        title: title.trim(),
        description: description.trim() || undefined,
        sourcePdfPath: up.path,
        totalCents,
        paymentDueDays: paymentDueDays.trim() ? parseInt(paymentDueDays, 10) : undefined,
        paymentTerms: terms.length ? terms : undefined,
      });
      if (supersedesId) {
        try {
          await callFn({ action: "supersede", clientId, proposalId: supersedesId, supersededByProposalId: created.proposal.id });
        } catch (e) {
          // The new proposal is already saved — a failed link here means the
          // old one is still visible rather than something was lost, so this
          // is a warning to go fix with "Mark superseded by…", not an error
          // that should look like the upload itself failed.
          toast.error(`Uploaded, but could not mark the old version superseded: ${e instanceof Error ? e.message : "unknown error"}`);
        }
      }
      toast.success("Proposal uploaded");
      setOpenUpload(false);
      setTitle(""); setDescription(""); setFile(null);
      setTotalDollars(""); setPaymentDueDays("14"); setSupersedesId("");
      setTerms([
        { label: "Deposit", trigger: "on_signature", amountType: "percent", amountValue: 50 },
        { label: "Final", trigger: "on_completion", amountType: "percent", amountValue: 50 },
      ]);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const downloadPdf = async (p: Proposal, variant: "source" | "signed") => {
    try {
      const data = await callFn({ action: "download", clientId, proposalId: p.id, variant });
      if (!data.pdfUrl) throw new Error("No PDF available");
      window.open(data.pdfUrl, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  };

  /**
   * Read a proposal before sending it.
   *
   * Bree had two proposals on one project and no way to tell them apart —
   * "Source" downloads a PDF, and an agent-written proposal has no PDF until
   * it is sent, so for that one there was nothing to click at all. This shows
   * whichever the proposal actually has: the stored PDF, or the content
   * rendered through the same renderer the PDF and the client portal use, so
   * what you read here is what the client will read.
   */
  const [preview, setPreview] = useState<{ p: Proposal; pdfUrl: string | null } | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);

  const openPreview = async (p: Proposal) => {
    setPreviewing(p.id);
    let pdfUrl: string | null = null;
    if (p.source_pdf_path) {
      try {
        const data = await callFn({ action: "download", clientId, proposalId: p.id, variant: "source" });
        pdfUrl = data.pdfUrl ?? null;
      } catch {
        // Fall through to the rendered content — a missing file should not
        // stop you reading a proposal that has words in it.
        pdfUrl = null;
      }
    }
    setPreviewing(null);
    setPreview({ p, pdfUrl });
  };

  const removeProposal = async (p: Proposal) => {
    if (!confirm(`Delete proposal "${p.title}"? This cannot be undone.`)) return;
    try {
      await callFn({ action: "delete", clientId, proposalId: p.id });
      toast.success("Proposal deleted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const copyPortalLink = async () => {
    if (!portalUrl) return;
    await navigator.clipboard.writeText(portalUrl);
    toast.success("Portal link copied");
  };

  const groupedList = useMemo(() => groupVersions(proposals), [proposals]);

  // A proposal that can still receive the next version of itself: anything
  // not already a done deal and not already retired. Scoped to the whole
  // project, not just one version thread — pairing two rows that were
  // uploaded independently (the 9/23 + 10/6 Menovia case) is exactly what
  // "Mark superseded by…" exists for.
  const eligibleReplacements = (p: Proposal) =>
    proposals.filter((x) => x.id !== p.id && x.status !== "signed" && x.status !== "superseded");

  /** One proposal card. `collapsed` renders the condensed row a superseded
   *  version gets — version label, status, Preview and Source only, per
   *  CRE-287: old versions stay visible for the record, not actionable. */
  const renderCard = (p: Proposal, opts: { isFirst: boolean; collapsed?: boolean; versionLabel?: string | null }) => {
    const { isFirst, collapsed = false, versionLabel = null } = opts;
    const isSigned = p.status === "signed";
    const isVoided = p.status === "voided";
    const isSuperseded = p.status === "superseded";
    // Declined is not voided. Voided is us withdrawing the document;
    // declined is the client turning it down, and it is the only
    // number that says how often we lose work — so it gets its own
    // colour rather than being folded in with the ones we pulled.
    const isDeclined = p.status === "declined";
    const isDraft = p.status === "draft";

    const statusChip = (
      <span style={{
        fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase",
        padding: "3px 9px", borderRadius: 999,
        background: isSigned
          ? "hsl(120 30% 50% / 0.15)"
          : isVoided
            ? "hsl(0 30% 50% / 0.15)"
            : isSuperseded
              ? "hsl(220 15% 55% / 0.15)"
              : isDeclined
                ? "hsl(28 45% 50% / 0.15)"
                : "hsl(40 20% 97% / 0.06)",
        color: isSigned
          ? "hsl(120 60% 70%)"
          : isVoided
            ? "hsl(0 60% 70%)"
            : isSuperseded
              ? "hsl(220 25% 70%)"
              : isDeclined
                ? "hsl(28 70% 70%)"
                : "var(--crm-taupe)",
        whiteSpace: "nowrap",
      }}>{p.status}</span>
    );

    if (collapsed) {
      return (
        <div key={p.id} style={{
          padding: "10px 18px 10px 30px", display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.muted, letterSpacing: "0.06em" }}>
              {versionLabel}
            </span>
            <span style={{ fontSize: 14, color: "var(--crm-stone)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.title}
            </span>
            {p.total_cents != null && (
              <span style={{ fontSize: 13, color: T.muted }}>{fmtUSD(p.total_cents)}</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {statusChip}
            <PanelButton onClick={() => void openPreview(p)} disabled={previewing === p.id} title="Read this version">
              <Eye size={12} /> {previewing === p.id ? "Opening…" : "Preview"}
            </PanelButton>
            {p.source_pdf_path && (
              <PanelButton onClick={() => downloadPdf(p, "source")} title="Download this version's PDF">
                <Download size={12} /> Source
              </PanelButton>
            )}
          </div>
        </div>
      );
    }

    const replacements = eligibleReplacements(p);

    return (
      <div key={p.id} style={{
        borderTop: isFirst ? "none" : T.hairline, padding: "12px 18px",
        display: "flex", flexDirection: "column", gap: 7,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--crm-accent)", marginBottom: 4 }}>
              <FileSignature size={12} /> Proposal{versionLabel ? ` · ${versionLabel}` : ""}
            </div>
            <h3 style={{ fontFamily: "var(--crm-font-serif)", fontWeight: 300, fontSize: 19, color: "var(--crm-warm-white)", margin: 0, lineHeight: 1.25 }}>
              {p.title}
            </h3>
            {p.description && (
              <p style={{ marginTop: 4, color: "var(--crm-stone)", fontSize: 14 }}>{p.description}</p>
            )}
          </div>
          {statusChip}
        </div>

        <div style={{ fontSize: 13, color: "var(--crm-taupe)" }}>
          {/* What this proposal actually is, without opening it. Two
              proposals on one project looked identical here — same
              date line, same buttons — which is how you end up unsure
              which one is the real one. */}
          {(() => {
            const secs = p.content
              ? writtenSections(p.content as ProposalContent).length
              : 0;
            if (secs) return `Written · ${secs} section${secs === 1 ? "" : "s"}`;
            if (p.source_pdf_path) return "Uploaded PDF";
            return "Empty — nothing written yet";
          })()}
          {" · "}
          {new Date(p.created_at).toLocaleDateString()}
          {p.client_signed_at && (
            <> · Signed {new Date(p.client_signed_at).toLocaleDateString()} by {p.client_signature_name}</>
          )}
          {p.declined_at && !p.client_signed_at && (
            <> · Declined {new Date(p.declined_at).toLocaleDateString()}
              {p.decline_reason ? ` — "${p.decline_reason}"` : ""}</>
          )}
          {/* The distinction that was invisible: a proposal can read
              'sent' and have gone to nobody, because uploading one sets
              that status without emailing anything. */}
          {p.sent_at
            ? <> · Sent to {p.sent_to ?? "the client"} on {new Date(p.sent_at).toLocaleDateString()}</>
            : !isSigned && !isVoided && !isSuperseded && (
              <> · <strong style={{ color: "hsl(28 70% 70%)" }}>Not sent to the client yet</strong></>
            )}
        </div>

        {/* The amount, and the deposit split if there is one — the thing
            CRE-287 put on this card because it used to take opening the PDF
            to find out, and two cards with no amount on either read as
            identical. */}
        {depositSplitLine(p) && (
          <div style={{ fontSize: 14, color: "var(--crm-warm-white)", fontWeight: 500 }}>
            {depositSplitLine(p)}
          </div>
        )}

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          <PanelButton
            onClick={() => void openPreview(p)}
            disabled={previewing === p.id}
            title="Read this proposal"
          >
            <Eye size={13} /> {previewing === p.id ? "Opening…" : "Preview"}
          </PanelButton>
          {p.source_pdf_path && (
            <PanelButton onClick={() => downloadPdf(p, "source")} title="Download the PDF as uploaded">
              <Download size={13} /> Source
            </PanelButton>
          )}
          {isSigned && (
            <PanelButton onClick={() => downloadPdf(p, "signed")} title="Download the signed PDF">
              <Download size={13} /> Signed
            </PanelButton>
          )}
          {!isSigned && (
            <PanelButton onClick={() => removeProposal(p)} title="Delete this proposal">
              <Trash2 size={13} />
            </PanelButton>
          )}
          {isDraft && (
            <PanelButton
              onClick={() => void markReady(p)}
              disabled={markingReady === p.id}
              title="Mark this proposal ready to send"
            >
              {markingReady === p.id ? "Marking…" : "Mark ready"}
            </PanelButton>
          )}
          {!isSigned && !isVoided && !isDeclined && !isSuperseded && (
            <PanelButton
              primary={!p.sent_at}
              onClick={() => void notifyClient(p)}
              disabled={notifying === p.id}
              title={p.sent_at
                ? "Send the client another link to this proposal"
                : "Email the client a link to review and sign it, and start the follow-up clock"}
            >
              <Send size={13} />{" "}
              {notifying === p.id ? "Sending…" : p.sent_at ? "Resend" : "Send"}
            </PanelButton>
          )}
          {!isSigned && !isSuperseded && replacements.length > 0 && (
            <PanelButton
              onClick={() => {
                setSupersedePickerFor(supersedePickerFor === p.id ? null : p.id);
                setSupersedeTarget("");
              }}
              title="Retire this proposal in place of a newer one, without deleting it"
            >
              Mark superseded…
            </PanelButton>
          )}
          <PanelButton
            onClick={() => setOpenLog(openLog === p.id ? null : p.id)}
            title="What has happened to this proposal"
          >
            <Activity size={13} />
          </PanelButton>
        </div>

        {supersedePickerFor === p.id && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 2, padding: "8px 10px", border: T.hairline, borderRadius: 8 }}>
            <span style={{ fontSize: 13, color: T.muted }}>Superseded by:</span>
            <select
              className="crm-input" style={{ flex: 1, minWidth: 180 }}
              value={supersedeTarget}
              onChange={(e) => setSupersedeTarget(e.target.value)}
            >
              <option value="">Select the replacement proposal…</option>
              {replacements.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}{r.total_cents != null ? ` — ${fmtUSD(r.total_cents)}` : ""} ({new Date(r.created_at).toLocaleDateString()})
                </option>
              ))}
            </select>
            <PanelButton
              primary
              disabled={!supersedeTarget || superseding === p.id}
              onClick={() => void supersedeProposal(p.id, supersedeTarget)}
            >
              {superseding === p.id ? "Linking…" : "Confirm"}
            </PanelButton>
            <PanelButton onClick={() => setSupersedePickerFor(null)}>Cancel</PanelButton>
          </div>
        )}

        {openLog === p.id && <ProposalActivityLog proposalId={p.id} />}
      </div>
    );
  };

  return (
    <>
      <Panel
        title="Proposal"
        meta={proposals.length > 1
          ? <span style={{ fontSize: 14, color: T.text2 }}>{proposals.length}</span>
          : undefined}
        actions={
          <PanelButton onClick={() => setOpenUpload(true)}>
            <Upload size={14} /> Upload
          </PanelButton>
        }
      >
      {loading ? (
        <div style={{ padding: 18, color: T.muted, fontSize: 15 }}>Loading…</div>
      ) : proposals.length === 0 ? (
        <div style={{ padding: 18, color: T.muted, fontSize: 15 }}>
          No proposal yet. Upload one to send for signature.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {groupedList.map((group, gi) => {
            const [head, ...older] = group;
            const versionLabel = group.length > 1 ? `v${head.version}` : null;
            return (
              <div key={head.id}>
                {renderCard(head, { isFirst: gi === 0, versionLabel })}
                {older.length > 0 && (
                  <div style={{ borderTop: T.hairline, background: "hsl(40 20% 97% / 0.02)" }}>
                    {older.map((o) => renderCard(o, { isFirst: false, collapsed: true, versionLabel: `v${o.version}` }))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </Panel>

      {/* Wide on purpose: a proposal read in a narrow column is a proposal you
          skim instead of check, and checking is the whole point of opening it
          before it goes to a client. */}
      <SidePanel
        open={!!preview}
        title={preview?.p.title ?? "Proposal"}
        subtitle={preview
          ? `${preview.p.status}${preview.p.sent_at ? " · sent" : " · not sent yet"}`
          : undefined}
        width={860}
        onClose={() => setPreview(null)}
        footer={
          preview ? (
            <>
              {!preview.p.client_signed_at && (
                <button
                  className="crm-btn crm-btn--ghost crm-btn--sm"
                  onClick={() => { const p2 = preview.p; setPreview(null); void removeProposal(p2); }}
                >
                  <Trash2 size={12} /> Delete
                </button>
              )}
              {preview.pdfUrl && (
                <a className="crm-btn crm-btn--ghost crm-btn--sm"
                  href={preview.pdfUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={12} /> Open PDF
                </a>
              )}
              <button className="crm-btn crm-btn--ghost" onClick={() => setPreview(null)}>Close</button>
            </>
          ) : undefined
        }
      >
        {preview && <ProposalPreviewBody p={preview.p} pdfUrl={preview.pdfUrl} />}
      </SidePanel>

      {/* A panel, like every other "edit one thing" flow here. The centred
          dialog covered the proposal list it was adding to. */}
      <SidePanel
        open={openUpload}
        onClose={() => { if (!uploading) setOpenUpload(false); }}
        title="Upload proposal"
        subtitle="A PDF the client can read and sign in their portal."
        width={460}
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <PanelButton onClick={() => setOpenUpload(false)} disabled={uploading}>Cancel</PanelButton>
            <PanelButton primary onClick={upload} disabled={uploading}>
              {uploading ? "Uploading…" : "Upload"}
            </PanelButton>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label className="crm-label" htmlFor="pp-title">Title *</label>
            <input id="pp-title" className="crm-input" value={title}
              onChange={(e) => setTitle(e.target.value)} placeholder="Proposal v1" />
          </div>
          <div>
            <label className="crm-label" htmlFor="pp-desc">Description</label>
            <textarea id="pp-desc" className="crm-input" value={description}
              onChange={(e) => setDescription(e.target.value)} rows={3}
              placeholder="Optional internal note for the client" />
          </div>
          <div>
            <label className="crm-label" htmlFor="pp-file">PDF file *</label>
            <input id="pp-file" ref={fileRef} type="file" accept="application/pdf"
              className="crm-input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {file && (
              <div style={{ marginTop: 6, fontSize: 14, color: T.muted }}>
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </div>
            )}
          </div>

          {proposals.filter((x) => x.status !== "signed" && x.status !== "superseded").length > 0 && (
            <div>
              <label className="crm-label" htmlFor="pp-supersedes">New version of…</label>
              <select id="pp-supersedes" className="crm-input" value={supersedesId}
                onChange={(e) => setSupersedesId(e.target.value)}>
                <option value="">Not a new version — a separate proposal</option>
                {proposals.filter((x) => x.status !== "signed" && x.status !== "superseded").map((x) => (
                  <option key={x.id} value={x.id}>{x.title} ({x.status})</option>
                ))}
              </select>
              {supersedesId && (
                <div style={{ marginTop: 6, fontSize: 13, color: T.muted }}>
                  That proposal will be marked superseded the moment this one is uploaded — it stays in the
                  list, collapsed, and can no longer be sent or signed.
                </div>
              )}
            </div>
          )}

          <div style={{ borderTop: T.hairline, paddingTop: 14 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: T.muted, marginBottom: 10 }}>
              Commercial terms
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label className="crm-label" htmlFor="pp-total">Total price ($) *</label>
                <input id="pp-total" className="crm-input" type="number" min={0.01} step="0.01" value={totalDollars}
                  onChange={(e) => setTotalDollars(e.target.value)} placeholder="e.g. 4000" />
              </div>
              <div style={{ width: 110 }}>
                <label className="crm-label" htmlFor="pp-due-days">Due (days)</label>
                <input id="pp-due-days" className="crm-input" type="number" min={0} value={paymentDueDays}
                  onChange={(e) => setPaymentDueDays(e.target.value)} />
              </div>
            </div>

            {totalDollars.trim() && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {terms.map((t, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input className="crm-input" style={{ flex: 1 }} placeholder="Label" value={t.label}
                      onChange={(e) => setTerms((s) => s.map((x, ix) => ix === i ? { ...x, label: e.target.value } : x))} />
                    <select className="crm-input" style={{ width: 130 }} value={t.trigger}
                      onChange={(e) => setTerms((s) => s.map((x, ix) => ix === i ? { ...x, trigger: e.target.value as PaymentTerm["trigger"] } : x))}>
                      <option value="on_signature">On signature</option>
                      <option value="on_completion">On completion</option>
                      <option value="date">On date</option>
                    </select>
                    {t.trigger === "date" && (
                      <input className="crm-input" style={{ width: 130 }} type="date" value={t.dueDate ?? ""}
                        onChange={(e) => setTerms((s) => s.map((x, ix) => ix === i ? { ...x, dueDate: e.target.value } : x))} />
                    )}
                    <select className="crm-input" style={{ width: 70 }} value={t.amountType}
                      onChange={(e) => setTerms((s) => s.map((x, ix) => ix === i ? { ...x, amountType: e.target.value as PaymentTerm["amountType"] } : x))}>
                      <option value="percent">%</option>
                      <option value="fixed">$</option>
                    </select>
                    <input className="crm-input" style={{ width: 80 }} type="number" min={0} step="0.01" value={t.amountValue}
                      onChange={(e) => setTerms((s) => s.map((x, ix) => ix === i ? { ...x, amountValue: parseFloat(e.target.value) || 0 } : x))} />
                    <button className="crm-btn crm-btn--ghost crm-btn--sm"
                      onClick={() => setTerms((s) => s.filter((_, ix) => ix !== i))}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                <button className="crm-btn crm-btn--ghost crm-btn--sm"
                  onClick={() => setTerms((s) => [...s, { label: "", trigger: "on_completion", amountType: "percent", amountValue: 0 }])}>
                  + Installment
                </button>
                <div style={{ fontSize: 13, color: T.muted }}>
                  The on-signature installment sends automatically through SureCart the moment this is signed.
                </div>
              </div>
            )}
          </div>
        </div>
      </SidePanel>
    </>
  );
}

/**
 * What a proposal actually looks like.
 *
 * A PDF is shown as a PDF. Written content goes through renderProposalHtml —
 * the same renderer the PDF path and the client portal use — so this is not a
 * separate idea of what the document says. When there is neither, the panel
 * says so plainly rather than showing an empty frame that reads as broken.
 */
function ProposalPreviewBody({ p, pdfUrl }: { p: Proposal; pdfUrl: string | null }) {
  const content = (p.content ?? null) as ProposalContent | null;
  const sections = content ? writtenSections(content).length : 0;

  const html = useMemo(
    () => (sections ? renderProposalHtml(p.title, content as ProposalContent) : ""),
    [content, p.title, sections],
  );

  if (pdfUrl) return <PdfFrame url={pdfUrl} title={p.title} />;

  if (sections) {
    return (
      <div
        className="ws__doc-body"
        // Same renderer as the PDF path. Content is escaped at the source (see
        // `esc` in proposal-spine) rather than trusted here.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <p style={{ color: "var(--crm-taupe)", fontSize: 16, fontStyle: "italic" }}>
      Nothing written yet — this proposal has no PDF and no sections. It was
      started but never filled in.
    </p>
  );
}
