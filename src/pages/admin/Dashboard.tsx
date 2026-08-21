import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import ClientsTable from "@/components/admin/ClientsTable";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";


export default function Dashboard() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // Bumped after a create so the table refetches. Cheaper than threading a
  // reload handle out of it for the one event that changes the list.
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState({
    business_name: "",
    contact_name: "",
    contact_email: "",
  });

  const createClient = async () => {
    if (!form.contact_name.trim()) {
      toast.error("Client name required");
      return;
    }
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
    if (data?.id) navigate(`/admin/clients/${data.id}`);
    else setReloadKey((k) => k + 1);
  };

  return (
    <AdminLayout>
      <div className="roster">
        <div className="roster__ghost">CRE8</div>

        <div className="roster__head">
          <div className="roster__title-block">
            <div className="roster__eyebrow">Client Roster</div>
            <h1 className="roster__title">All <em>clients</em></h1>
            <hr className="roster__rule" />
            <p className="roster__sub">
              Every brand on our books. Open a client to see their projects — automation builds and site previews.
            </p>
          </div>
        </div>

        <div className="roster__toolbar">
        <div className="roster__actions">
            <button className="crm-btn crm-btn--ghost" onClick={() => navigate("/admin/invites")}>
              ✉ Invites
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <button className="crm-btn crm-btn--primary">+ New Client</button>
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
                  <button className="crm-btn crm-btn--bronze" onClick={createClient}>
                    Create
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* One table, used here and in the agent Workspace rail, so the two
            can never drift into showing different clients. */}
        <ClientsTable key={reloadKey} />
      </div>
    </AdminLayout>
  );
}
