// The Files tab on a client's project, in the portal.
//
// Two lists from one table: what Cre8 Visions shared, and what the
// client sent. Same kind of thing from opposite ends, so one table with
// a direction rather than two that drift apart.
//
// Neither list carries a download link (CRE-822): `open()` mints one, for
// one file, on the click that needs it, so a link minted when the page
// loaded is never still live -- or dead -- by the time somebody clicks.
import { useState } from "react";
import { Upload, FileText, Download, Trash2 } from "lucide-react";
import EmptyState from "@/components/admin/cv/EmptyState";
import { fileSize, previewKind } from "@/lib/projectFiles";
import FilePreview from "@/components/FilePreview";
import { useClientFiles, type OpenedFile, type ProjectFile } from "@/components/portal/useClientFiles";

export type { ProjectFile };

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function FilesSection({
  clientId, clientProjectId, clientName, adminPreview,
}: {
  clientId: string;
  clientProjectId: string;
  clientName: string | null;
  adminPreview: boolean;
}) {
  const [previewing, setPreviewing] = useState<OpenedFile | null>(null);
  const {
    files, shared, sent, busy, unavailable, dragging, inputRef, onDragOver, onDragLeave, onDrop, upload, remove, open,
  } = useClientFiles({ clientId, clientProjectId, clientName, adminPreview });

  const row = (f: ProjectFile, mine: boolean) => {
    const canOpen = f.downloadable && previewKind(f.mime, f.name);
    const canDownload = f.downloadable;
    return (
      <div key={f.id} className="cv-it">
        <span className="cv-ic" style={{ background: "#EEF0F5", color: "#3D4556" }}>
          <FileText size={22} />
        </span>
        <span className="cv-it__what">
          {canOpen ? (
            <button type="button" className="cv-filename" onClick={() => void open(f).then(setPreviewing)}>
              {f.name}
            </button>
          ) : <b>{f.name}</b>}
          <small>
            {[
              f.category,
              when(f.created_at),
              fileSize(f.size_bytes),
              f.status === "external" ? "not available yet" : null,
            ].filter(Boolean).join(" · ")}
          </small>
        </span>
        <span className={`cv-chip ${mine ? "cv-chip--violet" : "cv-chip--gray"}`}>
          {mine ? "From you" : "From Cre8 Visions"}
        </span>
        {canDownload && (
          <button
            type="button"
            className="cv-open"
            style={{ padding: "0 16px" }}
            onClick={() => void open(f).then((opened) => opened && window.open(opened.url, "_blank"))}
          >
            <Download size={14} style={{ marginRight: 6 }} /> Download
          </button>
        )}
        {mine && (
          <button type="button" className="cv-mini cv-mini--danger" onClick={() => void remove(f)}>
            <Trash2 size={14} />
          </button>
        )}
      </div>
    );
  };

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
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
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

      {previewing && (
        <FilePreview
          name={previewing.filename} url={previewing.url} mime={previewing.mime}
          onClose={() => {
            if (previewing.url.startsWith("blob:")) URL.revokeObjectURL(previewing.url);
            setPreviewing(null);
          }}
        />
      )}
    </div>
  );
}
