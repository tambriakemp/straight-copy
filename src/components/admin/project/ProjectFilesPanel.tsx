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
//
// CRE-822: when `client-files` answers from the plugin, this panel no
// longer writes to the bucket itself -- it posts the bytes (or asks for an
// upload ticket, past the plugin's 6 MiB inline ceiling) and lets the
// plugin mint the object key. See `useClientFiles.ts`'s header for the
// fuller version of this; this panel duplicates its own copy rather than
// sharing that hook because the admin side has always had its own upload
// cap and its own "share to client" controls that the portal's hook has no
// use for.
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, FileText, Download, Eye, EyeOff, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import EmptyState from "@/components/admin/cv/EmptyState";
import { fileSize, safeFileName, previewKind } from "@/lib/projectFiles";
import { fileToBase64, blobUrlFromBase64 } from "@/lib/fileBytes";
import FilePreview from "@/components/FilePreview";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
/**
 * Mirrors the Client Portal plugin's own inline-store ceiling (CRE-827: this
 * was 50MB before the plugin had any file storage of its own to be bound
 * by). One constant now that the gate and the inline choice are the same
 * number -- there is no path above it to choose a ticket over.
 */
const MAX_BYTES = 6 * 1024 * 1024;

interface Row {
  id: string;
  name: string;
  mime: string | null;
  size_bytes: number | null;
  direction: string;
  category: string | null;
  uploaded_by_name: string | null;
  visible_to_client: boolean;
  created_at: string;
  status: "pending" | "stored" | "external" | "removed";
  downloadable: boolean;
}

interface Opened {
  url: string;
  mime: string | null;
  filename: string;
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
  const [source, setSource] = useState<"plugin" | "admin-tables">("admin-tables");
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [category, setCategory] = useState("");
  const [previewing, setPreviewing] = useState<Opened | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const out = await call("list", { client_id: clientId, client_project_id: clientProjectId });
      setRows((out.files ?? []) as Row[]);
      if (out.source === "plugin" || out.source === "admin-tables") setSource(out.source);
      setUnavailable(false);
    } catch {
      setRows([]);
      setUnavailable(true);
    }
  }, [clientId, clientProjectId]);

  useEffect(() => { void load(); }, [load]);

  const uploadViaPlugin = async (file: File) => {
    const inline = file.size <= MAX_BYTES;
    const created = await call("create", {
      client_id: clientId, client_project_id: clientProjectId,
      name: file.name, mime: file.type || null, byte_size: file.size,
      ...(inline ? { content_base64: await fileToBase64(file) } : {}),
      category: category.trim() || null,
      uploaded_by_name: "Cre8 Visions",
    });
    const ticket = created.upload as { url: string; method: string; headers: Record<string, string> } | null;
    if (!ticket) return;
    const put = await fetch(ticket.url, { method: ticket.method || "PUT", headers: ticket.headers, body: file });
    if (!put.ok) throw new Error("The upload did not reach storage. Try again.");
    const fileId = (created.file as { id?: string } | null)?.id;
    if (fileId) await call("complete", { client_id: clientId, client_project_id: clientProjectId, id: fileId });
  };

  /** The pre-CRE-822 path, kept exactly as it worked until CP-6's import
   *  runs and this install's three plugin variables are set. */
  const uploadViaLegacy = async (file: File) => {
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
  };

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    let done = 0;
    for (const file of Array.from(list)) {
      if (file.size > MAX_BYTES) { toast.error(`${file.name} is over 6 MiB`); continue; }
      try {
        if (source === "plugin") await uploadViaPlugin(file);
        else await uploadViaLegacy(file);
        done++;
      } catch (e) {
        toast.error(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (done) { await load(); toast.success(`Shared ${done} file${done === 1 ? "" : "s"}`); }
  };

  const open = async (r: Row): Promise<Opened | null> => {
    try {
      const data = await call("download", { client_id: clientId, id: r.id });
      const mime = (data.mime as string | null) ?? r.mime;
      if (typeof data.url === "string" && data.url) {
        return { url: data.url, mime, filename: (data.filename as string) || r.name };
      }
      if (typeof data.content_base64 === "string" && data.content_base64) {
        return { url: blobUrlFromBase64(data.content_base64, mime), mime, filename: (data.filename as string) || r.name };
      }
      throw new Error("That file has no bytes to open yet.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open that file");
      return null;
    }
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

  const row = (r: Row) => {
    const canOpen = r.downloadable && previewKind(r.mime, r.name);
    return (
      <div key={r.id} className="cv-it">
        <span className="cv-ic" style={{ background: "#EEF0F5", color: "#3D4556" }}><FileText size={22} /></span>
        <span className="cv-it__what">
          {/* Clickable when there is something to show. A name that opens
              nothing should not look like a link. */}
          {canOpen ? (
            <button type="button" className="cv-filename" onClick={() => void open(r).then(setPreviewing)}>
              {r.name}
            </button>
          ) : <b>{r.name}</b>}
          <small>
            {[
              r.category,
              new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
              fileSize(r.size_bytes),
              r.uploaded_by_name,
              r.status === "external" ? "bytes still in the old store" : null,
            ].filter(Boolean).join(" · ")}
          </small>
        </span>
        {!r.visible_to_client && <span className="cv-chip cv-chip--amber">Hidden from client</span>}
        {r.downloadable && (
          <button
            type="button"
            className="cv-open"
            style={{ padding: "0 16px" }}
            onClick={() => void open(r).then((opened) => opened && window.open(opened.url, "_blank"))}
          >
            <Download size={14} style={{ marginRight: 6 }} /> Download
          </button>
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
  };

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

      {previewing && (
        <FilePreview
          name={previewing.filename} url={previewing.url} mime={previewing.mime}
          onClose={() => {
            if (previewing.url.startsWith("blob:")) URL.revokeObjectURL(previewing.url);
            setPreviewing(null);
          }}
        />
      )}
    </section>
  );
}
