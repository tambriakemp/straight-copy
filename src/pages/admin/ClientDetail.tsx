import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { STAGES } from "@/components/admin/StageBadge";
import { ArrowLeft, Plus, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const LAUNCH_DEFAULTS = [
  "Brand voice document drafted",
  "Lead capture form deployed",
  "Onboarding flow live",
  "Welcome email automation set up",
  "Client trained on system",
  "Hand-off complete",
];
const GROWTH_DEFAULTS = [
  ...LAUNCH_DEFAULTS,
  "Business Brain knowledge base loaded",
  "Content publishing automation",
  "Lead nurture sequence",
  "Reporting dashboard configured",
  "Monthly review cadence scheduled",
  "Quarterly roadmap drafted",
];

interface Client {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  tier: string;
  stage: string;
  intake_summary: string | null;
  brand_voice_url: string | null;
  brand_voice_content: string | null;
  notes: string | null;
  created_at: string;
  archived: boolean;
}

interface ChecklistItem { id: string; label: string; completed: boolean; order_index: number; }
interface Automation { id: string; name: string; status: string; notes: string | null; }
interface Delivery { id: string; delivery_date: string; title: string; description: string | null; link_url: string | null; }

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [newCheckLabel, setNewCheckLabel] = useState("");
  const [newAuto, setNewAuto] = useState({ name: "", status: "not_started" });
  const [newDelivery, setNewDelivery] = useState({ delivery_date: format(new Date(), "yyyy-MM-dd"), title: "", description: "", link_url: "" });

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [c, ch, au, de] = await Promise.all([
      supabase.from("clients").select("*").eq("id", id).maybeSingle(),
      supabase.from("client_checklist_items").select("*").eq("client_id", id).order("order_index"),
      supabase.from("client_automations").select("*").eq("client_id", id).order("created_at"),
      supabase.from("client_deliveries").select("*").eq("client_id", id).order("delivery_date", { ascending: false }),
    ]);
    if (c.error) toast.error(c.error.message);
    setClient((c.data as Client) || null);
    setChecklist((ch.data as ChecklistItem[]) || []);
    setAutomations((au.data as Automation[]) || []);
    setDeliveries((de.data as Delivery[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const updateClient = async (patch: Partial<Client>) => {
    if (!client) return;
    setClient({ ...client, ...patch });
    setSaving(true);
    const { error } = await supabase.from("clients").update(patch).eq("id", client.id);
    setSaving(false);
    if (error) toast.error(error.message);
  };

  const seedChecklist = async () => {
    if (!client) return;
    const items = client.tier === "growth" ? GROWTH_DEFAULTS : LAUNCH_DEFAULTS;
    const rows = items.map((label, i) => ({ client_id: client.id, label, order_index: i }));
    const { error } = await supabase.from("client_checklist_items").insert(rows);
    if (error) toast.error(error.message); else { toast.success("Checklist seeded"); load(); }
  };

  const addChecklistItem = async () => {
    if (!client || !newCheckLabel.trim()) return;
    const { error } = await supabase.from("client_checklist_items").insert({
      client_id: client.id, label: newCheckLabel.trim(), order_index: checklist.length,
    });
    if (error) toast.error(error.message); else { setNewCheckLabel(""); load(); }
  };

  const toggleCheck = async (item: ChecklistItem) => {
    setChecklist((prev) => prev.map((c) => (c.id === item.id ? { ...c, completed: !c.completed } : c)));
    await supabase.from("client_checklist_items").update({ completed: !item.completed }).eq("id", item.id);
  };

  const deleteCheck = async (cid: string) => {
    await supabase.from("client_checklist_items").delete().eq("id", cid);
    load();
  };

  const addAutomation = async () => {
    if (!client || !newAuto.name.trim()) return;
    const { error } = await supabase.from("client_automations").insert({
      client_id: client.id, name: newAuto.name.trim(), status: newAuto.status,
    });
    if (error) toast.error(error.message); else { setNewAuto({ name: "", status: "not_started" }); load(); }
  };

  const updateAutoStatus = async (a: Automation, status: string) => {
    setAutomations((prev) => prev.map((x) => (x.id === a.id ? { ...x, status } : x)));
    await supabase.from("client_automations").update({ status }).eq("id", a.id);
  };

  const deleteAuto = async (aid: string) => {
    await supabase.from("client_automations").delete().eq("id", aid);
    load();
  };

  const addDelivery = async () => {
    if (!client || !newDelivery.title.trim()) return;
    const { error } = await supabase.from("client_deliveries").insert({
      client_id: client.id,
      delivery_date: newDelivery.delivery_date,
      title: newDelivery.title.trim(),
      description: newDelivery.description.trim() || null,
      link_url: newDelivery.link_url.trim() || null,
    });
    if (error) toast.error(error.message); else {
      setNewDelivery({ delivery_date: format(new Date(), "yyyy-MM-dd"), title: "", description: "", link_url: "" });
      load();
    }
  };

  const archive = async () => {
    if (!client) return;
    if (!confirm("Archive this client? They will be hidden from the pipeline.")) return;
    await supabase.from("clients").update({ archived: true }).eq("id", client.id);
    toast.success("Archived");
    navigate("/admin");
  };

  if (loading) return <AdminLayout><p className="text-sm text-zinc-500">Loading…</p></AdminLayout>;
  if (!client) return <AdminLayout><p className="text-sm text-zinc-500">Client not found.</p></AdminLayout>;

  const statusColor = (s: string) =>
    s === "live" ? "bg-emerald-100 text-emerald-800" :
    s === "building" ? "bg-blue-100 text-blue-800" :
    s === "paused" ? "bg-amber-100 text-amber-800" :
    "bg-zinc-100 text-zinc-700";

  return (
    <AdminLayout>
      <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to pipeline
      </Link>

      <div className="bg-white border border-zinc-200 rounded-lg p-5 mb-5">
        <div className="flex items-start justify-between mb-1">
          <h1 className="text-2xl font-semibold tracking-tight">{client.business_name || "Untitled"}</h1>
          {saving && <span className="text-xs text-zinc-400">Saving…</span>}
        </div>
        <p className="text-sm text-zinc-500">
          Submitted {format(new Date(client.created_at), "MMM d, yyyy")}
        </p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="checklist">Checklist</TabsTrigger>
          <TabsTrigger value="automations">Automations</TabsTrigger>
          <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
          <TabsTrigger value="danger">Danger</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Business name" value={client.business_name || ""} onChange={(v) => updateClient({ business_name: v })} />
            <Field label="Contact name" value={client.contact_name || ""} onChange={(v) => updateClient({ contact_name: v })} />
            <Field label="Contact email" value={client.contact_email || ""} onChange={(v) => updateClient({ contact_email: v })} />
            <Field label="Contact phone" value={client.contact_phone || ""} onChange={(v) => updateClient({ contact_phone: v })} />
            <div className="space-y-1.5">
              <Label>Tier</Label>
              <Select value={client.tier} onValueChange={(v) => updateClient({ tier: v })}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="launch">Launch</SelectItem>
                  <SelectItem value="growth">Growth</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Stage</Label>
              <Select value={client.stage} onValueChange={(v) => updateClient({ stage: v })}>
                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Intake summary</Label>
            <Textarea rows={6} value={client.intake_summary || ""} onChange={(e) => setClient({ ...client, intake_summary: e.target.value })} onBlur={(e) => updateClient({ intake_summary: e.target.value })} className="bg-white" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
            <Field label="Brand voice document URL" value={client.brand_voice_url || ""} onChange={(v) => updateClient({ brand_voice_url: v })} />
            {client.brand_voice_url && (
              <a href={client.brand_voice_url} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm"><ExternalLink className="h-4 w-4" /> Open</Button>
              </a>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Brand voice (optional inline content)</Label>
            <Textarea rows={6} value={client.brand_voice_content || ""} onChange={(e) => setClient({ ...client, brand_voice_content: e.target.value })} onBlur={(e) => updateClient({ brand_voice_content: e.target.value })} className="bg-white" />
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={4} value={client.notes || ""} onChange={(e) => setClient({ ...client, notes: e.target.value })} onBlur={(e) => updateClient({ notes: e.target.value })} className="bg-white" />
          </div>
        </TabsContent>

        <TabsContent value="checklist" className="space-y-3 mt-4">
          {checklist.length === 0 && (
            <div className="bg-white border border-zinc-200 rounded-lg p-4 flex items-center justify-between">
              <p className="text-sm text-zinc-500">No checklist items yet.</p>
              <Button size="sm" onClick={seedChecklist}>Seed defaults for {client.tier}</Button>
            </div>
          )}
          <ul className="space-y-2">
            {checklist.map((item) => (
              <li key={item.id} className="bg-white border border-zinc-200 rounded-lg px-3 py-2 flex items-center gap-3">
                <Checkbox checked={item.completed} onCheckedChange={() => toggleCheck(item)} />
                <span className={`flex-1 text-sm ${item.completed ? "line-through text-zinc-400" : "text-zinc-800"}`}>{item.label}</span>
                <button onClick={() => deleteCheck(item.id)} className="text-zinc-400 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input placeholder="New item…" value={newCheckLabel} onChange={(e) => setNewCheckLabel(e.target.value)} className="bg-white" />
            <Button onClick={addChecklistItem}><Plus className="h-4 w-4" /> Add</Button>
          </div>
        </TabsContent>

        <TabsContent value="automations" className="space-y-3 mt-4">
          {automations.length === 0 && <p className="text-sm text-zinc-500">No automations tracked yet.</p>}
          <ul className="space-y-2">
            {automations.map((a) => (
              <li key={a.id} className="bg-white border border-zinc-200 rounded-lg px-3 py-2 flex items-center gap-3">
                <span className="flex-1 text-sm font-medium text-zinc-800">{a.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${statusColor(a.status)}`}>{a.status.replace("_", " ")}</span>
                <Select value={a.status} onValueChange={(v) => updateAutoStatus(a, v)}>
                  <SelectTrigger className="w-[130px] h-8 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_started">Not started</SelectItem>
                    <SelectItem value="building">Building</SelectItem>
                    <SelectItem value="live">Live</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                  </SelectContent>
                </Select>
                <button onClick={() => deleteAuto(a.id)} className="text-zinc-400 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input placeholder="Automation name (e.g. Lead capture form)" value={newAuto.name} onChange={(e) => setNewAuto({ ...newAuto, name: e.target.value })} className="bg-white" />
            <Select value={newAuto.status} onValueChange={(v) => setNewAuto({ ...newAuto, status: v })}>
              <SelectTrigger className="w-[140px] bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="not_started">Not started</SelectItem>
                <SelectItem value="building">Building</SelectItem>
                <SelectItem value="live">Live</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={addAutomation}><Plus className="h-4 w-4" /> Add</Button>
          </div>
        </TabsContent>

        <TabsContent value="deliveries" className="space-y-4 mt-4">
          <div className="bg-white border border-zinc-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-5 gap-2">
            <Input type="date" value={newDelivery.delivery_date} onChange={(e) => setNewDelivery({ ...newDelivery, delivery_date: e.target.value })} />
            <Input placeholder="Title" value={newDelivery.title} onChange={(e) => setNewDelivery({ ...newDelivery, title: e.target.value })} />
            <Input placeholder="Description" value={newDelivery.description} onChange={(e) => setNewDelivery({ ...newDelivery, description: e.target.value })} />
            <Input placeholder="Link URL (optional)" value={newDelivery.link_url} onChange={(e) => setNewDelivery({ ...newDelivery, link_url: e.target.value })} />
            <Button onClick={addDelivery}><Plus className="h-4 w-4" /> Log</Button>
          </div>
          <ul className="space-y-2">
            {deliveries.map((d) => (
              <li key={d.id} className="bg-white border border-zinc-200 rounded-lg px-3 py-2 flex items-start gap-3">
                <span className="text-xs text-zinc-500 w-24 shrink-0">{format(new Date(d.delivery_date), "MMM d, yyyy")}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-800">{d.title}</p>
                  {d.description && <p className="text-xs text-zinc-500">{d.description}</p>}
                </div>
                {d.link_url && (
                  <a href={d.link_url} target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-zinc-700">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </li>
            ))}
            {deliveries.length === 0 && <p className="text-sm text-zinc-500">No deliveries logged yet.</p>}
          </ul>
        </TabsContent>

        <TabsContent value="danger" className="mt-4">
          <div className="bg-white border border-red-200 rounded-lg p-4">
            <p className="text-sm text-zinc-700 mb-3">Archive this client to hide them from the pipeline. This is reversible from the database.</p>
            <Button variant="destructive" onClick={archive}>Archive client</Button>
          </div>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={local} onChange={(e) => setLocal(e.target.value)} onBlur={() => local !== value && onChange(local)} className="bg-white" />
    </div>
  );
}
