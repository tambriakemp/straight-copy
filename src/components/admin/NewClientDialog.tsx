// Creating a client, from wherever the roster is showing.
//
// This used to live inline in Dashboard.tsx, which was fine while /admin/clients
// was the only place clients appeared. Then the roster moved into every agent's
// Workspace rail and the standalone page dropped out of the nav — so the table
// came along and the one control that adds to it did not. The roster was
// reachable from six screens and creatable from none.
//
// Extracted rather than copied: two dialogs writing `clients` would drift on
// the company rule below within a week, and the second one would be the one
// nobody remembered to fix.
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  /** Called with the new client's id once both writes have settled. */
  onCreated: (clientId: string) => void;
  /** Overrides the trigger label, for surfaces where "+ New Client" reads oddly. */
  label?: string;
}

export default function NewClientDialog({ onCreated, label = "+ New Client" }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    business_name: "",
    contact_name: "",
    contact_email: "",
  });

  const create = async () => {
    if (!form.contact_name.trim()) {
      toast.error("Client name required");
      return;
    }
    setBusy(true);
    try {
      const company = form.business_name.trim();
      const { data, error } = await supabase.from("clients").insert({
        // The client is the person. business_name is deprecated and owned by the
        // primary company, so it is left for that insert to set via its trigger
        // rather than written here — two writers would race.
        contact_name: form.contact_name.trim(),
        contact_email: form.contact_email.trim() || null,
        purchased_at: new Date().toISOString(),
      }).select("id").single();
      if (error) {
        toast.error(error.message);
        return;
      }

      // A client created with no company would have nothing for a project to
      // belong to, and the project form only offers a picker now. So the first
      // company is created here when one was named.
      if (data?.id && company) {
        const { error: cErr } = await supabase.from("client_companies").insert({
          client_id: data.id,
          name: company,
          email: form.contact_email.trim() || null,
          is_primary: true,
          order_index: 0,
        });
        if (cErr) toast.error(`Client created, but the company failed: ${cErr.message}`);
      }

      toast.success("Client created");
      setOpen(false);
      setForm({ business_name: "", contact_name: "", contact_email: "" });
      if (data?.id) onCreated(data.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="crm-btn crm-btn--primary">{label}</button>
      </DialogTrigger>
      <DialogContent data-mobile-bottom-sheet="true" className="crm-shell !bg-[hsl(36_5%_16%)] !border-[hsl(40_20%_97%/0.08)] !text-[hsl(40_20%_97%)] !rounded-none !max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif italic text-2xl text-[hsl(40_20%_97%)]">New client</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="crm-label">Client name *</label>
            <input
              className="crm-input"
              value={form.contact_name}
              onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
            />
          </div>
          <div>
            <label className="crm-label">First company</label>
            <p style={{ fontSize: 14, color: "var(--crm-taupe)", margin: "0 0 6px" }}>
              Optional. A client can run several businesses — add the rest on their page.
            </p>
            <input
              className="crm-input"
              value={form.business_name}
              onChange={(e) => setForm({ ...form, business_name: e.target.value })}
            />
          </div>
          <div>
            <label className="crm-label">Contact email</label>
            <input
              type="email"
              className="crm-input"
              value={form.contact_email}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter className="mt-2">
          <button className="crm-btn crm-btn--bronze" disabled={busy} onClick={create}>
            {busy ? "Creating…" : "Create"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
