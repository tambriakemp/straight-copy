// One proposal, laid out to the Admin Journeys canvas: the document on
// the left, where it has got to and what it is worth on the right.
//
// There was no page for a single proposal before — you read one as a card
// inside the project's Proposals panel, which meant the signed PDF, the
// payment terms and the version history were three disclosures deep. A
// proposal is the document a client signs; it deserves an address.
//
// Everything here goes through the proposal-sign edge function, which is
// the only thing that can reach the PDF bucket and the signing audit.
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Download, ExternalLink } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import EmptyState from "@/components/admin/cv/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { usd } from "@/lib/clientBalance";
import { proposalGroup, clientStatusLabel, type ProposalLike } from "@/lib/proposalStatus";
import { describeTerm, termRows } from "@/lib/proposalTerms";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

interface ProposalRow extends ProposalLike {
  id: string;
  client_id: string;
  client_project_id: string;
  title: string;
  description: string | null;
  version: number;
  version_group_id: string | null;
  total_cents: number | null;
  payment_due_days: number | null;
  payment_terms: unknown;
  client_signature_name: string | null;
  client_signature_type: string | null;
  agency_signer_name: string;
  sent_to: string | null;
  source_pdf_path: string | null;
  signed_pdf_path: string | null;
  created_at: string;
}

// Built up rather than inlined, which costs the typed inference on
// `select` — hence the casts below. Worth it: the alternative is a
// 300-character line nobody can diff.
const SELECT =
  "id, client_id, client_project_id, title, description, status, version, version_group_id, " +
  "total_cents, payment_due_days, payment_terms, sent_at, first_viewed_at, client_signed_at, " +
  "agency_countersigned_at, declined_at, decline_reason, client_signature_name, " +
  "client_signature_type, agency_signer_name, sent_to, source_pdf_path, signed_pdf_path, created_at";

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

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function Step({ label, detail, done, bad }: { label: string; detail?: string; done: boolean; bad?: boolean }) {
  return (
    <div className={`cv-step ${done ? "" : "cv-step--todo"} ${bad ? "cv-step--bad" : ""}`}>
      <i>{bad ? "×" : done ? "✓" : ""}</i>
      <span>
        {label}
        {detail && <small>{detail}</small>}
      </span>
    </div>
  );
}

export default function ProposalDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [p, setP] = useState<ProposalRow | null>(null);
  const [clientName, setClientName] = useState<string>("");
  const [projectName, setProjectName] = useState<string>("");
  const [versions, setVersions] = useState<ProposalRow[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase.from("client_proposals").select(SELECT).eq("id", id).maybeSingle();
    if (error) toast.error(error.message);
    const row = (data ?? null) as unknown as ProposalRow | null;
    setP(row);
    setLoading(false);
    if (!row) return;

    const [c, pr, v] = await Promise.all([
      supabase.from("clients").select("contact_name, business_name").eq("id", row.client_id).maybeSingle(),
      supabase.from("client_projects").select("name").eq("id", row.client_project_id).maybeSingle(),
      supabase.from("client_proposals").select(SELECT)
        .eq("version_group_id", row.version_group_id ?? row.id)
        .order("version", { ascending: false }),
    ]);
    setClientName(c.data?.contact_name || c.data?.business_name || "Client");
    setProjectName(pr.data?.name ?? "Project");
    // A proposal with no version_group_id is its own only version.
    const vs = (v.data ?? []) as unknown as ProposalRow[];
    setVersions(vs.length ? vs : [row]);

    // The signed copy when there is one, otherwise what was sent. `get`
    // hands back both signed URLs with the row, so this is one call
    // rather than a second round trip to `download` — which is also
    // where the bug was: that action answers with `pdfUrl`, this page
    // was reading `url`, and every proposal said "No PDF yet" over a
    // file sitting in the bucket.
    try {
      const out = await callFn({ action: "get", clientId: row.client_id, proposalId: row.id });
      const full = (out.proposal ?? {}) as { source_url?: string | null; signed_pdf_url?: string | null };
      setPdfUrl(full.signed_pdf_url || full.source_url || null);
    } catch {
      // Not fatal — the page is still worth reading without the document.
      setPdfUrl(null);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, body: Record<string, unknown>, ok: string) => {
    setBusy(key);
    try {
      await callFn(body);
      toast.success(ok);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <AdminLayout topBar={false}><div className="cv-admin cv-page"><p className="cv-page-sub">Loading…</p></div></AdminLayout>;
  }
  if (!p) {
    return (
      <AdminLayout topBar={false}>
        <div className="cv-admin cv-page">
          <EmptyState title="Proposal not found" subtitle="It may have been deleted." />
        </div>
      </AdminLayout>
    );
  }

  const group = proposalGroup(p);
  const status = clientStatusLabel(p);
  const terms = termRows(p.payment_terms, p.total_cents);
  const portalUrl = `${window.location.origin}/portal/${p.client_id}/proposals/${p.id}`;
  const awaiting = group === "awaiting";

  return (
    <AdminLayout topBar={false}>
      <div className="cv-admin cv-page" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 14 }}>
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <div className="cv-crumbs">
              <a href={`/admin/clients/${p.client_id}`}>{clientName}</a>
              {" / "}
              <a href={`/admin/clients/${p.client_id}/projects/${p.client_project_id}`}>{projectName}</a>
              {" / Proposals"}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
              <h1 className="cv-page-title">{p.title}</h1>
              <span className="cv-chip cv-chip--gray">Version {p.version}</span>
              <span className={`cv-chip cv-chip--${status.tone}`}>{status.label}</span>
            </div>
          </div>
          <a className="cv-open" style={{ padding: "0 18px" }} href={portalUrl} target="_blank" rel="noreferrer">
            See client view <ExternalLink size={14} style={{ marginLeft: 6 }} />
          </a>
          <button
            type="button" className="cv-open cv-open--dark" style={{ padding: "0 18px" }}
            onClick={() => navigate(`/admin/proposals/new?project=${p.client_project_id}&client=${p.client_id}&supersedes=${p.id}`)}
          >
            Upload new version
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
          <section className="cv-card cv-card-pad" style={{ flex: "3 1 480px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1, fontWeight: 500 }}>
                {p.signed_pdf_path ? "Signed copy" : "Proposal"}
              </span>
              <a
                className="cv-open"
                href={pdfUrl ?? undefined}
                target="_blank" rel="noreferrer"
                aria-disabled={!pdfUrl}
                style={{
                  padding: "0 16px", minHeight: 44,
                  ...(pdfUrl ? {} : { opacity: 0.5, pointerEvents: "none" as const }),
                }}
              >
                <Download size={15} style={{ marginRight: 7 }} /> Download PDF
              </a>
            </div>
            <div className="cv-paper">
              <div className="cv-paper__sheet">
                {pdfUrl ? (
                  <iframe src={`${pdfUrl}#navpanes=0&toolbar=1&zoom=100`} title={p.title} />
                ) : (
                  <div className="cv-paper__none">
                    No PDF on this proposal yet. Upload one and it reads here.
                  </div>
                )}
              </div>
            </div>
          </section>

          <aside style={{ flex: "2 1 300px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
            {awaiting && (
              <section className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <h2 className="cv-card-title">Before it is signed</h2>
                <p style={{ margin: 0, fontSize: 13, color: "var(--cv-muted)" }}>
                  It has been sent and is waiting on {clientName}.
                </p>
                <button
                  type="button" className="cv-open" disabled={busy === "notify"}
                  onClick={() => run("notify", { action: "notify", clientId: p.client_id, proposalId: p.id }, "Reminder sent")}
                >
                  {busy === "notify" ? "Sending…" : "Resend email"}
                </button>
                <button
                  type="button" className="cv-open"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(portalUrl);
                      toast.success("Client link copied");
                    } catch { toast.error("Could not copy the link"); }
                  }}
                >
                  Copy client link
                </button>
              </section>
            )}

            <section className="cv-card cv-card-pad">
              <h2 className="cv-card-title" style={{ marginBottom: 14 }}>Status</h2>
              <Step label="Uploaded" detail={fmtWhen(p.created_at)} done />
              <Step
                label="Sent"
                detail={p.sent_at ? [fmtWhen(p.sent_at), p.sent_to].filter(Boolean).join(" · ") : "Not sent yet"}
                done={!!p.sent_at}
              />
              <Step
                label="Viewed in portal"
                detail={p.first_viewed_at ? fmtWhen(p.first_viewed_at) : "Not opened yet"}
                done={!!p.first_viewed_at}
              />
              {p.declined_at ? (
                <Step
                  label="Declined"
                  detail={[fmtWhen(p.declined_at), p.decline_reason ?? "no reason given"].join(" · ")}
                  done bad
                />
              ) : (
                <>
                  <Step
                    label="Signed by client"
                    detail={p.client_signed_at
                      ? [fmtWhen(p.client_signed_at), p.client_signature_name, p.client_signature_type && `${p.client_signature_type} signature`]
                          .filter(Boolean).join(" · ")
                      : "Not signed yet"}
                    done={!!p.client_signed_at}
                  />
                  <Step
                    label="Countersigned"
                    detail={p.agency_countersigned_at
                      ? [fmtWhen(p.agency_countersigned_at), p.agency_signer_name].filter(Boolean).join(" · ")
                      : "Happens automatically when the client signs"}
                    done={!!p.agency_countersigned_at}
                  />
                </>
              )}
            </section>

            <section className="cv-card cv-card-pad" style={{ background: "var(--cv-ink)", color: "#fff" }}>
              <div style={{ fontSize: 14, color: "#C9CFDB" }}>Total</div>
              <div style={{ fontSize: 32, fontWeight: 600, lineHeight: 1.2 }}>
                {p.total_cents ? usd(p.total_cents) : "No total set"}
              </div>
              <div style={{ fontSize: 13, color: "#C9CFDB", marginBottom: 8 }}>
                {p.payment_due_days
                  ? `Invoices due ${p.payment_due_days} days after they are sent`
                  : "No due window set"}
              </div>
              {!terms.length ? (
                <div style={{ fontSize: 13, color: "#C9CFDB" }}>
                  No payment schedule on this proposal — signing it will not create one.
                </div>
              ) : terms.map((t, i) => (
                <div key={i} className="cv-row cv-row--onink">
                  <span>
                    {t.label}
                    <small>{describeTerm(t)}</small>
                  </span>
                  <b style={{ fontWeight: 500 }}>{t.amountCents != null ? usd(t.amountCents) : t.share}</b>
                </div>
              ))}
              <a
                href={`/admin/clients/${p.client_id}/projects/${p.client_project_id}`}
                style={{ display: "inline-block", color: "#fff", fontSize: 14, padding: "12px 0 0" }}
              >
                Open payment schedule →
              </a>
            </section>

            {versions.length > 1 && (
              <section className="cv-card cv-card-pad">
                <h2 className="cv-card-title" style={{ marginBottom: 6 }}>Versions</h2>
                {versions.map((v, i) => (
                  <div key={v.id} className={`cv-row ${i === 0 ? "cv-row--first" : ""}`}>
                    <span>
                      Version {v.version}
                      <small>
                        {v.sent_at ? `Sent ${fmtWhen(v.sent_at)}` : "Not sent"}
                        {v.client_signed_at ? " · Signed" : v.first_viewed_at ? " · Viewed" : " · Not viewed"}
                      </small>
                    </span>
                    {v.id === p.id
                      ? <span className="cv-chip cv-chip--green">Current</span>
                      : (
                        <button
                          type="button" className="cv-mini"
                          onClick={() => navigate(`/admin/proposals/${v.id}`)}
                        >
                          Open
                        </button>
                      )}
                  </div>
                ))}
              </section>
            )}
          </aside>
        </div>
      </div>
    </AdminLayout>
  );
}
