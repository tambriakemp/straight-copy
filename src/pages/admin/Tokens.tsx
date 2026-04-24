import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { Trash2, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface Token {
  id: string; label: string; created_at: string; last_used_at: string | null; revoked: boolean;
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return "crm_" + Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function Tokens() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crm-api`;

  const load = async () => {
    const { data, error } = await supabase
      .from("api_tokens")
      .select("id,label,created_at,last_used_at,revoked")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message); else setTokens((data as Token[]) || []);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!label.trim()) { toast.error("Label required"); return; }
    setBusy(true);
    const raw = generateToken();
    const hash = await sha256(raw);
    const { error } = await supabase.from("api_tokens").insert({ label: label.trim(), token_hash: hash });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setRevealed(raw);
    setLabel("");
    load();
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this token? API calls using it will immediately fail.")) return;
    await supabase.from("api_tokens").update({ revoked: true }).eq("id", id);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this token permanently?")) return;
    await supabase.from("api_tokens").delete().eq("id", id);
    load();
  };

  return (
    <AdminLayout>
      <div className="bg-white border border-zinc-200 rounded-lg p-5 mb-5">
        <h1 className="text-lg font-semibold mb-1">API Tokens</h1>
        <p className="text-sm text-zinc-500 mb-4">
          Bearer tokens for the public REST API. Endpoint:&nbsp;
          <code className="text-xs bg-zinc-100 px-1.5 py-0.5 rounded">{apiUrl}</code>
        </p>
        <div className="flex gap-2 max-w-md">
          <div className="flex-1 space-y-1.5">
            <Label>Token label</Label>
            <Input placeholder="e.g. Zapier production" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <Button onClick={create} disabled={busy} className="self-end">Generate</Button>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2">Label</th>
              <th className="text-left px-4 py-2">Created</th>
              <th className="text-left px-4 py-2">Last used</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.id} className="border-t border-zinc-100">
                <td className="px-4 py-2 font-medium">{t.label}</td>
                <td className="px-4 py-2 text-zinc-500">{format(new Date(t.created_at), "MMM d, yyyy")}</td>
                <td className="px-4 py-2 text-zinc-500">{t.last_used_at ? format(new Date(t.last_used_at), "MMM d, HH:mm") : "—"}</td>
                <td className="px-4 py-2">
                  {t.revoked ? <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">revoked</span> : <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">active</span>}
                </td>
                <td className="px-4 py-2 text-right space-x-2">
                  {!t.revoked && <Button variant="ghost" size="sm" onClick={() => revoke(t.id)}>Revoke</Button>}
                  <Button variant="ghost" size="sm" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
            {tokens.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-zinc-400">No tokens yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={!!revealed} onOpenChange={(o) => !o && setRevealed(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Your new token</DialogTitle></DialogHeader>
          <p className="text-sm text-zinc-600">Copy this now. You won't see it again.</p>
          <div className="bg-zinc-900 text-zinc-100 rounded p-3 font-mono text-xs break-all">{revealed}</div>
          <DialogFooter>
            <Button onClick={() => { navigator.clipboard.writeText(revealed!); toast.success("Copied"); }}>
              <Copy className="h-4 w-4" /> Copy
            </Button>
            <Button variant="outline" onClick={() => setRevealed(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
