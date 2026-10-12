// Creating a project on a client.
//
// The "+ New project" button navigated to /admin/clients/:id?new=project
// and nothing anywhere read that parameter — so the URL changed, the
// page re-rendered identically, and clicking it did nothing at all. A
// client's projects were creatable from the payment-schedule form and
// nowhere else.
//
// The company picker is offered, not required: client_projects.company_id
// is nullable, and a client who has never had a company recorded should
// not be blocked from having a project. It defaults to the primary one
// when there is one, because that is right nearly every time.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { projectTypeStyle } from "@/lib/projectType";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";

/** The types a project can be. Same keys projectTypeStyle names. */
const TYPES = ["web_development", "app_development", "marketing", "automation_build"] as const;

interface Company { id: string; name: string; is_primary: boolean }

export default function NewProjectDialog({
  clientId, onCreated,
}: {
  clientId: string;
  /** Called with the new project's id once the insert has settled. */
  onCreated: (projectId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("web_development");
  const [companyId, setCompanyId] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("client_companies")
        .select("id, name, is_primary")
        .eq("client_id", clientId).eq("archived", false)
        .order("is_primary", { ascending: false })
        .order("order_index", { ascending: true });
      if (cancelled) return;
      const rows = (data ?? []) as Company[];
      setCompanies(rows);
      setCompanyId((rows.find((c) => c.is_primary) ?? rows[0])?.id ?? "");
    })();
    return () => { cancelled = true; };
  }, [open, clientId]);

  const create = async () => {
    const title = name.trim();
    if (!title) { toast.error("Give the project a name"); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.from("client_projects").insert({
        client_id: clientId,
        name: title,
        type,
        company_id: companyId || null,
      }).select("id").single();
      if (error) throw new Error(error.message);
      toast.success("Project created");
      setOpen(false);
      setName("");
      onCreated(data.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the project");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="cv-btn-ink cv-btn-ink--sm">+ New project</button>
      </DialogTrigger>
      <DialogContent data-mobile-bottom-sheet="true" className="sm:max-w-md">
        <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label className="cv-field">
            Name
            <input
              className="cv-input" value={name} autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !busy) void create(); }}
              placeholder="Michigan Health Specialist"
            />
          </label>

          <label className="cv-field">
            Type
            <select className="cv-select" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>{projectTypeStyle(t).label}</option>
              ))}
            </select>
          </label>

          {companies.length > 0 && (
            <label className="cv-field">
              Company
              <select className="cv-select" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.is_primary ? " · primary" : ""}</option>
                ))}
                <option value="">No company</option>
              </select>
            </label>
          )}
        </div>

        <DialogFooter>
          <button type="button" className="cv-open" style={{ padding: "0 18px" }}
            onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="cv-open cv-open--dark" style={{ padding: "0 18px" }}
            onClick={create} disabled={busy}>
            {busy ? "Creating…" : "Create project"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
