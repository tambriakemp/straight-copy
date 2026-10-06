import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import SidePanel from "@/components/admin/SidePanel";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, loadAdminOperations, projectMap, type AdminOperations } from "@/lib/adminOperations";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const PROJECT_TYPES = ["automation_build", "site_preview", "app_development", "web_development", "marketing"] as const;

type NewScheduleItem = { label: string; amount_dollars: string; due_date: string };

export default function Payments() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminOperations | null>(null);
  const [status, setStatus] = useState("outstanding");
  const reload = () => loadAdminOperations().then(setData).catch((error) => toast.error(error.message || "Failed to load payments"));
  useEffect(() => { reload(); }, []);
  const projects = useMemo(() => projectMap(data?.projects ?? []), [data]);
  const rows = (data?.invoices ?? []).filter((invoice) => status === "all"
    || (status === "outstanding" ? invoice.status === "sent" : invoice.status === status));
  const outstanding = (data?.invoices ?? []).filter((invoice) => invoice.status === "sent")
    .reduce((sum, invoice) => sum + invoice.amount_cents, 0);

  // --- New payment schedule -------------------------------------------------
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectType, setNewProjectType] = useState<string>("web_development");
  const [proposalId, setProposalId] = useState("");
  const [proposalOptions, setProposalOptions] = useState<{ id: string; title: string }[]>([]);
  const [title, setTitle] = useState("Payment schedule");
  const [items, setItems] = useState<NewScheduleItem[]>([{ label: "Deposit", amount_dollars: "", due_date: "" }]);

  const clientOptions = useMemo(
    () => Object.entries(data?.clientNames ?? {}).sort((a, b) => a[1].localeCompare(b[1])),
    [data],
  );
  const projectsForClient = useMemo(
    () => (data?.projects ?? []).filter((p) => p.client_id === clientId),
    [data, clientId],
  );
  const creatingNewProject = projectId === "__new__";

  useEffect(() => {
    if (!open) return;
    setProjectId(""); setNewProjectName(""); setProposalId(""); setProposalOptions([]);
    setTitle("Payment schedule");
    setItems([{ label: "Deposit", amount_dollars: "", due_date: "" }]);
  }, [open]);

  useEffect(() => {
    setProjectId(""); setProposalId(""); setProposalOptions([]);
  }, [clientId]);

  useEffect(() => {
    if (!clientId || !projectId || creatingNewProject) { setProposalOptions([]); return; }
    let cancelled = false;
    (async () => {
      const { data: rows2 } = await supabase
        .from("client_proposals")
        .select("id, title, status")
        .eq("client_id", clientId).eq("client_project_id", projectId)
        .in("status", ["signed", "sent", "ready", "draft"]);
      if (!cancelled) setProposalOptions((rows2 ?? []).map((r) => ({ id: r.id, title: r.title })));
    })();
    return () => { cancelled = true; };
  }, [clientId, projectId, creatingNewProject]);

  const createSchedule = async () => {
    if (!clientId) return toast.error("Pick a client");
    if (!projectId) return toast.error("Pick or create a project");
    if (creatingNewProject && !newProjectName.trim()) return toast.error("Name the new project");
    const cleanItems = items
      .map((it) => ({
        label: it.label.trim(),
        amount_cents: Math.round(parseFloat(it.amount_dollars || "0") * 100),
        due_date: it.due_date || null,
      }))
      .filter((it) => it.label);
    for (const it of cleanItems) {
      if (!it.amount_cents || it.amount_cents < 100) return toast.error(`${it.label}: amount must be at least $1`);
    }
    setSaving(true);
    try {
      let effectiveProjectId = projectId;
      if (creatingNewProject) {
        const { data: proj, error } = await supabase.from("client_projects").insert({
          client_id: clientId, name: newProjectName.trim(), type: newProjectType,
        }).select("id").single();
        if (error) throw error;
        effectiveProjectId = proj.id;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const r = await fetch(`${SUPABASE_URL}/functions/v1/project-invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: "create-schedule",
          clientId, clientProjectId: effectiveProjectId,
          title: title.trim() || "Payment schedule",
          proposalId: proposalId || undefined,
          items: cleanItems.map((it, i) => ({ sequence: i + 1, ...it })),
        }),
      });
      const resBody = await r.json();
      if (!r.ok) throw new Error(resBody.error || "Could not create schedule");

      toast.success("Payment schedule created");
      setOpen(false);
      reload();
      navigate(`/admin/clients/${clientId}/projects/${effectiveProjectId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create schedule");
    } finally {
      setSaving(false);
    }
  };

  return <AdminLayout><div className="roster">
    <div className="roster__head"><div className="roster__title-block">
      <div className="roster__eyebrow">Client work</div><h1 className="roster__title">All <em>payments</em></h1>
      <hr className="roster__rule" /><p className="roster__sub">Payment schedules, due dates, and outstanding balances across every project.</p>
    </div>
    <button className="crm-btn crm-btn--primary" onClick={() => setOpen(true)}>
      <Plus size={14} /> New payment schedule
    </button>
    </div>
    <div className="ops-summary"><div><span>Outstanding balance</span><strong>{data ? formatMoney(outstanding) : "—"}</strong></div></div>
    <div className="ctbl__bar"><select className="ctbl__filter" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter payments">
      <option value="outstanding">Outstanding</option><option value="scheduled">Scheduled</option><option value="paid">Paid</option><option value="failed">Failed</option><option value="void">Void</option><option value="all">All statuses</option>
    </select><span className="ctbl__count">{data ? `${rows.length} payments` : "Loading…"}</span></div>
    <div className="ctbl__scroll"><table className="ctbl__table"><thead><tr><th>Payment</th><th>Client</th><th className="ctbl__col-contact">Project</th><th>Due</th><th>Amount</th><th>Status</th></tr></thead><tbody>
      {!data && <tr><td colSpan={6} className="ctbl__empty">Loading…</td></tr>}
      {data && !rows.length && <tr><td colSpan={6} className="ctbl__empty">No payments match this filter.</td></tr>}
      {rows.map((invoice) => { const project = projects[invoice.client_project_id]; return <tr key={invoice.id} tabIndex={0}
        onClick={() => project && navigate(`/admin/clients/${invoice.client_id}/projects/${project.id}`)}
        onKeyDown={(event) => { if (event.key === "Enter" && project) navigate(`/admin/clients/${invoice.client_id}/projects/${project.id}`); }}>
        <td className="ctbl__name">{invoice.label}</td><td>{data?.clientNames[invoice.client_id] ?? "—"}</td><td className="ctbl__col-contact">{project?.name ?? "—"}</td>
        <td className="ctbl__when">{invoice.due_date ? new Date(`${invoice.due_date}T12:00:00`).toLocaleDateString() : "—"}</td><td>{formatMoney(invoice.amount_cents, invoice.currency)}</td>
        <td><span className={`ctbl__pill ctbl__pill--${invoice.status}`}>{invoice.status}</span></td></tr>; })}
    </tbody></table></div>

    <SidePanel
      open={open}
      title="New payment schedule"
      subtitle="A project can carry more than one — each one is sent and tracked independently."
      onClose={() => { if (!saving) setOpen(false); }}
      width={520}
      footer={
        <>
          <button className="crm-btn crm-btn--ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
          <button className="crm-btn crm-btn--primary" onClick={() => void createSchedule()} disabled={saving}>
            {saving ? "Creating…" : "Create schedule"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label className="crm-label">Client *</label>
          <select className="crm-input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— choose a client —</option>
            {clientOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>

        {clientId && (
          <div>
            <label className="crm-label">Project *</label>
            <select className="crm-input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— choose a project —</option>
              {projectsForClient.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="__new__">+ Create a new project…</option>
            </select>
          </div>
        )}

        {creatingNewProject && (
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="crm-label">New project name *</label>
              <input className="crm-input" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} />
            </div>
            <div style={{ width: 160 }}>
              <label className="crm-label">Type</label>
              <select className="crm-input" value={newProjectType} onChange={(e) => setNewProjectType(e.target.value)}>
                {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select>
            </div>
          </div>
        )}

        {!!proposalOptions.length && (
          <div>
            <label className="crm-label">Link to a proposal (optional)</label>
            <select className="crm-input" value={proposalId} onChange={(e) => setProposalId(e.target.value)}>
              <option value="">— not linked —</option>
              {proposalOptions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="crm-label">Schedule title</label>
          <input className="crm-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div>
          <label className="crm-label">Installments</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((it, i) => (
              <div key={i} style={{ display: "flex", gap: 6 }}>
                <input className="crm-input" style={{ flex: 1 }} placeholder="Label" value={it.label}
                  onChange={(e) => setItems((s) => s.map((x, ix) => ix === i ? { ...x, label: e.target.value } : x))} />
                <input className="crm-input" style={{ width: 110 }} type="number" step="0.01" placeholder="Amount"
                  value={it.amount_dollars}
                  onChange={(e) => setItems((s) => s.map((x, ix) => ix === i ? { ...x, amount_dollars: e.target.value } : x))} />
                <input className="crm-input" style={{ width: 140 }} type="date" value={it.due_date}
                  onChange={(e) => setItems((s) => s.map((x, ix) => ix === i ? { ...x, due_date: e.target.value } : x))} />
                <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => setItems((s) => s.filter((_, ix) => ix !== i))}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
          <button className="crm-btn crm-btn--ghost crm-btn--sm" style={{ marginTop: 8 }}
            onClick={() => setItems((s) => [...s, { label: "", amount_dollars: "", due_date: "" }])}>
            <Plus size={12} /> Add installment
          </button>
        </div>
      </div>
    </SidePanel>
  </div></AdminLayout>;
}