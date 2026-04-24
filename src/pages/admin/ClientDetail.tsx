import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ReactFlow, Background, Controls, Handle, Position,
  type Node, type Edge, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { ArrowLeft, Check, Circle, Loader2, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type NodeStatus = "pending" | "in_progress" | "complete";

interface JourneyNode {
  id: string;
  client_id: string;
  key: string;
  label: string;
  order_index: number;
  status: NodeStatus;
  notes: string | null;
  asset_url: string | null;
  asset_label: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

interface Client {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  tier: string;
  intake_summary: string | null;
  brand_voice_url: string | null;
  brand_voice_content: string | null;
  notes: string | null;
  purchased_at: string | null;
  created_at: string;
  archived: boolean;
}

// ---------- Custom React Flow node ----------
type DeliverableData = {
  label: string;
  status: NodeStatus;
  index: number;
  total: number;
};

function DeliverableNode({ data }: NodeProps<Node<DeliverableData>>) {
  const { label, status, index, total } = data;
  const isComplete = status === "complete";
  const isActive = status === "in_progress";
  return (
    <div className="relative flex flex-col items-center group">
      <Handle type="target" position={Position.Left} className="!bg-stone-300 !border-0 !w-2 !h-2" />
      <div
        className={[
          "h-14 w-14 rounded-full flex items-center justify-center border transition-all",
          isComplete
            ? "bg-emerald-500 border-emerald-600 text-white shadow-md"
            : isActive
            ? "bg-stone-900 border-stone-900 text-stone-50 animate-pulse shadow-lg"
            : "bg-stone-100 border-stone-300 text-stone-400",
        ].join(" ")}
      >
        {isComplete ? (
          <Check className="h-6 w-6" strokeWidth={2.5} />
        ) : isActive ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Circle className="h-5 w-5" />
        )}
      </div>
      <div className="mt-3 text-center max-w-[120px]">
        <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400">
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </div>
        <div className="text-xs font-medium text-stone-800 mt-0.5 leading-tight">{label}</div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-stone-300 !border-0 !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { deliverable: DeliverableNode };

// ---------- Page ----------
export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [nodes, setNodes] = useState<JourneyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [c, n] = await Promise.all([
      supabase.from("clients").select("*").eq("id", id).maybeSingle(),
      supabase.from("journey_nodes").select("*").eq("client_id", id).order("order_index"),
    ]);
    if (c.error) toast.error(c.error.message);
    setClient((c.data as Client) || null);
    setNodes((n.data as JourneyNode[]) || []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription on this client's nodes
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`journey-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "journey_nodes", filter: `client_id=eq.${id}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, load]);

  const updateClient = async (patch: Partial<Client>) => {
    if (!client) return;
    setClient({ ...client, ...patch });
    setSaving(true);
    const { error } = await supabase.from("clients").update(patch).eq("id", client.id);
    setSaving(false);
    if (error) toast.error(error.message);
  };

  const updateNode = async (nodeId: string, patch: Partial<JourneyNode>) => {
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)));
    const { error } = await supabase
      .from("journey_nodes")
      .update(patch as never)
      .eq("id", nodeId);
    if (error) toast.error(error.message);
  };

  const archive = async () => {
    if (!client) return;
    if (!confirm("Archive this client? They will be hidden from the roster.")) return;
    await supabase.from("clients").update({ archived: true }).eq("id", client.id);
    toast.success("Archived");
    navigate("/admin");
  };

  // Build React Flow graph
  const { rfNodes, rfEdges } = useMemo(() => {
    const SPACING = 180;
    const rfNodes: Node<DeliverableData>[] = nodes.map((n, i) => ({
      id: n.id,
      type: "deliverable",
      position: { x: i * SPACING, y: 0 },
      data: { label: n.label, status: n.status, index: i, total: nodes.length },
      draggable: false,
    }));
    const rfEdges: Edge[] = nodes.slice(0, -1).map((n, i) => {
      const next = nodes[i + 1];
      const done = n.status === "complete";
      return {
        id: `${n.id}-${next.id}`,
        source: n.id,
        target: next.id,
        type: "straight",
        animated: !done && n.status === "in_progress",
        style: {
          stroke: done ? "hsl(142 70% 45%)" : "hsl(30 8% 75%)",
          strokeWidth: done ? 2 : 1.5,
        },
      };
    });
    return { rfNodes, rfEdges };
  }, [nodes]);

  const selected = nodes.find((n) => n.id === selectedId) || null;

  if (loading) {
    return (
      <AdminLayout>
        <p className="text-sm text-stone-500">Loading…</p>
      </AdminLayout>
    );
  }
  if (!client) {
    return (
      <AdminLayout>
        <p className="text-sm text-stone-500">Client not found.</p>
      </AdminLayout>
    );
  }

  const completes = nodes.filter((n) => n.status === "complete").length;

  return (
    <AdminLayout>
      <Link
        to="/admin"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.25em] text-stone-500 hover:text-stone-900 mb-6"
      >
        <ArrowLeft className="h-3 w-3" /> Back to roster
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8">
        {/* ---------- Sidebar ---------- */}
        <aside className="space-y-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-stone-500 mb-2">
              {client.tier === "growth" ? "Growth tier" : "Launch tier"}
            </p>
            <h1 className="font-serif text-2xl text-stone-900 italic leading-tight">
              {client.business_name || "Untitled"}
            </h1>
            {saving && <p className="text-[10px] text-stone-400 mt-2">Saving…</p>}
          </div>

          <div className="space-y-4 pb-6 border-b border-stone-200">
            <SidebarField
              label="Contact name"
              value={client.contact_name || ""}
              onSave={(v) => updateClient({ contact_name: v || null })}
            />
            <SidebarField
              label="Email"
              type="email"
              value={client.contact_email || ""}
              onSave={(v) => updateClient({ contact_email: v || null })}
            />
            <SidebarField
              label="Phone"
              value={client.contact_phone || ""}
              onSave={(v) => updateClient({ contact_phone: v || null })}
            />
            <div>
              <Label className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Tier</Label>
              <Select value={client.tier} onValueChange={(v) => updateClient({ tier: v })}>
                <SelectTrigger className="mt-1.5 h-9 bg-white border-stone-300"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="launch">Launch</SelectItem>
                  <SelectItem value="growth">Growth</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5 pb-6 border-b border-stone-200">
            <Label className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Purchase date</Label>
            <p className="text-sm text-stone-700">
              {format(new Date(client.purchased_at || client.created_at), "MMMM d, yyyy")}
            </p>
          </div>

          <div className="space-y-1.5 pb-6 border-b border-stone-200">
            <Label className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Notes</Label>
            <Textarea
              rows={5}
              defaultValue={client.notes || ""}
              onBlur={(e) => e.target.value !== (client.notes || "") && updateClient({ notes: e.target.value || null })}
              className="bg-white border-stone-300 text-sm"
              placeholder="Internal notes…"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Linked files</Label>
            <SidebarField
              label="Brand voice URL"
              value={client.brand_voice_url || ""}
              onSave={(v) => updateClient({ brand_voice_url: v || null })}
              placeholder="https://…"
            />
            {client.brand_voice_url && (
              <a
                href={client.brand_voice_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-stone-600 hover:text-stone-900"
              >
                <ExternalLink className="h-3 w-3" /> Open document
              </a>
            )}
          </div>

          {client.intake_summary && (
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Intake summary</Label>
              <div className="bg-stone-50 border border-stone-200 rounded-sm p-3 text-xs text-stone-700 whitespace-pre-wrap max-h-48 overflow-y-auto">
                {client.intake_summary}
              </div>
            </div>
          )}

          <div className="pt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={archive}
              className="text-stone-500 hover:text-rose-600 hover:bg-transparent"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Archive client
            </Button>
          </div>
        </aside>

        {/* ---------- Journey panel ---------- */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-stone-500">Journey</p>
              <h2 className="font-serif text-xl text-stone-900 italic mt-1">
                {completes} of {nodes.length} complete
              </h2>
            </div>
          </div>

          <div className="bg-stone-50/60 border border-stone-200 rounded-sm" style={{ height: 360 }}>
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              onNodeClick={(_, n) => setSelectedId(n.id)}
              fitView
              fitViewOptions={{ padding: 0.25, minZoom: 0.5, maxZoom: 1.2 }}
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              panOnDrag
              zoomOnScroll
            >
              <Background color="hsl(30 8% 80%)" gap={24} size={1} />
              <Controls
                showInteractive={false}
                className="!bg-white !border !border-stone-200 !rounded-sm !shadow-sm"
              />
            </ReactFlow>
          </div>

          <p className="text-xs text-stone-500 mt-3 italic font-serif">
            Click any deliverable to update its status and notes.
          </p>
        </section>
      </div>

      {/* ---------- Slide-out node panel ---------- */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="bg-stone-50 border-stone-200 overflow-y-auto sm:max-w-md">
          {selected && (
            <NodePanel
              node={selected}
              onUpdate={(p) => updateNode(selected.id, p)}
              onClose={() => setSelectedId(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
}

// ---------- Node detail panel ----------
function NodePanel({
  node, onUpdate, onClose,
}: {
  node: JourneyNode;
  onUpdate: (patch: Partial<JourneyNode>) => void;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState(node.notes || "");
  const [assetUrl, setAssetUrl] = useState(node.asset_url || "");
  const [assetLabel, setAssetLabel] = useState(node.asset_label || "");

  useEffect(() => {
    setNotes(node.notes || "");
    setAssetUrl(node.asset_url || "");
    setAssetLabel(node.asset_label || "");
  }, [node.id, node.notes, node.asset_url, node.asset_label]);

  const cycle = () => {
    const next: NodeStatus =
      node.status === "pending" ? "in_progress"
      : node.status === "in_progress" ? "complete"
      : "pending";
    onUpdate({ status: next });
  };

  return (
    <div className="space-y-6 py-2">
      <SheetHeader className="space-y-2 text-left">
        <p className="text-[11px] uppercase tracking-[0.35em] text-stone-500">
          Deliverable {String(node.order_index + 1).padStart(2, "0")}
        </p>
        <SheetTitle className="font-serif text-2xl text-stone-900 italic">
          {node.label}
        </SheetTitle>
        <SheetDescription className="text-stone-600">
          {node.status === "complete"
            ? "This deliverable is complete."
            : node.status === "in_progress"
            ? "Currently in progress."
            : "Not started yet."}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-2">
        <Label className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Status</Label>
        <Select value={node.status} onValueChange={(v: NodeStatus) => onUpdate({ status: v })}>
          <SelectTrigger className="bg-white border-stone-300"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
          </SelectContent>
        </Select>
        <Button
          onClick={cycle}
          variant="outline"
          size="sm"
          className="w-full mt-1 border-stone-300 bg-white"
        >
          Advance to{" "}
          {node.status === "pending"
            ? "In progress"
            : node.status === "in_progress"
            ? "Complete"
            : "Pending"}
        </Button>
      </div>

      <div className="space-y-2">
        <Label className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Notes</Label>
        <Textarea
          rows={5}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (node.notes || "") && onUpdate({ notes: notes || null })}
          className="bg-white border-stone-300"
          placeholder="Working notes for this step…"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Linked asset</Label>
        <Input
          value={assetLabel}
          onChange={(e) => setAssetLabel(e.target.value)}
          onBlur={() => assetLabel !== (node.asset_label || "") && onUpdate({ asset_label: assetLabel || null })}
          placeholder="Asset label (e.g. Brand voice doc)"
          className="bg-white border-stone-300"
        />
        <Input
          value={assetUrl}
          onChange={(e) => setAssetUrl(e.target.value)}
          onBlur={() => assetUrl !== (node.asset_url || "") && onUpdate({ asset_url: assetUrl || null })}
          placeholder="https://…"
          className="bg-white border-stone-300"
        />
        {node.asset_url && (
          <a
            href={node.asset_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-stone-600 hover:text-stone-900"
          >
            <ExternalLink className="h-3 w-3" /> Open asset
          </a>
        )}
      </div>

      <div className="space-y-1.5 pt-4 border-t border-stone-200">
        <Label className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Timestamps</Label>
        <dl className="text-xs text-stone-600 space-y-1">
          <Row term="Started" value={node.started_at ? format(new Date(node.started_at), "MMM d, yyyy · HH:mm") : "—"} />
          <Row term="Completed" value={node.completed_at ? format(new Date(node.completed_at), "MMM d, yyyy · HH:mm") : "—"} />
          <Row term="Updated" value={format(new Date(node.updated_at), "MMM d, yyyy · HH:mm")} />
        </dl>
      </div>

      <Button onClick={onClose} variant="ghost" size="sm" className="w-full">
        Close
      </Button>
    </div>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-stone-500">{term}</dt>
      <dd className="text-stone-700 tabular-nums">{value}</dd>
    </div>
  );
}

// ---------- Sidebar text field with blur-save ----------
function SidebarField({
  label, value, onSave, type = "text", placeholder,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{label}</Label>
      <Input
        type={type}
        value={local}
        placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => local !== value && onSave(local)}
        className="bg-white border-stone-300 h-9 text-sm"
      />
    </div>
  );
}
