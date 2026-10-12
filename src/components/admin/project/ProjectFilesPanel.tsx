// The agency half of a project's files: what we have shared with the
// client, and what they have sent back.
//
// The same table and the same endpoint the portal uses, so there is one
// answer to "what files are on this project" rather than two lists that
// disagree. The difference is what this caller is allowed to do: share a
// file TO the client, hide one, and delete either side's.
//
// Without this panel the portal's "Shared with you" list could never
// have anything in it, which is a tab that is permanently empty and
// reads as broken.
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, FileText, Download, Eye, EyeOff, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import EmptyState from "@/components/admin/cv/EmptyState";
import { fileSize, safeFileName } from "@/lib/projectFiles";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const MAX_BYTES = 50 * 1024 * 1024;

interface Row {
  id: string;
  name: string;
  storage_path: string;
  size_bytes: number | null;
  direction: string;
  category: string | null;
  uploaded_by_name: string | null;
  visible_to_client: boolean;
  created_at: string;
  url: string | null;
}

async function call(action: string, body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not signed in");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/client-files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string })?.error ?? res.statusText);
  return json as Record<string, unknown>;
}

export default function ProjectFilesPanel({
  clientId, clientProjectId,
}: {
  clientId: string;
  clientProjectId: string;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [category, setCategory] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const out = await call("list", { client_id: clientId, client_project_id: clientProjectId });
      setRows((out.files ?? []) as Row[]);
      setUnavailable(false);
    } catch {
      setRows([]);
      setUnavailable(true);
    }
  }, [clientId, clientProjectId]);

  useEffect(() => { void load(); }, [load]);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    let done = 0;
    for (const file of Array.from(list)) {
      if (file.size > MAX_BYTES) { toast.error(`${file.name} is over 50MB`); continue; }
      try {
        const path = `project-files/${clientId}/${clientProjectId}/${Date.now()}-${safeFileName(file.name)}`;
        const { error } = await supabase.storage.from("client-assets").upload(path, file, {
          cacheControl: "3600", upsert: false, contentType: file.type || undefined,
        });
        if (error) throw new Error(error.message);
        await call("register", {
          client_id: clientId, client_project_id: clientProjectId,
          name: file.name, storage_path: path, size_bytes: file.size,
          mime: file.type || null, direction: "to_client",
          category: category.trim() || null,
          uploaded_by_name: "Cre8 Visions",
        });
        done++;
      } catch (e) {
        toast.error(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (done) { await load(); toast.success(`Shared ${done} file${done === 1 ? "" : "s"}`); }
  };

  const toggle = async (r: Row) => {
    try {
      await call("set_visible", { client_id: clientId, id: r.id, visible_to_client: !r.visible_to_client });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change that");
    }
  };

  const remove = async (r: Row) => {
    if (!confirm(`Delete ${r.name}? This cannot be undone.`)) return;
    try {
      await call("remove", { client_id: clientId, id: r.id });
      await load();
      toast.success("Deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete that file");
    }
  };

  const all = rows ?? [];
  const shared = all.filter((r) => r.direction === "to_client");
  const received = all.filter((r) => r.direction !== "to_client");

  const row = (r: Row) => (
    <div key={r.id} className="cv-it">
      <span className="cv-ic" style={{ background: "#EEF0F5", color: "#3D4556" }}><FileText size={22} /></span>
      <span className="cv-it__what">
        <b>{r.name}</b>
        <small>
          {[
            r.category,
            new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
            fileSize(r.size_bytes),
            r.uploaded_by_name,
          ].filter(Boolean).join(" · ")}
        </small>
      </span>
      {!r.visible_to_client && <span className="cv-chip cv-chip--amber">Hidden from client</span>}
      {r.url && (
        <a className="cv-open" style={{ padding: "0 16px" }} href={r.url} target="_blank" rel="noreferrer">
          <Download size={14} style={{ marginRight: 6 }} /> Download
        </a>
      )}
      <button type="button" className="cv-mini" onClick={() => toggle(r)}
        title={r.visible_to_client ? "Hide from the client" : "Show to the client"}>
        {r.visible_to_client ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
      <button type="button" className="cv-mini cv-mini--danger" onClick={() => remove(r)}>
        <Trash2 size={14} />
      </button>
    </div>
  );

  return (
    <section className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <div style={{ flex: "1 1 240px" }}>
          <h2 className="cv-card-title">Files</h2>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--cv-muted)" }}>
            What you've shared with the client, and what they've sent you.
            Anything you upload here appears on their Files tab.
          </p>
        </div>
        <input className="cv-input" style={{ flex: "0 1 180px", minHeight: 40, fontSize: 13 }}
          value={category} onChange={(e) => setCategory(e.target.value)}
          placeholder="Heading (e.g. Contracts)" />
        <button type="button" className="cv-open cv-open--dark" style={{ padding: "0 20px" }}
          disabled={busy || unavailable} onClick={() => inputRef.current?.click()}>
          <Upload size={15} style={{ marginRight: 7 }} />
          {busy ? "Uploading…" : "Share files"}
        </button>
        <input ref={inputRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>

      {unavailable ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--cv-muted)" }}>
          The client-files function isn't deployed yet, so this reads empty.
          Ask Lovable to deploy <code>client-files</code>.
        </p>
      ) : rows === null ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--cv-muted)" }}>Loading…</p>
      ) : !all.length ? (
        <EmptyState icon={FileText} title="No files on this project"
          subtitle="Share one above, or wait for the client to send something." />
      ) : (
        <>
          {shared.length > 0 && (
            <>
              <div className="cv-fb__grouphead"><span style={{ flex: 1 }}>Shared with the client</span><span>{shared.length}</span></div>
              {shared.map(row)}
            </>
          )}
          {received.length > 0 && (
            <>
              <div className="cv-fb__grouphead"><span style={{ flex: 1 }}>Sent by the client</span><span>{received.length}</span></div>
              {received.map(row)}
            </>
          )}
        </>
      )}
    </section>
  );
}
