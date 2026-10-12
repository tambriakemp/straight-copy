// The Files tab on a client's project, in the portal.
//
// Two lists from one table: what Cre8 Visions shared, and what the
// client sent. Same kind of thing from opposite ends, so one table with
// a direction rather than two that drift apart.
//
// Downloads are signed URLs minted per load and good for half an hour.
// The bucket is private on purpose — the portal is a link, and a link
// that also hands out permanent file URLs turns one forwarded address
// into a document archive that never expires.
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, FileText, Download, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import EmptyState from "@/components/admin/cv/EmptyState";
import { fileSize, safeFileName, previewKind } from "@/lib/projectFiles";
import FilePreview from "@/components/FilePreview";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const MAX_BYTES = 15 * 1024 * 1024;

export interface ProjectFile {
  id: string;
  name: string;
  storage_path: string;
  size_bytes: number | null;
  mime: string | null;
  direction: string;
  category: string | null;
  uploaded_by_name: string | null;
  visible_to_client: boolean;
  created_at: string;
  url: string | null;
}

async function call(action: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/client-files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PUB_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string })?.error ?? res.statusText);
  return json as Record<string, unknown>;
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function FilesSection({
  clientId, clientProjectId, clientName,
}: {
  clientId: string;
  clientProjectId: string;
  clientName: string | null;
}) {
  const [files, setFiles] = useState<ProjectFile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [previewing, setPreviewing] = useState<ProjectFile | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const out = await call("list", { client_id: clientId, client_project_id: clientProjectId });
      setFiles((out.files ?? []) as ProjectFile[]);
      setUnavailable(false);
    } catch {
      setFiles([]);
      setUnavailable(true);
    }
  }, [clientId, clientProjectId]);

  useEffect(() => { void load(); }, [load]);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    let done = 0;
    for (const file of Array.from(list)) {
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} is over 15MB`);
        continue;
      }
      try {
        const path = `project-files/${clientId}/${clientProjectId}/${Date.now()}-${safeFileName(file.name)}`;
        const { error } = await supabase.storage.from("client-assets").upload(path, file, {
          cacheControl: "3600", upsert: false, contentType: file.type || undefined,
        });
        if (error) throw new Error(error.message);
        // Two steps on purpose: the bytes go straight to storage, and
        // only then is a row written. A failed upload leaves no row
        // claiming a file that is not there.
        await call("register", {
          client_id: clientId,
          client_project_id: clientProjectId,
          name: file.name,
          storage_path: path,
          size_bytes: file.size,
          mime: file.type || null,
          uploaded_by_name: clientName || null,
        });
        done++;
      } catch (e) {
        toast.error(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (done) { await load(); toast.success(`Sent ${done} file${done === 1 ? "" : "s"}`); }
  };

  const remove = async (f: ProjectFile) => {
    if (!confirm(`Remove ${f.name}?`)) return;
    try {
      await call("remove", { client_id: clientId, id: f.id });
      await load();
      toast.success("Removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove that file");
    }
  };

  const rows = files ?? [];
  const shared = rows.filter((f) => f.direction === "to_client");
  const sent = rows.filter((f) => f.direction !== "to_client");

  const row = (f: ProjectFile, mine: boolean) => (
    <div key={f.id} className="cv-it">
      <span className="cv-ic" style={{ background: "#EEF0F5", color: "#3D4556" }}>
        <FileText size={22} />
      </span>
      <span className="cv-it__what">
        {f.url && previewKind(f.mime, f.name) ? (
          <button type="button" className="cv-filename" onClick={() => setPreviewing(f)}>
            {f.name}
          </button>
        ) : <b>{f.name}</b>}
        <small>
          {[f.category, when(f.created_at), fileSize(f.size_bytes)].filter(Boolean).join(" · ")}
        </small>
      </span>
      <span className={`cv-chip ${mine ? "cv-chip--violet" : "cv-chip--gray"}`}>
        {mine ? "From you" : "From Cre8 Visions"}
      </span>
      {f.url && (
        <a className="cv-open" style={{ padding: "0 16px" }} href={f.url} target="_blank" rel="noreferrer">
          <Download size={14} style={{ marginRight: 6 }} /> Download
        </a>
      )}
      {mine && (
        <button type="button" className="cv-mini cv-mini--danger" onClick={() => remove(f)}>
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );

  return (
    <div className="cv-pg">
      <div>
        <h2 className="cv-card-title" style={{ fontSize: 22 }}>Files</h2>
        <p className="cv-page-sub">
          Send files to Cre8 Visions and download what they've shared with you.
        </p>
      </div>

      {unavailable && (
        <section className="cv-card cv-card-pad">
          <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>
            File sharing isn't switched on yet. Cre8 Visions will let you know
            when it is — in the meantime, reply to our last email with anything
            you need to send.
          </p>
        </section>
      )}

      {!unavailable && (
        <section
          className="cv-card cv-card-pad cv-drop"
          data-dragging={dragging ? "yes" : undefined}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files); }}
        >
          <span className="cv-ic" style={{ background: "#E7EEFF", color: "#2447C0" }}>
            <Upload size={22} />
          </span>
          <div style={{ flex: "1 1 240px" }}>
            <div style={{ fontWeight: 500 }}>Drop files here to send them</div>
            <div style={{ fontSize: 13, color: "var(--cv-muted)" }}>
              Logos, photos, documents, anything the team asked for. Up to 15MB each.
            </div>
          </div>
          <button type="button" className="cv-open cv-open--dark" style={{ padding: "0 20px" }}
            disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? "Sending…" : "Choose files"}
          </button>
          <input ref={inputRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
        </section>
      )}

      <section className="cv-card cv-card-pad">
        <div className="cv-card-head">
          <h2 className="cv-card-title">Shared with you</h2>
          <span className="cv-chip cv-chip--gray">{shared.length}</span>
        </div>
        {files === null ? (
          <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>Loading…</p>
        ) : !shared.length ? (
          <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>
            Nothing yet. Contracts, designs and deliverables Cre8 Visions sends
            you show up here.
          </p>
        ) : shared.map((f) => row(f, false))}
      </section>

      <section className="cv-card cv-card-pad">
        <div className="cv-card-head">
          <h2 className="cv-card-title">Sent by you</h2>
          <span className="cv-chip cv-chip--gray">{sent.length}</span>
        </div>
        {!sent.length ? (
          <EmptyState icon={Upload} title="Nothing sent yet"
            subtitle="Anything you upload above appears here, and goes straight to the team." />
        ) : sent.map((f) => row(f, true))}
      </section>

      {previewing?.url && (
        <FilePreview
          name={previewing.name} url={previewing.url} mime={previewing.mime}
          onClose={() => setPreviewing(null)}
        />
      )}
    </div>
  );
}
