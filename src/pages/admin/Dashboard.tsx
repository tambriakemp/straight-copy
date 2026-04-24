import { useEffect, useMemo, useState } from "react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import KanbanColumn from "@/components/admin/KanbanColumn";
import { STAGES, StageId } from "@/components/admin/StageBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { ClientRow } from "@/components/admin/ClientCard";

export default function Dashboard() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ business_name: "", contact_name: "", contact_email: "", tier: "launch" });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("id,business_name,contact_name,contact_email,tier,stage,brand_voice_url,created_at")
      .eq("archived", false)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setClients((data as ClientRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (tierFilter !== "all" && c.tier !== tierFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (c.business_name || "").toLowerCase().includes(q) ||
          (c.contact_name || "").toLowerCase().includes(q) ||
          (c.contact_email || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [clients, search, tierFilter]);

  const handleDragEnd = async (e: DragEndEvent) => {
    if (!e.over) return;
    const newStage = e.over.id as StageId;
    const id = String(e.active.id);
    const current = clients.find((c) => c.id === id);
    if (!current || current.stage === newStage) return;

    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, stage: newStage } : c)));
    const { error } = await supabase.from("clients").update({ stage: newStage }).eq("id", id);
    if (error) {
      toast.error("Failed to update stage");
      load();
    }
  };

  const createClient = async () => {
    if (!form.business_name.trim()) {
      toast.error("Business name required");
      return;
    }
    const { error } = await supabase.from("clients").insert({
      business_name: form.business_name.trim(),
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
      tier: form.tier,
      stage: "intake_submitted",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Client created");
    setOpen(false);
    setForm({ business_name: "", contact_name: "", contact_email: "", tier: "launch" });
    load();
  };

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Input
          placeholder="Search clients…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs bg-white"
        />
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-[140px] bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            <SelectItem value="launch">Launch</SelectItem>
            <SelectItem value="growth">Growth</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4" /> New Client</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New client</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Business name *</Label>
                  <Input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Contact name</Label>
                  <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Contact email</Label>
                  <Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tier</Label>
                  <Select value={form.tier} onValueChange={(v) => setForm({ ...form, tier: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="launch">Launch</SelectItem>
                      <SelectItem value="growth">Growth</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createClient}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading pipeline…</p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES.map((s) => (
              <KanbanColumn
                key={s.id}
                stageId={s.id}
                label={s.label}
                clients={filtered.filter((c) => c.stage === s.id)}
              />
            ))}
          </div>
        </DndContext>
      )}
    </AdminLayout>
  );
}
