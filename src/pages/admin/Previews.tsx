import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Copy, Check, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Project = {
  id: string;
  name: string;
  client_label: string | null;
  slug: string;
  storage_prefix: string;
  entry_path: string;
  is_multi_page: boolean;
  feedback_enabled: boolean;
  archived: boolean;
  created_at: string;
};

export default function Previews() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [clientLabel, setClientLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const base = useMemo(() => window.location.origin, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("preview-admin", { body: { action: "list" } });
    if (error) toast.error(error.message);
    else setProjects(data?.projects ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) return toast.error("Name required");
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("preview-admin", {
      body: { action: "create", name: name.trim(), client_label: clientLabel.trim() || null },
    });
    setCreating(false);
    if (error || !data?.project) return toast.error(error?.message || "Failed");
    setOpen(false);
    setName(""); setClientLabel("");
    toast.success("Preview created — now upload your files.");
    window.location.href = `/admin/previews/${data.project.id}`;
  };

  const copy = async (p: Project) => {
    await navigator.clipboard.writeText(`${base}/p/${p.slug}`);
    setCopiedId(p.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <AdminLayout>
      <div className="crm-card">
        <div className="crm-card__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="crm-card__title">Preview Sandbox</div>
            <div className="crm-card__sub">Upload site mockups, share unguessable links, collect pin feedback.</div>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button className="crm-btn crm-btn--primary"><Plus size={14} /> New preview</button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New preview project</DialogTitle></DialogHeader>
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <label className="crm-label">Project name</label>
                  <input className="crm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Magna Tax Relief — Home v1" />
                </div>
                <div>
                  <label className="crm-label">Client label (optional)</label>
                  <input className="crm-input" value={clientLabel} onChange={(e) => setClientLabel(e.target.value)} placeholder="Magna Tax Relief" />
                </div>
              </div>
              <DialogFooter>
                <button className="crm-btn" onClick={() => setOpen(false)}>Cancel</button>
                <button className="crm-btn crm-btn--primary" onClick={create} disabled={creating}>
                  {creating ? "Creating…" : "Create"}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div style={{ marginTop: 16 }}>
          {loading ? (
            <div style={{ padding: 24, color: "hsl(30 8% 50%)" }}>Loading…</div>
          ) : projects.length === 0 ? (
            <div style={{ padding: 24, color: "hsl(30 8% 50%)" }}>No previews yet. Create your first one above.</div>
          ) : (
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Client</th>
                  <th>Pages</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/admin/previews/${p.id}`} style={{ color: "inherit", textDecoration: "underline" }}>
                        {p.name}
                      </Link>
                    </td>
                    <td>{p.client_label || "—"}</td>
                    <td>{p.is_multi_page ? "Multi" : "Single"}</td>
                    <td>{new Date(p.created_at).toLocaleDateString()}</td>
                    <td>{p.archived ? "Archived" : "Active"}</td>
                    <td style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button className="crm-btn crm-btn--ghost" onClick={() => copy(p)} title="Copy share link">
                        {copiedId === p.id ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                      <a className="crm-btn crm-btn--ghost" href={`/p/${p.slug}`} target="_blank" rel="noreferrer" title="Open preview">
                        <ExternalLink size={14} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
